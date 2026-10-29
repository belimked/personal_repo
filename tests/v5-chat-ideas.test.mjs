import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, waitFor } from "./helpers.mjs";

// S06：助手把没有时间的说法记成想做的事，时间段说法按截止日成为待办；对想做的事追加想法、排期、查询
const V = "v5";
const TODAY = "2026-10-29"; // 周四

async function openChat() {
  const p = await loadPage("home.html", { session: "lily@demo.com", version: V, today: TODAY });
  const { window, document } = p;
  window.PA_TYPING_MS = 5;
  const all = (sel) => [...document.querySelectorAll(sel)];
  await waitFor(() => document.querySelector('#msgs .msg[data-kind="greet"]'), { label: "问候消息" });
  await window.PA_CHAT.idle();
  return { ...p, all, chat: window.PA_CHAT, PA: window.PA };
}
const btn = (root, text) => [...root.querySelectorAll("button, a")].find((b) => b.textContent.trim() === text);
async function say(c, text) {
  const n = c.all("#msgs .msg.bot:not(.typing)").length;
  c.document.getElementById("input").value = text;
  c.document.getElementById("send").click();
  await waitFor(() => c.all("#msgs .msg.bot:not(.typing)").length > n, { label: `回复：${text}` });
  await c.chat.idle();
  return c.all("#msgs .msg.bot:not(.typing)").at(-1);
}
async function withChat(fn) {
  const c = await openChat();
  try {
    assert.deepEqual(c.errors, []);
    await fn(c, c.PA);
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
}

test("没有时间的说法记成想做的事，点“明天”生成关联待办", () =>
  withChat(async (c, PA) => {
    const ideas0 = PA.state.ideas.length, todos0 = PA.state.todos.length;
    const b = await say(c, "想研究一下保险理财");
    assert.equal(b.dataset.kind, "idea");
    assert.equal(PA.state.ideas.length, ideas0 + 1);
    assert.equal(PA.state.todos.length, todos0);
    const idea = PA.state.ideas[0];
    assert.ok(idea.title.includes("保险理财"));
    assert.ok(b.textContent.includes("想做的事"));
    assert.ok(b.textContent.includes("没排日期，不算待办"));
    for (const l of ["今天", "明天", "这周末", "下周", "选日期", "撤销"]) assert.ok(btn(b, l), l);
    assert.ok(b.querySelector(".tip")?.textContent.includes("想做的事"), "首次附 💡 提示");
    btn(b, "明天").click();
    const t = PA.state.todos.find((x) => x.ideaId === idea.id);
    assert.ok(t);
    assert.equal(t.date, "2026-10-30");
    assert.equal(PA.state.todos.length, todos0 + 1);
    const card = c.document.querySelector(`[data-mid="${c.chat.messages().at(-1).id}"]`);
    assert.ok(card.textContent.includes("已排到"));
    assert.ok(PA.ideaById(idea.id), "想做的事保留");
    assert.ok(c.state().todos.some((x) => x.ideaId === idea.id), "已保存");
  }));

test("第二次记成想做的事不再出 💡 提示；撤销后移除", () =>
  withChat(async (c, PA) => {
    await say(c, "想研究一下保险理财");
    const n = PA.state.ideas.length;
    const b = await say(c, "想学做面包");
    assert.equal(b.dataset.kind, "idea");
    assert.ok(!b.querySelector(".tip"));
    btn(b, "撤销").click();
    assert.equal(PA.state.ideas.length, n);
    assert.ok(!PA.state.ideas.some((i) => i.title.includes("面包")));
  }));

test("时间段说法直接成为待办，date 为下月最后一天，卡片写截止日", () =>
  withChat(async (c, PA) => {
    const ideas0 = PA.state.ideas.length;
    const b = await say(c, "下个月要买车险");
    const t = PA.state.todos.at(-1);
    assert.equal(t.title, "买车险");
    assert.equal(t.date, "2026-11-30");
    assert.ok(t.deadline);
    assert.equal(PA.state.ideas.length, ideas0);
    assert.ok(b.textContent.includes("已加入待办：11月30日（周一）前 · 买车险"), b.textContent);
  }));

test("“新能源车那件事，再记一下”追加到想做的事的想法记录", () =>
  withChat(async (c, PA) => {
    const n = PA.ideaById("i2").records.length;
    const b = await say(c, "新能源车那件事，再记一下：问问以旧换新");
    assert.equal(PA.ideaById("i2").records.length, n + 1);
    assert.equal(PA.ideaById("i2").records[0].text, "问问以旧换新");
    assert.ok(b.querySelector('a[href="idea.html?id=i2"]'));
    btn(b, "撤销").click();
    assert.equal(PA.ideaById("i2").records.length, n);
  }));

test("“保险那件事，排到周六上午”从想做的事生成关联待办，想做的事仍在", () =>
  withChat(async (c, PA) => {
    const n = PA.state.todos.filter((x) => x.ideaId === "i3").length;
    const b = await say(c, "保险那件事，排到周六上午");
    const list = PA.state.todos.filter((x) => x.ideaId === "i3");
    assert.equal(list.length, n + 1);
    const t = list.at(-1);
    assert.equal(t.date, "2026-10-31");
    assert.equal(t.time, "09:00");
    assert.equal(PA.ideaById("i3").status, "active");
    assert.ok(b.textContent.includes("已排到"));
    btn(b, "撤销").click();
    assert.equal(PA.state.todos.filter((x) => x.ideaId === "i3").length, n);
  }));

test("按意思查询包含想做的事，标“想做的事”并带“排个时间”", () =>
  withChat(async (c, PA) => {
    const b = await say(c, "跟保险有关的事有哪些？");
    const row = b.querySelector('[data-idea-row="i3"]');
    assert.ok(row, "结果含想做的事 i3");
    assert.ok(row.textContent.includes("想做的事"));
    const plan = btn(row, "排个时间");
    assert.ok(plan);
    plan.click();
    await waitFor(() => c.chat.messages().at(-1).kind === "idea", { label: "排期卡片" });
    await c.chat.idle();
    const card = c.all("#msgs .msg.bot:not(.typing)").at(-1);
    btn(card, "下周").click();
    assert.ok(PA.state.todos.some((x) => x.ideaId === "i3" && x.date === "2026-11-02"));
  }));

test("最近安排面板底部链到想做的事，不再出现“待安排”", () =>
  withChat(async (c, PA) => {
    c.chat.recent.open();
    const sheet = c.document.getElementById("recent-sheet");
    const foot = sheet.querySelector(".sheet-foot");
    assert.ok(foot.textContent.includes("想做的事"));
    const n = PA.state.ideas.filter((i) => i.status === "active").length;
    assert.ok(foot.textContent.includes(`想做的事 ${n} 件 · 看看 ›`));
    assert.ok(foot.querySelector('a[href="ideas.html"]'));
    assert.ok(!sheet.textContent.includes("待安排"));
    assert.ok(!c.document.getElementById("msgs").textContent.includes("待安排"));
  }));
