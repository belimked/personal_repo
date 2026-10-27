import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, waitFor } from "./helpers.mjs";

const TODAY = "2026-03-04"; // 周三
const SESSION = "lily@demo.com";

async function openChat(state) {
  const p = await loadPage("home.html", { session: SESSION, today: TODAY, state });
  const { window, document } = p;
  window.PA_TYPING_MS = 20;
  await waitFor(() => document.querySelector('#msgs .msg[data-kind="greet"]'), { label: "问候消息" });
  await window.PA_CHAT.idle();
  const all = (sel) => [...document.querySelectorAll(sel)];
  return { ...p, all, chat: window.PA_CHAT, PA: window.PA, $: (s) => document.querySelector(s) };
}
const btn = (root, text) => [...root.querySelectorAll("button, a")].find((b) => b.textContent.trim() === text);
const tips = (el) => [...el.querySelectorAll(".tip")].map((x) => x.textContent);
const lastBot = (c, kind) => c.all(`#msgs .msg.bot[data-kind="${kind}"]`).at(-1);
const openN = (c) => c.PA.state.todos.filter((t) => t.status === "open" && t.date === TODAY).length;
const overN = (c) => c.PA.state.todos.filter((t) => t.status === "open" && t.date && t.date < TODAY).length;

test("建议说法：在输入框上方，覆盖五类能力，点一下直接发送", async () => {
  const c = await openChat();
  try {
    const row = c.$(".dockrow");
    assert.ok(row && row.closest(".dock").nextElementSibling === c.$("#cbox"), "建议说法行在输入框正上方");
    assert.equal(row.firstElementChild.id, "recent-btn", "最近安排按钮在最左侧");
    assert.ok(!c.$("#says").contains(c.$("#recent-btn")), "按钮不在可滑动区域内");
    const says = c.all("#says [data-say]");
    assert.ok(says.length >= 5);
    assert.equal(c.$("#input").placeholder, "跟我说就行，比如：周五3点体检");
    assert.ok(c.$("#cbox .mic"), "语音按钮在输入框内");
    const text = says[0].dataset.say;
    const n = c.all("#msgs .msg.me").length;
    says[0].click();
    assert.equal(c.all("#msgs .msg.me").length, n + 1);
    assert.equal(c.all("#msgs .msg.me").at(-1).textContent.trim(), text);
    await c.chat.idle();
    assert.ok(lastBot(c, "todo"), "记事建议说法得到结果卡片");
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
});

test("💡 提示：第一次记事后出现，第二次不再出现；记在 state.tipsShown", async () => {
  const c = await openChat();
  try {
    await c.chat.send("周五3点体检");
    const first = lastBot(c, "todo");
    assert.equal(tips(first).length, 1);
    assert.ok(tips(first)[0].includes("💡") && tips(first)[0].includes("改到下午4点"));
    await c.chat.send("下周三交月报");
    assert.notEqual(lastBot(c, "todo"), first);
    assert.equal(tips(lastBot(c, "todo")).length, 0);
    assert.ok(c.state().tipsShown.includes("add"));
    assert.equal(tips(first).length, 1, "第一条的提示保留");
  } finally {
    c.close();
  }
});

test("💡 提示：查文件、按意思查待办、批量推迟各一次", async () => {
  const c = await openChat();
  try {
    await c.chat.send("租房合同什么时候到期？");
    assert.ok(tips(lastBot(c, "search")).some((t) => t.includes("按意思找")));
    await c.chat.send("跟保险有关的事有哪些？");
    const s2 = lastBot(c, "search");
    assert.ok(tips(s2).some((t) => t.includes("把重疾险排到周六上午")));
    assert.ok(!tips(s2).some((t) => t.includes("按意思找")), "查文件提示只出现一次");
    await c.chat.send("除了周会，明天的都推迟一天");
    const p = lastBot(c, "postpone");
    assert.equal(tips(p).length, 0, "确认前不提示");
    btn(p, "推迟 2 项").click();
    assert.ok(tips(lastBot(c, "postpone")).some((t) => t.includes("除了周会，明天的都推迟")));
    await c.chat.send("把明天的事都推迟一天");
    btn(lastBot(c, "postpone"), "推迟 1 项").click();
    assert.equal(tips(lastBot(c, "postpone")).length, 0);
    for (const k of ["kb", "search-todo", "postpone"]) assert.ok(c.state().tipsShown.includes(k), k);
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
});

test("最近安排按钮：N = 今天未完成件数，逾期红色角标 = 逾期件数", async () => {
  const c = await openChat();
  try {
    const b = c.$("#recent-btn");
    assert.match(b.textContent, /📅 最近安排/);
    assert.equal(b.querySelector("[data-recent-n]").textContent, String(openN(c)));
    assert.equal(openN(c), 3);
    const o = b.querySelector("[data-recent-over]");
    assert.ok(!o.classList.contains("hidden"));
    assert.equal(o.textContent, String(overN(c)));
    assert.equal(overN(c), 1);
    await c.chat.send("季度报告已经提交了，标记完成");
    assert.equal(b.querySelector("[data-recent-n]").textContent, "2");
  } finally {
    c.close();
  }
  const p = await loadPage("home.html", { session: SESSION, today: TODAY });
  const state = p.state();
  p.close();
  state.todos.find((t) => t.id === "t5").status = "done";
  const d = await openChat(state);
  try {
    assert.ok(d.$("#recent-btn [data-recent-over]").classList.contains("hidden"), "无逾期时不显示角标");
  } finally {
    d.close();
  }
});

test("面板：分组列出、可打勾完成并刷新数字，不进聊天记录", async () => {
  const c = await openChat();
  try {
    const msgN = c.chat.messages().length, domN = c.all("#msgs .msg").length;
    c.$("#recent-btn").click();
    const sheet = c.$("#recent-sheet");
    assert.ok(!sheet.classList.contains("hidden"));
    const heads = [...sheet.querySelectorAll("h4")].map((h) => h.textContent);
    assert.ok(heads[0].startsWith("已逾期 1 项"));
    assert.ok(heads[1].startsWith("今天") && heads[2].startsWith("明天") && heads[3].startsWith("后天"));
    assert.ok(heads.includes("期限快到"));
    assert.ok(sheet.textContent.includes("更新简历") && sheet.textContent.includes("还剩"), "期限最后 7 天的待安排事项");
    assert.ok(!sheet.textContent.includes("买车险"), "期限还远的不列出");
    assert.ok(btn(sheet, "去待办页 ›"));
    assert.match(sheet.querySelector(".sheet-foot").textContent, /待安排 \d+ 件/);
    assert.ok(sheet.querySelector('a[href="profile.html#reminder"]'), "邮件提醒设置入口");
    assert.equal(c.chat.messages().length, msgN);
    assert.equal(c.state().chat[TODAY].length, msgN);
    assert.equal(c.all("#msgs .msg").length, domN);

    sheet.querySelector('[data-tick="t14"]').click();
    assert.equal(c.PA.todoById("t14").status, "done");
    assert.ok(!sheet.classList.contains("hidden"), "打勾不关闭面板");
    await waitFor(() => c.$("#recent-btn [data-recent-n]").textContent === "2", { label: "按钮数字刷新" });
    await waitFor(() => !sheet.querySelector('[data-tick="t14"]'), { label: "完成的事移出面板" });
    sheet.querySelector('[data-tick="t5"]').click();
    await waitFor(() => c.$("#recent-btn [data-recent-over]").classList.contains("hidden"), { label: "逾期角标消失" });
    assert.equal(c.chat.messages().length, msgN, "面板操作不进聊天记录");
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
});

test("面板三种关闭方式：×、面板外、再点按钮", async () => {
  const c = await openChat();
  try {
    const b = c.$("#recent-btn"), sheet = c.$("#recent-sheet");
    const isOpen = () => !sheet.classList.contains("hidden");
    b.click(); assert.ok(isOpen());
    sheet.querySelector("[data-sheet-x]").click(); assert.ok(!isOpen(), "点 × 关闭");
    b.click(); assert.ok(isOpen());
    sheet.querySelector("h4").click(); assert.ok(isOpen(), "点面板内部不关闭");
    c.$("#msgs").click(); assert.ok(!isOpen(), "点面板外关闭");
    b.click(); assert.ok(isOpen());
    b.click(); assert.ok(!isOpen(), "再点按钮关闭");
  } finally {
    c.close();
  }
});

test("页面不再有 v3 的“近 3 天”区域", async () => {
  const c = await openChat();
  try {
    assert.equal(c.$("#near"), null);
    assert.ok(!c.document.body.textContent.includes("近 3 天"));
  } finally {
    c.close();
  }
});
