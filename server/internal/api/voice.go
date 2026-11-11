package api

import (
	"log"
	"strings"

	"xiaohe/server/internal/llm"
)

// speakerHint 告诉纪要模型怎么称呼说话的人，避免出现“说话人 0”。
func speakerHint(n int) string {
	if n > 1 {
		return "转写里的“说话人 N”只是语音识别给的编号，不是名字：能从内容判断出名字或身份（如经理、客户、妈妈）时用名字或身份，判断不出才写“说话人 N”。"
	}
	return "整段只有用户本人在说话：摘要和要点里用“你”指代说话的人，不要写“说话人”；action_items 的 is_self 默认为 true。"
}

// voiceReply 把按住说的一句话当作首页对话里的一条消息，让小禾直接回答。
func (a *API) voiceReply(uid, name, spoken string, row map[string]any) string {
	history, _ := a.DB.Rows("SELECT role,content FROM messages WHERE user_id=? AND thread='home' ORDER BY created_at DESC,rowid DESC LIMIT 20", uid)
	msgs := []map[string]string{{"role": "system", "content": llm.Prompt(name) + "用户这条消息是语音转写的，可能有同音错字，按最合理的意思理解。" + recordingDateHint(row)}}
	for i := len(history) - 1; i >= 0; i-- {
		msgs = append(msgs, map[string]string{"role": str(history[i]["role"]), "content": str(history[i]["content"])})
	}
	msgs = append(msgs, map[string]string{"role": "user", "content": spoken})
	reply, e := a.LLM.Call("deepseek-v4-flash", msgs)
	if e != nil || strings.TrimSpace(reply) == "" {
		log.Printf("recording=%s stage=reply fallback=true", str(row["id"]))
		return llm.Fallback(spoken)
	}
	return strings.TrimSpace(reply)
}

// voiceTitle 用说的话本身做标题，过长截断。
func voiceTitle(spoken string) string {
	return clip(strings.TrimSpace(spoken), 30)
}

func clip(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
