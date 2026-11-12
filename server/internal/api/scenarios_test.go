package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRequestScenarios(t *testing.T) {
	a, c := setup(t, "")
	user := login(t, c, "lily@demo.com")
	admin := login(t, c, "admin@demo.com")
	uid := loginID(t, c, user)
	for _, tc := range []struct {
		name, method, path, body, token string
		status                          int
		code                            string
	}{
		{"login success", "POST", "/api/auth/login", `{"email":"lily@demo.com","password":"demo1234"}`, "", 200, ""},
		{"login missing email", "POST", "/api/auth/login", `{"email":"missing@example.com","password":"demo1234"}`, "", 401, "invalid_credentials"},
		{"login wrong password", "POST", "/api/auth/login", `{"email":"lily@demo.com","password":"wrong"}`, "", 401, "invalid_credentials"},
		{"login normalized email", "POST", "/api/auth/login", `{"email":"  LILY@DEMO.COM  ","password":"demo1234"}`, "", 200, ""},
		{"missing token", "GET", "/api/me", "", "", 401, "unauthorized"},
		{"incorrect token", "GET", "/api/me", "", "wrong", 401, "unauthorized"},
		{"invalid JSON", "POST", "/api/items", "broken", user, 400, "invalid_body"},
		{"array body", "POST", "/api/items", "[]", user, 400, "invalid_body"},
		{"unknown route", "GET", "/api/missing", "", user, 404, "not_found"},
		{"options", "OPTIONS", "/api/items", "", "", 200, ""},
		{"admin forbidden users", "GET", "/api/admin/users", "", user, 403, "forbidden"},
		{"admin forbidden items", "GET", "/api/items", "", admin, 403, "forbidden"},
		{"admin forbidden messages", "GET", "/api/messages", "", admin, 403, "forbidden"},
		{"admin forbidden chat", "POST", "/api/chat", `{"message":"hi"}`, admin, 403, "forbidden"},
		{"invalid kind", "POST", "/api/items", `{"kind":"bad","data":{}}`, user, 400, "invalid_item"},
		{"invalid data", "POST", "/api/items", `{"kind":"todo","data":[]}`, user, 400, "invalid_item"},
		{"empty chat", "POST", "/api/chat", `{"message":" "}`, user, 400, "invalid_chat"},
		{"long chat", "POST", "/api/chat", fmt.Sprintf(`{"message":%q}`, strings.Repeat("a", 10001)), user, 400, "invalid_chat"},
		{"invalid mode", "POST", "/api/chat", `{"message":"hi","mode":"bad"}`, user, 400, "invalid_chat"},
		{"invalid email", "POST", "/api/admin/users", `{"email":"bad","name":"X"}`, admin, 400, "invalid_user"},
		{"missing user", "PATCH", "/api/admin/users/missing", `{"name":"X"}`, admin, 404, "not_found"},
		{"self delete", "DELETE", "/api/admin/users/" + loginID(t, c, admin), "", admin, 400, "self_delete"},
		{"sensitive key", "PUT", "/api/admin/settings", `{"settings":{"api_key":"x"}}`, admin, 400, "sensitive_setting"},
		{"sensitive value", "PUT", "/api/admin/settings", `{"settings":{"note":"my token"}}`, admin, 400, "sensitive_setting"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			status, v := c(tc.method, tc.path, tc.body, tc.token)
			expect(t, status, tc.status)
			if tc.code != "" && v["error"] != tc.code {
				t.Fatal(v)
			}
		})
	}
	t.Run("expired token", func(t *testing.T) {
		a.DB.Exec("UPDATE sessions SET expires_at=? WHERE user_id=?", "2000-01-01T00:00:00.000Z", uid)
		code, _ := c("GET", "/api/me", "", user)
		expect(t, code, 401)
	})
	t.Run("disabled account", func(t *testing.T) {
		a.DB.Exec("UPDATE users SET disabled=1 WHERE id=?", uid)
		code, _ := c("POST", "/api/auth/login", `{"email":"lily@demo.com","password":"demo1234"}`, "")
		expect(t, code, 403)
		a.DB.Exec("UPDATE users SET disabled=0 WHERE id=?", uid)
	})
	t.Run("deleted account", func(t *testing.T) {
		a.DB.Exec("UPDATE users SET deleted_at=? WHERE id=?", Now(), uid)
		code, _ := c("POST", "/api/auth/login", `{"email":"lily@demo.com","password":"demo1234"}`, "")
		expect(t, code, 403)
		a.DB.Exec("UPDATE users SET deleted_at=NULL WHERE id=?", uid)
	})
}

