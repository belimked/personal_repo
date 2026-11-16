package llm

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCallOptionsUsageAndTruncation(t *testing.T) {
	var requests []map[string]any
	truncated := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		requests = append(requests, body)
		if truncated {
			fmt.Fprint(w, `{"choices":[{"finish_reason":"length","message":{"content":"partial"}}],"usage":{"prompt_tokens":10,"completion_tokens":20,"completion_tokens_details":{"reasoning_tokens":15}}}`)
		} else {
			fmt.Fprint(w, `{"choices":[{"message":{"content":"{}"}}]}`)
		}
	}))
	defer server.Close()
	c := Client{Key: "test", Base: server.URL}
	messages := []map[string]string{{"role": "user", "content": "hello"}}
	if _, err := c.Call("deepseek-v4-pro", messages); err != nil {
		t.Fatal(err)
	}
	if _, err := c.CallWith("deepseek-v4-pro", messages, Options{JSON: true, NoThinking: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Stream("deepseek-v4-pro", messages, Options{JSON: true, NoThinking: true}, func(string) {}); err == nil {
		t.Fatal("expected incomplete stream")
	}
	if _, ok := requests[0]["response_format"]; ok {
		t.Fatal(requests[0])
	}
	for _, req := range requests[1:] {
		if req["response_format"].(map[string]any)["type"] != "json_object" || req["thinking"].(map[string]any)["type"] != "disabled" {
			t.Fatal(req)
		}
	}
	if requests[0]["thinking"].(map[string]any)["type"] != "enabled" {
		t.Fatal(requests[0])
	}
	truncated = true
	content, usage, err := c.CallUsage("deepseek-v4-pro", messages, Options{})
	if !errors.Is(err, ErrTruncated) || content != "" || usage != (Usage{10, 20, 15}) {
		t.Fatal(content, usage, err)
	}
	_, err = c.CallWith("deepseek-v4-pro", messages, Options{})
	if !errors.Is(err, ErrTruncated) {
		t.Fatal(err)
	}
}

func TestCallUsageMissingUsage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"choices":[{"message":{"content":"ok"}}]}`)
	}))
	defer server.Close()
	content, usage, err := (Client{Key: "test", Base: server.URL}).CallUsage("deepseek-v4-flash", nil, Options{})
	if err != nil || content != "ok" || usage != (Usage{}) {
		t.Fatal(content, usage, err)
	}
}
