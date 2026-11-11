package api

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// 交给小禾的资料（照片、截图、PDF、Word、txt）和录音共用 recordings 表，kind='file'。
const maxFile = 30 << 20
const maxPages = 30
const fileRetentionDays = 90

var fileTypes = map[string]string{
	".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".heic": "image/heic",
	".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".txt": "text/plain",
}

// unreadable 是读不出内容的永久失败，带给用户看的原因，不再自动重试。
type unreadable string

func (u unreadable) Error() string { return string(u) }

type fileSeg struct {
	Text string `json:"text"`
	Page int    `json:"page,omitempty"`
}

// sniff 用文件头确认内容和扩展名一致。
func sniff(path, ext string) bool {
	f, e := os.Open(path)
	if e != nil {
		return false
	}
	defer f.Close()
	head := make([]byte, 512)
	n, _ := io.ReadFull(f, head)
	head = head[:n]
	switch ext {
	case ".jpg", ".jpeg":
		return bytes.HasPrefix(head, []byte{0xFF, 0xD8, 0xFF})
	case ".png":
		return bytes.HasPrefix(head, []byte("\x89PNG"))
	case ".heic":
		return len(head) >= 12 && string(head[4:8]) == "ftyp"
	case ".pdf":
		return bytes.HasPrefix(head, []byte("%PDF"))
	case ".docx":
		return bytes.HasPrefix(head, []byte("PK\x03\x04"))
	case ".txt":
		return !bytes.Contains(head, []byte{0})
	}
	return false
}

// extract 把资料读成文字：图片走 63 的 OCR，PDF 先取文字层、没有再逐页 OCR，docx/txt 直接读。
func (a *API) extract(ctx context.Context, row map[string]any) (asrResponse, []fileSeg, bool, error) {
	var res asrResponse
	id := str(row["id"])
	if _, e := a.DB.Exec("UPDATE recordings SET status='transcribing',updated_at=? WHERE id=? AND status='queued'", Now(), id); e != nil {
		return res, nil, false, e
	}
	started := time.Now()
	path := str(row["audio_path"])
	ext := strings.ToLower(filepath.Ext(path))
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	var segs []fileSeg
	var offline bool
	var e error
	switch ext {
	case ".txt":
		res.Model = "text"
		segs, e = readText(path)
	case ".docx":
		res.Model = "docx"
		segs, e = readDocx(path)
	case ".pdf":
		res.Model = "pdftotext"
		segs, e = readPDF(ctx, path)
		if e == nil && letters(segs) < 20 {
			res.Model = "pdf-ocr"
			segs, offline, e = a.ocrPDF(ctx, path)
		}
	default:
		res.Model = "ocr"
		var text string
		text, offline, e = a.ocrImage(ctx, path, ext)
		segs = []fileSeg{{Text: text}}
	}
	if e != nil {
		return res, nil, offline, e
	}
	var kept []fileSeg
	var all []string
	for _, s := range segs {
		s.Text = strings.TrimSpace(strings.ReplaceAll(s.Text, "\r\n", "\n"))
		if s.Text != "" {
			kept = append(kept, s)
			all = append(all, s.Text)
		}
	}
	res.Text = strings.Join(all, "\n\n")
	res.Elapsed = time.Since(started).Seconds()
	if letters(kept) < 2 {
		if ext == ".pdf" || ext == ".docx" || ext == ".txt" {
			return res, nil, false, unreadable("这份文件里没读到文字")
		}
		return res, nil, false, unreadable("图片里没认出文字")
	}
	return res, kept, false, nil
}

func letters(segs []fileSeg) int {
	n := 0
	for _, s := range segs {
		for _, r := range s.Text {
			if unicode.IsLetter(r) || unicode.IsDigit(r) {
				n++
			}
		}
	}
	return n
}

func readText(path string) ([]fileSeg, error) {
	b, e := os.ReadFile(path)
	if e != nil {
		return nil, e
	}
	b = bytes.TrimPrefix(b, []byte("\xEF\xBB\xBF"))
	if !utf8.Valid(b) {
		return nil, unreadable("只能读 UTF-8 编码的文本文件")
	}
	return []fileSeg{{Text: string(b)}}, nil
}

