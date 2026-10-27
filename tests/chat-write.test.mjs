import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, waitFor } from "./helpers.mjs";

const TODAY = "2026-03-04"; // 周三
const SESSION = "lily@demo.com";

async function openChat(state) {
  const p = await loadPage("home.html", { session: SESSION, today: TODAY, state });
  const { window, document } = p;
  window.PA_TYPING_MS = 10;
  const all = (sel) => [...document.querySelectorAll(sel)];
  await waitFor(() => document.querySelector('#msgs .msg[data-kind="greet"]'), { label: "问候消息" });
  await window.PA_CHAT.idle();
  return { ...p, all, chat: window.PA_CHAT, PA: window.PA };
}
const btn = (root, text) => [...root.querySelectorAll("button, a")].find((b) => b.textContent.trim() === text);
const lastKind = (c, kind) => c.all(`#msgs .msg[data-kind="${kind}"]`).at(-1);
const countKind = (c, kind) => c.all(`#msgs .msg[data-kind="${kind}"]`).length;
async function create(c, text) {
  const n = countKind(c, "todo");
  await c.chat.send(text);
  await waitFor(() => countKind(c, "todo") > n, { label: `新建：${text}` });
  await c.chat.idle();
  await c.chat.idle();
  return c.PA.todoById(lastKind(c, "todo").querySelector('a[href^="todo.html?id="]').getAttribute("href").split("=")[1]);
}

