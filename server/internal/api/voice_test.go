package api

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"
)

func uploadVoice(t *testing.T, f *recordingFixture, kind string) (int, string) {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	w.WriteField("kind", kind)
	part, _ := w.CreateFormFile("file", "a.m4a")
	part.Write([]byte("audio"))
	w.Close()
	r := httptest.NewRequest("POST", "/api/recordings", &body)
	r.Header.Set("Content-Type", w.FormDataContentType())
	r.Header.Set("Authorization", "Bearer "+f.user)
	rec := httptest.NewRecorder()
	f.a.Handler().ServeHTTP(rec, r)
	var out struct {
		Recording struct{ ID, Kind string } `json:"recording"`
	}
	json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out.Recording.ID
}

func TestVoiceNoteBecomesChat(t *testing.T) {
	f := newRecordingFixture(t)
	f.device(t, strings.Repeat("cd", 32))
	if code, _ := uploadVoice(t, f, "bogus"); code != 400 {
		t.Fatal("invalid kind accepted", code)
	}
	code, id := uploadVoice(t, f, "voice")
	expect(t, code, 200)
	f.a.ProcessOne(context.Background())
	var status, kind string
	f.a.DB.QueryRow("SELECT status,kind FROM recordings WHERE id=?", id).Scan(&status, &kind)
	if status != "done" || kind != "voice" {
		t.Fatal(status, kind)
	}
	msgs, _ := f.a.DB.Rows("SELECT role,content FROM messages WHERE thread='home' ORDER BY created_at,rowid")
	if len(msgs) != 2 || msgs[0]["role"] != "user" || msgs[0]["content"] != "隐私转写" || msgs[1]["role"] != "assistant" || !strings.Contains(str(msgs[1]["content"]), "已记到事项") {
		t.Fatal(msgs)
	}
	// 单人说话：纪要提示词要求用“你”，转写不带“说话人”编号
	if p, _ := f.lastPrompt.Load().(string); !strings.Contains(p, "用“你”指代") {
		t.Fatal(p)
	}
	f.regenerate(t, id)
	var n int
	f.a.DB.QueryRow("SELECT count(*) FROM messages WHERE thread='home'").Scan(&n)
	if n != 3 { // 重新生成只追加纪要消息，不重复对话
		t.Fatal(n)
	}
	f.pushMu.Lock()
	defer f.pushMu.Unlock()
	if len(f.payloads) != 2 || !strings.Contains(f.payloads[0], "小禾回复了") || !strings.Contains(f.payloads[1], "会议纪要整理好了") {
		t.Fatal(f.payloads)
	}
}

func TestMeetingDefaultKind(t *testing.T) {
	f := newRecordingFixture(t)
	id := f.completed(t)
	var kind string
	f.a.DB.QueryRow("SELECT kind FROM recordings WHERE id=?", id).Scan(&kind)
	if kind != "meeting" {
		t.Fatal(kind)
	}
	if speakerHint(2) == speakerHint(1) || !strings.Contains(speakerHint(2), "名字或身份") {
		t.Fatal("speaker hint")
	}
}
