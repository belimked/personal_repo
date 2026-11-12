package api

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

// Jev 调 TypeSafe 的 jev 分类模型，判断录音是工作、生活还是混合场合。
type Jev struct {
	Key, Base string
	HTTP      *http.Client
}

// Scene 是一次场合判断的结果；Model 为空表示没调用成功（或未配置），按 mixed 处理。
type Scene struct {
	Scene       string  // work / life / mixed
	P           float64 // 所选场合的最高概率；兜底时为 0
	WorkActions float64
	LifeActions float64
	Model       string
	ExtractWork bool
	ExtractLife bool
}

const (
	sceneMaxChars  = 8000
	sceneHeadChars = 6000
	sceneTailChars = 2000
	sceneMinP      = 0.70 // 场合最高概率低于此值按 mixed
	actionMinP     = 0.30 // 行动项概率低于此值不提取该类事项
	workLifeMinP   = 0.70 // 场合为 work 时，另提生活事项需要的 life_actions 概率
)

const (
	sceneInstructions = "这是一段录音的语音转写（可能有错字、缺标点）。判断这段录音整体是什么场合：工作场合指同事、上下级、客户之间谈公司或业务的事，即使业务本身涉及医疗、购物、采购、天气等话题也算工作；生活场合指家人、朋友、自己的私人事务和闲聊，即使聊到对方的工作、裁员、换工作也算生活。开场寒暄、顺口一提的天气或新闻不改变场合。两种场合都有实质内容时选 mixed。"
	workActionsQ      = "录音里是否有人承诺或被安排去做某件与工作、公司、业务有关的具体事情？只是讨论想法、没有落到人身上的不算。"
	lifeActionsQ      = "录音里是否有人承诺或被安排去做某件私人生活中的具体事情，例如购物、就医预约、接送家人、缴费、打电话给家人？工作事务（包括公司采购、请假的工作交接）不算。"
)

// sceneText 截取送去分类的转写：超过 8000 字时取开头 6000 + 结尾 2000 字。
func sceneText(s string) string {
	r := []rune(s)
	if len(r) <= sceneMaxChars {
		return s
	}
	return string(r[:sceneHeadChars]) + "\n……\n" + string(r[len(r)-sceneTailChars:])
}

// Classify 判断场合并决定提取哪类事项。未配置 key 或两次调用都失败时返回 mixed、两类都提取，并带回错误供日志使用。
func (j Jev) Classify(ctx context.Context, transcript string) (Scene, error) {
	fallback := Scene{Scene: "mixed", ExtractWork: true, ExtractLife: true}
	if j.Key == "" {
		return fallback, errors.New("not configured")
	}
	var a jevAnswers
	var e error
	for try := 0; try < 2; try++ {
		if a, e = j.call(ctx, sceneText(transcript)); e == nil {
			break
		}
	}
	if e != nil {
		return fallback, e
	}
	s := Scene{Scene: "mixed", WorkActions: a.Answers.WorkActions.Noul, LifeActions: a.Answers.LifeActions.Noul, Model: a.Model}
	best, bestP := "", -1.0
	for _, k := range []string{"work", "life", "mixed"} {
		if p := a.Answers.Scene.Probabilities[k]; p > bestP {
			best, bestP = k, p
		}
	}
	s.P = bestP
	if bestP >= sceneMinP {
		s.Scene = best
	}
	s.ExtractWork = s.Scene != "life" && s.WorkActions >= actionMinP
	s.ExtractLife = s.LifeActions >= actionMinP && (s.Scene != "work" || s.LifeActions >= workLifeMinP)
	return s, nil
}

type jevAnswers struct {
	Model   string `json:"model"`
	Answers struct {
		Scene struct {
			Probabilities map[string]float64 `json:"probabilities"`
		} `json:"scene"`
		WorkActions struct {
			Noul float64 `json:"noul"`
		} `json:"work_actions"`
		LifeActions struct {
			Noul float64 `json:"noul"`
		} `json:"life_actions"`
	} `json:"answers"`
}