func readDocx(path string) ([]fileSeg, error) {
	z, e := zip.OpenReader(path)
	if e != nil {
		return nil, unreadable("Word 文件打不开，可能已损坏")
	}
	defer z.Close()
	for _, f := range z.File {
		if f.Name != "word/document.xml" {
			continue
		}
		r, e := f.Open()
		if e != nil {
			return nil, unreadable("Word 文件打不开，可能已损坏")
		}
		defer r.Close()
		var out strings.Builder
		dec := xml.NewDecoder(io.LimitReader(r, 50<<20))
		inText := false
		for {
			tok, e := dec.Token()
			if e == io.EOF {
				break
			}
			if e != nil {
				return nil, unreadable("Word 文件打不开，可能已损坏")
			}
			switch t := tok.(type) {
			case xml.StartElement:
				switch t.Name.Local {
				case "t":
					inText = true
				case "tab":
					out.WriteString("\t")
				case "br", "cr":
					out.WriteString("\n")
				}
			case xml.EndElement:
				switch t.Name.Local {
				case "t":
					inText = false
				case "p":
					out.WriteString("\n")
				case "tc":
					out.WriteString("\t")
				}
			case xml.CharData:
				if inText {
					out.Write(t)
				}
			}
		}
		return []fileSeg{{Text: out.String()}}, nil
	}
	return nil, unreadable("不是有效的 Word（docx）文件")
}

func readPDF(ctx context.Context, path string) ([]fileSeg, error) {
	var stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, "pdftotext", "-enc", "UTF-8", "-l", "200", path, "-")
	cmd.Stderr = &stderr
	out, e := cmd.Output()
	if e != nil {
		if strings.Contains(stderr.String(), "assword") {
			return nil, unreadable("PDF 设了密码，读不了")
		}
		if errors.Is(e, exec.ErrNotFound) {
			return nil, e
		}
		return nil, unreadable("PDF 打不开，可能已损坏")
	}
	var segs []fileSeg
	for i, page := range strings.Split(string(out), "\f") {
		segs = append(segs, fileSeg{Text: page, Page: i + 1})
	}
	return segs, nil
}

// ocrPDF 处理扫描件：每页转成图片后交给 OCR，最多 maxPages 页。
func (a *API) ocrPDF(ctx context.Context, path string) ([]fileSeg, bool, error) {
	dir, e := os.MkdirTemp("", "xh-pdf-")
	if e != nil {
		return nil, false, e
	}
	defer os.RemoveAll(dir)
	if e = exec.CommandContext(ctx, "pdftoppm", "-r", "150", "-png", "-l", fmt.Sprint(maxPages), path, filepath.Join(dir, "p")).Run(); e != nil {
		return nil, false, unreadable("PDF 打不开，可能已损坏")
	}
	pages, _ := filepath.Glob(filepath.Join(dir, "p-*.png"))
	sort.Strings(pages)
	var segs []fileSeg
	for i, p := range pages {
		text, offline, e := a.ocrImage(ctx, p, ".png")
		if e != nil {
			return nil, offline, e
		}
		segs = append(segs, fileSeg{Text: text, Page: i + 1})
	}
	return segs, false, nil
}

func (a *API) ocrImage(ctx context.Context, path, ext string) (string, bool, error) {
	if a.OCRURL == "" {
		return "", true, errors.New("ocr not configured")
	}
	if ext == ".heic" {
		dir, e := os.MkdirTemp("", "xh-heic-")
		if e != nil {
			return "", false, e
		}
		defer os.RemoveAll(dir)
		jpg := filepath.Join(dir, "x.jpg")
		if e = exec.CommandContext(ctx, "heif-convert", "-q", "90", path, jpg).Run(); e != nil {
			return "", false, unreadable("这张 HEIC 图片打不开")
		}
		path = jpg
	}
	b, e := os.ReadFile(path)
	if e != nil {
		return "", false, e
	}
	body, _ := json.Marshal(map[string]any{"image": base64.StdEncoding.EncodeToString(b)})
	reqCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	req, e := http.NewRequestWithContext(reqCtx, "POST", strings.TrimRight(a.OCRURL, "/")+"/ocr", bytes.NewReader(body))
	if e != nil {
		return "", false, e
	}
	req.Header.Set("Content-Type", "application/json")
	resp, e := http.DefaultClient.Do(req)
	if e != nil {
		return "", true, e
	}
	defer resp.Body.Close()
	if resp.StatusCode == 503 || resp.StatusCode == 502 {
		return "", true, fmt.Errorf("ocr status %d", resp.StatusCode)
	}
	if resp.StatusCode != 200 {
		return "", false, fmt.Errorf("ocr status %d", resp.StatusCode)
	}
	var out struct {
		Code int             `json:"code"`
		Data json.RawMessage `json:"data"`
	}
	if e = json.NewDecoder(io.LimitReader(resp.Body, 20<<20)).Decode(&out); e != nil {
		return "", false, e
	}
	if out.Code == 101 {
		return "", false, nil
	}
	if out.Code != 100 {
		return "", false, fmt.Errorf("ocr code %d", out.Code)
	}
	var lines []ocrLine
	if json.Unmarshal(out.Data, &lines) != nil {
		return "", false, nil
	}
	return layout(lines), false, nil
}

