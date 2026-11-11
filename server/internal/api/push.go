package api

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

type Push struct {
	Team, KeyID, Topic, Base string
	Key                      *ecdsa.PrivateKey
	HTTP                     *http.Client
	mu                       sync.Mutex
	jwt                      string
	issued                   time.Time
}

func LoadPush() (*Push, error) {
	file := os.Getenv("APNS_KEY_FILE")
	if file == "" {
		return nil, nil
	}
	b, e := os.ReadFile(file)
	if e != nil {
		return nil, e
	}
	block, _ := pem.Decode(b)
	if block == nil {
		return nil, fmt.Errorf("invalid APNs key")
	}
	key, e := x509.ParsePKCS8PrivateKey(block.Bytes)
	if e != nil {
		return nil, e
	}
	ec, ok := key.(*ecdsa.PrivateKey)
	if !ok || ec.Curve.Params().BitSize != 256 {
		return nil, fmt.Errorf("APNs key must be P-256")
	}
	p := &Push{Team: os.Getenv("APNS_TEAM_ID"), KeyID: os.Getenv("APNS_KEY_ID"), Topic: os.Getenv("APNS_TOPIC"), Key: ec, HTTP: &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{ForceAttemptHTTP2: true}}}
	if p.Team == "" || p.KeyID == "" || p.Topic == "" {
		return nil, fmt.Errorf("APNs team, key id and topic required")
	}
	p.Base = "https://api.push.apple.com"
	if os.Getenv("APNS_ENV") == "sandbox" {
		p.Base = "https://api.sandbox.push.apple.com"
	}
	return p, nil
}
func (p *Push) token() (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.jwt != "" && time.Since(p.issued) < 50*time.Minute {
		return p.jwt, nil
	}
	now := time.Now()
	enc := base64.RawURLEncoding
	h, _ := json.Marshal(map[string]string{"alg": "ES256", "kid": p.KeyID})
	payload, _ := json.Marshal(map[string]any{"iss": p.Team, "iat": now.Unix()})
	input := enc.EncodeToString(h) + "." + enc.EncodeToString(payload)
	hash := sha256.Sum256([]byte(input))
	r, s, e := ecdsa.Sign(rand.Reader, p.Key, hash[:])
	if e != nil {
		return "", e
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	p.jwt = input + "." + enc.EncodeToString(sig)
	p.issued = now
	return p.jwt, nil
}
func (a *API) notify(uid, id string, success bool, count int) {
	if a.Push == nil {
		log.Printf("recording=%s push skipped reason=not_configured", id)
		return
	}
	var enabled string
	if e := a.DB.QueryRow("SELECT value FROM settings WHERE key='push_enabled'").Scan(&enabled); e == nil && (enabled == "false" || enabled == "0") {
		log.Printf("recording=%s push skipped reason=disabled", id)
		return
	}
	rows, e := a.DB.Rows("SELECT token,env FROM devices WHERE user_id=?", uid)
	if e != nil {
		log.Printf("recording=%s push devices_error=%v", id, e)
		return
	}
	statuses := map[string]int{}
	title, body := "录音没能转写", "点开看原因，可以重试"
	if success {
		title = "会议纪要整理好了"
		body = fmt.Sprintf("新增 %d 件事", count)
	}
	payload, _ := json.Marshal(map[string]any{"aps": map[string]any{"alert": map[string]string{"title": title, "body": body}, "sound": "default"}, "recording_id": id, "body": map[string]string{"recording_id": id}})
	// expo-notifications 在 iOS 上只把远程推送的 body 字段作为 data 交给 App；顶层 recording_id 保留兼容。
	for _, row := range rows {
		device := str(row["token"])
		prefix := device
		if len(prefix) > 8 {
			prefix = prefix[:8]
		}
		base := a.Push.Base
		if a.Push.Base == "https://api.push.apple.com" || a.Push.Base == "https://api.sandbox.push.apple.com" {
			if row["env"] == "sandbox" {
				base = "https://api.sandbox.push.apple.com"
			} else {
				base = "https://api.push.apple.com"
			}
		}
		for attempt := 0; attempt < 3; attempt++ {
			jwt, e := a.Push.token()
			if e != nil {
				statuses["jwt_error"]++
				break
			}
			req, e := http.NewRequest("POST", strings.TrimRight(base, "/")+"/3/device/"+device, bytes.NewReader(payload))
			if e != nil {
				statuses["request_error"]++
				break
			}
			req.Header.Set("authorization", "bearer "+jwt)
			req.Header.Set("apns-topic", a.Push.Topic)
			req.Header.Set("apns-push-type", "alert")
			req.Header.Set("content-type", "application/json")
			client := a.Push.HTTP
			if client == nil {
				client = http.DefaultClient
			}
			resp, e := client.Do(req)
			if e != nil {
				statuses["network_error"]++
				continue
			}
			statuses[fmt.Sprint(resp.StatusCode)]++
			b, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
			resp.Body.Close()
			if resp.StatusCode == 200 {
				break
			}
			if resp.StatusCode == 410 || resp.StatusCode == 400 && strings.Contains(string(b), "BadDeviceToken") {
				if _, err := a.DB.Exec("DELETE FROM devices WHERE token=? AND user_id=?", device, uid); err != nil {
					log.Printf("recording=%s push device_delete_failed token_prefix=%s error=%v", id, prefix, err)
				} else {
					log.Printf("recording=%s push device_deleted token_prefix=%s status=%d", id, prefix, resp.StatusCode)
				}
				break
			}
		}
	}
	var summary []string
	for code, n := range statuses {
		summary = append(summary, fmt.Sprintf("%s:%d", code, n))
	}
	sort.Strings(summary)
	log.Printf("recording=%s push devices=%d statuses=%s", id, len(rows), strings.Join(summary, ","))
}
