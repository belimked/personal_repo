package api

import (
	"context"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const maxAudio = 95 << 20

var deviceRE = regexp.MustCompile(`^[a-fA-F0-9]{64}$`)
var audioTypes = map[string]string{".m4a": "audio/mp4", ".opus": "audio/opus", ".mp3": "audio/mpeg", ".wav": "audio/wav"}

func (a *API) recordingRoutes(w http.ResponseWriter, r *http.Request, b, u map[string]any) {
	p, m, uid := r.URL.Path, r.Method, str(u["id"])
	if p == "/api/devices" && m == "POST" {
		token, platform, env := str(b["token"]), str(b["platform"]), str(b["env"])
		if !deviceRE.MatchString(token) || platform != "ios" || (env != "sandbox" && env != "production") {
			fail(w, 400, "invalid_device", "设备信息无效")
			return
		}
		now := Now()
		_, e := a.DB.Exec("INSERT INTO devices VALUES(?,?,?,?,?,?) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,platform=excluded.platform,env=excluded.env,last_seen_at=excluded.last_seen_at", strings.ToLower(token), uid, platform, env, now, now)
		if e != nil {
			a.internal(w)
			return
		}
		send(w, 200, map[string]any{"ok": true})
		return
	}
	if strings.HasPrefix(p, "/api/devices/") && m == "DELETE" {
		a.DB.Exec("DELETE FROM devices WHERE token=? AND user_id=?", strings.ToLower(strings.TrimPrefix(p, "/api/devices/")), uid)
		send(w, 200, map[string]any{"ok": true})
		return
	}
	if p == "/api/recordings" && m == "POST" {
		a.upload(w, r, uid)
		return
	}
	if p == "/api/recordings" && m == "GET" {
		since := r.URL.Query().Get("since")
		rows, e := a.DB.Rows("SELECT id,title,mime,size_bytes,duration_s,status,error,recorded_at,created_at,updated_at,finished_at,audio_deleted_at,scene,kind,intent,step FROM recordings WHERE user_id=? AND (?='' OR updated_at>?) ORDER BY created_at DESC", uid, since, since)
		if e != nil {
			a.internal(w)
			return
		}
		send(w, 200, map[string]any{"recordings": rows})
		return
	}
	if !strings.HasPrefix(p, "/api/recordings/") {
		fail(w, 404, "not_found", "接口不存在")
		return
	}
	tail := strings.TrimPrefix(p, "/api/recordings/")
	parts := strings.Split(tail, "/")
	id := parts[0]
	row, e := a.DB.One("SELECT * FROM recordings WHERE id=? AND user_id=?", id, uid)
	if e != nil {
		a.internal(w)
		return
	}
	if row == nil {
		fail(w, 404, "not_found", "录音不存在")
		return
	}
	if len(parts) == 1 {
		if m == "GET" {
			var pos int
			if row["status"] == "queued" {
				a.DB.QueryRow("SELECT count(*) FROM recordings WHERE status IN ('queued','transcribing') AND created_at<=?", row["created_at"]).Scan(&pos)
			}
			delete(row, "audio_path")
			row["queue_position"] = pos
			send(w, 200, map[string]any{"recording": row})
			return
		}
		if m == "DELETE" {
			_, e := a.DB.Exec("DELETE FROM transcripts WHERE recording_id=?", id)
			if e == nil {
				_, e = a.DB.Exec("DELETE FROM recordings WHERE id=? AND user_id=?", id, uid)
			}
			if e != nil {
				a.internal(w)
				return
			}
			if row["audio_path"] != nil {
				os.Remove(str(row["audio_path"]))
			}
			send(w, 200, map[string]any{"ok": true})
			return
		}
	}
	if len(parts) == 2 && m == "GET" && (parts[1] == "transcript" || parts[1] == "minutes") {
		tr, e := a.DB.One("SELECT * FROM transcripts WHERE recording_id=?", id)
		if e != nil {
			a.internal(w)
			return
		}
		if tr == nil {
			fail(w, 404, "not_found", "内容尚未生成")
			return
		}
		if parts[1] == "minutes" {
			if tr["minutes"] == nil {
				fail(w, 404, "not_found", "纪要尚未生成")
				return
			}
			var v any
			if json.Unmarshal([]byte(str(tr["minutes"])), &v) != nil {
				a.internal(w)
				return
			}
			send(w, 200, v)
			return
		}
		var segments any
		json.Unmarshal([]byte(str(tr["segments"])), &segments)
		send(w, 200, map[string]any{"text": tr["text"], "segments": segments, "speakers": tr["speakers"]})
		return
	}
	// 用户改标签（工作 / 生活 / 工作和生活）：记为用户指定，并按新标签重新整理事项。
	if len(parts) == 2 && m == "POST" && parts[1] == "scene" {
		scene := str(b["scene"])
		if scene != "work" && scene != "life" && scene != "mixed" {
			fail(w, 400, "invalid_scene", "标签无效")
			return
		}
		if row["status"] != "done" {
			fail(w, 409, "invalid_status", "整理完成后才能改标签")
			return
		}
		if _, e := a.DB.Exec("UPDATE recordings SET scene=?,scene_model='user',scene_p=1,status='summarizing',attempts=0,next_try_at=NULL,error=NULL,updated_at=?,finished_at=NULL WHERE id=?", scene, Now(), id); e != nil {
			a.internal(w)
			return
		}
		a.wakeQueue()
		send(w, 200, map[string]any{"ok": true, "status": "summarizing", "scene": scene})
		return
	}
	if len(parts) == 2 && m == "POST" && (parts[1] == "retry" || parts[1] == "regenerate") {
		if parts[1] == "retry" && row["status"] != "failed" || parts[1] == "regenerate" && row["status"] != "done" {
			fail(w, 409, "invalid_status", "当前状态不能重试")
			return
		}
		target := "queued"
		if parts[1] == "regenerate" || row["audio_path"] == nil {
			target = "summarizing"
		}
		if target == "queued" && row["audio_path"] == nil {
			fail(w, 409, "audio_deleted", "音频已删除")
			return
		}
		if target == "summarizing" {
			var n int
			a.DB.QueryRow("SELECT count(*) FROM transcripts WHERE recording_id=?", id).Scan(&n)
			if n == 0 {
				fail(w, 409, "audio_deleted", "音频已删除")
				return
			}
		}
		_, e := a.DB.Exec("UPDATE recordings SET status=?,attempts=0,next_try_at=NULL,error=NULL,updated_at=?,finished_at=NULL WHERE id=?", target, Now(), id)
		if e != nil {
			a.internal(w)
			return
		}
		a.wakeQueue()
		send(w, 200, map[string]any{"ok": true, "status": target})
		return
	}
	fail(w, 404, "not_found", "接口不存在")
}
func (a *API) upload(w http.ResponseWriter, r *http.Request, uid string) {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		fail(w, 400, "invalid_file", "请上传文件")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxAudio+(1<<20))
	reader, e := r.MultipartReader()
	if e != nil {
		fail(w, 400, "invalid_file", "上传格式无效")
		return
	}
	var title, recorded, ext, typ, path string
	kind := "meeting"
	var size int64
	found := false
	id := ID()
	defer func() {
		if path != "" {
			os.Remove(path)
		}
	}()
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			fail(w, 413, "too_large", "音频文件超过 95 MB")
			return
		}
		switch part.FormName() {
		case "title", "recorded_at", "kind":
			raw, err := io.ReadAll(io.LimitReader(part, 1024))
			if err != nil {
				a.internal(w)
				return
			}
			switch part.FormName() {
			case "title":
				title = string(raw)
			case "kind":
				if string(raw) != "meeting" && string(raw) != "voice" && string(raw) != "file" {
					fail(w, 400, "invalid_kind", "类型无效")
					return
				}
				if kind != "file" {
					kind = string(raw)
				}
			default:
				recorded = string(raw)
			}
		case "file":
			if found {
				fail(w, 400, "invalid_file", "一次只能上传一个文件")
				return
			}
			found = true
			ext = strings.ToLower(filepath.Ext(part.FileName()))
			typ = audioTypes[ext]
			if ft := fileTypes[ext]; ft != "" {
				// 照片和文档按资料处理，不管表单里写的是什么录音类型
				typ, kind = ft, "file"
			} else if kind == "file" {
				fail(w, 400, "invalid_file", "支持照片（jpg、png、heic）、PDF、Word（docx）和 txt")
				return
			}
			declared, _, _ := mime.ParseMediaType(part.Header.Get("Content-Type"))
			if typ == "" || kind != "file" && declared != "" && declared != "application/octet-stream" && declared != typ && !(ext == ".m4a" && declared == "audio/x-m4a") && !(ext == ".wav" && declared == "audio/x-wav") {
				fail(w, 400, "invalid_file", "不支持这种文件")
				return
			}
			dir := a.AudioDir
			if dir == "" {
				dir = "audio"
			}
			folder := filepath.Join(dir, uid)
			if e = os.MkdirAll(folder, 0700); e != nil {
				a.internal(w)
				return
			}
			path = filepath.Join(folder, id+ext)
			f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
			if err != nil {
				a.internal(w)
				return
			}
			size, err = io.Copy(f, io.LimitReader(part, maxAudio+1))
			closeErr := f.Close()
			if err != nil || closeErr != nil {
				a.internal(w)
				return
			}
			if kind == "file" && size > maxFile {
				fail(w, 413, "too_large", "文件超过 30 MB")
				return
			}
			if size > maxAudio {
				fail(w, 413, "too_large", "音频文件超过 95 MB")
				return
			}
			if size == 0 {
				fail(w, 400, "invalid_file", "文件是空的")
				return
			}
			if kind == "file" && !sniff(path, ext) {
				fail(w, 400, "invalid_file", "文件内容和类型对不上，可能已损坏")
				return
			}
		default:
			io.Copy(io.Discard, io.LimitReader(part, 1024))
		}
	}
	if !found {
		fail(w, 400, "invalid_file", "请上传文件")
		return
	}
	if recorded != "" {
		if _, e = time.Parse(time.RFC3339Nano, recorded); e != nil {
			fail(w, 400, "invalid_recorded_at", "录音时间无效")
			return
		}
	}
	var count int
	var duration float64
	today := time.Now().UTC().Format("2006-01-02")
	if kind == "file" {
		if e = a.DB.QueryRow("SELECT count(*) FROM recordings WHERE user_id=? AND created_at>=? AND kind='file'", uid, today).Scan(&count); e != nil {
			a.internal(w)
			return
		}
		if count >= 50 {
			fail(w, 429, "rate_limited", "今天交的资料已达上限（50 份）")
			return
		}
	} else if e = a.DB.QueryRow("SELECT count(*),coalesce(sum(CASE WHEN duration_s IS NOT NULL AND duration_s>0 THEN duration_s ELSE size_bytes/4000.0 END),0) FROM recordings WHERE user_id=? AND created_at>=? AND kind<>'file'", uid, today).Scan(&count, &duration); e != nil {
		a.internal(w)
		return
	}
	if kind != "file" && (count >= 20 || duration+float64(size)/4000 > 5*3600) {
		fail(w, 429, "rate_limited", "今日录音上传已达上限")
		return
	}
	now := Now()
	_, e = a.DB.Exec("INSERT INTO recordings(id,user_id,title,mime,size_bytes,audio_path,status,recorded_at,created_at,updated_at,kind) VALUES(?,?,?,?,?,?,'queued',?,?,?,?)", id, uid, title, typ, size, path, recorded, now, now, kind)
	if e != nil {
		a.internal(w)
		return
	}
	path = ""
	a.wakeQueue()
	send(w, 200, map[string]any{"recording": map[string]any{"id": id, "status": "queued", "title": title, "created_at": now, "kind": kind}})
}
func (a *API) adminASR(w http.ResponseWriter) {
	rows, e := a.DB.Rows("SELECT r.id,r.status,r.attempts,r.created_at,r.finished_at,r.duration_s,t.asr_elapsed_s FROM recordings r LEFT JOIN transcripts t ON t.recording_id=r.id ORDER BY r.created_at DESC LIMIT 20")
	if e != nil {
		a.internal(w)
		return
	}
	var n int
	a.DB.QueryRow("SELECT count(*) FROM recordings WHERE status='queued'").Scan(&n)
	send(w, 200, map[string]any{"online": a.asrOnline(), "queue": n, "recent": rows})
}
func (a *API) asrOnline() bool {
	if a.ASRURL == "" {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, e := http.NewRequestWithContext(ctx, "GET", strings.TrimRight(a.ASRURL, "/")+"/health", nil)
	if e != nil {
		return false
	}
	resp, e := http.DefaultClient.Do(req)
	if e != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}
