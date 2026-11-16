package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMinutesTruncationRetry(t *testing.T) {
	for _, tc := range []struct {
		name                 string
		alwaysTruncate, long bool
		wantCalls            int
		wantStatus           string
	}{
		{"final succeeds", false, false, 2, "done"},
		{"both truncated", true, false, 2, "summarizing"},
		{"piece and final retry", false, true, 6, "done"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newRecordingFixture(t)
			id := f.upload(t)
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var req struct {
					MaxTokens int `json:"max_tokens"`
					Thinking  struct {
						Type string `json:"type"`
					} `json:"thinking"`
					ResponseFormat struct {
						Type string `json:"type"`
					} `json:"response_format"`
				}
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					t.Error(err)
				}
				calls++
				expectedThinking := "enabled"
				if calls%2 == 0 {
					expectedThinking = "disabled"
				}
				if req.MaxTokens != 16000 || req.Thinking.Type != expectedThinking || req.ResponseFormat.Type != "json_object" {
					t.Errorf("call %d: %+v", calls, req)
				}
				if calls%2 == 1 || tc.alwaysTruncate {
					fmt.Fprint(w, `{"choices":[{"finish_reason":"length","message":{"content":"partial"}}],"usage":{"prompt_tokens":100,"completion_tokens":16000,"completion_tokens_details":{"reasoning_tokens":15000}}}`)
				} else {
					content, _ := json.Marshal(fullMinutes)
					fmt.Fprintf(w, `{"choices":[{"finish_reason":"stop","message":{"content":%s}}],"usage":{"prompt_tokens":100,"completion_tokens":200}}`, content)
				}
			}))
			defer server.Close()
			f.a.LLM.Base = server.URL
			if tc.long {
				// Seed a summarizing row directly to exercise pieces and final.
				now := Now()
				_, err := f.a.DB.Exec("UPDATE recordings SET status='summarizing' WHERE id=?", id)
				if err != nil {
					t.Fatal(err)
				}
				_, err = f.a.DB.Exec("INSERT INTO transcripts(recording_id,text,segments,speakers,created_at) VALUES(?,?,?,?,?)", id, strings.Repeat("会议", 20001), "[]", 1, now)
				if err != nil {
					t.Fatal(err)
				}
			}
			var logs bytes.Buffer
			if tc.alwaysTruncate {
				original := log.Writer()
				log.SetOutput(&logs)
				defer log.SetOutput(original)
			}
			f.a.ProcessOne(context.Background())
			if tc.alwaysTruncate && !strings.Contains(logs.String(), "state=retry attempt=1 error_type=") {
				t.Fatal("missing jobError retry log:", logs.String())
			}
			if tc.alwaysTruncate && !strings.Contains(logs.String(), "error=llm: truncated: max_tokens reached") {
				t.Fatal("missing truncation reason:", logs.String())
			}
			var status string
			var attempts int
			var next *string
			if err := f.a.DB.QueryRow("SELECT status,attempts,next_try_at FROM recordings WHERE id=?", id).Scan(&status, &attempts, &next); err != nil {
				t.Fatal(err)
			}
			if calls != tc.wantCalls || status != tc.wantStatus {
				t.Fatal(calls, status)
			}
			if tc.alwaysTruncate && (attempts != 1 || next == nil) {
				t.Fatal(attempts, next)
			}
		})
	}
}
