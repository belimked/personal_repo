package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
	"xiaohe/server/internal/llm"
)

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

func (a *API) convertMessages(w http.ResponseWriter, b, u map[string]any) {
	idsRaw, ok := b["ids"].([]any)
	kind, scene := b["kind"], b["scene"]
	if !ok || len(idsRaw) < 1 || len(idsRaw) > 50 || (kind != "todo" && kind != "watch" && kind != "idea") || (scene != "work" && scene != "life") {
		fail(w, 400, "invalid_convert", "消息或事项类型无效")
		return
	}
	ids := make([]string, 0, len(idsRaw))
	seen := make(map[string]bool)
	for _, v := range idsRaw {
		id, valid := v.(string)
		if !valid || id == "" || seen[id] {
			fail(w, 400, "invalid_convert", "消息 ID 无效")
			return
		}
		seen[id] = true
		ids = append(ids, id)
	}
	args := []any{u["id"]}
	for _, id := range ids {
		args = append(args, id)
	}
	marks := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	rows, err := a.DB.Rows("SELECT id,role,content FROM messages WHERE user_id=? AND thread='home' AND id IN ("+marks+") ORDER BY created_at,rowid", args...)
	if err != nil {
		a.internal(w)
		return
	}
	if len(rows) != len(ids) {
		fail(w, 400, "invalid_convert", "消息不属于当前用户的首页对话")
		return
	}
	lines := make([]string, 0, len(rows))
	fallback := ""
	for _, row := range rows {
		role := "小禾"
		if row["role"] == "user" {
			role = "我"
			if fallback == "" {
				fallback = str(row["content"])
			}
		}
		lines = append(lines, role+"："+str(row["content"]))
	}
	if fallback == "" {
		fallback = str(rows[0]["content"])
	}
	text, callErr := a.LLM.CallWith(jobModel("XIAOHE_MODEL_JOB", "deepseek-v4-flash"), []map[string]string{
		{"role": "system", "content": "根据对话提炼事项。只输出JSON对象：{\"title\":\"不超过20字\",\"note\":\"不超过60字\",\"due\":\"YYYY-MM-DD或null\",\"owner\":\"人名或null\"}。不确定的日期和负责人用null，不要编造。"},
		{"role": "user", "content": strings.Join(lines, "\n")},
	}, llm.Options{Timeout: 20 * time.Second})
	var result struct {
		Title string  `json:"title"`
		Note  string  `json:"note"`
		Due   *string `json:"due"`
		Owner *string `json:"owner"`
	}
	if i, j := strings.Index(text, "{"), strings.LastIndex(text, "}"); i >= 0 && j > i {
		text = text[i : j+1]
	}
	if callErr == nil {
		callErr = json.Unmarshal([]byte(strings.TrimSpace(text)), &result)
	}
	data := map[string]any{"title": truncateRunes(strings.TrimSpace(fallback), 20), "note": "", "scene": scene, "source": map[string]any{"type": "chat", "message_ids": ids}}
	if callErr == nil && strings.TrimSpace(result.Title) != "" {
		data["title"] = truncateRunes(strings.TrimSpace(result.Title), 20)
		data["note"] = truncateRunes(strings.TrimSpace(result.Note), 60)
		if result.Due != nil {
			if due := strings.TrimSpace(*result.Due); due != "" {
				if parsed, e := time.Parse("2006-01-02", due); e == nil && parsed.Format("2006-01-02") == due {
					data["due"] = due
				}
			}
		}
		if result.Owner != nil && strings.TrimSpace(*result.Owner) != "" {
			data["owner"] = strings.TrimSpace(*result.Owner)
		}
	}
	if kind == "todo" {
		data["done"] = false
	}
	itemID, now := ID(), Now()
	raw, _ := json.Marshal(data)
	tx, err := a.DB.Begin()
	if err != nil {
		a.internal(w)
		return
	}
	defer tx.Rollback()
	// Recheck ownership under the write transaction in case messages changed during the LLM call.
	var count int
	err = tx.QueryRow("SELECT count(*) FROM messages WHERE user_id=? AND thread='home' AND id IN ("+marks+")", args...).Scan(&count)
	if err != nil {
		a.internal(w)
		return
	}
	if count != len(ids) {
		fail(w, 400, "invalid_convert", "消息不属于当前用户的首页对话")
		return
	}
	_, err = tx.Exec("INSERT INTO items(id,user_id,kind,data,created_at,updated_at,deleted) VALUES(?,?,?,?,?,?,0)", itemID, u["id"], kind, string(raw), now, now)
	if err == nil {
		updateArgs := append([]any{itemID, u["id"]}, args[1:]...)
		_, err = tx.Exec("UPDATE messages SET item_id=? WHERE user_id=? AND thread='home' AND id IN ("+marks+")", updateArgs...)
	}
	if err == nil {
		_, err = tx.Exec("INSERT INTO audit VALUES(?,?,?,?,?)", ID(), u["email"], "convert_messages", itemID, now)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		a.internal(w)
		return
	}
	send(w, 200, map[string]any{"item": map[string]any{"id": itemID, "kind": kind, "data": data, "created_at": now, "updated_at": now, "deleted": 0}})
}
