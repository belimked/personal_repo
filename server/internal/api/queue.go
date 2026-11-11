package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"xiaohe/server/internal/llm"
)

// Minutes generation reads long transcripts with thinking enabled; it needs
// far more time and output room than interactive chat.
var minutesLLM = llm.Options{Timeout: 3 * time.Minute, MaxTokens: 8000}

func (a *API) Start(ctx context.Context) error {
	result, e := a.DB.Exec("UPDATE recordings SET status=CASE WHEN status='transcribing' THEN 'queued' ELSE 'summarizing' END,updated_at=? WHERE status IN ('transcribing','summarizing')", Now())
	if e != nil {
		return e
	}
	recovered, e := result.RowsAffected()
	if e != nil {
		return e
	}
	log.Printf("queue started recovered=%d", recovered)
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		if ctx.Err() != nil {
			return
		}
		a.ProcessOne(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				a.ProcessOne(ctx)
			}
		}
	}()
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		a.CleanupAudio()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				a.CleanupAudio()
			}
		}
	}()
	return nil
}
func (a *API) ProcessOne(ctx context.Context) {
	if ctx.Err() != nil {
		return
	}
	row, e := a.DB.One("SELECT * FROM recordings WHERE status IN ('queued','summarizing') AND (next_try_at IS NULL OR next_try_at<=?) ORDER BY created_at LIMIT 1", Now())
	if e != nil {
		log.Printf("queue fetch failed type=%T error=%v", e, e)
		return
	}
	if row == nil {
		return
	}
	id, uid := str(row["id"]), str(row["user_id"])
	status := str(row["status"])
	if status == "queued" {
		started := time.Now()
		log.Printf("recording=%s stage=transcribing started duration_s=%.3f", id, audioSeconds(row))
		res, offline, err := a.transcribe(ctx, row)
		if err != nil {
			a.jobError(row, "queued", offline, err)
			return
		}
		segments, _ := json.Marshal(res.Segments)
		tx, e := a.DB.Begin()
		if e != nil {
			a.jobError(row, "queued", false, fmt.Errorf("store transcribe begin: %w", e))
			return
		}
		var present int
		if tx.QueryRow("SELECT count(*) FROM recordings WHERE id=? AND status='transcribing'", id).Scan(&present) != nil || present == 0 {
			tx.Rollback()
			return
		}
		_, e = tx.Exec("INSERT INTO transcripts(recording_id,text,segments,speakers,asr_model,asr_elapsed_s,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(recording_id) DO UPDATE SET text=excluded.text,segments=excluded.segments,speakers=excluded.speakers,asr_model=excluded.asr_model,asr_elapsed_s=excluded.asr_elapsed_s", id, res.Text, string(segments), res.Speakers, res.Model, res.Elapsed, Now())
		if e == nil {
			_, e = tx.Exec("UPDATE recordings SET status='summarizing',attempts=0,duration_s=?,updated_at=? WHERE id=?", res.Duration, Now(), id)
		}
		if e != nil {
			tx.Rollback()
			a.jobError(row, "queued", false, fmt.Errorf("store transcribe: %w", e))
			return
		}
		if e = tx.Commit(); e != nil {
			tx.Rollback()
			a.jobError(row, "queued", false, fmt.Errorf("store transcribe commit: %w", e))
			return
		}
		log.Printf("recording=%s stage=transcribing completed elapsed=%s duration_s=%.3f segments=%d", id, time.Since(started), res.Duration, len(res.Segments))
	}
	a.summarize(ctx, id, uid)
}

type asrResponse struct {
	Text     string `json:"text"`
	Segments []struct {
		Start   int    `json:"start_ms"`
		End     int    `json:"end_ms"`
		Speaker int    `json:"speaker"`
		Text    string `json:"text"`
	} `json:"segments"`
	Speakers int     `json:"speakers"`
	Model    string  `json:"model"`
	Duration float64 `json:"duration_s"`
	Elapsed  float64 `json:"elapsed_s"`
}

