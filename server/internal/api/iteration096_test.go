package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestLinkImportGuards(t *testing.T) {
	f := newRecordingFixture(t)
	page := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/redirect":
			http.Redirect(w, r, "http://127.0.0.1:1/private", 302)
		case "/large":
			w.Header().Set("Content-Type", "text/plain")
			fmt.Fprint(w, strings.Repeat("x", (5<<20)+1))
		default:
			w.Header().Set("Content-Type", "text/html")
			fmt.Fprint(w, "<title>一页资料</title><nav>不要</nav><p>正文内容</p><script>隐私</script>")
		}
	}))
	defer page.Close()
	call := func(link string) (int, map[string]any) {
		return f.call("POST", "/api/files/link", fmt.Sprintf(`{"url":%q}`, link), f.user)
	}
	code, out := call(page.URL)
	if code != 400 || out["error"] != "invalid_link" {
		t.Fatal(code, out)
	}
	f.a.AllowPrivateLinks = true
	code, out = call(page.URL)
	if code != 200 {
		t.Fatal(code, out)
	}
	id := out["recording"].(map[string]any)["id"]
	row, _ := f.a.DB.One("SELECT source_url,kind,mime FROM recordings WHERE id=?", id)
	if row["source_url"] != page.URL || row["kind"] != "file" || row["mime"] != "text/plain" {
		t.Fatal(row)
	}
	code, _ = call(page.URL + "/large")
	if code != 400 {
		t.Fatal(code)
	}
	f.a.AllowPrivateLinks = false
	code, _ = call(page.URL + "/redirect")
	if code != 400 {
		t.Fatal(code)
	}
}
func TestPointsExportForgetAndPrivacy(t *testing.T) {
	f := newRecordingFixture(t)
	code, home := f.call("GET", "/api/home", "", f.user)
	if code != 200 {
		t.Fatal(code)
	}
	user := home["user"].(map[string]any)["id"]
	today := Now()
	f.a.DB.Exec("INSERT INTO messages(id,user_id,thread,role,content,model,created_at) VALUES(?,?,?,?,?,?,?)", ID(), user, "home", "user", "你好", nil, today)
	f.a.DB.Exec("INSERT INTO items VALUES(?,?,?,?,?,?,0)", "fact-test", user, "fact", `{"text":"测试"}`, today, today)
	f.a.DB.Exec("INSERT INTO job_runs(id,job,user_id,run_key,status,started_at) VALUES(?,?,?,?,?,?)", ID(), "profile", user, "old", "ok", today)
	code, p := f.call("GET", "/api/points", "", f.user)
	if code != 200 || p["used"].(float64) < 1 {
		t.Fatal(code, p)
	}
	code, e := f.call("GET", "/api/export", "", f.user)
	if code != 200 || len(e["items"].([]any)) == 0 {
		t.Fatal(code, e)
	}
	code, res := f.call("POST", "/api/forget", `{}`, f.user)
	if code != 200 || res["deleted"] != float64(1) {
		t.Fatal(code, res)
	}
	var n int
	f.a.DB.QueryRow("SELECT count(*) FROM job_runs WHERE job='profile' AND user_id=?", user).Scan(&n)
	if n != 0 {
		t.Fatal(n)
	}
	f.a.DB.Exec("INSERT INTO items VALUES(?,?,?,?,?,?,0)", "setting-sensitive", user, "setting", `{"value":{"health":false,"face":true}}`, today, today)
	allowed := sensitiveSettings(f.a, fmt.Sprint(user))
	if allowed["health"] || !allowed["face"] || !allowed["finance"] {
		t.Fatal(allowed)
	}
}
func TestMinutesSuggestionAndSensitiveProfile(t *testing.T) {
	f := newRecordingFixture(t)
	f.minutes.Store(`{"title":"纪要","summary":"摘要","action_items":[{"text":"跟进","due":"2026-12-01","suggest":"按会上约定跟进","suggest_short":"按约定跟进"}]}`)
	id := f.upload(t)
	f.a.ProcessOne(context.Background())
	row, _ := f.a.DB.One("SELECT data FROM items WHERE id=?", id+"-0")
	if row == nil || !strings.Contains(fmt.Sprint(row["data"]), "按会上约定跟进") {
		t.Fatal(row)
	}
	_, home := f.call("GET", "/api/home", "", f.user)
	uid := fmt.Sprint(home["user"].(map[string]any)["id"])
	f.a.DB.Exec("INSERT INTO items VALUES(?,?,?,?,?,?,0)", "setting-sensitive", uid, "setting", `{"value":{"health":false}}`, Now(), Now())
	yesterday := time.Now().In(taipei).AddDate(0, 0, -1).UTC().Format(time.RFC3339)
	f.a.DB.Exec("INSERT INTO messages(id,user_id,thread,role,content,model,created_at) VALUES(?,?,?,?,?,?,?)", ID(), uid, "home", "user", "喜欢跑步", nil, yesterday)
	f.minutes.Store(`[{"text":"每天跑步","group":"健康","from":"对话"},{"text":"负责项目","group":"工作","from":"对话"}]`)
	if _, err := f.a.profileJob(uid, time.Now().In(taipei)); err != nil {
		t.Fatal(err)
	}
	var count int
	f.a.DB.QueryRow("SELECT count(*) FROM items WHERE user_id=? AND kind='fact' AND deleted=0", uid).Scan(&count)
	if count != 1 {
		t.Fatal(count)
	}
	if prompt, _ := f.lastPrompt.Load().(string); !strings.Contains(prompt, "不要记录健康相关事实") {
		t.Fatal(prompt)
	}
}

func TestSuggestBackfillAndNotifyFilter(t *testing.T) {
	f := newRecordingFixture(t)
	_, home := f.call("GET", "/api/home", "", f.user)
	uid := fmt.Sprint(home["user"].(map[string]any)["id"])
	f.minutes.Store(`{"suggest":"按纪要安排完成","suggest_short":"尽快安排"}`)
	now := Now()
	f.a.DB.Exec("INSERT INTO items VALUES(?,?,?,?,?,?,0)", "suggest-test", uid, "idea", `{"title":"安排事项"}`, now, now)
	f.call("GET", "/api/home", "", f.user)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		row, _ := f.a.DB.One("SELECT json_extract(data,'$.suggest') AS suggestion FROM items WHERE id='suggest-test'")
		if row != nil && row["suggestion"] == "按纪要安排完成" {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	row, _ := f.a.DB.One("SELECT json_extract(data,'$.suggest_short') AS short FROM items WHERE id='suggest-test'")
	if row["short"] != "尽快安排" {
		t.Fatal(row)
	}
	f.a.DB.Exec("INSERT INTO items VALUES(?,?,?,?,?,?,0)", "setting-notify", uid, "setting", `{"value":"urgent"}`, now, now)
	if f.a.pushAllowed(uid, "录音整理好了", map[string]string{"recording_id": "x"}) || !f.a.pushAllowed(uid, "录音没能转写", map[string]string{"recording_id": "x"}) || !f.a.pushAllowed(uid, "提醒", map[string]string{"type": "remind"}) {
		t.Fatal("urgent")
	}
	f.a.DB.Exec("UPDATE items SET data=? WHERE id='setting-notify'", `{"value":"off"}`)
	if f.a.pushAllowed(uid, "提醒", map[string]string{"type": "remind"}) {
		t.Fatal("off")
	}
}
