package api

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"math/big"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const fullMinutes = `{"title":"机密标题","summary":"摘要","points":["要点"],"decisions":["决定"],"action_items":[{"text":"做甲","due":"2026-12-01"},{"text":"做乙"},{"text":"做丙","owner":"张三","due":"2026-12-02"}]}`

func uploadTest(t *testing.T, a *API, token, name string, data []byte) (int, map[string]any) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, _ := writer.CreateFormFile("file", name)
	part.Write(data)
	writer.Close()
	r := httptest.NewRequest("POST", "/api/recordings", &body)
	r.Header.Set("Content-Type", writer.FormDataContentType())
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return w.Code, out
}

type recordingFixture struct {
	a                   *API
	call                func(string, string, string, string) (int, map[string]any)
	user, admin         string
	asrMode, pushStatus atomic.Int32
	llmFail             atomic.Bool
	minutes             atomic.Value
	lastPrompt          atomic.Value
	pushMu              sync.Mutex
	payloads            []string
	pushes              atomic.Int32
	key                 *ecdsa.PrivateKey
}

func newRecordingFixture(t *testing.T) *recordingFixture {
	t.Helper()
	f := &recordingFixture{}
	f.minutes.Store(fullMinutes)
	asr := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-ASR-Token") != "secret" {
			t.Error("ASR token")
		}
		switch f.asrMode.Load() {
		case 1:
			http.Error(w, "busy", 503)
		case 2:
			http.Error(w, "bad", 400)
		default:
			fmt.Fprint(w, `{"text":"隐私转写","duration_s":30,"speakers":1,"segments":[{"start_ms":0,"end_ms":500,"speaker":1,"text":"隐私转写"}]}`)
		}
	}))
	t.Cleanup(asr.Close)
	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if f.llmFail.Load() {
			http.Error(w, "fail", 502)
			return
		}
		var req struct {
			Messages []struct{ Role, Content string } `json:"messages"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		for _, m := range req.Messages {
			if m.Role == "system" {
				f.lastPrompt.Store(m.Content)
			}
		}
		content, _ := json.Marshal(f.minutes.Load().(string))
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, content)
	}))
	t.Cleanup(llm.Close)
	apns := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := new(bytes.Buffer)
		raw.ReadFrom(r.Body)
		f.pushMu.Lock()
		f.payloads = append(f.payloads, raw.String())
		f.pushMu.Unlock()
		f.pushes.Add(1)
		status := f.pushStatus.Load()
		if status == 0 {
			status = 200
		}
		w.WriteHeader(int(status))
		if status == 400 {
			fmt.Fprint(w, `{"reason":"BadDeviceToken"}`)
		}
	}))
	t.Cleanup(apns.Close)
	f.a, f.call = setup(t, llm.URL)
	f.a.AudioDir = t.TempDir()
	f.a.ASRURL = asr.URL
	f.a.ASRToken = "secret"
	f.key, _ = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	f.a.Push = &Push{Key: f.key, Team: "team", KeyID: "key", Topic: "app.test", Base: apns.URL, HTTP: apns.Client()}
	f.user = login(t, f.call, "lily@demo.com")
	f.admin = login(t, f.call, "admin@demo.com")
	return f
}
func (f *recordingFixture) upload(t *testing.T) string {
	t.Helper()
	code, v := uploadTest(t, f.a, f.user, "a.wav", []byte("audio"))
	expect(t, code, 200)
	return v["recording"].(map[string]any)["id"].(string)
}
func (f *recordingFixture) completed(t *testing.T) string {
	t.Helper()
	id := f.upload(t)
	f.a.ProcessOne(context.Background())
	var status string
	f.a.DB.QueryRow("SELECT status FROM recordings WHERE id=?", id).Scan(&status)
	if status != "done" {
		t.Fatal(status)
	}
	return id
}
func (f *recordingFixture) device(t *testing.T, token string) {
	t.Helper()
	code, _ := f.call("POST", "/api/devices", fmt.Sprintf(`{"token":%q,"platform":"ios","env":"production"}`, token), f.user)
	expect(t, code, 200)
}
func (f *recordingFixture) regenerate(t *testing.T, id string) {
	t.Helper()
	code, _ := f.call("POST", "/api/recordings/"+id+"/regenerate", `{}`, f.user)
	expect(t, code, 200)
	f.a.ProcessOne(context.Background())
}
func (f *recordingFixture) item(t *testing.T, id string) (string, int) {
	t.Helper()
	var kind string
	var deleted int
	if err := f.a.DB.QueryRow("SELECT kind,deleted FROM items WHERE id=?", id).Scan(&kind, &deleted); err != nil {
		t.Fatal(err)
	}
	return kind, deleted
}

func TestRecordingScenarios(t *testing.T) {
	t.Run("上传超限 413", func(t *testing.T) {
		f := newRecordingFixture(t)
		code, _ := uploadTest(t, f.a, f.user, "a.wav", make([]byte, maxAudio+1))
		expect(t, code, 413)
	})
	t.Run("类型不符", func(t *testing.T) {
		f := newRecordingFixture(t)
		code, _ := uploadTest(t, f.a, f.user, "bad.txt", []byte("bad"))
		expect(t, code, 400)
	})
	t.Run("成功全流程", func(t *testing.T) {
		f := newRecordingFixture(t)
		id := f.completed(t)
		for _, suffix := range []string{"", "/transcript", "/minutes"} {
			code, _ := f.call("GET", "/api/recordings/"+id+suffix, "", f.user)
			expect(t, code, 200)
		}
		code, v := f.call("GET", "/api/messages", "", f.user)
		expect(t, code, 200)
		if len(v["messages"].([]any)) != 1 {
			t.Fatal(v)
		}
	})
	t.Run("ASR 503 退避", func(t *testing.T) {
		f := newRecordingFixture(t)
		f.asrMode.Store(1)
		id := f.upload(t)
		f.a.ProcessOne(context.Background())
		var next, updated string
		var attempts int
		f.a.DB.QueryRow("SELECT next_try_at,updated_at,attempts FROM recordings WHERE id=?", id).Scan(&next, &updated, &attempts)
		first, _ := time.Parse(time.RFC3339Nano, next)
		if time.Until(first) < 50*time.Second || attempts != 0 {
			t.Fatal(next, attempts)
		}
		f.a.DB.Exec("UPDATE recordings SET updated_at=?,next_try_at=? WHERE id=?", time.Now().Add(-2*time.Minute).UTC().Format("2006-01-02T15:04:05.000Z"), time.Now().Add(-time.Minute).UTC().Format("2006-01-02T15:04:05.000Z"), id)
		f.a.ProcessOne(context.Background())
		f.a.DB.QueryRow("SELECT next_try_at,attempts FROM recordings WHERE id=?", id).Scan(&next, &attempts)
		second, _ := time.Parse(time.RFC3339Nano, next)
		if second.Sub(first) < 50*time.Second || attempts != 0 {
			t.Fatal(next, attempts)
		}
		_ = updated
	})
	t.Run("ASR 错误三次后 failed", func(t *testing.T) {
		f := newRecordingFixture(t)
		f.asrMode.Store(2)
		id := f.upload(t)
		for i := 0; i < 3; i++ {
			f.a.DB.Exec("UPDATE recordings SET next_try_at=NULL WHERE id=?", id)
			f.a.ProcessOne(context.Background())
		}
		var status string
		f.a.DB.QueryRow("SELECT status FROM recordings WHERE id=?", id).Scan(&status)
		if status != "failed" {
			t.Fatal(status)
		}
	})
	t.Run("纪要提示词带录音日期，相对日期转成待办", func(t *testing.T) {
		f := newRecordingFixture(t)
		id := f.upload(t)
		// 2026-11-10 20:00 UTC = 台北 2026-11-11 星期三
		f.a.DB.Exec("UPDATE recordings SET recorded_at=? WHERE id=?", "2026-11-10T20:00:00.000Z", id)
		f.minutes.Store(`{"title":"周会","action_items":[{"text":"本周五交方案","owner":"lily","is_self":true,"due":"2026-11-13"}]}`)
		f.a.ProcessOne(context.Background())
		prompt, _ := f.lastPrompt.Load().(string)
		if !strings.Contains(prompt, "录音日期：2026-11-11（星期三") || !strings.Contains(prompt, "本周五") {
			t.Fatal(prompt)
		}
		if kind, deleted := f.item(t, id+"-0"); kind != "todo" || deleted != 0 {
			t.Fatal(kind, deleted)
		}
	})
	t.Run("无 recorded_at 时用 created_at", func(t *testing.T) {
		hint := recordingDateHint(map[string]any{"created_at": "2026-11-09T01:00:00.000Z"})
		if !strings.Contains(hint, "2026-11-09（星期一") {
			t.Fatal(hint)
		}
		if recordingDateHint(map[string]any{}) != "" {
			t.Fatal("empty row should give no hint")
		}
	})
	t.Run("LLM 失败仍可查转写", func(t *testing.T) {
		f := newRecordingFixture(t)
		f.llmFail.Store(true)
		id := f.upload(t)
		for i := 0; i < 3; i++ {
			f.a.DB.Exec("UPDATE recordings SET next_try_at=NULL WHERE id=?", id)
			f.a.ProcessOne(context.Background())
		}
		var status string
		f.a.DB.QueryRow("SELECT status FROM recordings WHERE id=?", id).Scan(&status)
		if status != "failed" {
			t.Fatal(status)
		}
		code, _ := f.call("GET", "/api/recordings/"+id+"/transcript", "", f.user)
		expect(t, code, 200)
		f.llmFail.Store(false)
		code, _ = f.call("POST", "/api/recordings/"+id+"/retry", `{}`, f.user)
		expect(t, code, 200)
		f.a.ProcessOne(context.Background())
	})
	t.Run("重启续跑", func(t *testing.T) {
		f := newRecordingFixture(t)
		id := f.upload(t)
		f.a.DB.Exec("UPDATE recordings SET status='transcribing' WHERE id=?", id)
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		if err := f.a.Start(ctx); err != nil {
			t.Fatal(err)
		}
		f.a.ProcessOne(context.Background())
		var status string
		f.a.DB.QueryRow("SELECT status FROM recordings WHERE id=?", id).Scan(&status)
		if status != "done" {
			t.Fatal(status)
		}
	})
	t.Run("三种事项分类和确定性 id", func(t *testing.T) {
		f := newRecordingFixture(t)
		id := f.completed(t)
		for i, kind := range []string{"todo", "idea", "watch"} {
			actual, deleted := f.item(t, fmt.Sprintf("%s-%d", id, i))
			if actual != kind || deleted != 0 {
				t.Fatal(actual, deleted)
			}
		}
	})
	t.Run("重新生成不重复", func(t *testing.T) {
		f := newRecordingFixture(t)
		id := f.completed(t)
		f.regenerate(t, id)
		var count int
		f.a.DB.QueryRow("SELECT count(*) FROM items WHERE id LIKE ?", id+"-%").Scan(&count)
		if count != 3 {
			t.Fatal(count)
		}
	})
	t.Run("重新生成软删多余项", func(t *testing.T) {
		f := newRecordingFixture(t)
		id := f.completed(t)
		var before string
		f.a.DB.QueryRow("SELECT updated_at FROM items WHERE id=?", id+"-2").Scan(&before)
		f.minutes.Store(`{"title":"短纪要","summary":"摘要","action_items":[{"text":"做甲"}]}`)
		f.regenerate(t, id)
		for _, i := range []int{1, 2} {
			_, deleted := f.item(t, fmt.Sprintf("%s-%d", id, i))
			if deleted != 1 {
				t.Fatal(i, deleted)
			}
		}
		var after string
		f.a.DB.QueryRow("SELECT updated_at FROM items WHERE id=?", id+"-2").Scan(&after)
		if after <= before {
			t.Fatal(before, after)
		}
		code, v := f.call("GET", "/api/items?since="+before, "", f.user)
		expect(t, code, 200)
		if len(v["items"].([]any)) == 0 {
			t.Fatal("no incremental deletion")
		}
	})
	t.Run("不复活已手动删除事项", func(t *testing.T) {
		f := newRecordingFixture(t)
		id := f.completed(t)
		code, _ := f.call("DELETE", "/api/items/"+id+"-0", "", f.user)
		expect(t, code, 200)
		f.regenerate(t, id)
		_, deleted := f.item(t, id+"-0")
		if deleted != 1 {
			t.Fatal("resurrected")
		}
	})
	t.Run("推送成功", func(t *testing.T) {
		f := newRecordingFixture(t)
		f.device(t, strings.Repeat("a", 64))
		f.completed(t)
		if f.pushes.Load() != 1 {
			t.Fatal(f.pushes.Load())
		}
	})
	t.Run("410 删除设备", func(t *testing.T) {
		f := newRecordingFixture(t)
		f.device(t, strings.Repeat("a", 64))
		f.pushStatus.Store(410)
		f.completed(t)
		var n int
		f.a.DB.QueryRow("SELECT count(*) FROM devices").Scan(&n)
		if n != 0 {
			t.Fatal(n)
		}
	})
	t.Run("BadDeviceToken 删除设备", func(t *testing.T) {
		f := newRecordingFixture(t)
		f.device(t, strings.Repeat("b", 64))
		f.pushStatus.Store(400)
		f.completed(t)
		var n int
		f.a.DB.QueryRow("SELECT count(*) FROM devices").Scan(&n)
		if n != 0 {
			t.Fatal(n)
		}
	})
	t.Run("未配置跳过", func(t *testing.T) {
		f := newRecordingFixture(t)
		f.device(t, strings.Repeat("a", 64))
		f.a.Push = nil
		f.completed(t)
		if f.pushes.Load() != 0 {
			t.Fatal("unexpected push")
		}
	})
	t.Run("payload 不含内容", func(t *testing.T) {
		f := newRecordingFixture(t)
		f.device(t, strings.Repeat("a", 64))
		f.completed(t)
		f.pushMu.Lock()
		defer f.pushMu.Unlock()
		if len(f.payloads) != 1 || strings.Contains(f.payloads[0], "机密标题") || strings.Contains(f.payloads[0], "隐私转写") || !strings.Contains(f.payloads[0], "新增 3 件事") {
			t.Fatal(f.payloads)
		}
	})
	t.Run("音频成功 7 天清理", func(t *testing.T) {
		f := newRecordingFixture(t)
		id := f.completed(t)
		assertAudioCleanup(t, f, id, "done", 8, true)
	})
	t.Run("音频失败 30 天清理", func(t *testing.T) {
		f := newRecordingFixture(t)
		id := f.upload(t)
		assertAudioCleanup(t, f, id, "failed", 29, false)
		assertAudioCleanup(t, f, id, "failed", 31, true)
	})
	t.Run("管理员 403", func(t *testing.T) {
		f := newRecordingFixture(t)
		code, _ := uploadTest(t, f.a, f.admin, "a.wav", []byte("audio"))
		expect(t, code, 403)
		id := f.upload(t)
		code, _ = f.call("GET", "/api/recordings/"+id, "", f.admin)
		expect(t, code, 403)
	})
	t.Run("别人的录音 404", func(t *testing.T) {
		f := newRecordingFixture(t)
		id := f.upload(t)
		code, v := f.call("POST", "/api/admin/users", `{"email":"other@example.com","name":"其他人"}`, f.admin)
		expect(t, code, 200)
		otherID := v["user"].(map[string]any)["id"]
		token := random(32)
		f.a.DB.Exec("INSERT INTO sessions VALUES(?,?,?,?)", token, otherID, Now(), time.Now().Add(time.Hour).UTC().Format("2006-01-02T15:04:05.000Z"))
		code, _ = f.call("DELETE", "/api/recordings/"+id, "", token)
		expect(t, code, 404)
	})
	t.Run("超时估算和上限", func(t *testing.T) {
		for _, tc := range []struct {
			row  map[string]any
			want time.Duration
		}{{map[string]any{"size_bytes": int64(4000)}, 10 * time.Minute}, {map[string]any{"size_bytes": int64(8e6)}, 20 * time.Minute}, {map[string]any{"size_bytes": int64(60e6)}, time.Hour}, {map[string]any{"size_bytes": int64(60e6), "duration_s": float64(2000)}, 20 * time.Minute}} {
			if got := asrTimeout(tc.row); got != tc.want {
				t.Fatalf("%v: %s want %s", tc.row, got, tc.want)
			}
		}
	})
	t.Run("每日限额含未转写估算", func(t *testing.T) {
		f := newRecordingFixture(t)
		var uid string
		f.a.DB.QueryRow("SELECT user_id FROM sessions WHERE token=?", f.user).Scan(&uid)
		now := Now()
		for i, entry := range []struct {
			duration any
			size     int
		}{{float64(17990), 4000}, {nil, 36000}} {
			_, err := f.a.DB.Exec("INSERT INTO recordings(id,user_id,title,mime,size_bytes,status,duration_s,created_at,updated_at) VALUES(?,?,?,?,?,'queued',?,?,?)", fmt.Sprint("quota-", i), uid, "", "audio/wav", entry.size, entry.duration, now, now)
			if err != nil {
				t.Fatal(err)
			}
		}
		code, _ := uploadTest(t, f.a, f.user, "a.wav", make([]byte, 8000))
		expect(t, code, 429)
	})
	t.Run("事务写失败进入重试", func(t *testing.T) {
		f := newRecordingFixture(t)
		id := f.upload(t)
		f.a.DB.Exec("CREATE TRIGGER reject_assistant BEFORE INSERT ON messages WHEN NEW.role='assistant' BEGIN SELECT RAISE(FAIL,'test message failure'); END")
		f.a.ProcessOne(context.Background())
		var status string
		var attempts int
		f.a.DB.QueryRow("SELECT status,attempts FROM recordings WHERE id=?", id).Scan(&status, &attempts)
		if status != "summarizing" || attempts != 1 {
			t.Fatal(status, attempts)
		}
	})
	t.Run("事务提交失败进入重试", func(t *testing.T) {
		f := newRecordingFixture(t)
		id := f.upload(t)
		f.a.DB.Exec("CREATE TABLE test_parent(id TEXT PRIMARY KEY)")
		f.a.DB.Exec("CREATE TABLE test_child(id TEXT REFERENCES test_parent(id) DEFERRABLE INITIALLY DEFERRED)")
		f.a.DB.Exec("CREATE TRIGGER test_deferred AFTER INSERT ON messages WHEN NEW.role='assistant' BEGIN INSERT INTO test_child(id) VALUES('missing'); END")
		f.a.ProcessOne(context.Background())
		var status string
		var attempts int
		f.a.DB.QueryRow("SELECT status,attempts FROM recordings WHERE id=?", id).Scan(&status, &attempts)
		if status != "summarizing" || attempts != 1 {
			t.Fatal(status, attempts)
		}
	})
	t.Run("JWT 公钥验证", func(t *testing.T) {
		f := newRecordingFixture(t)
		token, err := f.a.Push.token()
		if err != nil {
			t.Fatal(err)
		}
		parts := strings.Split(token, ".")
		if len(parts) != 3 {
			t.Fatal(token)
		}
		hash := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
		sig, _ := base64.RawURLEncoding.DecodeString(parts[2])
		if len(sig) != 64 || !ecdsa.Verify(&f.key.PublicKey, hash[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])) {
			t.Fatal("invalid JWT")
		}
		der, _ := x509.MarshalPKCS8PrivateKey(f.key)
		path := filepath.Join(t.TempDir(), "key.p8")
		os.WriteFile(path, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), 0600)
		t.Setenv("APNS_KEY_FILE", path)
		t.Setenv("APNS_TEAM_ID", "team")
		t.Setenv("APNS_KEY_ID", "key")
		t.Setenv("APNS_TOPIC", "app")
		if _, err := LoadPush(); err != nil {
			t.Fatal(err)
		}
	})
}
func assertAudioCleanup(t *testing.T, f *recordingFixture, id, status string, days int, removed bool) {
	t.Helper()
	old := time.Now().AddDate(0, 0, -days).UTC().Format("2006-01-02T15:04:05.000Z")
	f.a.DB.Exec("UPDATE recordings SET status=?,finished_at=? WHERE id=?", status, old, id)
	var path string
	f.a.DB.QueryRow("SELECT audio_path FROM recordings WHERE id=?", id).Scan(&path)
	f.a.CleanupAudio()
	var audio, deleted *string
	if err := f.a.DB.QueryRow("SELECT audio_path,audio_deleted_at FROM recordings WHERE id=?", id).Scan(&audio, &deleted); err != nil {
		t.Fatal(err)
	}
	if removed {
		if audio != nil || deleted == nil {
			t.Fatal(audio, deleted)
		}
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatal(err)
		}
	} else if audio == nil || deleted != nil {
		t.Fatal(audio, deleted)
	}
}
