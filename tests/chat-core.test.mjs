import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, waitFor } from "./helpers.mjs";

const TODAY = "2026-03-04"; // 周三
const SESSION = "lily@demo.com";

async function openChat(state) {
  const p = await loadPage("home.html", { session: SESSION, today: TODAY, state });
  const { window, document } = p;
  window.PA_TYPING_MS = 20;
  const kindEl = (kind) => document.querySelector(`#msgs .msg[data-kind="${kind}"]`);
  const all = (sel) => [...document.querySelectorAll(sel)];
  await waitFor(() => kindEl("greet"), { label: "问候消息" });
  await window.PA_CHAT.idle();
  return { ...p, kindEl, all, chat: window.PA_CHAT, PA: window.PA };
}
const btn = (root, text) => [...root.querySelectorAll("button, a")].find((b) => b.textContent.trim() === text);
async function say(c, text) {
  const n = c.all("#msgs .msg.bot:not(.typing)").length;
  c.document.getElementById("input").value = text;
  c.document.getElementById("send").click();
  await waitFor(() => c.all("#msgs .msg.bot:not(.typing)").length > n, { label: `回复：${text}` });
  return c.all("#msgs .msg.bot:not(.typing)").at(-1);
}

test("打开页面：助手先开口，问候并带今天待办卡片（可打勾）", async () => {
  const c = await openChat();
  try {
    assert.deepEqual(c.errors, []);
    const g = c.kindEl("greet");
    assert.match(g.textContent, /(早上好|中午好|下午好|晚上好|夜深了)/);
    assert.match(g.textContent, /今天有 3 件事/);
    for (const t of ["联系平安的客户经理", "银行办理转账", "提交季度报告给王经理"]) assert.ok(g.textContent.includes(t), t);
    assert.equal(g.querySelectorAll("[data-tick]").length, 3);
    assert.equal(c.document.querySelector("[data-bot-name]").textContent, "小禾");
    assert.ok(c.document.body.textContent.includes("你的私人助手 · 帮你记事、找文件"));
    assert.ok(!c.document.getElementById("near") && !c.document.getElementById("stats"), "不再有近 3 天区域和摘要");
    // 打勾完成
    g.querySelector('[data-tick="t14"]').click();
    assert.equal(c.PA.todoById("t14").status, "done");
    await waitFor(() => c.kindEl("greet").querySelector('.crow.done [data-tick="t14"]'), { label: "勾选后行变为已完成" });
  } finally {
    c.close();
  }
});

test("消息结构统一，写入 state.chat[今天]", async () => {
  const c = await openChat();
  try {
    const list = c.chat.messages();
    assert.ok(list.length >= 2);
    for (const m of list) {
      assert.deepEqual(Object.keys(m).sort(), ["data", "id", "kind", "role", "text", "ts"]);
      assert.ok(["bot", "user"].includes(m.role));
    }
    assert.deepEqual(c.state().chat[TODAY].map((m) => m.kind), [...list].map((m) => m.kind));
  } finally {
    c.close();
  }
});

test("逾期单独一条消息，带三个按钮；改到今天后日期变为今天，可撤销", async () => {
  const c = await openChat();
  try {
    const o = c.kindEl("overdue");
    assert.ok(o, "应有逾期消息");
    assert.ok(o.textContent.includes("续交物业费"));
    for (const l of ["改到今天", "改到明天", "已经交了"]) assert.ok(btn(o, l), l);
    btn(o, "改到今天").click();
    assert.equal(c.PA.todoById("t5").date, TODAY);
    assert.equal(c.state().todos.find((t) => t.id === "t5").date, TODAY);
    assert.ok(c.all("#msgs .msg.me").at(-1).textContent.includes("改到今天"));
    await waitFor(() => c.all('#msgs .msg[data-kind="result"]').length, { label: "结果卡片" });
    const r = c.all('#msgs .msg[data-kind="result"]').at(-1);
    btn(r, "撤销").click();
    assert.equal(c.PA.todoById("t5").date, "2026-03-03");
  } finally {
    c.close();
  }
});

test("没有逾期时不发逾期消息", async () => {
  const p = await loadPage("home.html", { session: SESSION, today: TODAY });
  const state = p.state();
  p.close();
  state.todos.find((t) => t.id === "t5").status = "done";
  state.chat = {};
  const c = await openChat(state);
  try {
    assert.equal(c.kindEl("overdue"), null);
  } finally {
    c.close();
  }
});

test("“周五3点体检”：先显示正在输入，再出现用户气泡和带撤销的结果卡片；撤销后移除", async () => {
  const c = await openChat();
  try {
    const before = c.state().todos.length;
    c.document.getElementById("input").value = "周五3点体检";
    c.document.getElementById("send").click();
    assert.ok(c.document.querySelector("#msgs .msg.typing"), "应显示正在输入");
    assert.ok(c.document.querySelector("#msgs .msg.typing").textContent.includes("正在输入"));
    assert.equal(c.state().todos.length, before, "正在输入时还未执行");
    const card = await waitFor(() => c.kindEl("todo"), { label: "结果卡片" });
    assert.equal(c.document.querySelector("#msgs .msg.typing"), null);
    const me = c.all("#msgs .msg.me").at(-1);
    assert.equal(me.textContent.trim(), "周五3点体检");
    assert.ok(btn(card, "撤销") && btn(card, "修改"));
    const todos = c.state().todos;
    assert.equal(todos.length, before + 1);
    const t = todos.at(-1);
    assert.ok(t.title.includes("体检"), t.title);
    assert.equal(t.date, "2026-03-06");
    assert.ok(t.time, "带时间点");
    assert.ok(card.textContent.includes("3月6日"));
    btn(card, "撤销").click();
    assert.ok(!c.state().todos.some((x) => x.id === t.id), "撤销后待办被移除");
    assert.ok(c.kindEl("todo").textContent.includes("已撤销"));
  } finally {
    c.close();
  }
});