func TestItemScenarios(t *testing.T) {
	a, c := setup(t, "")
	u := login(t, c, "lily@demo.com")
	admin := login(t, c, "admin@demo.com")
	t.Run("create", func(t *testing.T) {
		code, _ := c("POST", "/api/items", `{"id":"one","kind":"todo","data":{"text":"A","nested":{"old":1}}}`, u)
		expect(t, code, 200)
	})
	t.Run("same id updates", func(t *testing.T) {
		code, v := c("POST", "/api/items", `{"id":"one","kind":"idea","data":{"text":"B"}}`, u)
		expect(t, code, 200)
		if v["item"].(map[string]any)["kind"] != "idea" {
			t.Fatal(v)
		}
	})
	t.Run("patch shallow merge", func(t *testing.T) {
		code, v := c("PATCH", "/api/items/one", `{"data":{"extra":1}}`, u)
		expect(t, code, 200)
		data := v["item"].(map[string]any)["data"].(map[string]any)
		if data["text"] != "B" || data["extra"] != float64(1) {
			t.Fatal(data)
		}
	})
	t.Run("kind filter", func(t *testing.T) {
		c("POST", "/api/items", `{"id":"two","kind":"todo","data":{}}`, u)
		code, v := c("GET", "/api/items?kind=idea", "", u)
		expect(t, code, 200)
		if len(v["items"].([]any)) != 1 {
			t.Fatal(v)
		}
	})
	t.Run("other user item", func(t *testing.T) {
		_, v := c("POST", "/api/admin/users", `{"email":"other@example.com","name":"Other"}`, admin)
		id := v["user"].(map[string]any)["id"]
		a.DB.Exec("INSERT INTO items VALUES(?,?,?,?,?,?,0)", "foreign", id, "todo", "{}", Now(), Now())
		code, _ := c("POST", "/api/items", `{"id":"foreign","kind":"todo","data":{}}`, u)
		expect(t, code, 403)
	})
	t.Run("delete since incremental", func(t *testing.T) {
		code, _ := c("DELETE", "/api/items/one", "", u)
		expect(t, code, 200)
		code, v := c("GET", "/api/items?since=2000-01-01T00:00:00.000Z", "", u)
		expect(t, code, 200)
		found := false
		for _, row := range v["items"].([]any) {
			item := row.(map[string]any)
			if item["id"] == "one" && item["deleted"] == float64(1) {
				found = true
			}
		}
		if !found {
			t.Fatal(v)
		}
	})
}

func TestMessageScenarios(t *testing.T) {
	a, c := setup(t, "")
	u := login(t, c, "lily@demo.com")
	id := loginID(t, c, u)
	for i := 0; i < 105; i++ {
		_, e := a.DB.Exec("INSERT INTO messages(id,user_id,thread,role,content,model,created_at) VALUES(?,?,?,?,?,?,?)", fmt.Sprintf("m-%03d", i), id, "home", "user", fmt.Sprint(i), nil, time.Date(2020, 1, 1, 0, 0, i, 0, time.UTC).Format("2006-01-02T15:04:05.000Z"))
		if e != nil {
			t.Fatal(e)
		}
	}
	for _, tc := range []struct {
		name, query string
		length      int
	}{{"zero defaults", "?limit=0", 50}, {"negative clamps", "?limit=-1", 1}, {"over 100 clamps", "?limit=101", 100}} {
		t.Run(tc.name, func(t *testing.T) {
			code, v := c("GET", "/api/messages"+tc.query, "", u)
			expect(t, code, 200)
			messages := v["messages"].([]any)
			if len(messages) != tc.length {
				t.Fatal(len(messages))
			}
			for i := 1; i < len(messages); i++ {
				if messages[i-1].(map[string]any)["created_at"].(string) > messages[i].(map[string]any)["created_at"].(string) {
					t.Fatal("not ascending")
				}
			}
		})
	}
}

