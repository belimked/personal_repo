package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
	"xiaohe/server/internal/llm"
)

var jobDefaults = map[string]string{"morning": "08:00", "remind": "00:00", "profile": "02:00", "weekly": "17:00"}

func jobModel(key, def string) string {
	if s := os.Getenv(key); s != "" {
		return s
	}
	return def
}
func (a *API) jobConfig(name string) (bool, string) {
	at := jobDefaults[name]
	var raw string
	if a.DB.QueryRow("SELECT value FROM settings WHERE key=?", "job."+name).Scan(&raw) == nil {
		var v struct {
			Enabled *bool  `json:"enabled"`
			At      string `json:"at"`
		}
		if json.Unmarshal([]byte(raw), &v) == nil {
			if v.At != "" {
				at = v.At
			}
			if v.Enabled != nil {
				return *v.Enabled, at
			}
		}
	}
	return true, at
}
func jobKey(name string, now time.Time) string {
	if name == "remind" {
		return now.Format("2006-01-02T15:") + fmt.Sprintf("%02d", now.Minute()/5*5)
	}
	if name == "weekly" {
		year, week := now.ISOWeek()
		return fmt.Sprintf("%04d-W%02d", year, week)
	}
	return now.Format("2006-01-02")
}
func (a *API) startJobs(ctx context.Context) {
	if os.Getenv("XIAOHE_JOBS") == "off" {
		log.Print("jobs disabled")
		return
	}
	log.Printf("jobs enabled morning=%s remind=every-5m profile=%s weekly=Friday-%s models job=%s profile=%s", func() string { _, v := a.jobConfig("morning"); return v }(), func() string { _, v := a.jobConfig("profile"); return v }(), func() string { _, v := a.jobConfig("weekly"); return v }(), jobModel("XIAOHE_MODEL_JOB", "deepseek-v4-flash"), jobModel("XIAOHE_MODEL_PROFILE", "deepseek-v4-pro"))
	go func() {
		a.checkJobs()
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				a.checkJobs()
			}
		}
	}()
}
func (a *API) checkJobs() {
	now := time.Now().In(taipei)
	for name := range jobDefaults {
		enabled, at := a.jobConfig(name)
		if !enabled {
			continue
		}
		if name == "weekly" && now.Weekday() != time.Friday {
			continue
		}
		if name == "remind" {
			if now.Minute()%5 == 0 {
				a.runJob(name, "", false, now)
			}
			continue
		}
		scheduled, e := time.ParseInLocation("2006-01-02 15:04", now.Format("2006-01-02")+" "+at, taipei)
		if e == nil && !now.Before(scheduled) && now.Sub(scheduled) <= 3*time.Hour {
			a.runJob(name, "", false, now)
		}
	}
}
func (a *API) adminJobs(w http.ResponseWriter, r *http.Request, b, u map[string]any) {
	p, m := r.URL.Path, r.Method
	if p == "/api/admin/jobs" && m == "GET" {
		jobs := map[string]any{}
		for name := range jobDefaults {
			enabled, at := a.jobConfig(name)
			runs, e := a.DB.Rows("SELECT id,user_id,run_key,status,detail,started_at,finished_at,CAST((julianday(finished_at)-julianday(started_at))*86400000 AS INTEGER) duration_ms,1 processed_users FROM job_runs WHERE job=? ORDER BY started_at DESC,rowid DESC LIMIT 10", name)
			if e != nil {
				a.internal(w)
				return
			}
			jobs[name] = map[string]any{"enabled": enabled, "at": at, "runs": runs}
		}
		send(w, 200, map[string]any{"jobs": jobs})
		return
	}
	parts := strings.Split(strings.TrimPrefix(p, "/api/admin/jobs/"), "/")
	name := parts[0]
	if _, ok := jobDefaults[name]; !ok || len(parts) > 2 {
		fail(w, 404, "not_found", "任务不存在")
		return
	}
	if len(parts) == 1 && m == "PUT" {
		enabled, ok := b["enabled"].(bool)
		at, atOK := b["at"].(string)
		if !ok || !atOK || len(at) != 5 {
			fail(w, 400, "invalid_job", "配置无效")
			return
		}
		if _, e := time.Parse("15:04", at); e != nil {
			fail(w, 400, "invalid_job", "时间无效")
			return
		}
		raw, _ := json.Marshal(map[string]any{"enabled": enabled, "at": at})
		if _, e := a.DB.Exec("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", "job."+name, string(raw)); e != nil {
			a.internal(w)
			return
		}
		a.audit(u, "update_job", name)
		send(w, 200, map[string]any{"ok": true})
		return
	}
	if len(parts) == 2 && parts[1] == "run" && m == "POST" {
		uid := ""
		if b["user_id"] != nil {
			var ok bool
			uid, ok = b["user_id"].(string)
			if !ok || uid == "" {
				fail(w, 400, "invalid_user", "用户无效")
				return
			}
			row, e := a.DB.One("SELECT id FROM users WHERE id=? AND role='user' AND disabled=0 AND deleted_at IS NULL", uid)
			if e != nil {
				a.internal(w)
				return
			}
			if row == nil {
				fail(w, 404, "not_found", "用户不存在")
				return
			}
		}
		processed, err := a.runJob(name, uid, true, time.Now().In(taipei))
		a.audit(u, "run_job", name)
		if err != nil {
			a.internal(w)
			return
		}
		send(w, 200, map[string]any{"ok": true, "processed_users": processed})
		return
	}
	fail(w, 404, "not_found", "接口不存在")
}
func (a *API) runJob(name, only string, manual bool, now time.Time) (int, error) {
	users, e := a.DB.Rows("SELECT id FROM users WHERE role='user' AND disabled=0 AND deleted_at IS NULL AND (?='' OR id=?)", only, only)
	if e != nil {
		return 0, e
	}
	processed := 0
	for _, user := range users {
		uid := str(user["id"])
		key := jobKey(name, now)
		if manual {
			key += "-manual-" + ID()
		}
		id := ID()
		started := Now()
		res, e := a.DB.Exec("INSERT OR IGNORE INTO job_runs(id,job,user_id,run_key,status,started_at) VALUES(?,?,?,?,?,?)", id, name, uid, key, "running", started)
		if e != nil {
			return processed, e
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			continue
		}
		processed++
		detail, err := a.runJobUser(name, uid, now)
		status := "ok"
		if err != nil {
			status = "error"
			detail = err.Error()
			log.Printf("job=%s user=%s error=%v", name, uid, err)
		}
		if _, e = a.DB.Exec("UPDATE job_runs SET status=?,detail=?,finished_at=? WHERE id=?", status, detail, Now(), id); e != nil {
			return processed, e
		}
	}
	return processed, nil
}
func proactive(a *API, uid string) string {
	row, e := a.DB.One("SELECT data FROM items WHERE user_id=? AND id='setting-proactive' AND deleted=0", uid)
	if e != nil || row == nil {
		return "on"
	}
	var d struct {
		Value string `json:"value"`
	}
	json.Unmarshal([]byte(str(row["data"])), &d)
	if d.Value == "quiet" || d.Value == "off" {
		return d.Value
	}
	return "on"
}
func (a *API) runJobUser(name, uid string, now time.Time) (string, error) {
	mode := proactive(a, uid)
	today := now.Format("2006-01-02")
	if name != "remind" && mode == "off" {
		return "skipped: off", nil
	}
	if name == "remind" {
		rows, e := a.DB.Rows("SELECT id,data FROM items WHERE user_id=? AND deleted=0 AND datetime(json_extract(data,'$.remind_at'))<=datetime(?) AND coalesce(json_extract(data,'$.reminded_at'),'')='' AND coalesce(json_extract(data,'$.done'),0)=0 AND coalesce(json_extract(data,'$.status'),'')<>'done'", uid, Now())
		if e != nil {
			return "", e
		}
		count := 0
		for _, r := range rows {
			var d map[string]any
			if json.Unmarshal([]byte(str(r["data"])), &d) != nil {
				continue
			}
			a.pushUser(uid, "提醒："+value(d["title"], str(d["text"])), "", map[string]string{"type": "remind", "item_id": str(r["id"])})
			d["reminded_at"] = Now()
			raw, _ := json.Marshal(d)
			if _, e := a.DB.Exec("UPDATE items SET data=?,updated_at=? WHERE id=?", string(raw), Now(), r["id"]); e != nil {
				return "", e
			}
			count++
		}
		return fmt.Sprintf("reminded %d", count), nil
	}
	if name == "profile" {
		return a.profileJob(uid, now)
	}
	rows, e := a.DB.Rows("SELECT kind,data,created_at FROM items WHERE user_id=? AND deleted=0 AND kind IN ('todo','watch','idea','stash')", uid)
	if e != nil {
		return "", e
	}
	var lines []string
	for _, r := range rows {
		var d map[string]any
		json.Unmarshal([]byte(str(r["data"])), &d)
		if demoItem(str(r["kind"]), d) {
			continue
		}
		due := value(d["due"], str(d["date"]))
		done := d["done"] == true || d["status"] == "done"
		if name == "morning" {
			if !done && (due == today || due != "" && due < today || r["kind"] == "idea" || r["kind"] == "stash") {
				lines = append(lines, fmt.Sprintf("%s 到期%s", value(d["title"], str(d["text"])), due))
			}
		} else {
			start := now.AddDate(0, 0, -((int(now.Weekday()) + 6) % 7)).Format("2006-01-02")
			if str(r["created_at"]) >= start || !done || str(d["completed_at"]) >= start {
				lines = append(lines, fmt.Sprintf("%s 到期%s 完成%v 新增%v", value(d["title"], str(d["text"])), due, done, str(r["created_at"]) >= start))
			}
		}
	}
	if len(lines) == 0 {
		return "skipped: empty", nil
	}
	kind := name
	maxChars := 80
	if name == "weekly" {
		maxChars = 180
	}
	model := jobModel("XIAOHE_MODEL_JOB", "deepseek-v4-flash")
	text, e := a.LLM.CallWith(model, []map[string]string{{"role": "system", "content": fmt.Sprintf("只根据提供的事项写%s简报，不编造，最多%d字。只输出正文。", kind, maxChars)}, {"role": "user", "content": strings.Join(lines, "\n")}}, llm.Options{Timeout: 25 * time.Second})
	if e != nil {
		return "", e
	}
	text = clip(strings.TrimSpace(text), maxChars)
	if text == "" {
		return "", fmt.Errorf("empty brief")
	}
	data, _ := json.Marshal(map[string]any{"items": len(lines)})
	if _, e = a.DB.Exec("INSERT INTO briefs VALUES(?,?,?,?,?,?)", ID(), uid, kind, text, string(data), Now()); e != nil {
		return "", e
	}
	if mode == "on" {
		a.pushUser(uid, "小禾简报", text, map[string]string{"type": "brief"})
	}
	return fmt.Sprintf("brief: %d items", len(lines)), nil
}
func (a *API) profileJob(uid string, now time.Time) (string, error) {
	yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")
	start, _ := time.ParseInLocation("2006-01-02", yesterday, taipei)
	end := start.AddDate(0, 0, 1)
	rows, e := a.DB.Rows("SELECT content FROM messages WHERE user_id=? AND thread='home' AND datetime(created_at)>=datetime(?) AND datetime(created_at)<datetime(?) ORDER BY created_at", uid, start.UTC().Format(time.RFC3339), end.UTC().Format(time.RFC3339))
	if e != nil {
		return "", e
	}
	var source []string
	for _, r := range rows {
		source = append(source, str(r["content"]))
	}
	minutes, e := a.DB.Rows("SELECT t.minutes FROM recordings r JOIN transcripts t ON t.recording_id=r.id WHERE r.user_id=? AND datetime(r.finished_at)>=datetime(?) AND datetime(r.finished_at)<datetime(?) AND r.status='done'", uid, start.UTC().Format(time.RFC3339), end.UTC().Format(time.RFC3339))
	if e != nil {
		return "", e
	}
	for _, r := range minutes {
		source = append(source, str(r["minutes"]))
	}
	if len(source) == 0 {
		return "skipped: empty", nil
	}
	facts, e := a.DB.Rows("SELECT data FROM items WHERE user_id=? AND kind='fact' AND deleted=0", uid)
	if e != nil {
		return "", e
	}
	existing := map[string]bool{}
	for _, r := range facts {
		var d map[string]any
		json.Unmarshal([]byte(str(r["data"])), &d)
		existing[str(d["text"])] = true
	}
	inputRunes := []rune(strings.Join(source, "\n"))
	if len(inputRunes) > 12000 {
		inputRunes = inputRunes[:12000]
	}
	input := string(inputRunes)
	old, _ := json.Marshal(existing)
	text, e := a.LLM.CallWith(jobModel("XIAOHE_MODEL_PROFILE", "deepseek-v4-pro"), []map[string]string{{"role": "system", "content": "从昨天的对话和纪要提取新增的确定事实，最多5条，不猜测。只输出JSON数组：[{\"text\":\"...\",\"group\":\"工作|健康\",\"from\":\"来自：...\"}]。已有事实不得重复。已有：" + string(old)}, {"role": "user", "content": input}}, llm.Options{Timeout: 3 * time.Minute})
	if e != nil {
		return "", e
	}
	var result []struct {
		Text  string `json:"text"`
		Group string `json:"group"`
		From  string `json:"from"`
	}
	if e = json.Unmarshal([]byte(strings.TrimSpace(text)), &result); e != nil {
		return "", e
	}
	count := 0
	for _, f := range result {
		if count >= 5 {
			break
		}
		f.Text = strings.TrimSpace(f.Text)
		if f.Text == "" || existing[f.Text] {
			continue
		}
		if f.Group != "工作" && f.Group != "健康" {
			continue
		}
		raw, _ := json.Marshal(map[string]any{"text": f.Text, "group": f.Group, "from": f.From, "auto": true})
		if _, e = a.DB.Exec("INSERT INTO items VALUES(?,?,?,?,?,?,0)", "fact-auto-"+ID(), uid, "fact", string(raw), Now(), Now()); e != nil {
			return "", e
		}
		existing[f.Text] = true
		count++
	}
	return fmt.Sprintf("facts %d", count), nil
}
