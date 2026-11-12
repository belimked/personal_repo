package api

import (
	"encoding/json"
	"math"
	"net/http"
	"os"
	"strconv"
	"time"
)

func settingValue(a *API, uid, id string) any {
	row, err := a.DB.One("SELECT data FROM items WHERE user_id=? AND id=? AND deleted=0", uid, id)
	if err != nil || row == nil {
		return nil
	}
	var d map[string]any
	json.Unmarshal([]byte(str(row["data"])), &d)
	return d["value"]
}
func sensitiveSettings(a *API, uid string) map[string]bool {
	result := map[string]bool{"health": true, "finance": true, "kids": true, "location": true, "face": false}
	if v, ok := settingValue(a, uid, "setting-sensitive").(map[string]any); ok {
		for k := range result {
			if b, ok := v[k].(bool); ok {
				result[k] = b
			}
		}
	}
	return result
}
func (a *API) points(w http.ResponseWriter, uid string) {
	now := time.Now().In(taipei)
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, taipei).UTC().Format(time.RFC3339)
	end := time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, taipei).UTC().Format(time.RFC3339)
	var chat, search, voice, files int
	var meeting int
	queries := []struct {
		q   string
		out *int
	}{
		{"SELECT count(*) FROM messages WHERE user_id=? AND thread='home' AND role='user' AND created_at>=? AND created_at<?", &chat},
		{"SELECT count(*) FROM search_uses WHERE user_id=? AND created_at>=? AND created_at<?", &search},
		{"SELECT count(*) FROM recordings WHERE user_id=? AND kind='voice' AND created_at>=? AND created_at<?", &voice},
		{"SELECT count(*) FROM recordings WHERE user_id=? AND kind='file' AND created_at>=? AND created_at<?", &files},
	}
	for _, x := range queries {
		if a.DB.QueryRow(x.q, uid, start, end).Scan(x.out) != nil {
			a.internal(w)
			return
		}
	}
	rows, err := a.DB.Rows("SELECT duration_s,size_bytes FROM recordings WHERE user_id=? AND kind='meeting' AND created_at>=? AND created_at<?", uid, start, end)
	if err != nil {
		a.internal(w)
		return
	}
	for _, r := range rows {
		seconds := audioSeconds(r)
		if seconds <= 0 {
			seconds = 1
		}
		meeting += int(math.Ceil(seconds/600)) * 5
	}
	quota, err := strconv.Atoi(os.Getenv("XIAOHE_MONTHLY_POINTS"))
	if err != nil || quota <= 0 {
		quota = 500
	}
	used := chat + search + voice + meeting + files*3
	detail := []map[string]any{}
	for _, x := range []struct {
		label         string
		count, points int
	}{{"对话", chat, chat}, {"按意思搜索", search, search}, {"语音", voice, voice}, {"会议录音", len(rows), meeting}, {"资料", files, files * 3}} {
		detail = append(detail, map[string]any{"label": x.label, "count": x.count, "points": x.points})
	}
	send(w, 200, map[string]any{"quota": quota, "used": used, "left": quota - used, "month": now.Format("2006-01"), "detail": detail})
}
func (a *API) exportData(w http.ResponseWriter, u map[string]any) {
	uid := str(u["id"])
	data := map[string]any{"user": pub(u)}
	for _, x := range []struct{ name, query string }{
		{"items", "SELECT * FROM items WHERE user_id=?"},
		{"messages", "SELECT * FROM messages WHERE user_id=?"},
		{"recordings", "SELECT r.id,r.title,r.mime,r.size_bytes,r.duration_s,r.status,r.error,r.recorded_at,r.created_at,r.updated_at,r.finished_at,r.scene,r.kind,r.source_url,t.text,t.segments,t.minutes FROM recordings r LEFT JOIN transcripts t ON t.recording_id=r.id WHERE r.user_id=?"},
		{"briefs", "SELECT * FROM briefs WHERE user_id=?"},
		{"user_locations", "SELECT * FROM user_locations WHERE user_id=?"},
	} {
		rows, err := a.DB.Rows(x.query, uid)
		if err != nil {
			a.internal(w)
			return
		}
		if rows == nil {
			rows = []map[string]any{}
		}
		if x.name == "items" {
			for _, row := range rows {
				decodeData(row)
			}
		}
		data[x.name] = rows
	}
	a.audit(u, "export", uid)
	w.Header().Set("Content-Disposition", `attachment; filename="xiaohe-export.json"`)
	send(w, 200, data)
}
func (a *API) forget(w http.ResponseWriter, u map[string]any) {
	uid := str(u["id"])
	tx, err := a.DB.Begin()
	if err != nil {
		a.internal(w)
		return
	}
	defer tx.Rollback()
	res, err := tx.Exec("UPDATE items SET deleted=1,updated_at=? WHERE user_id=? AND kind='fact' AND deleted=0", Now(), uid)
	if err == nil {
		_, err = tx.Exec("DELETE FROM job_runs WHERE user_id=? AND job='profile'", uid)
	}
	if err != nil || tx.Commit() != nil {
		a.internal(w)
		return
	}
	count, _ := res.RowsAffected()
	a.audit(u, "forget", uid)
	send(w, 200, map[string]any{"deleted": count})
}
