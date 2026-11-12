package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
	"xiaohe/server/internal/llm"
)

type askFilter struct {
	From       string   `json:"from"`
	To         string   `json:"to"`
	Kinds      []string `json:"kinds"`
	Status     string   `json:"status"`
	Scope      []string `json:"scope"`
	Keywords   []string `json:"keywords"`
	AnswerHint string   `json:"answer_hint"`
}

func askDate(s string) bool {
	if s == "" {
		return true
	}
	t, e := time.Parse("2006-01-02", s)
	return e == nil && t.Format("2006-01-02") == s
}
func (a *API) ask(w http.ResponseWriter, b map[string]any, uid string) {
	q, ok := b["q"].(string)
	q = strings.TrimSpace(q)
	if !ok || q == "" || utf8.RuneCountInString(q) > 200 {
		fail(w, 400, "invalid_query", "请输入要搜的内容（最多 200 字）")
		return
	}
	model := os.Getenv("XIAOHE_MODEL_ASK")
	if model == "" {
		model = "deepseek-v4-flash"
	}
	now := time.Now().In(taipei)
	prompt := fmt.Sprintf("今天是 %s 星期%s（Asia/Taipei）。将用户搜索意图转换为纯 JSON，不要解释：{\"from\":\"YYYY-MM-DD|null\",\"to\":\"YYYY-MM-DD|null\",\"kinds\":[\"todo\",\"watch\",\"idea\"],\"status\":\"open|done|any\",\"scope\":[\"things\",\"files\",\"said\"],\"keywords\":[\"...\"],\"answer_hint\":\"一句话说明理解成什么\"}。相对时间按今天换算；无日期用 null；无关键词用 []。", now.Format("2006-01-02"), []string{"日", "一", "二", "三", "四", "五", "六"}[now.Weekday()])
	raw, e := a.LLM.CallWith(model, []map[string]string{{"role": "system", "content": prompt}, {"role": "user", "content": q}}, llm.Options{Timeout: 15 * time.Second})
	var f askFilter
	if i, j := strings.Index(raw, "{"), strings.LastIndex(raw, "}"); i >= 0 && j > i {
		raw = raw[i : j+1]
	}
	parsed := json.Unmarshal([]byte(raw), &f)
	if f.From == "null" {
		f.From = ""
	}
	if f.To == "null" {
		f.To = ""
	}
	valid := e == nil && parsed == nil && askDate(f.From) && askDate(f.To) && (f.Status == "open" || f.Status == "done" || f.Status == "any") && len(f.Scope) > 0
	for _, k := range f.Kinds {
		if k != "todo" && k != "watch" && k != "idea" {
			valid = false
		}
	}
	for _, s := range f.Scope {
		if s != "things" && s != "files" && s != "said" {
			valid = false
		}
	}
	mode := "ask"
	if !valid {
		mode = "keyword"
		clean := q
		for _, word := range []string{"帮我", "搜一下", "找一下", "查一下", "搜", "找", "查", "一下"} {
			clean = strings.ReplaceAll(clean, word, "")
		}
		clean = strings.TrimSpace(clean)
		if clean == "" {
			clean = q
		}
		f = askFilter{Status: "any", Scope: []string{"things", "files", "said"}, Keywords: []string{clean}}
	}
	if len(f.Kinds) == 0 {
		f.Kinds = []string{"todo", "watch", "idea"}
	}
	scopes := map[string]bool{}
	for _, s := range f.Scope {
		scopes[s] = true
	}
	said, things, files := []map[string]any{}, []map[string]any{}, []map[string]any{}
	// Reuse the existing keyword matcher for transcripts, messages and files.
	if len(f.Keywords) > 0 && (scopes["said"] || scopes["files"]) {
		for _, keyword := range f.Keywords {
			if keyword == "" {
				continue
			}
			req := httptest.NewRequest("GET", "/api/search", nil)
			params := req.URL.Query()
			params.Set("q", clip(keyword, 50))
			req.URL.RawQuery = params.Encode()
			rec := httptest.NewRecorder()
			a.search(rec, req, uid)
			if rec.Code != 200 {
				a.internal(w)
				return
			}
			var result struct {
				Said  []map[string]any `json:"said"`
				Files []map[string]any `json:"files"`
			}
			if json.Unmarshal(rec.Body.Bytes(), &result) != nil {
				a.internal(w)
				return
			}
			said = append(said, result.Said...)
			files = append(files, result.Files...)
		}
	}
	if scopes["files"] && len(f.Keywords) == 0 {
		rows, err := a.DB.Rows("SELECT id recording_id,title,kind,recorded_at,created_at,duration_s FROM recordings WHERE user_id=? ORDER BY created_at DESC LIMIT 30", uid)
		if err != nil {
			a.internal(w)
			return
		}
		for _, r := range rows {
			at := str(r["recorded_at"])
			if at == "" {
				at = str(r["created_at"])
			}
			files = append(files, map[string]any{"recording_id": r["recording_id"], "title": r["title"], "kind": r["kind"], "at": at, "duration_s": r["duration_s"]})
		}
	}
	if !scopes["said"] || len(f.Keywords) == 0 {
		said = []map[string]any{}
	}
	if !scopes["files"] {
		files = []map[string]any{}
	}
	kept := []map[string]any{}
	for _, file := range files {
		at := str(file["at"])
		if (f.From == "" || at >= f.From) && (f.To == "" || at[:min(len(at), 10)] <= f.To) {
			kept = append(kept, file)
		}
	}
	files = kept
	if scopes["things"] {
		rows, err := a.DB.Rows("SELECT id,kind,data FROM items WHERE user_id=? AND deleted=0 AND kind IN ('todo','watch','idea')", uid)
		if err != nil {
			a.internal(w)
			return
		}
		for _, row := range rows {
			kind := str(row["kind"])
			allowed := false
			for _, k := range f.Kinds {
				if k == kind {
					allowed = true
				}
			}
			if !allowed {
				continue
			}
			var d map[string]any
			if json.Unmarshal([]byte(str(row["data"])), &d) != nil {
				continue
			}
			done := d["done"] == true || d["status"] == "done"
			if f.Status == "open" && done || f.Status == "done" && !done {
				continue
			}
			due := str(d["due"])
			if due == "" {
				due = str(d["date"])
			}
			day := due[:min(len(due), 10)]
			if f.From != "" && day < f.From && !(f.Status == "open" && f.To != "" && day != "" && day < f.To) {
				continue
			}
			if f.To != "" && (day == "" || day > f.To) {
				continue
			}
			title := str(d["title"])
			if title == "" {
				title = str(d["text"])
			}
			if len(f.Keywords) > 0 {
				hit := false
				for _, k := range f.Keywords {
					if k != "" && (has(title, k) || has(str(d["note"]), k) || has(str(d["owner"]), k)) {
						hit = true
					}
				}
				if !hit {
					continue
				}
			}
			item := map[string]any{"id": row["id"], "kind": kind, "title": title, "due": due, "done": done, "owner": str(d["owner"])}
			if src, ok := d["source"].(map[string]any); ok && src["type"] == "recording" {
				item["recording_id"] = src["recording_id"]
			}
			things = append(things, item)
		}
		sort.SliceStable(things, func(i, j int) bool {
			x, y := str(things[i]["due"]), str(things[j]["due"])
			if x == "" {
				return false
			}
			if y == "" {
				return true
			}
			return x < y
		})
		if len(things) > 50 {
			things = things[:50]
		}
	}
	overdue := 0
	for _, item := range things {
		if !item["done"].(bool) && str(item["due"]) != "" && str(item["due"])[:min(len(str(item["due"])), 10)] < now.Format("2006-01-02") {
			overdue++
		}
	}
	answer := fmt.Sprintf("找到 %d 件事、%d 条说过的话、%d 份资料。", len(things), len(said), len(files))
	if overdue > 0 {
		answer += fmt.Sprintf("其中 %d 件已过期。", overdue)
	}
	send(w, 200, map[string]any{"answer": answer, "filter": f, "said": said, "things": things, "files": files, "mode": mode})
}
