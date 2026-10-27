import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, waitFor } from "./helpers.mjs";

const TODAY = "2026-03-04"; // 周三
const FRIDAY = "2026-03-06";
const SESSION = "lily@demo.com";

async function openChat() {
  const p = await loadPage("home.html", { session: SESSION, today: TODAY });
  p.window.PA_TYPING_MS = 10;
  await waitFor(() => p.document.querySelector('#msgs .msg[data-kind="greet"]'), { label: "问候消息" });
  await p.window.PA_CHAT.idle();
  return { ...p, chat: p.window.PA_CHAT, PA: p.window.PA, all: (sel) => [...p.document.querySelectorAll(sel)] };
}
const lastKind = (c, kind) => c.all(`#msgs .msg[data-kind="${kind}"]`).at(-1);
const countKind = (c, kind) => c.all(`#msgs .msg[data-kind="${kind}"]`).length;

test("parseWhen：口语里的钟点按时段规则补成下午/晚上", async () => {
  const p = await loadPage("index.html", { today: TODAY });
  try {
    const t = (s) => p.window.PA.parseWhen(s).time;
    const cases = {
      "周五3点体检": "15:00", "明天1点开会": "13:00", "两点半交材料": "14:30", "六点吃饭": "18:00", "4:30开会": "16:30",
      "凌晨3点赶飞机": "03:00", "早上7点跑步": "07:00", "上午10点开会": "10:00", "上午3点": "03:00",
      "下午3点": "15:00", "晚上8点看电影": "20:00", "傍晚6点": "18:00", "下午12点": "12:00", "晚上11点": "23:00",
      "明天7点起床": "07:00", "九点上班": "09:00", "11点开会": "11:00", "12点吃午饭": "12:00", "中午12点": "12:00", "中午1点": "13:00",
    };
    for (const [s, want] of Object.entries(cases)) assert.equal(t(s), want, s);
    const w = p.window.PA.parseWhen("周五3点体检");
    assert.equal(w.date, FRIDAY);
    assert.equal(w.precision, "time");
  } finally {
    p.close();
  }
});

test("助手页“周五3点体检”生成周五 15:00 的待办", async () => {
  const c = await openChat();
  try {
    const n = countKind(c, "todo");
    await c.chat.send("周五3点体检");
    await waitFor(() => countKind(c, "todo") > n, { label: "新建待办" });
    await c.chat.idle();
    const id = lastKind(c, "todo").querySelector('a[href^="todo.html?id="]').getAttribute("href").split("=")[1];
    const t = c.state().todos.find((x) => x.id === id);
    assert.equal(t.title, "体检");
    assert.equal(t.date, FRIDAY);
    assert.equal(t.time, "15:00");
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
});

test("待办页手动新建表单：“周五3点体检”识别为 15:00 并按此创建", async () => {
  const p = await loadPage("todos.html", { session: SESSION, today: TODAY });
  try {
    p.document.getElementById("new").click();
    const ti = await waitFor(() => p.document.getElementById("n-title"), { label: "新建表单" });
    ti.value = "周五3点体检";
    ti.dispatchEvent(new p.window.Event("input"));
    const hint = p.document.getElementById("n-parsed").textContent;
    assert.ok(hint.includes("15:00") && !hint.includes("03:00"), hint);
    const create = [...p.document.querySelectorAll("button")].find((b) => b.textContent.trim() === "创建");
    create.click();
    const t = await waitFor(() => p.state().todos.find((x) => x.title === "体检"), { label: "创建待办" });
    assert.equal(t.date, FRIDAY);
    assert.equal(t.time, "15:00");
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("“找/查/搜/查找/搜索 + 内容”直接按查询处理，原话不被改写；带时间或动作的不算查询", async () => {
  const c = await openChat();
  try {
    for (const text of ["找合同", "查合同", "搜合同", "查找合同", "搜索报价方案", "帮我找合同"]) {
      const n = countKind(c, "search");
      await c.chat.send(text);
      await c.chat.idle();
      assert.equal(countKind(c, "search"), n + 1, `${text} 应按查询处理`);
      assert.equal(c.chat.messages().filter((m) => m.role === "user").at(-1).text, text, "记录里是原话");
      assert.equal(c.all("#msgs .msg.me").at(-1).textContent.trim(), text);
    }
    const n = countKind(c, "search");
    await c.chat.send("找张三明天下午3点开会");
    await c.chat.idle();
    assert.equal(countKind(c, "search"), n, "带时间的是新建，不是查询");
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
});

test("从“待确认会议”卡片确认的写作类待办也会触发代写提示", async () => {
  const c = await openChat();
  try {
    await c.chat.send("处理待确认会议");
    const card = await waitFor(() => lastKind(c, "meetings")?.querySelector("[data-m]"), { label: "会议卡片" });
    const box = card.querySelector('[data-i="1"]');
    assert.ok(box.closest("label").textContent.includes("负责更新报价方案"));
    box.checked = true;
    const n = countKind(c, "writeOffer");
    card.querySelector("[data-ok]").click();
    const offer = await waitFor(() => countKind(c, "writeOffer") > n && lastKind(c, "writeOffer"), { label: "代写提示" });
    assert.ok(offer.textContent.includes("负责更新报价方案") || offer.textContent.includes("方案"), offer.textContent);
    await c.chat.idle();
    const t = c.state().todos.find((x) => x.title === "负责更新报价方案");
    assert.ok(t, "已创建待办");
    assert.deepEqual(c.state().writeOffer.offered, [t.id]);
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
});
