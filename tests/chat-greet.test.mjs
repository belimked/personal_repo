import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, waitFor, sleep } from "./helpers.mjs";

const TODAY = "2026-03-04";
const SESSION = "lily@demo.com";

async function openChat(state, today = TODAY) {
  const p = await loadPage("home.html", { session: SESSION, today, state });
  const { window, document } = p;
  window.PA_TYPING_MS = 10;
  await waitFor(() => document.querySelector('#msgs .msg[data-kind="greet"]'), { label: "问候消息" });
  await window.PA_CHAT.idle();
  const all = (sel) => [...document.querySelectorAll(sel)];
  return { ...p, all, chat: window.PA_CHAT, PA: window.PA, kinds: (k) => all(`#msgs .msg[data-kind="${k}"]`) };
}
const btn = (root, text) => [...root.querySelectorAll("button, a")].find((b) => b.textContent.trim() === text);
const openCount = (c) => c.state().todos.filter((t) => t.status === "open").length;
async function stateAfterFirstOpen() {
  const c = await openChat();
  const s = c.state();
  c.close();
  return s;
}

test("有未处理会议时助手主动发消息；勾选 2 条确认后待办数 +2，会议已处理；可听原话", async () => {
  const c = await openChat();
  try {
    assert.deepEqual(c.errors, []);
    const note = await waitFor(() => c.kinds("meetingNote")[0], { label: "会议消息" });
    assert.match(note.textContent, /整理出 4 条待办，有 1 条是分给你的/);
    assert.ok(btn(note, "晚点再说"));
    btn(note, "一起过一下").click();
    const review = await waitFor(() => c.kinds("meetingReview")[0], { label: "逐条确认" });
    assert.equal(c.all("#msgs .msg.me").at(-1).textContent.trim(), "一起过一下");
    btn(review, "听原话").click();
    const r = c.kinds("meetingReview")[0];
    assert.ok(r.querySelector(".mt-quote").textContent.includes("00:12:40"), "显示时间点");
    assert.ok(r.querySelector(".mt-quote").textContent.includes("周五之前发给客户"), "显示原文片段");
    const boxes = r.querySelectorAll("input[data-i]");
    assert.equal([...boxes].filter((x) => x.checked).length, 1, "默认勾选分给我的");
    boxes[2].checked = true;
    boxes[2].dispatchEvent(new c.window.Event("change"));
    const before = openCount(c);
    btn(r, "加入待办（2 条）").click();
    assert.equal(openCount(c), before + 2);
    assert.ok(!c.state().inbox.some((m) => m.id === "m1"), "会议标记为已处理");
    assert.ok(c.kinds("meetingReview")[0].textContent.includes("加入 2 条待办"));
    assert.ok(c.kinds("meetingNote")[0].textContent.includes("已选择：一起过一下"));
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
});

test("“晚点再说”：稍后再提醒一次，之后不再提醒", async () => {
  const c = await openChat();
  try {
    c.window.PA_REMIND_MS = 30;
    const note = await waitFor(() => c.kinds("meetingNote")[0], { label: "会议消息" });
    btn(note, "晚点再说").click();
    assert.equal(c.state().inbox.find((m) => m.id === "m1").remindLater, "waiting");
    const again = await waitFor(() => c.kinds("meetingNote")[1], { label: "再次提醒" });
    assert.ok(again.textContent.includes("提醒你一下"));
    assert.equal(c.state().inbox.find((m) => m.id === "m1").remindLater, "done");
    await sleep(80);
    assert.equal(c.kinds("meetingNote").length, 2);
    const s = c.state();
    c.close();
    const d = await openChat(s);
    try {
      assert.equal(d.state().chat[TODAY].filter((m) => m.kind === "meetingNote").length, 2, "重新打开不再提醒");
    } finally {
      d.close();
    }
  } finally {
    c.close();
  }
});

test("“晚点再说”后关掉页面，下次打开再提醒一次", async () => {
  const c = await openChat();
  const note = await waitFor(() => c.kinds("meetingNote")[0], { label: "会议消息" });
  btn(note, "晚点再说").click();
  await c.chat.idle();
  const s = c.state();
  c.close();
  const d = await openChat(s);
  try {
    await waitFor(() => d.kinds("meetingNote").length === 2, { label: "下次打开再提醒" });
    assert.ok(d.kinds("meetingNote")[1].textContent.includes("提醒你一下"));
    assert.equal(d.kinds("greet").length, 1, "不再完整问候");
  } finally {
    d.close();
  }
});

test("同一天第二次加载不再完整问候；没有变化不说话，有新增只说新增", async () => {
  const s = await stateAfterFirstOpen();
  assert.equal(s.greetedOn, TODAY);
  const n = s.chat[TODAY].length;
  let c = await openChat(s);
  let s2;
  try {
    assert.equal(c.state().chat[TODAY].filter((m) => m.kind === "greet").length, 1);
    assert.equal(c.state().chat[TODAY].length, n, "没有变化不发消息");
    assert.equal(c.kinds("greet").length, 1, "今天的记录照常显示");
    s2 = c.state();
  } finally {
    c.close();
  }
  s2.todos.push({ ...s2.todos.find((t) => t.id === "t14"), id: "tx", title: "取快递", time: "18:00" });
  c = await openChat(s2);
  try {
    const d = await waitFor(() => c.kinds("greetDelta")[0], { label: "变化消息" });
    assert.match(d.textContent, /今天又多了 1 件事/);
    assert.ok(d.textContent.includes("取快递"));
    assert.ok(!d.textContent.includes("银行办理转账"), "只说新增项");
    assert.equal(c.state().chat[TODAY].filter((m) => m.kind === "greet").length, 1);
  } finally {
    c.close();
  }
});

test("对话按天保存：超过 30 天的清理，默认只显示今天，可加载更早的", async () => {
  const s = await stateAfterFirstOpen();
  const old = (d, text) => [{ id: "old-" + d, role: "user", kind: "text", text, data: {}, ts: d + " 09:00" }];
  s.chat["2026-02-01"] = old("2026-02-01", "三十一天前的话");
  s.chat["2026-02-03"] = old("2026-02-03", "二十九天前的话");
  const c = await openChat(s);
  try {
    assert.ok(!c.state().chat["2026-02-01"], "31 天前的记录被清理");
    assert.ok(c.state().chat["2026-02-03"], "29 天前的记录保留");
    assert.ok(!c.document.getElementById("msgs").textContent.includes("二十九天前的话"), "默认只显示今天");
    btn(c.document, "查看更早的对话").click();
    const msgs = c.document.getElementById("msgs");
    assert.ok(msgs.textContent.includes("二十九天前的话"));
    assert.ok(msgs.querySelector(".chat-day").compareDocumentPosition(c.kinds("greet")[0]) & c.window.Node.DOCUMENT_POSITION_FOLLOWING, "更早的对话在上面");
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
});

test("问候带节日开场（农历演示日期 / 公历）；数字与程序数据不一致时退回模板", async () => {
  let c = await openChat(undefined, "2026-06-19");
  try {
    const g = c.kinds("greet")[0];
    assert.ok(g.textContent.includes("端午"), g.textContent);
    assert.equal(c.state().chat["2026-06-19"].find((m) => m.kind === "greet").data.holiday, "端午节");
    assert.match(g.textContent, /今天有 3 件事/);
  } finally {
    c.close();
  }
  c = await openChat(undefined, "2026-10-01");
  try {
    assert.ok(c.kinds("greet")[0].textContent.includes("国庆"));
    // 模拟模型改错数字：退回模板
    c.window.PA_GREET_REWRITE = ({ template }) => "国庆快乐！" + template.replace("3 件事", "5 件事");
    c.PA.state.chat = {};
    c.PA.state.greetedOn = "";
    c.document.getElementById("msgs").innerHTML = "";
    c.chat.opening();
    await c.chat.idle();
    const g = c.kinds("greet")[0];
    assert.ok(!g.textContent.includes("国庆") && !g.textContent.includes("5 件事"), g.textContent);
    assert.match(g.textContent, /今天有 3 件事/);
    assert.equal(c.chat.messages().find((m) => m.kind === "greet").data.rewritten, false);
  } finally {
    c.close();
  }
});
