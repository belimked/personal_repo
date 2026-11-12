package api

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"xiaohe/server/internal/llm"
)

func validRemindTime(s *string) bool {
	if s == nil {
		return false
	}
	_, err := time.ParseInLocation("2006-01-02T15:04", *s, taipei)
	return err == nil
}

type voiceIntent struct {
	Intent   string  `json:"intent"`
	Query    *string `json:"query"`
	Title    *string `json:"title"`
	RemindAt *string `json:"remind_at"`
	Place    *string `json:"place"`
}

func (a *API) classifyVoice(spoken string) voiceIntent {
	prompt := fmt.Sprintf("今天是 %s（Asia/Taipei）。判断用户意图，只返回 JSON：{\"intent\":\"search|remind|route|other\",\"query\":\"搜索要搜的话或null\",\"title\":\"提醒事项标题或null\",\"remind_at\":\"YYYY-MM-DDTHH:MM或null\",\"place\":\"目的地或null\"}。无值用 JSON null，时间按今天换算。", time.Now().In(taipei).Format("2006-01-02"))
	raw, e := a.LLM.CallWith(jobModel("XIAOHE_MODEL_ASK", "deepseek-v4-flash"), []map[string]string{{"role": "system", "content": prompt}, {"role": "user", "content": spoken}}, llm.Options{Timeout: 10 * time.Second})
	var v voiceIntent
	if i, j := strings.Index(raw, "{"), strings.LastIndex(raw, "}"); i >= 0 && j > i {
		raw = raw[i : j+1]
	}
	if e != nil || json.Unmarshal([]byte(raw), &v) != nil {
		return voiceIntent{Intent: "other"}
	}
	switch v.Intent {
	case "search", "remind", "route", "other":
		return v
	}
	return voiceIntent{Intent: "other"}
}
func (a *API) voiceAction(ctx context.Context, uid, id, spoken, scene string, v voiceIntent) (string, any, bool) {
	switch v.Intent {
	case "search":
		q := spoken
		if v.Query != nil && strings.TrimSpace(*v.Query) != "" {
			q = strings.TrimSpace(*v.Query)
		}
		result, e := a.askResult(uid, clip(q, 200))
		if e != nil {
			return "搜索暂时不可用", nil, true
		}
		answer := str(result["answer"])
		things, _ := result["things"].([]map[string]any)
		for i, item := range things {
			if i >= 5 {
				break
			}
			answer += fmt.Sprintf("\n%d. %s", i+1, str(item["title"]))
		}
		return answer, map[string]any{"search": q}, true
	case "remind":
		if v.Title == nil || v.RemindAt == nil || strings.TrimSpace(*v.Title) == "" {
			return "", nil, false
		}
		at, e := time.ParseInLocation("2006-01-02T15:04", *v.RemindAt, taipei)
		if e != nil {
			return "", nil, false
		}
		title := strings.TrimSpace(*v.Title)
		data := map[string]any{"title": title, "due": at.Format("2006-01-02"), "remind_at": at.UTC().Format(time.RFC3339), "done": false, "scene": scene, "source": map[string]any{"type": "recording", "recording_id": id}}
		raw, _ := json.Marshal(data)
		if _, e = a.DB.Exec("INSERT INTO items(id,user_id,kind,data,created_at,updated_at,deleted) VALUES(?,?,?,?,?,?,0) ON CONFLICT(id) DO NOTHING", "remind-"+id, uid, "todo", string(raw), Now(), Now()); e != nil {
			return "提醒暂时没能创建", nil, true
		}
		return fmt.Sprintf("好，%d月%d日 %s 提醒你：%s", at.Month(), at.Day(), at.Format("15:04"), title), nil, true
	case "route":
		if v.Place == nil || strings.TrimSpace(*v.Place) == "" {
			return "没找到地点", nil, true
		}
		to := strings.TrimSpace(*v.Place)
		lat, lng, ok := a.lastLocation(uid)
		if !ok {
			return "打开小禾时还没拿到你的位置，开启定位后再问我", nil, true
		}
		if !mapsConfigured() {
			return "路线预估还没开通", nil, true
		}
		ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		result, e := a.estimate(ctx, to, lat, lng, "last")
		if e == errPlace {
			return "没找到" + to, nil, true
		}
		if e != nil {
			return "路线预估暂时不可用", nil, true
		}
		reply := fmt.Sprintf("从你现在的位置去%s，开车约 %d 分钟", result.Place.Name, result.DrivingMin)
		if result.TransitMin != nil {
			reply += fmt.Sprintf("，公交约 %d 分钟", *result.TransitMin)
		}
		return reply + "（预估）", map[string]any{"route": result.Place}, true
	}
	return "", nil, false
}
