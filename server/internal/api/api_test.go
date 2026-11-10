package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"xiaohe/server/internal/llm"
	"xiaohe/server/internal/store"
)

func setup(t *testing.T, upstream string) (*API, func(string, string, string, string) (int, map[string]any)) {
	t.Helper()
	db, e := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { db.Close() })
	if e = db.Migrate(); e != nil {
		t.Fatal(e)
	}
	a := &API{DB: db, Version: "go-test", Origins: []string{"https://allowed.test"}, LLM: llm.Client{Key: "test", Base: upstream}}
	call := func(method, path, body, token string) (int, map[string]any) {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		a.Handler().ServeHTTP(w, r)
		var v map[string]any
		if e := json.Unmarshal(w.Body.Bytes(), &v); e != nil {
			t.Fatalf("%s %s: %v: %s", method, path, e, w.Body.String())
		}
		return w.Code, v
	}
	return a, call
}
func login(t *testing.T, call func(string, string, string, string) (int, map[string]any), email string) string {
	t.Helper()
	code, v := call("POST", "/api/auth/login", `{"email":"`+email+`","password":"demo1234"}`, "")
	if code != 200 {
		t.Fatalf("login %v %v", code, v)
	}
	return v["token"].(string)
}
func expect(t *testing.T, got, want int) {
	t.Helper()
	if got != want {
		t.Fatalf("status %d want %d", got, want)
	}
}
func TestCompatibility(t *testing.T) {
	if h := Hash("legacy-pass-1", "00112233445566778899aabbccddeeff"); h != "ee853bbf35396037880f4978879d0a69761eba9b1d0751f1bdd37aa7acb9f899" {
		t.Fatal(h)
	}
}
func TestAuthItemsChat(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var v map[string]any
		json.NewDecoder(r.Body).Decode(&v)
		if v["model"] == "deepseek-v4-pro" && v["max_tokens"] != float64(3000) {
			t.Error(v)
		}
		http.Error(w, "down", 502)
	}))
	defer up.Close()
	a, c := setup(t, up.URL)
	code, _ := c("GET", "/api/items", "", "")
	expect(t, code, 401)
	code, _ = c("POST", "/api/auth/login", `{"email":"lily@demo.com","password":"bad"}`, "")
	expect(t, code, 401)
	user := login(t, c, "lily@demo.com")
	admin := login(t, c, "admin@demo.com")
	code, _ = c("GET", "/api/items", "", admin)
	expect(t, code, 403)
	code, _ = c("POST", "/api/admin/users", `{}`, user)
	expect(t, code, 403)
	code, _ = c("GET", "/api/me", "", user)
	expect(t, code, 200)
	code, v := c("POST", "/api/items", `{"id":"item-1","kind":"todo","data":{"text":"A"}}`, user)
	expect(t, code, 200)
	updated := v["item"].(map[string]any)["updated_at"].(string)
	code, v = c("PATCH", "/api/items/item-1", `{"data":{"extra":1}}`, user)
	expect(t, code, 200)
	if v["item"].(map[string]any)["data"].(map[string]any)["text"] != "A" {
		t.Fatal(v)
	}
	code, v = c("GET", "/api/items?since=2000-01-01T00:00:00.000Z", "", user)
	expect(t, code, 200)
	if len(v["items"].([]any)) != 1 {
		t.Fatal(v)
	}
	code, v = c("GET", "/api/items?since=2999-01-01T00:00:00.000Z", "", user)
	expect(t, code, 200)
	if len(v["items"].([]any)) != 0 {
		t.Fatal(v)
	}
	code, _ = c("POST", "/api/items", `{"id":"item-1","kind":"todo","data":{}}`, admin)
	expect(t, code, 403)
	code, v = c("POST", "/api/admin/users", `{"email":"two@example.com","name":"第二位"}`, admin)
	expect(t, code, 200)
	second := v["user"].(map[string]any)["id"].(string)
	a.DB.Exec("INSERT INTO items VALUES(?,?,?,?,?,?,0)", "other", second, "todo", "{}", Now(), Now())
	code, _ = c("PATCH", "/api/items/other", `{"data":{}}`, user)
	expect(t, code, 404)
	code, _ = c("POST", "/api/items", `{"id":"other","kind":"todo","data":{}}`, user)
	expect(t, code, 403)
	code, _ = c("DELETE", "/api/items/item-1", "", user)
	expect(t, code, 200)
	code, v = c("GET", "/api/items", "", user)
	expect(t, code, 200)
	if v["items"].([]any)[0].(map[string]any)["deleted"] != float64(1) {
		t.Fatal(v)
	}
	code, v = c("POST", "/api/chat", `{"message":"周报","mode":"make"}`, user)
	expect(t, code, 200)
	if v["fallback"] != true || v["model"] != "deepseek-v4-pro" || !strings.Contains(v["reply"].(string), "简版") {
		t.Fatal(v)
	}
	code, v = c("GET", "/api/messages", "", user)
	expect(t, code, 200)
	if len(v["messages"].([]any)) != 2 {
		t.Fatal(v)
	}
	for i := 0; i < 9; i++ {
		code, _ = c("POST", "/api/chat", `{"message":"hi"}`, user)
		expect(t, code, 200)
	}
	code, _ = c("POST", "/api/chat", `{"message":"hi"}`, user)
	expect(t, code, 429)
	code, _ = c("POST", "/api/auth/logout", `{}`, user)
	expect(t, code, 200)
	code, _ = c("GET", "/api/me", "", user)
	expect(t, code, 401)
	_ = updated
}
func TestAdmin(t *testing.T) {
	a, c := setup(t, "")
	admin := login(t, c, "admin@demo.com")
	code, v := c("GET", "/api/admin/users", "", admin)
	expect(t, code, 200)
	if len(v["users"].([]any)) != 2 {
		t.Fatal(v)
	}
	code, v = c("POST", "/api/admin/users", `{"email":"new@example.com","name":"新用户","role":"user"}`, admin)
	expect(t, code, 200)
	id := v["user"].(map[string]any)["id"].(string)
	pw := v["temp_password"].(string)
	code, _ = c("POST", "/api/admin/users", `{"email":"new@example.com","name":"x"}`, admin)
	expect(t, code, 400)
	code, _ = c("PATCH", "/api/admin/users/"+id, `{"disabled":true}`, admin)
	expect(t, code, 200)
	code, _ = c("POST", "/api/auth/login", `{"email":"new@example.com","password":"`+pw+`"}`, "")
	expect(t, code, 403)
	code, _ = c("PATCH", "/api/admin/users/"+id, `{"disabled":false}`, admin)
	expect(t, code, 200)
	code, _ = c("POST", "/api/admin/users/"+id+"/reset-password", `{}`, admin)
	expect(t, code, 200)
	code, _ = c("PUT", "/api/admin/settings", `{"settings":{"api_key":"bad"}}`, admin)
	expect(t, code, 400)
	code, _ = c("PUT", "/api/admin/settings", `{"settings":{"theme":"plain"}}`, admin)
	expect(t, code, 200)
	code, v = c("GET", "/api/admin/settings", "", admin)
	expect(t, code, 200)
	if v["settings"].(map[string]any)["theme"] != "plain" {
		t.Fatal(v)
	}
	code, v = c("POST", "/api/admin/test-model", `{}`, admin)
	expect(t, code, 200)
	if v["ok"] != false {
		t.Fatal(v)
	}
	code, _ = c("DELETE", "/api/admin/users/"+id, "", admin)
	expect(t, code, 200)
	code, _ = c("POST", "/api/admin/users/"+id+"/restore", `{}`, admin)
	expect(t, code, 200)
	a.DB.Exec("UPDATE users SET deleted_at=? WHERE id=?", time.Now().Add(-31*24*time.Hour).UTC().Format("2006-01-02T15:04:05.000Z"), id)
	code, _ = c("POST", "/api/admin/users/"+id+"/restore", `{}`, admin)
	expect(t, code, 400)
	code, v = c("GET", "/api/admin/audit", "", admin)
	expect(t, code, 200)
	if len(v["audit"].([]any)) < 4 {
		t.Fatal(v)
	}
	code, _ = c("DELETE", "/api/admin/users/"+loginID(t, c, admin), "", admin)
	expect(t, code, 400)
}
func loginID(t *testing.T, c func(string, string, string, string) (int, map[string]any), token string) string {
	_, v := c("GET", "/api/me", "", token)
	return v["user"].(map[string]any)["id"].(string)
}
func TestCORS(t *testing.T) {
	a, _ := setup(t, "")
	for _, origin := range []string{"https://allowed.test", "https://evil.test"} {
		r := httptest.NewRequest("OPTIONS", "/api/chat", nil)
		r.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		a.Handler().ServeHTTP(w, r)
		expect(t, w.Code, 200)
		if (w.Header().Get("Access-Control-Allow-Origin") != "") != (origin == "https://allowed.test") {
			t.Fatal(origin, w.Header())
		}
	}
}