func (a *API) transcribe(ctx context.Context, row map[string]any) (asrResponse, bool, error) {
	var result asrResponse
	id := str(row["id"])
	_, e := a.DB.Exec("UPDATE recordings SET status='transcribing',updated_at=? WHERE id=? AND status='queued'", Now(), id)
	if e != nil {
		return result, false, e
	}
	file, e := os.Open(str(row["audio_path"]))
	if e != nil {
		return result, false, e
	}
	defer file.Close()
	var body bytes.Buffer
	multi := multipart.NewWriter(&body)
	part, e := multi.CreateFormFile("file", filepath.Base(file.Name()))
	if e != nil {
		return result, false, e
	}
	if _, e = io.Copy(part, file); e != nil {
		return result, false, e
	}
	multi.Close()
	timeout := asrTimeout(row)
	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, e := http.NewRequestWithContext(reqCtx, "POST", strings.TrimRight(a.ASRURL, "/")+"/transcribe", &body)
	if e != nil {
		return result, false, e
	}
	req.Header.Set("Content-Type", multi.FormDataContentType())
	req.Header.Set("X-ASR-Token", a.ASRToken)
	resp, e := http.DefaultClient.Do(req)
	if e != nil {
		return result, true, e
	}
	defer resp.Body.Close()
	if resp.StatusCode == 503 {
		return result, true, errors.New("busy")
	}
	if resp.StatusCode != 200 {
		return result, false, fmt.Errorf("asr status %d", resp.StatusCode)
	}
	if e = json.NewDecoder(io.LimitReader(resp.Body, 40<<20)).Decode(&result); e != nil {
		return result, false, e
	}
	if result.Duration <= 0 || strings.TrimSpace(result.Text) == "" {
		return result, false, errors.New("empty ASR result")
	}
	return result, false, nil
}
func audioSeconds(row map[string]any) float64 {
	if duration, ok := row["duration_s"].(float64); ok && duration > 0 {
		return duration
	}
	if size, ok := row["size_bytes"].(int64); ok && size > 0 {
		return float64(size) / 4000
	}
	return 0
}
func asrTimeout(row map[string]any) time.Duration {
	seconds := math.Max(600, math.Min(3600, audioSeconds(row)*0.6))
	return time.Duration(seconds * float64(time.Second))
}
func (a *API) jobError(row map[string]any, stage string, offline bool, cause error) {
	id := str(row["id"])
	attempts := int(row["attempts"].(int64))
	label := stage
	if stage == "queued" {
		label = "transcribing"
	}
	if offline {
		delays := []time.Duration{time.Minute, 2 * time.Minute, 5 * time.Minute, 10 * time.Minute, 30 * time.Minute}
		index := 0
		if row["next_try_at"] != nil && row["updated_at"] != nil {
			previous, e1 := time.Parse(time.RFC3339Nano, str(row["next_try_at"]))
			updated, e2 := time.Parse(time.RFC3339Nano, str(row["updated_at"]))
			if e1 == nil && e2 == nil {
				for i, delay := range delays {
					if previous.Sub(updated) >= delay-time.Second {
						index = i + 1
					}
				}
			}
		}
		if index >= len(delays) {
			index = len(delays) - 1
		}
		log.Printf("recording=%s stage=%s retry=%d error_type=%T error=%v next_delay=%s", id, label, index+1, cause, cause, delays[index])
		if _, e := a.DB.Exec("UPDATE recordings SET status=?,next_try_at=?,updated_at=? WHERE id=?", stage, time.Now().UTC().Add(delays[index]).Format("2006-01-02T15:04:05.000Z"), Now(), id); e != nil {
			log.Printf("recording=%s stage=%s status_update_failed=%v", id, label, e)
		}
		return
	}
	attempts++
	state := "retry"
	if attempts >= 3 {
		state = "failed"
	}
	log.Printf("recording=%s stage=%s state=%s attempt=%d error_type=%T error=%v", id, label, state, attempts, cause, cause)
	if attempts >= 3 {
		if _, e := a.DB.Exec("UPDATE recordings SET status='failed',attempts=?,error=?,finished_at=?,updated_at=?,next_try_at=NULL WHERE id=?", attempts, "处理失败，请重试", Now(), Now(), id); e != nil {
			log.Printf("recording=%s stage=%s status_update_failed=%v", id, label, e)
			return
		}
		a.notify(str(row["user_id"]), id, false, 0)
		return
	}
	if _, e := a.DB.Exec("UPDATE recordings SET status=?,attempts=?,next_try_at=?,updated_at=? WHERE id=?", stage, attempts, time.Now().UTC().Add(time.Duration(attempts)*time.Minute).Format("2006-01-02T15:04:05.000Z"), Now(), id); e != nil {
		log.Printf("recording=%s stage=%s status_update_failed=%v", id, label, e)
	}
}

type action struct {
	Text   string `json:"text"`
	Owner  string `json:"owner"`
	Due    string `json:"due"`
	IsSelf bool   `json:"is_self"`
}
type minutes struct {
	Title     string   `json:"title"`
	Summary   string   `json:"summary"`
	Points    []string `json:"points"`
	Decisions []string `json:"decisions"`
	Actions   []action `json:"action_items"`
}

