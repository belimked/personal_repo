// S07 各页“问助手”入口与助手改名（设计 §3.7 / 评审 10.11）
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, relTarget, waitFor } from "./helpers.mjs";

const TODAY = "2026-03-04"; // 周三
const SESSION = "lily@demo.com";

async function open(name, opts = {}) {
  const p = await loadPage(name, { session: SESSION, today: TODAY, ...opts });
  p.window.PA_TYPING_MS = 20;
  return p;
}
const askOf = (href) => new URL(href).searchParams.get("ask");
const enter = (p, el) => el.dispatchEvent(new p.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
const rows = (p) => p.document.querySelectorAll("#tbl tr[data-row]").length;

test("知识库页：主搜索框提示“用一句话描述你要找的内容”并注明按意思找，提交后跳到助手页", async () => {
  const p = await open("files.html");
  try {
    assert.deepEqual(p.errors, []);
    const ask = p.document.getElementById("ask");
    assert.ok(ask, "应有“问助手”输入框");
    assert.equal(ask.getAttribute("placeholder"), "用一句话描述你要找的内容");
    const bar = ask.closest(".askbar");
    assert.ok(bar.textContent.includes("按意思找"), "旁边注明按意思找");
    // 原有的关键字筛选保留为次要功能
    const kw = p.document.getElementById("kw");
    assert.ok(kw, "关键字筛选仍保留");
    const before = rows(p);
    assert.ok(before >= 2, `文件列表应有数据：${before}`);
    kw.value = "合同";
    kw.dispatchEvent(new p.window.Event("input"));
    const filtered = rows(p);
    assert.ok(filtered >= 1 && filtered < before, `关键字筛选仍生效：${filtered}/${before}`);
    kw.value = "";
    kw.dispatchEvent(new p.window.Event("input"));
    // 主搜索框回车 → 助手页
    ask.value = "找上个月签的租房合同";
    enter(p, ask);
    assert.equal(p.navigations.length, 1);
    const target = relTarget(p.navigations[0]);
    assert.equal(target.split("?")[0], "home.html");
    assert.equal(askOf(p.navigations[0]), "找上个月签的租房合同");
  } finally {
    p.close();
  }
});

test("待办页：顶部有“跟助手说”一行，提交后跳到助手页", async () => {
  const p = await open("todos.html");
  try {
    assert.deepEqual(p.errors, []);
    const ask = p.document.getElementById("ask");
    assert.ok(ask, "应有“问助手”输入框");
    assert.equal(ask.getAttribute("placeholder"), "把这周所有会议推迟一天");
    const bar = ask.closest(".askbar");
    assert.equal(bar, p.document.getElementById("page").firstElementChild, "入口在页面顶部");
    assert.ok(bar.textContent.includes("跟助手说"), "有“跟助手说：”提示");
    ask.value = "把这周所有会议推迟一天";
    enter(p, ask);
    assert.equal(p.navigations.length, 1);
    assert.equal(relTarget(p.navigations[0]).split("?")[0], "home.html");
    assert.equal(askOf(p.navigations[0]), "把这周所有会议推迟一天");
    // 点“问助手”按钮同样有效
    ask.value = "把重疾险排到周六上午";
    p.document.getElementById("ask-go").click();
    assert.equal(p.navigations.length, 2);
    assert.equal(askOf(p.navigations[1]), "把重疾险排到周六上午");
  } finally {
    p.close();
  }
});

test("助手页带 ?ask= 打开：自动发出去并去掉地址参数，刷新不会重发", async () => {
  const p = await open("home.html", { url: `home.html?ask=${encodeURIComponent("找合同")}` });
  try {
    await waitFor(() => p.document.querySelector('#msgs .msg[data-kind="greet"]'), { label: "问候消息" });
    await p.window.PA_CHAT.idle();
    const mine = () => [...p.document.querySelectorAll("#msgs .msg.me")];
    assert.equal(mine().length, 1, "只有一条用户消息");
    assert.equal(mine()[0].textContent.trim(), "找合同");
    assert.ok(p.document.querySelector('#msgs .msg.bot[data-kind="search"]'), "助手直接按查询处理");
    assert.equal(p.window.location.search, "", "地址里的 ?ask= 已去掉");
    assert.ok(p.window.location.pathname.endsWith("/home.html"), p.window.location.pathname);
    assert.deepEqual(p.state().chat[TODAY].filter((m) => m.role === "user").map((m) => m.text), ["找合同"]);
    // 再等一会儿也不会重复发送
    await p.window.PA_CHAT.idle();
    assert.equal(mine().length, 1);
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("?ask= 带明确的说法时拿到查询结果", async () => {
  const p = await open("home.html", { url: `home.html?ask=${encodeURIComponent("找租房合同")}` });
  try {
    await waitFor(() => p.document.querySelector('#msgs .msg[data-kind="greet"]'), { label: "问候消息" });
    await p.window.PA_CHAT.idle();
    const hit = p.document.querySelector('#msgs .msg.bot[data-kind="search"] .hit');
    assert.ok(hit, "应有查询结果");
    assert.ok(hit.textContent.includes("租房合同扫描件"), hit.textContent);
    assert.equal(p.window.location.search, "");
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("个人设置可改助手名字，助手页页头显示新名字", async () => {
  const p = await open("profile.html");
  let saved;
  try {
    assert.deepEqual(p.errors, []);
    const input = p.document.getElementById("bot-name");
    assert.ok(input, "个人设置应有助手名字");
    assert.equal(input.value, "小禾");
    input.value = "阿禾";
    p.document.getElementById("save-bot-name").click();
    saved = p.state();
    assert.equal(saved.prefs.assistantName, "阿禾");
  } finally {
    p.close();
  }
  const h = await open("home.html", { state: saved });
  try {
    await waitFor(() => h.document.querySelector('#msgs .msg[data-kind="greet"]'), { label: "问候消息" });
    await h.window.PA_CHAT.idle();
    assert.equal(h.document.querySelector("[data-bot-name]").textContent, "阿禾", "页头显示新名字");
    assert.equal(h.document.querySelector("[data-bot-avatar]").firstChild.textContent, "阿");
    assert.equal(h.document.querySelector("#msgs .msg.bot .who").textContent, "阿");
    assert.deepEqual(h.errors, []);
  } finally {
    h.close();
  }
});