func TestChatScenarios(t *testing.T) {
	t.Run("fallback variants", func(t *testing.T) {
		_, c := setup(t, "")
		u := login(t, c, "lily@demo.com")
		for _, tc := range []struct{ name, msg, want string }{{"weekly", "周报", "简版"}, {"birthday", "妈妈生日", "她"}, {"generic", "你好", "暂时"}} {
			t.Run(tc.name, func(t *testing.T) {
				code, v := c("POST", "/api/chat", fmt.Sprintf(`{"message":%q}`, tc.msg), u)
				expect(t, code, 200)
				if v["fallback"] != true || !strings.Contains(v["reply"].(string), tc.want) {
					t.Fatal(v)
				}
			})
		}
	})
	t.Run("minute limit", func(t *testing.T) {
		a, c := setup(t, "")
		u := login(t, c, "lily@demo.com")
		id := loginID(t, c, u)
		for i := 0; i < 10; i++ {
			a.DB.Exec("INSERT INTO messages(id,user_id,thread,role,content,model,created_at) VALUES(?,?,?,?,?,?,?)", fmt.Sprintf("minute-%d", i), id, "home", "user", "x", nil, Now())
		}
		code, _ := c("POST", "/api/chat", `{"message":"hi"}`, u)
		expect(t, code, 429)
	})
	t.Run("day limit", func(t *testing.T) {
		a, c := setup(t, "")
		u := login(t, c, "lily@demo.com")
		id := loginID(t, c, u)
		at := time.Now().Add(-time.Hour).UTC().Format("2006-01-02T15:04:05.000Z")
		for i := 0; i < 200; i++ {
			a.DB.Exec("INSERT INTO messages(id,user_id,thread,role,content,model,created_at) VALUES(?,?,?,?,?,?,?)", fmt.Sprintf("day-%d", i), id, "home", "user", "x", nil, at)
		}
		code, _ := c("POST", "/api/chat", `{"message":"hi"}`, u)
		expect(t, code, 429)
	})
	t.Run("same thread last 20", func(t *testing.T) {
		up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var v struct {
				Messages []map[string]string `json:"messages"`
			}
			json.NewDecoder(r.Body).Decode(&v)
			if len(v.Messages) != 22 || v.Messages[1]["content"] != "10" || v.Messages[20]["content"] != "29" {
				t.Errorf("unexpected context: %v", v.Messages)
			}
			w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
		}))
		defer up.Close()
		a, c := setup(t, up.URL)
		u := login(t, c, "lily@demo.com")
		id := loginID(t, c, u)
		for i := 0; i < 30; i++ {
			a.DB.Exec("INSERT INTO messages(id,user_id,thread,role,content,model,created_at) VALUES(?,?,?,?,?,?,?)", fmt.Sprintf("ctx-%d", i), id, "target", "user", fmt.Sprint(i), nil, fmt.Sprintf("2020-01-01T00:00:%02d.000Z", i))
		}
		a.DB.Exec("INSERT INTO messages(id,user_id,thread,role,content,model,created_at) VALUES(?,?,?,?,?,?,?)", "other-thread", id, "other", "user", "exclude", nil, Now())
		code, _ := c("POST", "/api/chat", `{"message":"hi","thread":"target"}`, u)
		expect(t, code, 200)
	})
}

