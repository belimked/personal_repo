package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestVoiceIntentProgress(t *testing.T) {
	for _, tc := range []struct{ intent, step string }{{"search", "正在搜集资料"}, {"remind", "正在创建提醒"}, {"route", "正在估算路线"}, {"other", "正在创建任务"}} {
		t.Run(tc.intent, func(t *testing.T) {
			var a *API
			id := "voice-progress"
			seenJudging := false
			seenStep := false
			llmServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var b struct {
					Messages []map[string]string `json:"messages"`
				}
				json.NewDecoder(r.Body).Decode(&b)
				system := ""
				if len(b.Messages) > 0 {
					system = b.Messages[0]["content"]
				}
				reply := "你好"
				var step string
				if a != nil {
					a.DB.QueryRow("SELECT step FROM recordings WHERE id=?", id).Scan(&step)
				}
				switch {
				case strings.Contains(system, "判断用户意图"):
					seenJudging = step == "正在判断是什么事"
					at := time.Now().In(taipei).Add(time.Hour).Format("2006-01-02T15:04")
					reply = fmt.Sprintf(`{"intent":%q,"query":"事情","title":"交周报","remind_at":%q,"place":"台北101"}`, tc.intent, at)
				case strings.Contains(system, "将用户搜索意图"):
					seenStep = step == tc.step
					reply = `{"from":null,"to":null,"kinds":["todo"],"status":"any","scope":["things"],"keywords":[]}`
				case strings.Contains(system, "整理为 JSON"):
					seenStep = step == tc.step
					reply = `{"title":"语音","summary":"内容","points":[],"decisions":[],"action_items":[]}`
				default:
					if tc.intent == "other" && step == tc.step {
						seenStep = true
					}
				}
				raw, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": reply}}}})
				w.Write(raw)
			}))
			defer llmServer.Close()
			a, _ = setup(t, llmServer.URL)
			uid := "user-progress"
			a.DB.Exec("INSERT INTO users(id,email,name,role,pw_hash,pw_salt,created_at) VALUES(?,?,?,?,?,?,?)", uid, tc.intent+"@test.local", "用户", "user", "", "", Now())
			now := Now()
			_, e := a.DB.Exec("INSERT INTO recordings(id,user_id,mime,size_bytes,status,created_at,updated_at,kind) VALUES(?,?,?,?,?,?,?,?)", id, uid, "audio/mp4", 1, "summarizing", now, now, "voice")
			if e != nil {
				t.Fatal(e)
			}
			a.DB.Exec("INSERT INTO transcripts(recording_id,text,segments,created_at) VALUES(?,?,?,?)", id, "隐私转写", `[]`, now)
			if tc.intent == "route" {
				fakeMaps(t)
				a.DB.Exec("INSERT INTO user_locations(user_id,lat,lng,accuracy,at) VALUES(?,?,?,?,?)", uid, 25.0, 121.0, 10.0, Now())
			}
			a.summarize(context.Background(), id, uid)
			row, _ := a.DB.One("SELECT status,intent,step FROM recordings WHERE id=?", id)
			if row["status"] != "done" || row["step"] != tc.step || !seenJudging || ((tc.intent == "search" || tc.intent == "other") && !seenStep) {
				t.Fatalf("state=%v judging=%v step=%v", row, seenJudging, seenStep)
			}
			if tc.intent != "other" && row["intent"] != tc.intent {
				t.Fatal(row)
			}
			if tc.intent == "other" && row["intent"] != "mixed" {
				t.Fatal(row)
			}
		})
	}
}
