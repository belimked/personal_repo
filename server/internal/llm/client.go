package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	Key, Base string
	HTTP      *http.Client
}

// Options overrides per-call limits. Zero values keep the chat defaults
// (25s timeout; 800 tokens for flash, 3000 for pro).
type Options struct {
	Timeout   time.Duration
	MaxTokens int
}

func (c Client) Call(model string, messages []map[string]string) (string, error) {
	return c.CallWith(model, messages, Options{})
}

func (c Client) CallWith(model string, messages []map[string]string, o Options) (string, error) {
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
	if o.MaxTokens > 0 {
		tokens = o.MaxTokens
	}
	timeout := 25 * time.Second
	if o.Timeout > 0 {
		timeout = o.Timeout
	}
	b, _ := json.Marshal(map[string]any{"model": model, "messages": messages, "max_tokens": tokens, "thinking": map[string]string{"type": thinking}})
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
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

// Stream reads OpenAI-compatible SSE chunks and forwards content as it arrives.
func (c Client) Stream(model string, messages []map[string]string, o Options, onDelta func(string)) (string, error) {
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
	if o.MaxTokens > 0 {
		tokens = o.MaxTokens
	}
	timeout := 25 * time.Second
	if o.Timeout > 0 {
		timeout = o.Timeout
	}
	b, _ := json.Marshal(map[string]any{"model": model, "messages": messages, "max_tokens": tokens, "thinking": map[string]string{"type": thinking}, "stream": true})
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "POST", strings.TrimRight(base, "/")+"/chat/completions", bytes.NewReader(b))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.Key)
	req.Header.Set("Content-Type", "application/json")
	client := c.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return "", fmt.Errorf("upstream %d", resp.StatusCode)
	}
	reader := bufio.NewReader(resp.Body)
	var out strings.Builder
	done := false
	for {
		line, e := reader.ReadString('\n')
		if e != nil && e != io.EOF {
			return out.String(), e
		}
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "data:") {
			data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if data == "[DONE]" {
				done = true
				break
			}
			var chunk struct {
				Choices []struct {
					Delta struct {
						Content string `json:"content"`
					} `json:"delta"`
				} `json:"choices"`
				Error any `json:"error"`
			}
			if json.Unmarshal([]byte(data), &chunk) != nil || chunk.Error != nil {
				return out.String(), errors.New("invalid upstream stream")
			}
			for _, choice := range chunk.Choices {
				if choice.Delta.Content != "" {
					out.WriteString(choice.Delta.Content)
					onDelta(choice.Delta.Content)
				}
			}
		}
		if e == io.EOF {
			break
		}
	}
	if !done || out.Len() == 0 {
		return out.String(), errors.New("incomplete upstream stream")
	}
	return out.String(), nil
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