func (j Jev) call(ctx context.Context, text string) (jevAnswers, error) {
	var out jevAnswers
	body, _ := json.Marshal(map[string]any{
		"model": "jev-latest",
		"state": text,
		"questions": map[string]any{
			"scene": map[string]any{"type": "choice", "instructions": sceneInstructions, "criteria": map[string]string{
				"work":  "工作场合：会议、项目、客户、汇报、采购、请假安排等公司事务",
				"life":  "生活场合：购物、家务、健康就医、家人朋友、出行、时事闲聊等私人事务",
				"mixed": "同一段录音里既有实质的工作事项，也有实质的私人生活事项",
			}},
			"work_actions": map[string]any{"type": "noul", "instructions": workActionsQ},
			"life_actions": map[string]any{"type": "noul", "instructions": lifeActionsQ},
		},
	})
	base := j.Base
	if base == "" {
		base = "https://api.typesafe.ai"
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, e := http.NewRequestWithContext(ctx, "POST", strings.TrimRight(base, "/")+"/v1/systemone", bytes.NewReader(body))
	if e != nil {
		return out, e
	}
	req.Header.Set("Authorization", "Bearer "+j.Key)
	req.Header.Set("Content-Type", "application/json")
	client := j.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	r, e := client.Do(req)
	if e != nil {
		return out, e
	}
	defer r.Body.Close()
	if r.StatusCode/100 != 2 {
		return out, fmt.Errorf("upstream %d", r.StatusCode)
	}
	if e = json.NewDecoder(r.Body).Decode(&out); e != nil {
		return out, e
	}
	if len(out.Answers.Scene.Probabilities) == 0 {
		return out, errors.New("missing scene probabilities")
	}
	return out, nil
}

// minutesPrompt 按场合和要提取的事项类别组装纪要提示词。
func minutesPrompt(s Scene, dateHint, name string) string {
	format := "整理为 JSON：title 标题、summary 三到五句摘要、points 要点数组、decisions 已定事项数组、action_items 数组（text 内容、owner 负责人、due YYYY-MM-DD 日期、is_self 是否为用户本人、suggest 一句话建议怎么办（≤40字）、suggest_short 封面副标题（≤14字））。建议只依据录音内容，不编造。未提到的字段留空，勿编造。points 只写讨论过但没有落成事项或决定的内容（背景、想法、问题、数据），不要重复 action_items 和 decisions 里已有的事；没有就输出空数组。"
	var head string
	switch s.Scene {
	case "work":
		head = "这是一段工作场合的录音（会议、汇报、客户沟通等）。将逐句转写" + format
	case "life":
		head = "这是一段日常生活的录音（家人朋友交谈、私人事务）。将逐句转写" + format + "decisions 写商量好的事；summary 用平实的口吻。"
	default:
		head = "这段录音同时涉及工作和私人生活。将逐句转写" + format + "summary 和 points 分别说明工作部分和生活部分。"
	}
	work := "工作事项：有人承诺或被安排去做的具体工作，写明负责人；只是讨论想法、没落到人身上的不算。"
	life := "生活事项：需要去办的私人事务。购物清单合成一条（如“买：苹果、牛奶、电池”）；就医、预约、缴费、接送等有时间的写 due；家人朋友答应要做的事写 owner。"
	var rule string
	switch {
	case s.ExtractWork && s.ExtractLife:
		rule = "action_items 包含两类：" + work + life
	case s.ExtractWork:
		rule = "action_items 只提取" + work + "不要提取私人生活事项。"
	case s.ExtractLife:
		rule = "action_items 只提取" + life + "不要提取工作事项。"
	default:
		rule = "这段录音没有需要跟进的事项，action_items 输出空数组。"
	}
	return head + rule + dateHint + "用户显示名：" + name
}
