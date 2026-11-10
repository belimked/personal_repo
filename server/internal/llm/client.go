package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	Key, Base string
	HTTP      *http.Client
}

func (c Client) Call(model string, messages []map[string]string) (string, error) {
	if c.Key == "" {
		return "", errors.New("missing key")
	}
	base := c.Base
	if base == "" {
		base = "https://api.belimked.com/v1"
	}
	tokens, thinking := 800, "disabled"
	if model == "deepseek-v4-pro" {
		tokens, thinking = 3000, "enabled"
	}
	b, _ := json.Marshal(map[string]any{"model": model, "messages": messages, "max_tokens": tokens, "thinking": map[string]string{"type": thinking}})
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	req, e := http.NewRequestWithContext(ctx, "POST", strings.TrimRight(base, "/")+"/chat/completions", bytes.NewReader(b))
	if e != nil {
		return "", e
	}
	req.Header.Set("Authorization", "Bearer "+c.Key)
	req.Header.Set("Content-Type", "application/json")
	client := c.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	r, e := client.Do(req)
	if e != nil {
		return "", e
	}
	defer r.Body.Close()
	if r.StatusCode/100 != 2 {
		return "", fmt.Errorf("upstream %d", r.StatusCode)
	}
	var v struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if e = json.NewDecoder(r.Body).Decode(&v); e != nil {
		return "", e
	}
	if len(v.Choices) == 0 || v.Choices[0].Message.Content == "" {
		return "", errors.New("empty response")
	}
	return v.Choices[0].Message.Content, nil
}
func Fallback(s string) string {
	if strings.Contains(s, "周报") || strings.Contains(s, "简版") {
		return "我先给你列个简版：本周完成的事、当前进展、下周计划。把具体事项发我，我直接整理成稿。"
	}
	if strings.Contains(s, "生日") || strings.Contains(s, "妈妈") {
		return "先想想她最近提过想要什么。比起买贵的东西，挑一件她真会用的，再写几句你自己的话。"
	}
	return "我收到了。现在暂时没法继续处理，你可以稍后再试；这件事我已经记在对话里。"
}
func Prompt(name string) string {
	return "你是小禾，" + name + "的日常助理。你替用户记着、盯着、做出来，而非待办工具或聊天机器人。口吻克制、简短、中文，称呼用户为" + name + "；不说空话、不评论用户本人、不主动问个人信息。先交付可用的结果，只有办成眼前事所必需的条件才顺口问；能直接做的不要反复征询。工作写作只出草稿，不替用户发送；没有资料不要编造出处或已完成的动作。尊重用户的拒绝和隐私，不劝说、不推销。"
}
