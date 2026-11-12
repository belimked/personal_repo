package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
	"xiaohe/server/internal/llm"
)

func decodeData(v map[string]any) {
	var data any
	json.Unmarshal([]byte(str(v["data"])), &data)
	v["data"] = data
}
func (a *API) user(w http.ResponseWriter, r *http.Request, b, u map[string]any) {
	p, m := r.URL.Path, r.Method
	uid := u["id"]
	if p == "/api/recordings" || strings.HasPrefix(p, "/api/recordings/") || p == "/api/devices" || strings.HasPrefix(p, "/api/devices/") {
		a.recordingRoutes(w, r, b, u)
		return
	}
	if p == "/api/files/link" && m == "POST" {
		a.importLink(w, r, b, str(uid))
		return
	}
	if p == "/api/points" && m == "GET" {
		a.points(w, str(uid))
		return
	}
	if p == "/api/export" && m == "GET" {
		a.exportData(w, u)
		return
	}
	if p == "/api/forget" && m == "POST" {
		a.forget(w, u)
		return
	}
	if p == "/api/home" && m == "GET" {
		a.home(w, r, u)
		return
	}
	if p == "/api/briefs" && m == "GET" {
		a.briefs(w, r, str(uid))
		return
	}
	if p == "/api/ask" && m == "POST" {
		a.ask(w, b, str(uid))
		return
	}
	if p == "/api/search" && m == "GET" {
		a.search(w, r, str(uid))
		return
	}
	if p == "/api/items" && m == "GET" {
		kind, since := r.URL.Query().Get("kind"), r.URL.Query().Get("since")
		if kind != "" && !kinds[kind] {
			fail(w, 400, "invalid_kind", "类型无效")
			return
		}
		var k, s any
		if kind != "" {
			k = kind
		}
		if since != "" {
			s = since
		}
		rows := a.rows(w, "SELECT * FROM items WHERE user_id=? AND (? IS NULL OR kind=?) AND (? IS NULL OR updated_at>?) ORDER BY created_at", uid, k, k, s, s)
		if rows == nil {
			return
		}
		for _, v := range rows {
			decodeData(v)
		}
		send(w, 200, map[string]any{"items": rows})
		return
	}
	if p == "/api/items" && m == "POST" {
		kind := str(b["kind"])
		itemID := ID()
		if b["id"] != nil && b["id"] != "" && b["id"] != false {
			v, valid := b["id"].(string)
			if !valid {
				fail(w, 400, "invalid_item", "事项无效")
				return
			}
			itemID = v
		}
		data, ok := b["data"].(map[string]any)
		if !kinds[kind] || !ok {
			fail(w, 400, "invalid_item", "事项无效")
			return
		}
		old, e := a.DB.One("SELECT * FROM items WHERE id=?", itemID)
		if e != nil {
			a.internal(w)
			return
		}
		if old != nil && old["user_id"] != uid {
			fail(w, 403, "forbidden", "无权修改")
			return
		}
		created := Now()
		if old != nil {
			created = str(old["created_at"])
		}
		updated := Now()
		raw, _ := json.Marshal(data)
		_, e = a.DB.Exec("INSERT INTO items VALUES(?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,data=excluded.data,updated_at=excluded.updated_at,deleted=0", itemID, uid, kind, string(raw), created, updated)
		if e != nil {
			a.internal(w)
			return
		}
		send(w, 200, map[string]any{"item": map[string]any{"id": itemID, "kind": kind, "data": data, "created_at": created, "updated_at": updated, "deleted": 0}})
		return
	}
	if strings.HasPrefix(p, "/api/items/") && strings.Count(p, "/") == 3 && (m == "PATCH" || m == "DELETE") {
		itemID := strings.TrimPrefix(p, "/api/items/")
		old, e := a.DB.One("SELECT * FROM items WHERE id=? AND user_id=?", itemID, uid)
		if e != nil {
			a.internal(w)
			return
		}
		if old == nil {
			fail(w, 404, "not_found", "事项不存在")
			return
		}
		if m == "DELETE" {
			a.DB.Exec("UPDATE items SET deleted=1,updated_at=? WHERE id=?", Now(), itemID)
			send(w, 200, map[string]any{"ok": true})
			return
		}
		change, ok := b["data"].(map[string]any)
		if !ok {
			fail(w, 400, "invalid_item", "事项无效")
			return
		}
		decodeData(old)
		data := old["data"].(map[string]any)
		for k, v := range change {
			data[k] = v
		}
		raw, _ := json.Marshal(data)
		updated := Now()
		if _, e = a.DB.Exec("UPDATE items SET data=?,updated_at=? WHERE id=?", string(raw), updated, itemID); e != nil {
			a.internal(w)
			return
		}
		old["updated_at"] = updated
		send(w, 200, map[string]any{"item": old})
		return
	}
	if p == "/api/messages" && m == "GET" {
		thread := r.URL.Query().Get("thread")
		if thread == "" {
			thread = "home"
		}
		rows, more, err := a.messagePage(str(uid), thread, limit(r.URL.Query()), r.URL.Query().Get("before"), r.URL.Query().Get("q"))
		if err != nil {
			a.internal(w)
			return
		}
		send(w, 200, map[string]any{"messages": rows, "has_more": more})
		return
	}
	if p == "/api/messages/convert" && m == "POST" {
		a.convertMessages(w, b, u)
		return
	}
	if (p == "/api/chat" || p == "/api/chat/stream") && m == "POST" {
		message := strings.TrimSpace(str(b["message"]))
		thread := value(b["thread"], "home")
		mode := value(b["mode"], "chat")
		_, threadValid := b["thread"].(string)
		if b["thread"] == nil || b["thread"] == "" || b["thread"] == false {
			threadValid = true
		}
		if message == "" || len([]rune(message)) > 10000 || !threadValid || len([]rune(thread)) > 100 || mode != "chat" && mode != "make" {
			fail(w, 400, "invalid_chat", "消息或模式无效")
			return
		}
		var minute, day int
		a.DB.QueryRow("SELECT COALESCE(SUM(CASE WHEN created_at>? THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN created_at>? THEN 1 ELSE 0 END),0) FROM messages WHERE user_id=? AND role='user'", time.Now().UTC().Add(-time.Minute).Format("2006-01-02T15:04:05.000Z"), time.Now().UTC().Add(-24*time.Hour).Format("2006-01-02T15:04:05.000Z"), uid).Scan(&minute, &day)
		if minute >= 10 || day >= 200 {
			fail(w, 429, "rate_limited", "请求太频繁，请稍后再试")
			return
		}
		history := a.rows(w, "SELECT role,content FROM messages WHERE user_id=? AND thread=? ORDER BY created_at DESC,rowid DESC LIMIT 20", uid, thread)
		if history == nil {
			return
		}
		model := "deepseek-v4-flash"
		if mode == "make" {
			model = "deepseek-v4-pro"
		}
		msgs := []map[string]string{{"role": "system", "content": llm.Prompt(str(u["name"]))}}
		for i := len(history) - 1; i >= 0; i-- {
			msgs = append(msgs, map[string]string{"role": str(history[i]["role"]), "content": str(history[i]["content"])})
		}
		msgs = append(msgs, map[string]string{"role": "user", "content": message})
		if _, e := a.DB.Exec("INSERT INTO messages(id,user_id,thread,role,content,model,created_at) VALUES(?,?,?,?,?,?,?)", ID(), uid, thread, "user", message, nil, Now()); e != nil {
			a.internal(w)
			return
		}
		stream := p == "/api/chat/stream"
		var reply string
		var e error
		if stream {
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("X-Accel-Buffering", "no")
			w.WriteHeader(200)
			reply, e = a.LLM.Stream(model, msgs, llm.Options{}, func(delta string) { sse(w, map[string]any{"delta": delta}) })
		} else {
			reply, e = a.LLM.Call(model, msgs)
		}
		fallback := e != nil
		if fallback {
			text := llm.Fallback(message)
			if stream {
				sse(w, map[string]any{"delta": text})
			}
			reply += text
		}
		if _, e = a.DB.Exec("INSERT INTO messages(id,user_id,thread,role,content,model,created_at) VALUES(?,?,?,?,?,?,?)", ID(), uid, thread, "assistant", reply, model, Now()); e != nil {
			a.internal(w)
			return
		}
		if stream {
			sse(w, map[string]any{"done": true, "reply": reply, "model": model, "fallback": fallback})
		} else {
			send(w, 200, map[string]any{"reply": reply, "model": model, "thread": thread, "fallback": fallback})
		}
		return
	}
	fail(w, 404, "not_found", "接口不存在")
}
