package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"
	"xiaohe/server/internal/llm"
)

func (a *API) suggestMissing(uid string, items []map[string]any) {
	if _, loaded := a.suggestRunning.LoadOrStore(uid, true); loaded {
		return
	}
	today := time.Now().In(taipei).Format("2006-01-02")
	var pending []map[string]any
	for _, item := range items {
		if item["deleted"] != int64(0) {
			continue
		}
		d, ok := item["data"].(map[string]any)
		if !ok || demoItem(str(item["kind"]), d) || strings.TrimSpace(str(d["suggest"])) != "" {
			continue
		}
		kind := str(item["kind"])
		due := value(d["due"], str(d["date"]))
		if kind != "idea" && kind != "stash" && !(kind == "todo" && due != "" && due[:min(len(due), 10)] <= today && d["done"] != true && d["status"] != "done") {
			continue
		}
		if at, err := time.Parse(time.RFC3339Nano, str(d["suggest_error_at"])); err == nil && time.Since(at) < 24*time.Hour {
			continue
		}
		pending = append(pending, item)
		if len(pending) == 8 {
			break
		}
	}
	if len(pending) == 0 {
		a.suggestRunning.Delete(uid)
		return
	}
	go func() {
		defer a.suggestRunning.Delete(uid)
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		defer cancel()
		for _, item := range pending {
			if ctx.Err() != nil {
				a.storeSuggestion(uid, str(item["id"]), "", "", true)
				continue
			}
			d := item["data"].(map[string]any)
			summary := ""
			if src, ok := d["source"].(map[string]any); ok && str(src["type"]) == "recording" {
				var raw string
				if a.DB.QueryRow("SELECT coalesce(t.minutes,'') FROM transcripts t JOIN recordings r ON r.id=t.recording_id WHERE r.id=? AND r.user_id=?", src["recording_id"], uid).Scan(&raw) == nil {
					var m minutes
					json.Unmarshal([]byte(raw), &m)
					summary = m.Summary
				}
			}
			input := fmt.Sprintf("标题：%s\n负责人：%s\n到期：%s\n来源纪要摘要：%s", value(d["title"], str(d["text"])), str(d["owner"]), value(d["due"], str(d["date"])), summary)
			text, err := a.LLM.CallWith(jobModel("XIAOHE_MODEL_JOB", "deepseek-v4-flash"), []map[string]string{{"role": "system", "content": "仅根据给出的事项信息和纪要摘要写建议，不猜测、不编造。只输出JSON对象：{\"suggest\":\"一句话怎么办，不超过40字\",\"suggest_short\":\"封面副标题，不超过14字\"}。"}, {"role": "user", "content": input}}, llm.Options{Timeout: 20 * time.Second})
			var result struct {
				Suggest string `json:"suggest"`
				Short   string `json:"suggest_short"`
			}
			if i, j := strings.Index(text, "{"), strings.LastIndex(text, "}"); i >= 0 && j > i {
				text = text[i : j+1]
			}
			if err == nil {
				err = json.Unmarshal([]byte(strings.TrimSpace(text)), &result)
			}
			if err != nil || strings.TrimSpace(result.Suggest) == "" {
				a.storeSuggestion(uid, str(item["id"]), "", "", true)
				continue
			}
			a.storeSuggestion(uid, str(item["id"]), clip(strings.TrimSpace(result.Suggest), 40), clip(strings.TrimSpace(result.Short), 14), false)
		}
	}()
}

func (a *API) storeSuggestion(uid, id, suggest, short string, failed bool) {
	row, err := a.DB.One("SELECT data FROM items WHERE user_id=? AND id=? AND deleted=0", uid, id)
	if err != nil || row == nil {
		return
	}
	var d map[string]any
	if json.Unmarshal([]byte(str(row["data"])), &d) != nil || str(d["suggest"]) != "" {
		return
	}
	if failed {
		d["suggest_error_at"] = Now()
	} else {
		d["suggest"] = suggest
		d["suggest_short"] = short
		delete(d, "suggest_error_at")
	}
	raw, _ := json.Marshal(d)
	if _, err := a.DB.Exec("UPDATE items SET data=?,updated_at=? WHERE user_id=? AND id=? AND deleted=0", string(raw), Now(), uid, id); err != nil {
		log.Printf("suggest write failed: %v", err)
	}
}
