package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func sse(w http.ResponseWriter, v any) {
	b, _ := json.Marshal(v)
	fmt.Fprintf(w, "data: %s\n\n", b)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

func (a *API) messagePage(uid, thread string, n int, before, q string) ([]map[string]any, bool, error) {
	pattern := "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q) + "%"
	rows, e := a.DB.Rows(`SELECT messages.id,role,content,model,messages.created_at,messages.item_id,items.kind AS item_kind
		FROM messages LEFT JOIN items ON items.id=messages.item_id AND items.user_id=messages.user_id
		WHERE messages.user_id=? AND thread=? AND (?='' OR messages.created_at<?)
		AND (?='' OR content LIKE ? ESCAPE '\')
		ORDER BY messages.created_at DESC,messages.rowid DESC LIMIT ?`, uid, thread, before, before, q, pattern, n+1)
	if e != nil {
		return nil, false, e
	}
	more := len(rows) > n
	if more {
		rows = rows[:n]
	}
	for i, j := 0, len(rows)-1; i < j; i, j = i+1, j-1 {
		rows[i], rows[j] = rows[j], rows[i]
	}
	return rows, more, nil
}
func (a *API) home(w http.ResponseWriter, r *http.Request, u map[string]any) {
	n := 10
	if q := r.URL.Query().Get("msg_limit"); q != "" {
		if v, e := strconv.Atoi(q); e == nil {
			n = v
		}
	}
	if n < 1 {
		n = 1
	}
	if n > 50 {
		n = 50
	}
	uid := str(u["id"])
	items, e := a.DB.Rows("SELECT * FROM items WHERE user_id=? ORDER BY created_at", uid)
	if e != nil {
		a.internal(w)
		return
	}
	for _, item := range items {
		decodeData(item)
	}
	a.suggestMissing(uid, items)
	msgs, more, e := a.messagePage(uid, "home", n, "", "")
	if e != nil {
		a.internal(w)
		return
	}
	today := time.Now().In(taipei).Format("2006-01-02")
	brief, e := a.DB.One("SELECT id,kind,text,created_at FROM briefs WHERE user_id=? AND date(created_at,'+8 hours')=? ORDER BY created_at DESC,rowid DESC LIMIT 1", uid, today)
	if e != nil {
		a.internal(w)
		return
	}
	send(w, 200, map[string]any{"user": pub(u), "items": items, "messages": msgs, "has_more": more, "brief": brief, "server_time": Now()})
}
func (a *API) briefs(w http.ResponseWriter, r *http.Request, uid string) {
	n := limit(r.URL.Query())
	if r.URL.Query().Get("limit") == "" {
		n = 10
	}
	rows, e := a.DB.Rows("SELECT id,kind,text,created_at FROM briefs WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT ?", uid, n)
	if e != nil {
		a.internal(w)
		return
	}
	send(w, 200, map[string]any{"briefs": rows})
}
