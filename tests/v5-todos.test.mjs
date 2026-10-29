import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, relTarget } from "./helpers.mjs";

// S04：待办页去掉“待安排”，日期必填，详情显示来源与“先不做了”
const V = "v5";
const TODAY = "2026-10-29"; // 周四，本周最后一天是 11/1
const open = (name, opts = {}) => loadPage(name, { session: "lily@demo.com", version: V, today: TODAY, ...opts });

async function withPage(name, fn, opts) {
  const p = await open(name, opts);
  try {
    assert.deepEqual(p.errors, []);
    await fn(p, p.window.PA, p.document);
  } finally {
    p.close();
  }
}
const btn = (root, label) => [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
const chip = (root, label) => [...root.querySelectorAll(".chip")].find((c) => c.textContent.trim().startsWith(label));
const openNew = (doc) => { doc.getElementById("new").click(); return doc.querySelector(".modal-mask"); };

test("列表没有“待安排”页签和分组，也没有待安排卡片", () =>
  withPage("todos.html?view=list", (p, PA, doc) => {
    const tabs = [...doc.querySelectorAll("#tabs .tab")].map((t) => t.textContent);
    assert.equal(tabs.length, 4);
    assert.ok(tabs.every((t) => !t.includes("待安排")), tabs.join());
    assert.ok(![...doc.querySelectorAll(".group-row")].some((r) => r.textContent.includes("待安排")));
    assert.ok(!doc.getElementById("ucards-wrap"));
    assert.ok(!doc.querySelector("[data-star]"), "列表不再有星标");
    // 期限待办在列表上显示“截止：…前”
    const row = [...doc.querySelectorAll("tr.todo-row")].find((r) => r.textContent.includes("更新简历"));
    assert.ok(row.textContent.includes("截止：11/1 前"), row.textContent);
  }, { url: "todos.html?view=list" }));

test("日历没有待安排侧栏，带截止日的待办标“截止”", () =>
  withPage("todos.html", (p, PA, doc) => {
    assert.ok(!doc.getElementById("unsched"));
    assert.ok(!doc.querySelector("[data-drop-unsched]"));
    assert.ok(!doc.getElementById("cal-view").textContent.includes("待安排"));
    const ev = [...doc.querySelectorAll("#cal-view [data-id]")].find((e) => e.dataset.id === "t19");
    assert.ok(ev, "本周日历里有“更新简历”");
    assert.ok(ev.textContent.includes("截止"), ev.textContent);
  }, { url: "todos.html?view=cal" }));

test("?tab=unscheduled 跳转到想做的事", async () => {
  const p = await open("todos.html", { url: "todos.html?tab=unscheduled" });
  try {
    assert.deepEqual(p.errors, []);
    assert.deepEqual(p.navigations.map((h) => relTarget(h, V)), ["ideas.html"]);
  } finally {
    p.close();
  }
});

test("新建不选日期时保存禁用，点“放进想做的事”后 ideas 增加一条", () =>
  withPage("todos.html", (p, PA, doc) => {
    const m = openNew(doc);
    const ok = btn(m, "创建");
    assert.equal(ok.disabled, true);
    const tip = m.querySelector("#n-noday");
    assert.ok(!tip.classList.contains("hidden"));
    assert.ok(tip.textContent.includes("还没定日子？放进想做的事 ›"));
    m.querySelector("#n-title").value = "学做面包";
    const n0 = p.state().ideas.length, t0 = p.state().todos.length;
    m.querySelector("[data-to-idea]").click();
    const s = p.state();
    assert.equal(s.ideas.length, n0 + 1);
    assert.equal(s.ideas[0].title, "学做面包");
    assert.equal(s.todos.length, t0);
    assert.ok(!doc.querySelector(".modal-mask"), "弹窗关闭");
  }));

test("选了日期后可保存；选“本周内”期限保存后 date 为本周最后一天", () =>
  withPage("todos.html", (p, PA, doc) => {
    let m = openNew(doc);
    chip(m, "明天").click();
    assert.equal(btn(m, "创建").disabled, false);
    assert.ok(m.querySelector("#n-noday").classList.contains("hidden"));
    chip(m, "明天").click(); // 再点一次取消
    assert.equal(btn(m, "创建").disabled, true);
    m.querySelector(".close").click();

    m = openNew(doc);
    m.querySelector("#n-title").value = "交读书报告";
    chip(m, "本周内").click();
    assert.equal(btn(m, "创建").disabled, false);
    btn(m, "创建").click();
    const t = p.state().todos.find((x) => x.title === "交读书报告");
    assert.equal(t.date, "2026-11-01");
    assert.equal(t.deadline.to, "2026-11-01");
  }));

test("右侧详情：有 ideaId 显示“来自：”链接，没有星标", () =>
  withPage("todos.html", (p, PA, doc) => {
    doc.querySelector('[data-peek="t20"]').click();
    const pk = doc.querySelector(".peek");
    const a = pk.querySelector("[data-from] a");
    assert.ok(pk.querySelector("[data-from]").textContent.startsWith("来自："));
    assert.equal(a.getAttribute("href"), "idea.html?id=i3");
    assert.ok(a.textContent.includes(PA.ideaById("i3").title));
    assert.ok(!pk.querySelector(".star"));
    assert.ok(btn(pk, "先不做了"));
  }, { url: "todos.html?view=list" }));

test("右侧详情“先不做了”：无来源转为想做的事，可撤销；有来源只删除待办", () =>
  withPage("todos.html", (p, PA, doc) => {
    const n0 = p.state().ideas.length;
    doc.querySelector('[data-peek="t4"]').click();
    btn(doc.querySelector(".peek"), "先不做了").click();
    let s = p.state();
    assert.ok(!s.todos.some((t) => t.id === "t4"));
    assert.equal(s.ideas.length, n0 + 1);
    assert.equal(s.ideas[0].title, "给妈妈买生日礼物");
    // 撤销
    const undo = [...doc.querySelectorAll(".toast a")].pop();
    assert.equal(undo.textContent, "撤销");
    undo.click();
    s = p.state();
    assert.ok(s.todos.some((t) => t.id === "t4" && t.status === "open"));
    assert.equal(s.ideas.length, n0);

    // 有来源：只删除这条待办，想做的事保留
    doc.querySelector('[data-peek="t20"]').click();
    btn(doc.querySelector(".peek"), "先不做了").click();
    s = p.state();
    assert.equal(s.todos.find((t) => t.id === "t20").status, "deleted");
    assert.equal(s.ideas.length, n0);
    assert.ok(s.ideas.some((i) => i.id === "i3"));
  }, { url: "todos.html?view=list" }));

test("todo.html：显示来源链接、无星标，“先不做了”把无来源待办转为想做的事", async () => {
  await withPage("todo.html", (p, PA, doc) => {
    const from = doc.querySelector("[data-from]");
    assert.ok(from.textContent.startsWith("来自："));
    assert.equal(from.querySelector("a").getAttribute("href"), "idea.html?id=i3");
    assert.ok(!doc.querySelector("#view .star"));
    btn(doc, "先不做了").click();
    const s = p.state();
    assert.equal(s.todos.find((t) => t.id === "t20").status, "deleted");
    assert.ok(s.ideas.some((i) => i.id === "i3"));
  }, { url: "todo.html?id=t20" });

  await withPage("todo.html", (p, PA, doc) => {
    assert.ok(!doc.querySelector("[data-from]"));
    const n0 = p.state().ideas.length;
    btn(doc, "先不做了").click();
    const s = p.state();
    assert.ok(!s.todos.some((t) => t.id === "t4"));
    assert.equal(s.ideas.length, n0 + 1);
    assert.ok(doc.querySelector('#view a[href^="idea.html?id="]'));
  }, { url: "todo.html?id=t4" });
});

test("编辑时不能清空日期", () =>
  withPage("todo.html", (p, PA, doc) => {
    chip(doc.querySelector("#d-dtp"), "后天").click(); // t4 在后天，再点一次即清空
    btn(doc, "保存修改").click();
    assert.equal(p.state().todos.find((t) => t.id === "t4").date, "2026-10-31");
  }, { url: "todo.html?id=t4" }));