type ocrLine struct {
	Text string      `json:"text"`
	Box  [][]float64 `json:"box"`
}

// layout 按位置还原阅读顺序：上下重叠过半的算同一行，行内从左到右。
func layout(lines []ocrLine) string {
	type cell struct {
		text              string
		top, bottom, left float64
	}
	var cells []cell
	for _, l := range lines {
		if strings.TrimSpace(l.Text) == "" || len(l.Box) == 0 {
			continue
		}
		c := cell{text: strings.TrimSpace(l.Text), top: l.Box[0][1], bottom: l.Box[0][1], left: l.Box[0][0]}
		for _, p := range l.Box {
			if len(p) < 2 {
				continue
			}
			c.top, c.bottom, c.left = min(c.top, p[1]), max(c.bottom, p[1]), min(c.left, p[0])
		}
		cells = append(cells, c)
	}
	sort.SliceStable(cells, func(i, j int) bool { return cells[i].top < cells[j].top })
	var rows [][]cell
	for _, c := range cells {
		if n := len(rows); n > 0 {
			last := rows[n-1][0]
			mid := (c.top + c.bottom) / 2
			if mid > last.top && mid < last.bottom {
				rows[n-1] = append(rows[n-1], c)
				continue
			}
		}
		rows = append(rows, []cell{c})
	}
	var out []string
	for _, r := range rows {
		sort.SliceStable(r, func(i, j int) bool { return r[i].left < r[j].left })
		var parts []string
		for _, c := range r {
			parts = append(parts, c.text)
		}
		out = append(out, strings.Join(parts, " "))
	}
	return strings.Join(out, "\n")
}

// failNow 记下读不出内容的原因并通知用户，不再自动重试。
func (a *API) failNow(row map[string]any, reason string) {
	id := str(row["id"])
	log.Printf("recording=%s stage=transcribing state=failed reason=unreadable", id)
	if _, e := a.DB.Exec("UPDATE recordings SET status='failed',attempts=3,error=?,finished_at=?,updated_at=?,next_try_at=NULL WHERE id=?", reason, Now(), Now(), id); e != nil {
		log.Printf("recording=%s status_update_failed=%v", id, e)
		return
	}
	a.notify(str(row["user_id"]), id, false, "资料没能读出来", reason)
}

// filePrompt 是整理资料用的提示词，事项规则与录音一致。
func filePrompt(s Scene, row map[string]any, name string) string {
	hint := recordingDateHint(row)
	hint = strings.ReplaceAll(hint, "录音日期", "交资料日期")
	hint = strings.ReplaceAll(hint, "转写中的", "资料里的")
	hint = strings.ReplaceAll(hint, "录音当周", "交资料当周")
	p := minutesPrompt(s, hint, name)
	p = strings.ReplaceAll(p, "将逐句转写整理为", "将资料内容整理为")
	p = strings.ReplaceAll(p, "这段录音", "这份资料")
	p = strings.Replace(p, "这是一段工作场合的录音（会议、汇报、客户沟通等）。", "这是一份工作资料（截图、通知、文档等）。", 1)
	p = strings.Replace(p, "这是一段日常生活的录音（家人朋友交谈、私人事务）。", "这是一份生活资料（通知单、票据、聊天截图等）。", 1)
	return "用户把一份资料交给你：内容是从图片里识别出的文字或文档正文，可能有识别错字和排版错乱，按最合理的意思理解；资料里提到的“我”通常不是用户本人，除非明显是写给用户的。" + p + "decisions 写资料里已经确定的事（时间、地点、金额、结论）。"
}
