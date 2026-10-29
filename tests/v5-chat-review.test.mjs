import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, waitFor } from "./helpers.mjs";

// S07：逾期“先不做了”、关联待办都完成后问“算做成了吗”、会议确认每条带日期、每周 / 每月回顾
const V = "v5";
const TODAY = "2026-10-29"; // 周四
const MONDAY = "2026-11-02";

async function openChat({ today = TODAY, url, state } = {}) {
  const p = await loadPage("home.html", { session: "lily@demo.com", version: V, today, url, state });
  const { window, document } = p;
  window.PA_TYPING_MS = 5;
  const all = (sel) => [...document.querySelectorAll(sel)];
  await waitFor(() => document.querySelector('#msgs .msg[data-kind="greet"]'), { label: "问候消息" });
  await window.PA_CHAT.idle();
  return { ...p, all, chat: window.PA_CHAT, PA: window.PA };
}
const btn = (root, text) => [...root.querySelectorAll("button, a, .chip")].find((b) => b.textContent.trim() === text);
// 取初始演示数据，去掉对话记录，保证打开助手页时是当天第一次完整问候
const fresh = (p) => { const s = p.state(); p.close(); delete s.chat; delete s.greetedOn; delete s.greetSnapshot; delete s.reviewShown; return s; };
const lastOf = (c, kind) => c.all(`#msgs .msg[data-kind="${kind}"]`).at(-1);
async function withChat(opts, fn) {
  const c = await openChat(opts);
  try {
    assert.deepEqual(c.errors, []);
    await fn(c, c.PA);
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
}

test("逾期消息含“先不做了”，点后待办转成想做的事；撤销恢复", () =>
  withChat({}, async (c, PA) => {
    const od = lastOf(c, "overdue");
    assert.ok(od, "有逾期消息");
    const row = [...od.querySelectorAll("[data-todo-row]")].find((r) => r.textContent.includes("续交物业费"));
    const b = btn(row, "先不做了");
    assert.ok(b, "逾期行有“先不做了”");
    const ideas0 = PA.state.ideas.length;
    b.click();
    await waitFor(() => lastOf(c, "result"), { label: "处理结果" });
    await c.chat.idle();
    assert.ok(!PA.todoById("t5"), "待办已不在");
    assert.equal(PA.state.ideas.length, ideas0 + 1);
    assert.equal(PA.state.ideas[0].title, "续交物业费");
    assert.ok(lastOf(c, "overdue").textContent.includes("续交物业费"), "逾期消息仍显示该行");
    assert.ok(lastOf(c, "result").textContent.includes("想做的事"));
    btn(lastOf(c, "result"), "撤销").click();
    assert.ok(PA.todoById("t5"), "撤销后待办回来");
    assert.equal(PA.state.ideas.length, ideas0);
  }));

test("有来源的逾期待办“先不做了”只删除待办，想做的事还在", async () => {
  const p0 = await loadPage("home.html", { session: "lily@demo.com", version: V, today: TODAY });
  const st = fresh(p0);
  st.todos.find((t) => t.id === "t5").ideaId = "i1";
  await withChat({ state: st }, async (c, PA) => {
    const ideas0 = PA.state.ideas.length;
    btn(lastOf(c, "overdue"), "先不做了").click();
    await c.chat.idle();
    assert.equal(PA.todoById("t5").status, "deleted");
    assert.equal(PA.state.ideas.length, ideas0);
    assert.ok(PA.ideaById("i1"));
  });
});

test("最后一条关联待办在助手页打勾后问“算做成了吗”，点“做成了”标为 done；只问一次", () =>
  withChat({}, async (c, PA) => {
    const greet = lastOf(c, "greet");
    const tick = greet.querySelector('[data-tick="t20"]');
    assert.ok(tick, "问候里有“联系平安的客户经理”");
    tick.click();
    const q = await waitFor(() => lastOf(c, "ideaDone"), { label: "算做成了吗" });
    await c.chat.idle();
    assert.ok(q.textContent.includes("『研究一下保险』排的事都做完了，这件事算做成了吗？"), q.textContent);
    assert.deepEqual([...PA.ideaById("i3").askedDone], ["t20"]);
    btn(lastOf(c, "ideaDone"), "做成了").click();
    await c.chat.idle();
    assert.equal(PA.ideaById("i3").status, "done");
    assert.equal(c.state().ideas.find((i) => i.id === "i3").status, "done");
    PA.todosChanged();
    await c.chat.idle();
    assert.equal(c.all('#msgs .msg[data-kind="ideaDone"]').length, 1, "同一批待办不再发问");
  }));

test("选“还没”后同一批待办不再问；重新打开助手页也不问", async () => {
  let saved;
  await withChat({}, async (c, PA) => {
    lastOf(c, "greet").querySelector('[data-tick="t20"]').click();
    await waitFor(() => lastOf(c, "ideaDone"), { label: "算做成了吗" });
    await c.chat.idle();
    btn(lastOf(c, "ideaDone"), "还没").click();
    await c.chat.idle();
    assert.equal(PA.ideaById("i3").status, "active");
    saved = c.state();
  });
  await withChat({ state: saved }, async (c) => {
    assert.equal(c.chat.messages().filter((m) => m.kind === "ideaDone").length, 1);
  });
});

test("会议确认：只勾一条无日期条目，提示“先放进想做的事”，点后 ideas 增加一条（来源注明会议名）", () =>
  withChat({}, async (c, PA) => {
    btn(lastOf(c, "meetingNote"), "一起过一下").click();
    await waitFor(() => lastOf(c, "meetingReview"), { label: "会议逐条" });
    await c.chat.idle();
    let r = lastOf(c, "meetingReview");
    assert.ok(btn(r, "选日期"), "无日期条目显示“选日期”");
    const boxes = r.querySelectorAll("[data-i]");
    boxes.forEach((x) => { x.checked = x.dataset.i === "0"; x.dispatchEvent(new c.window.Event("change")); });
    const ideas0 = PA.state.ideas.length, todos0 = PA.state.todos.length;
    r.querySelector('[data-mr="ok"]').click();
    r = lastOf(c, "meetingReview");
    assert.ok(r.textContent.includes("有 1 条没定日期，先放进想做的事？"), r.textContent);
    assert.ok(btn(r, "回去选日期"));
    btn(r, "放进想做的事").click();
    assert.equal(PA.state.ideas.length, ideas0 + 1);
    const i = PA.state.ideas[0];
    assert.equal(i.title, "整理移动端审批需求说明，周五前发给客户");
    assert.ok(i.sourceNote.includes("客户需求沟通"), i.sourceNote);
    assert.equal(PA.state.todos.length, todos0 + 1, "只多一条已完成的会议记录");
    assert.ok(!PA.state.todos.some((t) => t.status === "open" && !t.date), "没有无日期待办");
    assert.equal(PA.state.inbox.length, 0);
  }));

test("会议确认：条目用日期快捷选项选日期后变成带日期的待办", () =>
  withChat({}, async (c, PA) => {
    btn(lastOf(c, "meetingNote"), "一起过一下").click();
    await waitFor(() => lastOf(c, "meetingReview"), { label: "会议逐条" });
    await c.chat.idle();
    let r = lastOf(c, "meetingReview");
    r.querySelectorAll("[data-i]").forEach((x) => { x.checked = x.dataset.i === "4"; x.dispatchEvent(new c.window.Event("change")); });
    r.querySelector('[data-line="4"] [data-due]').click();
    r = lastOf(c, "meetingReview");
    const chip = r.querySelector('[data-line="4"] [data-dd="2026-10-30"]');
    assert.ok(chip, "展开日期快捷选项");
    chip.click();
    r = lastOf(c, "meetingReview");
    assert.ok(r.querySelector('[data-line="4"]').textContent.includes("10月30日"));
    r.querySelector('[data-mr="ok"]').click();
    const t = PA.state.todos.find((x) => x.title === "编写一份新的移动审批项目介绍");
    assert.ok(t);
    assert.equal(t.date, "2026-10-30");
    assert.equal(t.status, "open");
    assert.ok(lastOf(c, "meetingReview").textContent.includes("已处理 1 个会议"));
  }));

test("会议条目有 due 时直接显示日期，确认后成为该日期的待办", async () => {
  const p0 = await loadPage("home.html", { session: "lily@demo.com", version: V, today: TODAY });
  const st = fresh(p0);
  st.inbox[0].items[0].due = "2026-10-30";
  await withChat({ state: st }, async (c, PA) => {
    btn(lastOf(c, "meetingNote"), "一起过一下").click();
    await waitFor(() => lastOf(c, "meetingReview"), { label: "会议逐条" });
    await c.chat.idle();
    const r = lastOf(c, "meetingReview");
    assert.ok(r.querySelector('[data-line="0"]').textContent.includes("10月30日"));
    r.querySelectorAll("[data-i]").forEach((x) => { x.checked = x.dataset.i === "0"; x.dispatchEvent(new c.window.Event("change")); });
    r.querySelector('[data-mr="ok"]').click();
    assert.ok(!lastOf(c, "meetingReview").textContent.includes("没定日期"));
    assert.equal(PA.state.todos.find((x) => x.title.startsWith("整理移动端审批")).date, "2026-10-30");
  });
});

test("?review=week 出现每周回顾，列前 5 件且不含灵光一现，带“排个时间”", () =>
  withChat({ url: "home.html?review=week" }, async (c, PA) => {
    const m = await waitFor(() => lastOf(c, "reviewWeek"), { label: "每周回顾" });
    const n = PA.state.ideas.filter((i) => i.status === "active" && !PA.isSpark(i)).length;
    assert.ok(m.textContent.includes(`你有 ${n} 件想做的事，有要排进这周的吗？`), m.textContent);
    const rows = m.querySelectorAll("[data-idea-row]");
    assert.ok(rows.length > 0 && rows.length <= 5);
    assert.ok(!m.textContent.includes("周报可以加个图表") && !m.textContent.includes("记家里开销的小程序"), "不含灵光一现");
    assert.equal(m.querySelectorAll("[data-plan]").length, rows.length);
    const greetIdx = c.all("#msgs .msg").indexOf(lastOf(c, "greet"));
    assert.ok(c.all("#msgs .msg").indexOf(m) > greetIdx, "在问候之后");
    btn(m, "排个时间").click();
    await c.chat.idle();
    assert.equal(lastOf(c, "idea").dataset.kind, "idea");
  }));

test("?review=month 出现灵光一现回顾和 90 天询问；“放下了”把想做的事标为 dropped", () =>
  withChat({ url: "home.html?review=month" }, async (c, PA) => {
    const m = await waitFor(() => lastOf(c, "reviewMonth"), { label: "每月回顾" });
    assert.ok(/记了 2 个灵光一现，翻翻看？/.test(m.textContent), m.textContent);
    assert.ok(btn(m, "去看看"));
    assert.ok(m.textContent.includes("还留着吗？"));
    assert.ok(m.textContent.includes("想学游泳"));
    assert.ok(btn(m, "留着") && btn(m, "放下了"));
    btn(m, "放下了").click();
    assert.equal(PA.ideaById("i4").status, "dropped");
    assert.ok(lastOf(c, "reviewMonth").textContent.includes("已放下"));
  }));

test("周一第一次打开有每周回顾，同一周再打开不重复；非周一不发", async () => {
  let saved;
  await withChat({ today: MONDAY }, async (c) => {
    await waitFor(() => lastOf(c, "reviewWeek"), { label: "每周回顾" });
    assert.ok(!lastOf(c, "reviewMonth"));
    saved = c.state();
    assert.equal(saved.reviewShown.week, MONDAY);
  });
  await withChat({ today: MONDAY, state: saved }, async (c) => {
    assert.equal(c.chat.messages().filter((m) => m.kind === "reviewWeek").length, 1);
  });
  await withChat({}, async (c) => {
    assert.ok(!lastOf(c, "reviewWeek") && !lastOf(c, "reviewMonth"));
  });
});

test("每月 1 日第一次打开出现灵光一现回顾（统计上个月）", () =>
  withChat({ today: "2026-12-01" }, async (c) => {
    const m = await waitFor(() => lastOf(c, "reviewMonth"), { label: "每月回顾" });
    assert.ok(m.textContent.includes("上个月记了"), m.textContent);
    assert.equal(c.state().reviewShown.month, "2026-12");
  }));

test("todo.html 会议行动项没有 due：先选日期或放进想做的事，不生成无日期待办", async () => {
  const p = await loadPage("todo.html?id=t3", { session: "lily@demo.com", version: V, today: TODAY });
  try {
    const { document: doc, window } = p, PA = window.PA;
    const todos0 = PA.state.todos.length, ideas0 = PA.state.ideas.length;
    doc.querySelector('[data-conv="1"]').click();
    let modal = doc.querySelector(".modal-mask");
    assert.ok(modal, "弹出选日期");
    assert.ok(modal.textContent.includes("没提到日期"));
    btn(modal, "放进想做的事").click();
    assert.equal(PA.state.todos.length, todos0, "不生成待办");
    assert.equal(PA.state.ideas.length, ideas0 + 1);
    assert.equal(PA.state.ideas[0].title, "负责报价方案，周五前出");
    assert.ok(PA.state.ideas[0].sourceNote.includes("产品评审会议"));
    assert.ok(doc.body.textContent.includes("已放进想做的事"));

    doc.querySelector('[data-conv="2"]').click();
    modal = doc.querySelector(".modal-mask");
    modal.querySelector('[data-cd="2026-10-30"]').click();
    assert.ok(!doc.querySelector(".modal-mask"), "选完关闭");
    const t = PA.state.todos.at(-1);
    assert.equal(t.title, "安排技术评估");
    assert.equal(t.date, "2026-10-30");
    assert.ok(!PA.state.todos.some((x) => x.status === "open" && !x.date));
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("todo.html 会议行动项有 due 时直接转为该日期的待办", async () => {
  const p0 = await loadPage("home.html", { session: "lily@demo.com", version: V, today: TODAY });
  const st = fresh(p0);
  st.todos.find((t) => t.id === "t3").actionItems[3].due = "2026-11-03";
  const p = await loadPage("todo.html?id=t3", { session: "lily@demo.com", version: V, today: TODAY, state: st });
  try {
    const { document: doc, window } = p;
    doc.querySelector('[data-conv="3"]').click();
    assert.ok(!doc.querySelector(".modal-mask"));
    const t = window.PA.state.todos.at(-1);
    assert.equal(t.title, "下周二前确认上线时间");
    assert.equal(t.date, "2026-11-03");
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});