test("PA_CHAT.send 可直接调用；修改按钮打开内联编辑", async () => {
  const c = await openChat();
  try {
    await c.chat.send("下周三交月报");
    const card = c.kindEl("todo");
    assert.ok(card.textContent.includes("交月报"));
    btn(card, "修改").click();
    assert.ok(card.querySelector('[data-k="title"]'));
    const user = c.chat.messages().filter((m) => m.role === "user").at(-1);
    assert.equal(user.text, "下周三交月报");
  } finally {
    c.close();
  }
});

test("“今天的事儿，我都完成了”出现批量完成确认卡片，确认后可一次撤销", async () => {
  const c = await openChat();
  try {
    const b = await say(c, "今天的事儿，我都完成了");
    assert.equal(b.dataset.kind, "batch");
    assert.equal(b.querySelectorAll(".result-card > label input[data-id]:checked").length, 3);
    const ok = btn(b, "完成 3 项");
    assert.ok(ok, "应有“完成 3 项”按钮");
    assert.ok(b.querySelector("details.bt-fold"), "逾期折叠列出");
    assert.ok(!b.querySelector("details.bt-fold input:checked"), "逾期默认不勾选");
    ok.click();
    for (const id of ["t1", "t14", "t20"]) assert.equal(c.PA.todoById(id).status, "done");
    btn(c.kindEl("batch"), "撤销").click();
    for (const id of ["t1", "t14", "t20"]) assert.equal(c.PA.todoById(id).status, "open");
  } finally {
    c.close();
  }
});

test("“除了银行的事儿”排除并写明原因；排除词没匹配时全部不勾选", async () => {
  const c = await openChat();
  try {
    let b = await say(c, "今天除了银行的事儿，都搞完了");
    assert.ok(b.querySelector(".bt-row.excl").textContent.includes("银行办理转账"));
    assert.ok(b.textContent.includes("已排除"));
    assert.ok(btn(b, "完成 2 项"));
    b = await say(c, "今天除了洗车的事儿，都搞完了");
    assert.ok(b.textContent.includes("没有找到和“洗车”相关的待办"));
    assert.equal(b.querySelectorAll("input[data-id]:checked").length, 0);
  } finally {
    c.close();
  }
});

test("批量推迟：“除了周会，明天的都推迟”", async () => {
  const c = await openChat();
  try {
    const b = await say(c, "除了周会，明天的都推迟一天");
    assert.equal(b.dataset.kind, "postpone");
    const ok = btn(b, "推迟 2 项");
    assert.ok(ok);
    ok.click();
    assert.equal(c.PA.todoById("t2").date, "2026-03-06");
    assert.equal(c.PA.todoById("t11").date, "2026-03-06");
    assert.equal(c.PA.todoById("t10").date, "2026-03-05");
    btn(c.kindEl("postpone"), "撤销").click();
    assert.equal(c.PA.todoById("t2").date, "2026-03-05");
  } finally {
    c.close();
  }
});

test("单条完成、删除、追加想法、按意思查文件与待办", async () => {
  const c = await openChat();
  try {
    let b = await say(c, "季度报告已经提交了，标记完成");
    assert.equal(c.PA.todoById("t1").status, "done");
    assert.ok(btn(b, "撤销"));
    b = await say(c, "给妈妈买生日礼物不用做了");
    assert.equal(c.PA.todoById("t4").status, "deleted");
    b = await say(c, "购车补贴那件事，再记一下：比亚迪落地价 15.8 万");
    assert.equal(c.PA.todoById("t16").records[0].text, "比亚迪落地价 15.8 万");
    btn(b, "撤销").click();
    assert.notEqual(c.PA.todoById("t16").records[0].text, "比亚迪落地价 15.8 万");
    b = await say(c, "租房合同什么时候到期？");
    assert.equal(b.dataset.kind, "search");
    assert.ok(b.querySelector(".hit"), "应找到文件");
    b = await say(c, "跟保险有关的事有哪些？");
    assert.ok(b.textContent.includes("买车险"), "按意思查到待办");
    b = await say(c, "下个月要买车险了");
    assert.ok(b.textContent.includes("待安排"));
    assert.ok(b.textContent.includes("几号到期"), "可追问");
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
});

test("文字 + 附件：创建待办并关联附件；只发文件时问要不要建待办", async () => {
  const c = await openChat();
  try {
    const f = new c.window.File(["合同内容"], "装修合同.txt", { type: "text/plain" });
    await c.chat.send("下周三前看完这份合同", [f]);
    const card = c.kindEl("todo");
    assert.ok(card.textContent.includes("装修合同.txt"));
    assert.deepEqual([...c.chat.messages().filter((m) => m.role === "user").at(-1).data.files], ["装修合同.txt"]);
    const g = new c.window.File(["x"], "发票.pdf", { type: "application/pdf" });
    await c.chat.send("", [g]);
    const fm = c.all('#msgs .msg[data-kind="files"]').at(-1);
    assert.ok(btn(fm, "建待办"));
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
});
