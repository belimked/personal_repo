package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestMessageSearchAndEscaping(t *testing.T) {
	a, call := setup(t, "")
	token := login(t, call, "lily@demo.com")
	uid := loginID(t, call, token)
	for i, content := range []string{"plain", "100%", "a_b", `a\b`, "100 extra"} {
		_, err := a.DB.Exec("INSERT INTO messages(id,user_id,thread,role,content,model,created_at) VALUES(?,?,?,?,?,?,?)", ID(), uid, "home", "user", content, nil, "2026-01-0"+string(rune('1'+i))+"T00:00:00.000Z")
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, tc := range []struct{ q, content string }{{"%", "100%"}, {"_", "a_b"}, {`\`, `a\b`}, {"plain", "plain"}} {
		code, v := call("GET", "/api/messages?q="+url.QueryEscape(tc.q), "", token)
		expect(t, code, 200)
		messages := v["messages"].([]any)
		if len(messages) != 1 || messages[0].(map[string]any)["content"] != tc.content || messages[0].(map[string]any)["item_id"] != nil || messages[0].(map[string]any)["item_kind"] != nil {
			t.Fatal(tc, v)
		}
	}
	code, v := call("GET", "/api/messages?q=100&limit=1", "", token)
	expect(t, code, 200)
	if v["has_more"] != true || len(v["messages"].([]any)) != 1 {
		t.Fatal(v)
	}
	code, v = call("GET", "/api/messages?q=100&before=2026-01-05T00:00:00.000Z", "", token)
	expect(t, code, 200)
	if len(v["messages"].([]any)) != 1 {
		t.Fatal(v)
	}
}

func TestConvertMessages(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request map[string]any
		json.NewDecoder(r.Body).Decode(&request)
		messages := request["messages"].([]any)
		prompt := messages[1].(map[string]any)["content"].(string)
		if !strings.Contains(prompt, "我：先做报告\n小禾：好的") {
			t.Errorf("unexpected prompt: %s", prompt)
		}
		w.Write([]byte(`{"choices":[{"message":{"content":"答案：{\"title\":\"完成报告\",\"note\":\"周五交\",\"due\":\"2026-11-20\",\"owner\":\"小王\"}"}}]}`))
	}))
	defer up.Close()
	a, call := setup(t, up.URL)
	token := login(t, call, "lily@demo.com")
	uid := loginID(t, call, token)
	for i, row := range []struct{ id, role, content string }{{"m1", "user", "先做报告"}, {"m2", "assistant", "好的"}} {
		_, err := a.DB.Exec("INSERT INTO messages(id,user_id,thread,role,content,model,created_at) VALUES(?,?,?,?,?,?,?)", row.id, uid, "home", row.role, row.content, nil, "2026-01-0"+string(rune('1'+i))+"T00:00:00.000Z")
		if err != nil {
			t.Fatal(err)
		}
	}
	code, v := call("POST", "/api/messages/convert", `{"ids":["m2","m1"],"kind":"todo","scene":"work"}`, token)
	expect(t, code, 200)
	item := v["item"].(map[string]any)
	data := item["data"].(map[string]any)
	if item["kind"] != "todo" || data["title"] != "完成报告" || data["due"] != "2026-11-20" || data["owner"] != "小王" || data["done"] != false || data["scene"] != "work" {
		t.Fatal(v)
	}
	code, v = call("GET", "/api/messages", "", token)
	expect(t, code, 200)
	for _, raw := range v["messages"].([]any) {
		msg := raw.(map[string]any)
		if msg["item_id"] != item["id"] || msg["item_kind"] != "todo" {
			t.Fatal(v)
		}
	}
	var audits int
	if err := a.DB.QueryRow("SELECT count(*) FROM audit WHERE action='convert_messages' AND target=?", item["id"]).Scan(&audits); err != nil || audits != 1 {
		t.Fatal(audits, err)
	}
	other := login(t, call, "admin@demo.com")
	otherID := loginID(t, call, other)
	a.DB.Exec("INSERT INTO messages(id,user_id,thread,role,content,model,created_at) VALUES(?,?,?,?,?,?,?)", "foreign", otherID, "home", "user", "别人的", nil, Now())
	for _, body := range []string{`{"ids":["m1","foreign"],"kind":"idea","scene":"life"}`, `{"ids":["m1","m1"],"kind":"idea","scene":"life"}`, `{"ids":["m1"],"kind":"bad","scene":"life"}`} {
		code, _ = call("POST", "/api/messages/convert", body, token)
		expect(t, code, 400)
	}
}

func TestConvertFallback(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "down", 502) }))
	defer up.Close()
	a, call := setup(t, up.URL)
	token := login(t, call, "lily@demo.com")
	uid := loginID(t, call, token)
	content := "这是一段超过二十个汉字的消息，用来验证标题截断能正确处理中文"
	a.DB.Exec("INSERT INTO messages(id,user_id,thread,role,content,model,created_at) VALUES(?,?,?,?,?,?,?)", "fallback", uid, "home", "user", content, nil, Now())
	code, v := call("POST", "/api/messages/convert", `{"ids":["fallback"],"kind":"watch","scene":"life"}`, token)
	expect(t, code, 200)
	data := v["item"].(map[string]any)["data"].(map[string]any)
	if data["title"] != string([]rune(content)[:20]) || data["note"] != "" || data["done"] != nil {
		t.Fatal(v)
	}
}
