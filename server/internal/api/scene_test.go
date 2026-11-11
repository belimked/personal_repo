package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func fakeJev(t *testing.T, reply func(state string) (int, string)) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	var calls atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/v1/systemone" || r.Header.Get("Authorization") != "Bearer k" {
			t.Errorf("request %s %s", r.URL.Path, r.Header.Get("Authorization"))
		}
		var req struct {
			State string `json:"state"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		code, body := reply(req.State)
		w.WriteHeader(code)
		fmt.Fprint(w, body)
	}))
	t.Cleanup(s.Close)
	return s, &calls
}

func jevReply(work, life, mixed, wa, la float64) string {
	return fmt.Sprintf(`{"model":"jev-1.14.0","answers":{"scene":{"type":"choice","probabilities":{"work":%v,"life":%v,"mixed":%v}},"work_actions":{"type":"noul","noul":%v},"life_actions":{"type":"noul","noul":%v}}}`, work, life, mixed, wa, la)
}

func TestSceneClassify(t *testing.T) {
	cases := []struct {
		name                   string
		work, life, mixed      float64
		wa, la                 float64
		scene                  string
		extractWork, extractLf bool
	}{
		{"工作会议", 0.99, 0, 0.01, 0.96, 0.04, "work", true, false},
		{"工作但有明确生活事项", 0.9, 0.05, 0.05, 0.9, 0.8, "work", true, true},
		{"工作，生活事项把握不够", 0.9, 0.05, 0.05, 0.9, 0.5, "work", true, false},
		{"生活忽略工作事项", 0.02, 0.97, 0.01, 0.9, 0.95, "life", false, true},
		{"把握低按 mixed", 0.6, 0.3, 0.1, 0.5, 0.4, "mixed", true, true},
		{"混合但没有生活行动", 0.1, 0.1, 0.8, 0.8, 0.1, "mixed", true, false},
		{"没有行动项", 0.95, 0, 0.05, 0.1, 0.05, "work", false, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s, _ := fakeJev(t, func(string) (int, string) { return 200, jevReply(c.work, c.life, c.mixed, c.wa, c.la) })
			got, e := Jev{Key: "k", Base: s.URL}.Classify(context.Background(), "转写")
			if e != nil || got.Scene != c.scene || got.ExtractWork != c.extractWork || got.ExtractLife != c.extractLf || got.Model != "jev-1.14.0" {
				t.Fatalf("%+v %v", got, e)
			}
		})
	}
	t.Run("失败重试一次后兜底 mixed", func(t *testing.T) {
		s, calls := fakeJev(t, func(string) (int, string) { return 502, "bad" })
		got, e := Jev{Key: "k", Base: s.URL}.Classify(context.Background(), "转写")
		if e == nil || calls.Load() != 2 || got.Scene != "mixed" || !got.ExtractWork || !got.ExtractLife || got.Model != "" {
			t.Fatalf("%+v %v %d", got, e, calls.Load())
		}
	})
	t.Run("第二次成功", func(t *testing.T) {
		var n atomic.Int32
		s, _ := fakeJev(t, func(string) (int, string) {
			if n.Add(1) == 1 {
				return 500, "x"
			}
			return 200, jevReply(0, 1, 0, 0, 0.9)
		})
		got, e := Jev{Key: "k", Base: s.URL}.Classify(context.Background(), "转写")
		if e != nil || got.Scene != "life" {
			t.Fatalf("%+v %v", got, e)
		}
	})
	t.Run("未配置 key", func(t *testing.T) {
		got, e := Jev{}.Classify(context.Background(), "转写")
		if e == nil || got.Scene != "mixed" {
			t.Fatalf("%+v %v", got, e)
		}
	})
	t.Run("长转写截取首尾", func(t *testing.T) {
		long := strings.Repeat("头", 6000) + strings.Repeat("中", 5000) + strings.Repeat("尾", 2000)
		var sent string
		s, _ := fakeJev(t, func(state string) (int, string) { sent = state; return 200, jevReply(1, 0, 0, 1, 0) })
		Jev{Key: "k", Base: s.URL}.Classify(context.Background(), long)
		if strings.Contains(sent, "中") || !strings.HasPrefix(sent, strings.Repeat("头", 6000)) || !strings.HasSuffix(sent, strings.Repeat("尾", 2000)) {
			t.Fatalf("len=%d", len([]rune(sent)))
		}
	})
}

func TestMinutesPrompt(t *testing.T) {
	work := minutesPrompt(Scene{Scene: "work", ExtractWork: true}, "录音日期：X。", "lily")
	if !strings.Contains(work, "工作场合") || !strings.Contains(work, "不要提取私人生活事项") || !strings.Contains(work, "录音日期：X。") || !strings.HasSuffix(work, "lily") {
		t.Fatal(work)
	}
	life := minutesPrompt(Scene{Scene: "life", ExtractLife: true}, "", "lily")
	if !strings.Contains(life, "日常生活") || !strings.Contains(life, "购物清单合成一条") || !strings.Contains(life, "不要提取工作事项") {
		t.Fatal(life)
	}
	mixed := minutesPrompt(Scene{Scene: "mixed", ExtractWork: true, ExtractLife: true}, "", "lily")
	if !strings.Contains(mixed, "两类") {
		t.Fatal(mixed)
	}
	none := minutesPrompt(Scene{Scene: "work"}, "", "lily")
	if !strings.Contains(none, "空数组") {
		t.Fatal(none)
	}
}

func TestSummarizeStoresScene(t *testing.T) {
	f := newRecordingFixture(t)
	s, _ := fakeJev(t, func(string) (int, string) { return 200, jevReply(0.02, 0.97, 0.01, 0.1, 0.95) })
	f.a.Jev = Jev{Key: "k", Base: s.URL}
	id := f.completed(t)
	var scene, model string
	var p, la float64
	if e := f.a.DB.QueryRow("SELECT scene,scene_p,life_actions_p,scene_model FROM recordings WHERE id=?", id).Scan(&scene, &p, &la, &model); e != nil {
		t.Fatal(e)
	}
	if scene != "life" || p != 0.97 || la != 0.95 || model != "jev-1.14.0" {
		t.Fatal(scene, p, la, model)
	}
	prompt, _ := f.lastPrompt.Load().(string)
	if !strings.Contains(prompt, "日常生活") {
		t.Fatal(prompt)
	}
}

func TestRegeneratePushBody(t *testing.T) {
	if minutesBody(2, 3) != "新增 2 件事" || minutesBody(0, 3) != "已更新，共 3 件事" || minutesBody(0, 0) != "没有需要跟进的事" {
		t.Fatal(minutesBody(2, 3), minutesBody(0, 3), minutesBody(0, 0))
	}
	f := newRecordingFixture(t)
	f.device(t, strings.Repeat("ab", 32))
	id := f.completed(t)
	f.regenerate(t, id)
	f.pushMu.Lock()
	defer f.pushMu.Unlock()
	if len(f.payloads) != 2 || !strings.Contains(f.payloads[0], "新增 3 件事") || !strings.Contains(f.payloads[1], "已更新，共 3 件事") {
		t.Fatal(f.payloads)
	}
}