func (a *API) summarize(ctx context.Context, id, uid string) {
	row, e := a.DB.One("SELECT * FROM recordings WHERE id=? AND user_id=?", id, uid)
	if e != nil || row == nil || row["status"] != "summarizing" {
		return
	}
	started := time.Now()
	log.Printf("recording=%s stage=summarizing started duration_s=%.3f", id, audioSeconds(row))
	tr, e := a.DB.One("SELECT * FROM transcripts WHERE recording_id=?", id)
	if e != nil || tr == nil {
		a.jobError(row, "summarizing", false, errors.New("missing transcript"))
		return
	}
	var segments []struct {
		Speaker int    `json:"speaker"`
		Text    string `json:"text"`
	}
	json.Unmarshal([]byte(str(tr["segments"])), &segments)
	var lines []string
	for _, s := range segments {
		lines = append(lines, fmt.Sprintf("说话人 %d：%s", s.Speaker, s.Text))
	}
	if len(lines) == 0 {
		lines = append(lines, str(tr["text"]))
	}
	user, _ := a.DB.One("SELECT name FROM users WHERE id=?", uid)
	name := ""
	if user != nil {
		name = str(user["name"])
	}
	input := strings.Join(lines, "\n")
	scene, se := a.Jev.Classify(ctx, input)
	if se != nil {
		log.Printf("recording=%s stage=scene fallback=mixed reason=%q", id, se.Error())
	} else {
		log.Printf("recording=%s stage=scene scene=%s p=%.2f work_actions=%.2f life_actions=%.2f model=%s", id, scene.Scene, scene.P, scene.WorkActions, scene.LifeActions, scene.Model)
	}
	prompt := minutesPrompt(scene, recordingDateHint(row), name)
	if len([]rune(input)) > 40000 {
		runes := []rune(input)
		var partial []string
		for start := 0; start < len(runes); start += 30000 {
			end := start + 30000
			if end > len(runes) {
				end = len(runes)
			}
			piece, err := a.LLM.CallWith("deepseek-v4-pro", []map[string]string{{"role": "system", "content": prompt + " 这是会议的一部分，请先按相同 JSON 格式提取本段信息。"}, {"role": "user", "content": string(runes[start:end])}}, minutesLLM)
			if err != nil {
				a.jobError(row, "summarizing", false, fmt.Errorf("llm: %w", err))
				return
			}
			partial = append(partial, piece)
		}
		input = "以下是各段整理结果，请合并去重并输出同样格式的最终 JSON：\n" + strings.Join(partial, "\n")
	}
	content, e := a.LLM.CallWith("deepseek-v4-pro", []map[string]string{{"role": "system", "content": prompt}, {"role": "user", "content": input}}, minutesLLM)
	if e != nil {
		a.jobError(row, "summarizing", false, fmt.Errorf("llm: %w", e))
		return
	}
	var min minutes
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimSuffix(content, "```")
	e = json.Unmarshal([]byte(strings.TrimSpace(content)), &min)
	if e != nil {
		e = fmt.Errorf("invalid JSON (%T)", e)
	}
	if e == nil && min.Title == "" {
		e = errors.New("missing title")
	}
	if e != nil {
		a.jobError(row, "summarizing", false, fmt.Errorf("llm response JSON: %w", e))
		return
	}
	raw, _ := json.Marshal(min)
	tx, e := a.DB.Begin()
	if e != nil {
		a.jobError(row, "summarizing", false, fmt.Errorf("store begin: %w", e))
		return
	}
	defer tx.Rollback()
	now := Now()
	var previous sql.NullString
	if e = tx.QueryRow("SELECT max(updated_at) FROM items WHERE user_id=? AND id LIKE ?", uid, id+"-%").Scan(&previous); e != nil {
		tx.Rollback()
		a.jobError(row, "summarizing", false, fmt.Errorf("store items timestamp: %w", e))
		return
	}
	if previous.Valid && previous.String >= now {
		last, err := time.Parse(time.RFC3339Nano, previous.String)
		if err != nil {
			tx.Rollback()
			a.jobError(row, "summarizing", false, fmt.Errorf("store items timestamp: %w", err))
			return
		}
		now = last.Add(time.Millisecond).UTC().Format("2006-01-02T15:04:05.000Z")
	}
	_, e = tx.Exec("UPDATE transcripts SET minutes=? WHERE recording_id=?", string(raw), id)
	count := 0
	var labels []string
	keep := []string{}
	for i, item := range min.Actions {
		if e != nil {
			break
		}
		if strings.TrimSpace(item.Text) == "" {
			continue
		}
		kind := "idea"
		if item.Owner != "" && !item.IsSelf && item.Owner != name {
			kind = "watch"
		} else if item.Due != "" {
			kind = "todo"
		}
		data := map[string]any{"text": item.Text, "title": item.Text, "source": map[string]any{"type": "recording", "recording_id": id, "index": i}}
		if item.Due != "" {
			data["date"] = item.Due
			data["due"] = item.Due
		}
		if item.Owner != "" {
			data["owner"] = item.Owner
		}
		b, _ := json.Marshal(data)
		itemID := fmt.Sprintf("%s-%d", id, i)
		var deleted int
		e = tx.QueryRow("INSERT INTO items(id,user_id,kind,data,created_at,updated_at,deleted) VALUES(?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,data=excluded.data,updated_at=excluded.updated_at WHERE items.user_id=excluded.user_id RETURNING deleted", itemID, uid, kind, string(b), now, now).Scan(&deleted)
		keep = append(keep, itemID)
		if e == nil && deleted == 0 {
			count++
			labels = append(labels, item.Text)
		}
	}
	if e == nil {
		query := "UPDATE items SET deleted=1,updated_at=? WHERE user_id=? AND id LIKE ? AND deleted=0"
		args := []any{now, uid, id + "-%"}
		if len(keep) > 0 {
			query += " AND id NOT IN (" + strings.TrimSuffix(strings.Repeat("?,", len(keep)), ",") + ")"
			for _, itemID := range keep {
				args = append(args, itemID)
			}
		}
		_, e = tx.Exec(query, args...)
	}
	if e == nil {
		var sceneModel any
		if scene.Model != "" {
			sceneModel = scene.Model
		}
		_, e = tx.Exec("UPDATE recordings SET status='done',error=NULL,attempts=0,next_try_at=NULL,finished_at=?,updated_at=?,title=?,scene=?,scene_p=?,work_actions_p=?,life_actions_p=?,scene_model=? WHERE id=? AND status='summarizing'", now, now, min.Title, scene.Scene, scene.P, scene.WorkActions, scene.LifeActions, sceneModel, id)
	}
	if e == nil {
		_, e = tx.Exec("INSERT INTO messages VALUES(?,?,?,?,?,?,?)", ID(), uid, "home", "assistant", fmt.Sprintf("会议纪要整理好了，新增 %d 件事：%s", count, strings.Join(labels, "、")), "deepseek-v4-pro", now)
	}
	if e != nil {
		tx.Rollback()
		a.jobError(row, "summarizing", false, fmt.Errorf("store write: %w", e))
		return
	}
	if e = tx.Commit(); e != nil {
		tx.Rollback()
		a.jobError(row, "summarizing", false, fmt.Errorf("store commit: %w", e))
		return
	}
	log.Printf("recording=%s stage=summarizing completed elapsed=%s duration_s=%.3f items=%d", id, time.Since(started), audioSeconds(row), count)
	a.notify(uid, id, true, count)
	_ = ctx
}

