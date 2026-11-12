package api

import (
	"context"
	"errors"
	"html"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var blockedLinkRanges = func() []netip.Prefix {
	var out []netip.Prefix
	for _, s := range []string{"0.0.0.0/8", "100.64.0.0/10", "198.18.0.0/15"} {
		out = append(out, netip.MustParsePrefix(s))
	}
	return out
}()

func publicLinkIP(ip net.IP) bool {
	addr, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	addr = addr.Unmap()
	if !addr.IsGlobalUnicast() || addr.IsPrivate() || addr.IsLoopback() || addr.IsLinkLocalUnicast() {
		return false
	}
	for _, p := range blockedLinkRanges {
		if p.Contains(addr) {
			return false
		}
	}
	return true
}
func (a *API) linkClient() *http.Client {
	transport := &http.Transport{DisableKeepAlives: true, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
		if err != nil || len(ips) == 0 {
			return nil, errors.New("DNS 解析失败")
		}
		for _, ip := range ips {
			if !a.AllowPrivateLinks && !publicLinkIP(ip) {
				return nil, errors.New("链接指向受限地址")
			}
		}
		dialer := &net.Dialer{Timeout: 5 * time.Second}
		var last error
		for _, ip := range ips {
			var conn net.Conn
			conn, last = dialer.DialContext(ctx, "tcp", net.JoinHostPort(ip.String(), port))
			if last == nil {
				return conn, nil
			}
		}
		return nil, last
	}}
	return &http.Client{Timeout: 15 * time.Second, Transport: transport, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 3 || !validLinkURL(req.URL) {
			return errors.New("跳转无效")
		}
		return nil
	}}
}
func validLinkURL(u *url.URL) bool {
	return (u.Scheme == "http" || u.Scheme == "https") && u.Hostname() != "" && u.User == nil
}

var htmlTitle = regexp.MustCompile(`(?is)<title\b[^>]*>(.*?)</title\s*>`)
var htmlTags = regexp.MustCompile(`(?s)<[^>]*>`)
var htmlSpace = regexp.MustCompile(`[\t \r\n]+`)

// RE2 has no backreferences; remove each unwanted element explicitly.
func plainPage(body string) (string, string) {
	title := ""
	if match := htmlTitle.FindStringSubmatch(body); len(match) > 1 {
		title = strings.TrimSpace(html.UnescapeString(htmlTags.ReplaceAllString(match[1], "")))
	}
	for _, tag := range []string{"script", "style", "nav", "footer", "head"} {
		re := regexp.MustCompile(`(?is)<` + tag + `\b[^>]*>.*?</` + tag + `\s*>`)
		body = re.ReplaceAllString(body, " ")
	}
	body = regexp.MustCompile(`(?i)</(p|div|li|h[1-6]|br|tr)>|<br\s*/?>`).ReplaceAllString(body, "\n")
	body = htmlTags.ReplaceAllString(body, " ")
	var lines []string
	for _, line := range strings.Split(html.UnescapeString(body), "\n") {
		if s := strings.TrimSpace(htmlSpace.ReplaceAllString(line, " ")); s != "" {
			lines = append(lines, s)
		}
	}
	return title, strings.Join(lines, "\n")
}
func (a *API) importLink(w http.ResponseWriter, r *http.Request, b map[string]any, uid string) {
	raw, ok := b["url"].(string)
	if !ok {
		fail(w, 400, "invalid_link", "链接打不开")
		return
	}
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || !validLinkURL(u) {
		fail(w, 400, "invalid_link", "链接打不开")
		return
	}
	client := a.linkClient()
	defer client.CloseIdleConnections()
	req, err := http.NewRequestWithContext(r.Context(), "GET", u.String(), nil)
	if err != nil {
		fail(w, 400, "invalid_link", "链接打不开")
		return
	}
	resp, err := client.Do(req)
	if err != nil {
		fail(w, 400, "invalid_link", "链接打不开")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		fail(w, 400, "invalid_link", "链接打不开")
		return
	}
	typ, params, err := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if err != nil || typ != "text/html" && typ != "text/plain" || params["charset"] != "" && !strings.EqualFold(params["charset"], "utf-8") {
		fail(w, 400, "invalid_link", "不是网页或文字内容")
		return
	}
	const maxBody = 5 << 20
	if resp.ContentLength > maxBody {
		fail(w, 400, "invalid_link", "网页太大（最多 5 MB）")
		return
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBody+1))
	if err != nil {
		fail(w, 400, "invalid_link", "链接打不开")
		return
	}
	if len(body) > maxBody {
		fail(w, 400, "invalid_link", "网页太大（最多 5 MB）")
		return
	}
	if !utf8.Valid(body) {
		fail(w, 400, "invalid_link", "不是网页或文字内容")
		return
	}
	title, text := "", string(body)
	if typ == "text/html" {
		title, text = plainPage(text)
	}
	if title == "" {
		title = resp.Request.URL.Hostname()
	}
	if strings.TrimSpace(text) == "" {
		fail(w, 400, "invalid_link", "网页没有可读文字")
		return
	}
	id := ID()
	dir := a.AudioDir
	if dir == "" {
		dir = "audio"
	}
	folder := filepath.Join(dir, uid)
	if os.MkdirAll(folder, 0700) != nil {
		a.internal(w)
		return
	}
	path := filepath.Join(folder, id+".txt")
	if err = os.WriteFile(path, []byte(text), 0600); err != nil {
		a.internal(w)
		return
	}
	now := Now()
	_, err = a.DB.Exec("INSERT INTO recordings(id,user_id,title,mime,size_bytes,audio_path,status,created_at,updated_at,kind,source_url) VALUES(?,?,?,?,?,?,'queued',?,?,'file',?)", id, uid, title, "text/plain", len(text), path, now, now, u.String())
	if err != nil {
		os.Remove(path)
		a.internal(w)
		return
	}
	a.wakeQueue()
	send(w, 200, map[string]any{"recording": map[string]any{"id": id, "title": title, "kind": "file", "status": "queued", "created_at": now, "source_url": u.String()}})
}
