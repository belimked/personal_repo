package api

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
)

func uploadFile(t *testing.T, f *recordingFixture, name string, data []byte) (int, string, string) {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	w.WriteField("kind", "file")
	part, _ := w.CreateFormFile("file", name)
	part.Write(data)
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
	return rec.Code, out.Recording.ID, out.Recording.Kind
}

func docx(t *testing.T, text string) []byte {
	t.Helper()
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	w, _ := z.Create("word/document.xml")
	fmt.Fprintf(w, `<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>%s</w:t></w:r></w:p><w:p><w:r><w:t>第二段</w:t></w:r></w:p></w:body></w:document>`, text)
	z.Close()
	return b.Bytes()
}

func status(f *recordingFixture, id string) (string, string) {
	var s, e string
	f.a.DB.QueryRow("SELECT status,coalesce(error,'') FROM recordings WHERE id=?", id).Scan(&s, &e)
	return s, e
}

func TestFileUploadAndExtract(t *testing.T) {
	f := newRecordingFixture(t)
	var ocrCalls int
	ocr := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ocrCalls++
		fmt.Fprint(w, `{"code":100,"data":[{"text":"家长会","box":[[10,50],[80,50],[80,70],[10,70]]},{"text":"通知","box":[[90,52],[150,52],[150,72],[90,72]]},{"text":"周五下午三点","box":[[10,10],[150,10],[150,30],[10,30]]}]}`)
	}))
	defer ocr.Close()
	f.a.OCRURL = ocr.URL

	t.Run("不支持的类型", func(t *testing.T) {
		code, _, _ := uploadFile(t, f, "a.xlsx", []byte("PK\x03\x04"))
		expect(t, code, 400)
	})
	t.Run("内容和扩展名不符", func(t *testing.T) {
		code, _, _ := uploadFile(t, f, "a.png", []byte("not a png"))
		expect(t, code, 400)
	})
	t.Run("txt 全流程", func(t *testing.T) {
		code, id, kind := uploadFile(t, f, "笔记.txt", []byte("周五前把报销单交给财务"))
		expect(t, code, 200)
		if kind != "file" {
			t.Fatal(kind)
		}
		f.a.ProcessOne(context.Background())
		if s, _ := status(f, id); s != "done" {
			t.Fatal(s)
		}
		var text, model string
		f.a.DB.QueryRow("SELECT text,asr_model FROM transcripts WHERE recording_id=?", id).Scan(&text, &model)
		if text != "周五前把报销单交给财务" || model != "text" {
			t.Fatal(text, model)
		}
		if p, _ := f.lastPrompt.Load().(string); !strings.Contains(p, "资料") || strings.Contains(p, "说话人") {
			t.Fatal("prompt", p)
		}
		var msg string
		f.a.DB.QueryRow("SELECT content FROM messages WHERE user_id=(SELECT user_id FROM recordings WHERE id=?) AND role='assistant' ORDER BY created_at DESC LIMIT 1", id).Scan(&msg)
		_, sr := f.call("GET", "/api/search?q="+url.QueryEscape("报销单"), "", f.user)
		if fs := sr["files"].([]any); len(fs) != 1 || fs[0].(map[string]any)["recording_id"] != id || len(sr["said"].([]any)) != 0 {
			t.Fatal("search", sr)
		}
		if !strings.HasPrefix(msg, "资料“") {
			t.Fatal(msg)
		}
	})
	t.Run("docx 读正文", func(t *testing.T) {
		code, id, _ := uploadFile(t, f, "a.docx", docx(t, "项目启动会纪要"))
		expect(t, code, 200)
		f.a.ProcessOne(context.Background())
		var text string
		f.a.DB.QueryRow("SELECT text FROM transcripts WHERE recording_id=?", id).Scan(&text)
		if !strings.Contains(text, "项目启动会纪要") || !strings.Contains(text, "第二段") {
			t.Fatal(text)
		}
	})
	t.Run("图片走 OCR 并按位置排版", func(t *testing.T) {
		code, id, _ := uploadFile(t, f, "a.png", []byte("\x89PNG\r\n\x1a\nxxxx"))
		expect(t, code, 200)
		f.a.ProcessOne(context.Background())
		if s, _ := status(f, id); s != "done" {
			t.Fatal(s)
		}
		var text string
		f.a.DB.QueryRow("SELECT text FROM transcripts WHERE recording_id=?", id).Scan(&text)
		if text != "周五下午三点\n家长会 通知" {
			t.Fatalf("%q", text)
		}
	})
	t.Run("空文本直接失败不重试", func(t *testing.T) {
		code, id, _ := uploadFile(t, f, "a.txt", []byte("  \n "))
		expect(t, code, 200)
		f.a.ProcessOne(context.Background())
		s, e := status(f, id)
		if s != "failed" || e != "这份文件里没读到文字" {
			t.Fatal(s, e)
		}
	})
	t.Run("OCR 离线时排队重试", func(t *testing.T) {
		f.a.OCRURL = "http://127.0.0.1:1"
		code, id, _ := uploadFile(t, f, "b.jpg", []byte{0xFF, 0xD8, 0xFF, 0xE0, 1, 2})
		expect(t, code, 200)
		f.a.ProcessOne(context.Background())
		var s string
		var next *string
		f.a.DB.QueryRow("SELECT status,next_try_at FROM recordings WHERE id=?", id).Scan(&s, &next)
		if s != "queued" || next == nil {
			t.Fatal(s, next)
		}
		f.a.OCRURL = ocr.URL
	})
	t.Run("资料保留 90 天", func(t *testing.T) {
		code, id, _ := uploadFile(t, f, "c.txt", []byte("留存测试内容"))
		expect(t, code, 200)
		f.a.DB.Exec("UPDATE recordings SET status='done',finished_at='2000-01-01T00:00:00.000Z',next_try_at=NULL WHERE id=?", id)
		recent := f.upload(t)
		f.a.DB.Exec("UPDATE recordings SET status='done',finished_at=? WHERE id=?", "2099-01-01T00:00:00.000Z", recent)
		var path string
		f.a.DB.QueryRow("SELECT audio_path FROM recordings WHERE id=?", id).Scan(&path)
		f.a.CleanupAudio()
		if _, e := os.Stat(path); !os.IsNotExist(e) {
			t.Fatal("old file kept")
		}
	})
	if ocrCalls == 0 {
		t.Fatal("ocr never called")
	}
}