var taipei = func() *time.Location {
	if loc, err := time.LoadLocation("Asia/Taipei"); err == nil {
		return loc
	}
	return time.FixedZone("CST", 8*3600)
}()

// recordingDateHint 给纪要提示词提供录音当天的日期，让模型把“本周五”“明天”等相对日期换算成 YYYY-MM-DD。
func recordingDateHint(row map[string]any) string {
	var at time.Time
	for _, key := range []string{"recorded_at", "created_at"} {
		if t, err := time.Parse(time.RFC3339Nano, str(row[key])); err == nil {
			at = t
			break
		}
	}
	if at.IsZero() {
		return ""
	}
	at = at.In(taipei)
	week := []string{"日", "一", "二", "三", "四", "五", "六"}[at.Weekday()]
	return fmt.Sprintf("录音日期：%s（星期%s，Asia/Taipei）。转写中的相对日期（今天、明天、本周五、下周三、月底等）一律按录音日期换算成 YYYY-MM-DD 填入 due；一周从星期一开始，“本周X”指录音当周，“下周X”指下一周；只有确实提到时间才填 due。", at.Format("2006-01-02"), week)
}
func (a *API) CleanupAudio() {
	days := 7
	var setting string
	if a.DB.QueryRow("SELECT value FROM settings WHERE key='audio_retention_days'").Scan(&setting) == nil {
		var n int
		if _, e := fmt.Sscanf(setting, "%d", &n); e == nil && n > 0 {
			days = n
		}
	}
	rows, e := a.DB.Rows("SELECT id,audio_path FROM recordings WHERE audio_path IS NOT NULL AND ((status='done' AND finished_at<?) OR (status='failed' AND finished_at<?))", time.Now().UTC().AddDate(0, 0, -days).Format("2006-01-02T15:04:05.000Z"), time.Now().UTC().AddDate(0, 0, -30).Format("2006-01-02T15:04:05.000Z"))
	if e != nil {
		return
	}
	for _, row := range rows {
		p := str(row["audio_path"])
		if err := os.Remove(p); err == nil || os.IsNotExist(err) {
			a.DB.Exec("UPDATE recordings SET audio_path=NULL,audio_deleted_at=?,updated_at=? WHERE id=? AND audio_path=?", Now(), Now(), row["id"], p)
		}
	}
}
