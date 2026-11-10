package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestUpstreamSuccessAndValidation(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request map[string]any
		if e := json.NewDecoder(r.Body).Decode(&request); e != nil {
			t.Error(e)
		}
		if request["model"] != "deepseek-v4-flash" || request["max_tokens"] != float64(800) || request["thinking"].(map[string]any)["type"] != "disabled" {
			t.Error(request)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"choices":[{"message":{"content":"你好"}}]}`))
	}))
	defer up.Close()
	_, c := setup(t, up.URL)
	user := login(t, c, "lily@demo.com")
	code, v := c("POST", "/api/chat", `{"message":"你好"}`, user)
	expect(t, code, 200)
	if v["fallback"] != false || v["reply"] != "你好" {
		t.Fatal(v)
	}
	code, _ = c("POST", "/api/chat", `{"message":"hi","thread":123}`, user)
	expect(t, code, 400)
	code, _ = c("POST", "/api/items", `{"kind":"todo","id":123,"data":{}}`, user)
	expect(t, code, 400)
	code, _ = c("POST", "/api/chat", `not-json`, user)
	expect(t, code, 400)
	code, _ = c("GET", "/api/items?kind=unknown", "", user)
	expect(t, code, 400)
	code, _ = c("GET", "/api/missing", "", user)
	expect(t, code, 404)
}
