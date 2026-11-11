package api

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
)

func has(s, q string) bool { return strings.Contains(strings.ToLower(s), strings.ToLower(q)) }

// snippet 截取命中位置前后的一小段，供搜索结果展示。
func snippet(text, q string) string {
	lower := strings.ToLower(text)
	i := strings.Index(lower, strings.ToLower(q))
	r := []rune(text)
	if i < 0 {
		return clip(text, 60)
	}
	start := len([]rune(lower[:i]))
	from, to := start-20, start+len([]rune(q))+40
	if from < 0 {
		from = 0
	}
	if to > len(r) {
		to = len(r)
	}
	s := string(r[from:to])
	if from > 0 {
		s = "…" + s
	}
	if to < len(r) {
		s += "…"
	}
	return s
}

// search 按关键词查本人的 说过的话（录音转写、首页对话）、事情（事项）、资料（录音标题和纪要）。
// 关键词只用于查询，不写日志。
func (a *API) search(w http.ResponseWriter, r *http.Request, uid string) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" || len([]rune(q)) > 50 {
		fail(w, 400, "invalid_query", "请输入要搜的内容")
		return
	}
	said, things, files := []map[string]any{}, []map[string]any{}, []map[string]any{}

	recs, e := a.DB.Rows(`SELECT r.id,r.title,r.kind,r.recorded_at,r.created_at,r.duration_s,t.text,t.segments,t.minutes
		FROM recordings r LEFT JOIN transcripts t ON t.recording_id=r.id
		WHERE r.user_id=? AND (instr(lower(coalesce(t.text,'')),lower(?))>0 OR instr(lower(coalesce(r.title,'')),lower(?))>0 OR instr(lower(coalesce(t.minutes,'')),lower(?))>0)
		ORDER BY r.created_at DESC LIMIT 30`, uid, q, q, q)
	if e != nil {
		a.internal(w)
		return
	}
	for _, row := range recs {
		at := str(row["recorded_at"])
		if at == "" {
			at = str(row["created_at"])
		}
		title := str(row["title"])
		if text := str(row["text"]); has(text, q) {
			hit := map[string]any{"type": "recording", "recording_id": row["id"], "title": title, "at": at, "snippet": snippet(text, q)}
			var segs []struct {
				StartMs *int64 `json:"start_ms"`
				Text    string `json:"text"`
			}
			json.Unmarshal([]byte(str(row["segments"])), &segs)
			for _, s := range segs {
				if has(s.Text, q) {
					hit["snippet"] = snippet(s.Text, q)
					if s.StartMs != nil {
						hit["start_ms"] = *s.StartMs
					}
					break
				}
			}
			said = append(said, hit)
		}
		var min minutes
		json.Unmarshal([]byte(str(row["minutes"])), &min)
		body := strings.Join(append(append([]string{min.Summary}, min.Points...), min.Decisions...), " ")
		if has(title, q) || has(body, q) {
			file := map[string]any{"recording_id": row["id"], "title": title, "kind": row["kind"], "at": at, "duration_s": row["duration_s"]}
			if has(body, q) {
				file["snippet"] = snippet(body, q)
			}
			files = append(files, file)
		}
	}

	msgs, e := a.DB.Rows("SELECT role,content,created_at FROM messages WHERE user_id=? AND thread='home' AND role IN ('user','assistant') AND instr(lower(content),lower(?))>0 ORDER BY created_at DESC LIMIT 20", uid, q)
	if e != nil {
		a.internal(w)
		return
	}
	for _, m := range msgs {
		said = append(said, map[string]any{"type": "chat", "role": m["role"], "at": m["created_at"], "snippet": snippet(str(m["content"]), q)})
	}
	sort.SliceStable(said, func(i, j int) bool { return str(said[i]["at"]) > str(said[j]["at"]) })

	rows, e := a.DB.Rows("SELECT id,kind,data FROM items WHERE user_id=? AND deleted=0 AND kind IN ('todo','idea','watch','stash') AND instr(lower(data),lower(?))>0 ORDER BY updated_at DESC LIMIT 50", uid, q)
	if e != nil {
		a.internal(w)
		return
	}
	for _, row := range rows {
		var d map[string]any
		json.Unmarshal([]byte(str(row["data"])), &d)
		title := str(d["title"])
		if title == "" {
			title = str(d["text"])
		}
		if !has(title, q) && !has(str(d["note"]), q) && !has(str(d["owner"]), q) {
			continue
		}
		thing := map[string]any{"id": row["id"], "kind": row["kind"], "title": title, "due": str(d["due"]), "done": d["done"] == true, "owner": str(d["owner"])}
		if src, ok := d["source"].(map[string]any); ok && str(src["type"]) == "recording" {
			thing["recording_id"] = str(src["recording_id"])
		}
		things = append(things, thing)
		if len(things) == 20 {
			break
		}
	}
	send(w, 200, map[string]any{"said": said, "things": things, "files": files})
}