test("新建“下周三交周报”后提示代写；好，开始 → 素材 → 初稿卡片，存入知识库并挂到待办", async () => {
  const c = await openChat();
  try {
    const seedNums = JSON.stringify([c.PA.state.todos, c.PA.state.files, c.PA.state.inbox]);
    const filesBefore = c.PA.state.files.length;
    const t = await create(c, "下周三交周报");
    const offer = await waitFor(() => lastKind(c, "writeOffer"), { label: "代写提示" });
    assert.match(offer.textContent, /参照之前的周报/);
    assert.ok(offer.textContent.includes("项目周报模板.html"), "按意思找到的参考文档");
    assert.ok(btn(offer, "好，开始") && btn(offer, "不用了"));
    assert.deepEqual(c.state().writeOffer.offered, [t.id]);

    btn(offer, "好，开始").click();
    const mat = await waitFor(() => lastKind(c, "writeMaterials"), { label: "素材消息" });
    assert.ok(mat.textContent.includes("本周完成") && mat.textContent.includes("产品评审会议"), "自动整理本周已完成待办");
    assert.ok(mat.querySelector("textarea"), "问是否补充");
    btn(mat, "写初稿").click();
    const card = await waitFor(() => lastKind(c, "writeDraft"), { label: "初稿卡片" });
    const text = card.querySelector("[data-draft]").textContent;
    assert.match(text, /周报（初稿）/);
    assert.match(text, /还缺：风险和需要协调的事/);
    for (const n of text.match(/\d+(?:\.\d+)?/g) || []) assert.ok(seedNums.includes(n), `初稿数字 ${n} 应来自演示数据`);

    const s = c.state();
    assert.equal(s.files.length, filesBefore + 1);
    const f = s.files.at(-1);
    assert.equal(f.status, "indexed");
    assert.equal(f.content, text);
    assert.ok(f.tags.includes("工作/报告"), "自动打标签");
    for (const k of ["id", "name", "ext", "cat", "size", "tags", "uploadedAt", "status"]) assert.ok(k in f, k);
    assert.ok(s.todos.find((x) => x.id === t.id).attachments.includes(f.id), "待办附件包含初稿");

    // 导出 Word：text/html 的 .doc
    let blob = null, dl = "";
    c.window.URL.createObjectURL = (b) => { blob = b; return "blob:x"; };
    c.window.URL.revokeObjectURL = () => {};
    c.window.HTMLAnchorElement.prototype.click = function () { dl = this.download; };
    btn(card, "导出 Word").click();
    assert.equal(blob.type, "text/html");
    assert.equal(dl, "周报.doc");
    // 复制
    let copied = "";
    Object.defineProperty(c.window.navigator, "clipboard", { configurable: true, value: { writeText: async (v) => { copied = v; } } });
    btn(card, "复制").click();
    assert.equal(copied, text);
    await waitFor(() => c.document.body.textContent.includes("已复制初稿"), { label: "复制提示" });
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
});

test("每件事只提示一次；同类连续拒绝 3 次后不再提示，接受会清零", async () => {
  const c = await openChat();
  try {
    const reject = async (text) => {
      const n = countKind(c, "writeOffer");
      await create(c, text);
      const o = await waitFor(() => countKind(c, "writeOffer") > n && lastKind(c, "writeOffer"), { label: `提示：${text}` });
      btn(o, "不用了").click();
      await waitFor(() => !btn(lastKind(c, "writeOffer"), "不用了"));
      await c.chat.idle();
    };
    await reject("周五交周报");
    await reject("下周一交周报");
    // 接受一次清零
    const n0 = countKind(c, "writeOffer");
    await create(c, "周六交周报");
    const o = await waitFor(() => countKind(c, "writeOffer") > n0 && lastKind(c, "writeOffer"));
    btn(o, "好，开始").click();
    await waitFor(() => lastKind(c, "writeMaterials"));
    await c.chat.idle();
    assert.equal(c.state().writeOffer.rejects["周报"], 0);

    await reject("周日交周报");
    await reject("下周二交周报");
    await reject("下周三交周报");
    assert.equal(c.state().writeOffer.rejects["周报"], 3);
    const n = countKind(c, "writeOffer");
    await create(c, "下周四交周报");
    await c.chat.idle();
    assert.equal(countKind(c, "writeOffer"), n, "第 4 次不再提示");
    // 其他类别不受影响
    await create(c, "周五前写好推广方案");
    await waitFor(() => countKind(c, "writeOffer") > n, { label: "方案类仍提示" });
    // 已提示过的待办，重新渲染不会再提示
    assert.equal(new Set(c.state().writeOffer.offered).size, c.state().writeOffer.offered.length);
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
});

test("非周报：素材不足时初稿写明缺什么，不出现素材外的数字", async () => {
  const c = await openChat();
  try {
    const seedNums = JSON.stringify([c.PA.state.todos, c.PA.state.files, c.PA.state.inbox]);
    await create(c, "下周五交客户管理系统项目介绍");
    const o = await waitFor(() => lastKind(c, "writeOffer"));
    btn(o, "好，开始").click();
    const mat = await waitFor(() => lastKind(c, "writeMaterials"));
    assert.ok(mat.textContent.includes("客户管理系统二期"), "从会议里提取项目信息");
    btn(mat, "写初稿").click();
    const card = await waitFor(() => lastKind(c, "writeDraft"));
    const text = card.querySelector("[data-draft]").textContent;
    assert.match(text, /还缺：项目目标、范围、时间安排/);
    for (const n of text.match(/\d+(?:\.\d+)?/g) || []) assert.ok(seedNums.includes(n), `初稿数字 ${n} 应来自演示数据`);
    assert.deepEqual(c.errors, []);
  } finally {
    c.close();
  }
});

test("刷新后代写消息按 data 重新渲染", async () => {
  const c = await openChat();
  let saved;
  try {
    await create(c, "下周三交周报");
    btn(await waitFor(() => lastKind(c, "writeOffer")), "不用了").click();
    await c.chat.idle();
    saved = c.state();
  } finally {
    c.close();
  }
  const c2 = await openChat(saved);
  try {
    const o = lastKind(c2, "writeOffer");
    assert.ok(o && o.textContent.includes("已选择：不用了"));
    assert.equal(c2.state().writeOffer.rejects["周报"], 1);
    assert.deepEqual(c2.errors, []);
  } finally {
    c2.close();
  }
});
