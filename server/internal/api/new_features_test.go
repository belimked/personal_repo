package api

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHomeMessagesGzip(t *testing.T) {
	a, c := setup(t, "")
	token := login(t, c, "lily@demo.com")
	uid := loginID(t, c, token)
	_, v := c("POST", "/api/items", `{"id":"x","kind":"todo","data":{"title":"hello"}}`, token)
	if v["item"] == nil {
		t.Fatal(v)
	}
	for i, at := range []string{"2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z", "2026-01-03T00:00:00.000Z"} {
		a.DB.Exec("INSERT INTO messages VALUES(?,?,?,?,?,?,?)", ID(), uid, "home", "user", string(rune('a'+i)), nil, at)
	}
	code, v := c("GET", "/api/home?msg_limit=2", "", token)
	expect(t, code, 200)
	if len(v["items"].([]any)) != 1 || len(v["messages"].([]any)) != 2 || v["has_more"] != true || v["brief"] != nil {
		t.Fatal(v)
	}
	code, v = c("GET", "/api/messages?limit=1&before=2026-01-03T00:00:00.000Z", "", token)
	expect(t, code, 200)
	if v["has_more"] != true || v["messages"].([]any)[0].(map[string]any)["content"] != "b" {
		t.Fatal(v)
	}
	req := httptest.NewRequest("GET", "/api/home", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept-Encoding", "gzip")
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, req)
	if w.Header().Get("Content-Encoding") != "gzip" {
		t.Fatal(w.Header())
	}
	zr, e := gzip.NewReader(bytes.NewReader(w.Body.Bytes()))
	if e != nil {
		t.Fatal(e)
	}
	raw, _ := io.ReadAll(zr)
	if !bytes.Contains(raw, []byte(`"messages"`)) {
		t.Fatal(string(raw))
	}
}
func TestStreamAndAsk(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var b map[string]any
		json.NewDecoder(r.Body).Decode(&b)
		if b["stream"] == true {
			w.Header().Set("Content-Type", "text/event-stream")
			io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"你好\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"呀\"}}]}\n\ndata: [DONE]\n\n")
			return
		}
		io.WriteString(w, `{"choices":[{"message":{"content":"{\"from\":\"2026-11-01\",\"to\":\"2026-11-30\",\"kinds\":[\"todo\"],\"status\":\"open\",\"scope\":[\"things\"],\"keywords\":[],\"answer_hint\":\"本月\"}"}}]}`)
	}))
	defer up.Close()
	a, c := setup(t, up.URL)
	token := login(t, c, "lily@demo.com")
	uid := loginID(t, c, token)
	req := httptest.NewRequest("POST", "/api/chat/stream", strings.NewReader(`{"message":"hi"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept-Encoding", "gzip")
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, req)
	if w.Header().Get("Content-Encoding") != "" || !strings.Contains(w.Body.String(), `"reply":"你好呀"`) || strings.Count(w.Body.String(), "data: ") != 3 {
		t.Fatal(w.Header(), w.Body.String())
	}
	for _, v := range []struct{ id, due string }{{"late", "2026-10-30"}, {"month", "2026-11-20"}, {"other", "2026-12-20"}} {
		a.DB.Exec("INSERT INTO items VALUES(?,?,?,?,?,?,0)", v.id, uid, "todo", `{"title":"待办","due":"`+v.due+`"}`, Now(), Now())
	}
	code, result := c("POST", "/api/ask", `{"q":"这个月需要处理的事情"}`, token)
	expect(t, code, 200)
	if result["mode"] != "ask" || len(result["things"].([]any)) != 2 {
		t.Fatal(result)
	}
	a.LLM.Key = ""
	failReq := httptest.NewRequest("POST", "/api/chat/stream", strings.NewReader(`{"message":"fail"}`))
	failReq.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	a.Handler().ServeHTTP(w, failReq)
	if !strings.Contains(w.Body.String(), `"fallback":true`) || strings.Count(w.Body.String(), "data: ") != 2 {
		t.Fatal(w.Body.String())
	}
	code, result = c("POST", "/api/ask", `{"q":"帮我搜一下待办"}`, token)
	expect(t, code, 200)
	if result["mode"] != "keyword" || len(result["things"].([]any)) != 3 {
		t.Fatal(result)
	}
}
func TestJobs(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var b map[string]any
		json.NewDecoder(r.Body).Decode(&b)
		msgs := b["messages"].([]any)
		system := msgs[0].(map[string]any)["content"].(string)
		reply := "早上好"
		if strings.Contains(system, "新增的确定事实") {
			reply = `[{"text":"已有","group":"工作","from":"来自：对话"},{"text":"新的事实","group":"工作","from":"来自：对话"}]`
		}
		raw, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": reply}}}})
		w.Write(raw)
	}))
	defer up.Close()
	a, c := setup(t, up.URL)
	token := login(t, c, "lily@demo.com")
	admin := login(t, c, "admin@demo.com")
	uid := loginID(t, c, token)
	now := time.Now().In(taipei)
	today := now.Format("2006-01-02")
	a.DB.Exec("INSERT INTO items VALUES(?,?,?,?,?,?,0)", "due", uid, "todo", `{"title":"交材料","due":"`+today+`"}`, Now(), Now())
	a.DB.Exec("INSERT INTO items VALUES(?,?,?,?,?,?,0)", "fact", uid, "fact", `{"text":"已有"}`, Now(), Now())
	yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")
	a.DB.Exec("INSERT INTO messages VALUES(?,?,?,?,?,?,?)", ID(), uid, "home", "user", "我有一个新的事实", nil, yesterday+"T12:00:00.000+08:00")
	for _, mode := range []string{"on", "quiet", "off"} {
		a.DB.Exec("INSERT INTO items VALUES(?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET data=excluded.data", "setting-proactive", uid, "setting", `{"value":"`+mode+`"}`, Now(), Now())
		for _, name := range []string{"morning", "weekly", "profile"} {
			key := jobKey(name, now) + "-" + mode
			manual := mode != "on"
			_, e := a.runJob(name, uid, manual, now)
			if e != nil {
				t.Fatal(e)
			}
			var count int
			a.DB.QueryRow("SELECT count(*) FROM job_runs WHERE job=? AND user_id=?", name, uid).Scan(&count)
			_, e = a.runJob(name, uid, manual, now)
			if e != nil {
				t.Fatal(e)
			}
			var after int
			a.DB.QueryRow("SELECT count(*) FROM job_runs WHERE job=? AND user_id=?", name, uid).Scan(&after)
			if (mode == "on" && after != count) || (manual && after != count+1) {
				t.Fatal(key, name, count, after)
			}
			var detail string
			a.DB.QueryRow("SELECT detail FROM job_runs WHERE job=? AND user_id=? ORDER BY rowid DESC LIMIT 1", name, uid).Scan(&detail)
			if mode == "off" && detail != "skipped: off" {
				t.Fatal(name, detail)
			}
		}
	}
	var factCount int
	a.DB.QueryRow("SELECT count(*) FROM items WHERE user_id=? AND kind='fact'", uid).Scan(&factCount)
	if factCount != 2 {
		t.Fatal(factCount)
	}
	a.DB.Exec("INSERT INTO items VALUES(?,?,?,?,?,?,0)", "remind", uid, "todo", `{"title":"喝水","remind_at":"2000-01-01T00:00:00.000Z"}`, Now(), Now())
	_, e := a.runJob("remind", uid, false, now)
	if e != nil {
		t.Fatal(e)
	}
	var raw string
	a.DB.QueryRow("SELECT data FROM items WHERE id='remind'").Scan(&raw)
	if !strings.Contains(raw, "reminded_at") {
		t.Fatal(raw)
	}
	code, v := c("GET", "/api/admin/jobs", "", admin)
	expect(t, code, 200)
	if v["jobs"] == nil {
		t.Fatal(v)
	}
	code, _ = c("GET", "/api/admin/jobs", "", token)
	expect(t, code, 403)
	code, _ = c("PUT", "/api/admin/jobs/morning", `{"enabled":false,"at":"09:30"}`, admin)
	expect(t, code, 200)
	enabled, at := a.jobConfig("morning")
	if enabled || at != "09:30" {
		t.Fatal(enabled, at)
	}
	code, _ = c("POST", "/api/admin/jobs/morning/run", `{"user_id":"`+uid+`"}`, admin)
	expect(t, code, 200)
}
func TestWake(t *testing.T) {
	a, _ := setup(t, "")
	a.wake = make(chan struct{}, 1)
	a.wakeQueue()
	a.wakeQueue()
	if len(a.wake) != 1 {
		t.Fatal("wake should coalesce")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	a.drainQueue(ctx)
}

func TestDemoItemAndMentionsFiles(t *testing.T) {
	if !demoItem("todo", map[string]any{"state": "pending", "title": "小周的周报"}) {
		t.Fatal("todo with state should be demo")
	}
	if !demoItem("stash", map[string]any{"briefId": "weekly-zhou"}) {
		t.Fatal("stash with briefId should be demo")
	}
	if demoItem("todo", map[string]any{"title": "买菜", "done": false}) || demoItem("idea", map[string]any{"state": "x"}) {
		t.Fatal("real items must not be demo")
	}
	if mentionsFiles("这个月需要处理的事情") {
		t.Fatal("plain task query should not search files")
	}
	if !mentionsFiles("上周开会说要办的事") || !mentionsFiles("这周的录音") {
		t.Fatal("meeting/recording query should search files")
	}
}