func TestAdminScenarios(t *testing.T) {
	a, c := setup(t, "")
	admin := login(t, c, "admin@demo.com")
	var id, password, token string
	t.Run("create user", func(t *testing.T) {
		code, v := c("POST", "/api/admin/users", `{"email":"new@example.com","name":"New"}`, admin)
		expect(t, code, 200)
		id = v["user"].(map[string]any)["id"].(string)
		password = v["temp_password"].(string)
		code, v = c("POST", "/api/auth/login", fmt.Sprintf(`{"email":"new@example.com","password":%q}`, password), "")
		expect(t, code, 200)
		token = v["token"].(string)
	})
	t.Run("duplicate email", func(t *testing.T) {
		code, _ := c("POST", "/api/admin/users", `{"email":"new@example.com","name":"Other"}`, admin)
		expect(t, code, 400)
	})
	t.Run("last login", func(t *testing.T) {
		code, v := c("GET", "/api/admin/users", "", admin)
		expect(t, code, 200)
		found := false
		for _, row := range v["users"].([]any) {
			x := row.(map[string]any)
			if x["id"] == id && x["last_login"] != nil {
				found = true
			}
		}
		if !found {
			t.Fatal(v)
		}
	})
	t.Run("disable revokes token", func(t *testing.T) {
		code, _ := c("PATCH", "/api/admin/users/"+id, `{"disabled":true}`, admin)
		expect(t, code, 200)
		code, _ = c("GET", "/api/me", "", token)
		expect(t, code, 401)
		c("PATCH", "/api/admin/users/"+id, `{"disabled":false}`, admin)
	})
	t.Run("reset revokes token and new login", func(t *testing.T) {
		_, v := c("POST", "/api/auth/login", fmt.Sprintf(`{"email":"new@example.com","password":%q}`, password), "")
		token = v["token"].(string)
		code, v := c("POST", "/api/admin/users/"+id+"/reset-password", `{}`, admin)
		expect(t, code, 200)
		code, _ = c("GET", "/api/me", "", token)
		expect(t, code, 401)
		password = v["temp_password"].(string)
		code, _ = c("POST", "/api/auth/login", fmt.Sprintf(`{"email":"new@example.com","password":%q}`, password), "")
		expect(t, code, 200)
	})
	t.Run("restore within 30 days", func(t *testing.T) {
		code, _ := c("DELETE", "/api/admin/users/"+id, "", admin)
		expect(t, code, 200)
		code, _ = c("POST", "/api/admin/users/"+id+"/restore", `{}`, admin)
		expect(t, code, 200)
	})
	t.Run("restore after 30 days", func(t *testing.T) {
		a.DB.Exec("UPDATE users SET deleted_at=? WHERE id=?", time.Now().Add(-31*24*time.Hour).UTC().Format("2006-01-02T15:04:05.000Z"), id)
		code, _ := c("POST", "/api/admin/users/"+id+"/restore", `{}`, admin)
		expect(t, code, 400)
	})
	t.Run("audit limit", func(t *testing.T) {
		code, v := c("GET", "/api/admin/audit?limit=1", "", admin)
		expect(t, code, 200)
		if len(v["audit"].([]any)) != 1 {
			t.Fatal(v)
		}
	})
	for _, ok := range []bool{true, false} {
		t.Run(fmt.Sprintf("test model success=%t", ok), func(t *testing.T) {
			up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if ok {
					w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
				} else {
					http.Error(w, "down", 502)
				}
			}))
			defer up.Close()
			a.LLM.Base = up.URL
			code, v := c("POST", "/api/admin/test-model", `{}`, admin)
			expect(t, code, 200)
			if v["ok"] != ok {
				t.Fatal(v)
			}
		})
	}
}

func TestSeedOnlyEmpty(t *testing.T) {
	a, c := setup(t, "")
	a.DB.Exec("INSERT INTO users(id,email,name,role,pw_hash,pw_salt,created_at) VALUES('existing','existing@test.com','E','user','h','s',?)", Now())
	code, _ := c("GET", "/api/health", "", "")
	expect(t, code, 200)
	var n int
	a.DB.QueryRow("SELECT count(*) FROM users").Scan(&n)
	if n != 1 {
		t.Fatal(n)
	}
}

func TestAccessLogAndPanic(t *testing.T) {
	a, c := setup(t, "")
	var logs bytes.Buffer
	original := log.Writer()
	log.SetOutput(&logs)
	defer log.SetOutput(original)
	t.Run("request excludes query and authorization", func(t *testing.T) {
		code, _ := c("GET", "/api/health?secret=hidden", "", "private-token")
		expect(t, code, 200)
		entry := logs.String()
		if !strings.Contains(entry, "method=GET path=/api/health status=200 duration=") || strings.Contains(entry, "hidden") || strings.Contains(entry, "private-token") {
			t.Fatal("invalid access log")
		}
	})
	t.Run("panic returns 500 and logs error", func(t *testing.T) {
		a.DB = nil // Deliberately force a panic before any response is written.
		code, v := c("GET", "/api/health", "", "")
		expect(t, code, 500)
		if v["error"] != "internal_error" || !strings.Contains(logs.String(), "request panic method=GET path=/api/health") || !strings.Contains(logs.String(), "status=500") {
			t.Fatal("panic response or log incorrect")
		}
	})
}
