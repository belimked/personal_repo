package api

import (
	"net/url"
	"testing"
)

func TestSearch(t *testing.T) {
	f := newRecordingFixture(t)
	id := f.completed(t) // 转写为“隐私转写”
	code, _ := f.call("POST", "/api/items", `{"id":"s-1","kind":"todo","data":{"title":"交报销单","due":"2026-11-20"}}`, f.user)
	expect(t, code, 200)
	code, _ = f.call("POST", "/api/items", `{"id":"s-2","kind":"todo","data":{"title":"报销已删"}}`, f.user)
	expect(t, code, 200)
	code, _ = f.call("DELETE", "/api/items/s-2", "", f.user)
	expect(t, code, 200)

	q := func(token, s string) map[string]any {
		t.Helper()
		code, v := f.call("GET", "/api/search?q="+url.QueryEscape(s), "", token)
		expect(t, code, 200)
		return v
	}
	v := q(f.user, "隐私")
	said := v["said"].([]any)
	if len(said) == 0 || said[0].(map[string]any)["recording_id"] != id || said[0].(map[string]any)["snippet"] != "隐私转写" {
		t.Fatal(v)
	}
	v = q(f.user, "报销")
	things := v["things"].([]any)
	if len(things) != 1 || things[0].(map[string]any)["due"] != "2026-11-20" {
		t.Fatal(v)
	}
	// 别人的内容搜不到
	code, u := f.call("POST", "/api/admin/users", `{"email":"two@example.com","name":"第二位"}`, f.admin)
	expect(t, code, 200)
	other := u["user"].(map[string]any)["id"].(string)
	f.a.DB.Exec("INSERT INTO recordings(id,user_id,title,mime,size_bytes,status,created_at,updated_at) VALUES('o1',?,'别人的会','audio/mp4',1,'done',?,?)", other, Now(), Now())
	f.a.DB.Exec("INSERT INTO transcripts(recording_id,text,segments,created_at) VALUES('o1','别人的秘密','[]',?)", Now())
	f.a.DB.Exec("INSERT INTO items VALUES('o2',?,'todo','{\"title\":\"别人的秘密\"}',?,?,0)", other, Now(), Now())
	if v = q(f.user, "别人"); len(v["said"].([]any)) != 0 || len(v["files"].([]any)) != 0 || len(v["things"].([]any)) != 0 {
		t.Fatal(v)
	}
	code, _ = f.call("GET", "/api/search?q=", "", f.user)
	expect(t, code, 400)
	if s := snippet("一二三四五六七八九十一二三四五六七八九十一二三四五六关键词后面", "关键词"); s[:3] != "…" {
		t.Fatal(s)
	}
}
