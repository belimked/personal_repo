import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage } from "./helpers.mjs";

// S05：待办页左侧标签树（点名只看、勾选多选、默认全选可排除）
const V = "v5";
const TODAY = "2026-10-29";
const open = (url = "todos.html?view=list") => loadPage("todos.html", { session: "lily@demo.com", version: V, today: TODAY, url });

async function withPage(fn, url) {
  const p = await open(url);
  try {
    assert.deepEqual(p.errors, []);
    await fn(p, p.window.PA, p.document);
  } finally {
    p.close();
  }
}
const item = (doc, k) => doc.querySelector(`#tagtree .tree-item[data-k="${k}"]`);
const allItem = (doc) => doc.querySelector('#tagtree .tree-item[data-kind="all"]');
const cb = (el) => el.querySelector("[data-cb]");
const cbState = (el) => (cb(el).classList.contains("on") ? "on" : cb(el).classList.contains("part") ? "part" : "");
const expand = (doc, top) => { if (!doc.querySelector(`#tagtree [data-k^="${top}/"]`)) doc.querySelector(`#tagtree [data-toggle="${top}"]`).click(); };
const listIds = (doc) => [...doc.querySelectorAll("#tbl [data-peek]")].map((a) => a.dataset.peek);
const tagsOf = (PA, id) => PA.todoById(id).tags || [];
// 给几条待办改成 生活/缴费（预设库补充的待办常用标签），再通知页面
function addPayTag(PA) {
  ["t5", "t14"].forEach((id) => (PA.todoById(id).tags = ["生活/缴费"]));
  PA.save(); PA.todosChanged();
}

test("替换了“全部标签”下拉框；默认全部勾上（含未打标签）", () =>
  withPage((p, PA, doc) => {
    assert.ok(!doc.getElementById("tagf"), "没有下拉框");
    assert.ok(!doc.body.textContent.includes("全部标签"));
    assert.ok(allItem(doc).textContent.includes("全部待办"));
    assert.equal(cbState(allItem(doc)), "on");
    assert.ok(item(doc, "工作"), "有一级标签“工作”");
    assert.ok(item(doc, "__none__").textContent.includes("未打标签"));
    assert.ok([...doc.querySelectorAll("#tagtree .tree-item")].every((el) => cbState(el) === "on"));
    assert.equal(doc.getElementById("tagsum").textContent.trim(), "");
    const n = doc.querySelectorAll("#tbl tr.todo-row").length;
    assert.ok(n > 0);
    // 件数跟随当前页签（未完成）
    assert.equal(+allItem(doc).querySelector(".n").textContent, n);
  }));

test("取消“工作”即排除：列表不含工作标签的待办，筛选行“除了 工作”；日历共用", () =>
  withPage((p, PA, doc) => {
    const before = listIds(doc);
    assert.ok(before.some((id) => tagsOf(PA, id).some((t) => t.startsWith("工作"))));
    cb(item(doc, "工作")).click();
    const ids = listIds(doc);
    assert.ok(ids.length > 0);
    assert.ok(ids.every((id) => !tagsOf(PA, id).some((t) => t === "工作" || t.startsWith("工作/"))), ids.join());
    assert.ok(doc.getElementById("tagsum").textContent.includes("除了 工作"), doc.getElementById("tagsum").textContent);
    assert.equal(cbState(allItem(doc)), "part");
    const saved = JSON.parse(p.window.sessionStorage.getItem("pa5_todo_tags"));
    assert.equal(saved.mode, "exclude");
    assert.ok(!saved.checked.includes("工作/会议"));
    // 日历用同一筛选
    doc.querySelector('#viewseg [data-v="cal"]').click();
    const evIds = [...doc.querySelectorAll("#cal-view [data-id]")].map((e) => e.dataset.id);
    assert.ok(evIds.length > 0);
    assert.ok(evIds.every((id) => !tagsOf(PA, id).some((t) => t.startsWith("工作"))), evIds.join());
    // 新出现的标签在排除模式下默认勾上
    addPayTag(PA);
    assert.equal(cbState(item(doc, "生活")), "on");
    // 清除 = 回到全选
    doc.getElementById("tag-clear").click();
    assert.equal(cbState(allItem(doc)), "on");
  }));

test("点全选框变为全不勾：列表为空并提示“全选”，点“全选”恢复", () =>
  withPage((p, PA, doc) => {
    cb(allItem(doc)).click();
    assert.equal(cbState(allItem(doc)), "");
    assert.equal(listIds(doc).length, 0);
    const empty = doc.querySelector("#tbl .empty");
    assert.ok(empty.textContent.includes("没有勾选任何标签 · 全选"), empty.textContent);
    assert.ok(!doc.getElementById("tag-none").classList.contains("hidden"));
    assert.equal(JSON.parse(p.window.sessionStorage.getItem("pa5_todo_tags")).mode, "only");
    // 只看模式下新标签默认不勾
    addPayTag(PA);
    assert.equal(cbState(item(doc, "生活")), "");
    doc.querySelector("#tbl .empty [data-tag-all]").click();
    assert.equal(cbState(allItem(doc)), "on");
    assert.ok(listIds(doc).length > 0);
    assert.ok(doc.getElementById("tag-none").classList.contains("hidden"));
  }));

test("只勾“生活/缴费”只显示该类；再勾“工作/会议”筛选行为合集", () =>
  withPage((p, PA, doc) => {
    addPayTag(PA);
    cb(allItem(doc)).click(); // 全不选
    expand(doc, "生活");
    cb(item(doc, "生活/缴费")).click();
    assert.equal(cbState(item(doc, "生活")), "part", "一级标签部分勾选显示半选");
    assert.deepEqual(listIds(doc).sort(), ["t14", "t5"]);
    assert.ok(doc.getElementById("tagsum").textContent.includes("标签：生活/缴费"));
    expand(doc, "工作");
    cb(item(doc, "工作/会议")).click();
    const ids = listIds(doc);
    assert.ok(ids.includes("t5") && ids.includes("t10"), ids.join());
    assert.ok(ids.every((id) => tagsOf(PA, id).some((t) => t === "生活/缴费" || t === "工作/会议")));
    assert.ok(doc.getElementById("tagsum").textContent.includes("标签：生活/缴费 + 工作/会议"), doc.getElementById("tagsum").textContent);
  }));

test("点标签名只看这一类；件数跟随页签；标签栏可收起，角标显示已选个数", () =>
  withPage((p, PA, doc) => {
    item(doc, "工作").click(); // 点名字（不是方框）
    const ids = listIds(doc);
    assert.ok(ids.length > 0);
    assert.ok(ids.every((id) => tagsOf(PA, id).some((t) => t.startsWith("工作"))));
    assert.ok(doc.getElementById("tagsum").textContent.includes("标签：工作"));
    assert.equal(cbState(item(doc, "工作")), "on");
    // 件数跟随页签：切到“已完成”后“全部待办”件数 = 已完成里（不按标签）的条数
    const doneTab = [...doc.querySelectorAll("#tabs .tab")].find((t) => t.dataset.k === "done");
    doneTab.click();
    const doneAll = PA.state.todos.filter((t) => t.status === "done").length;
    assert.equal(+allItem(doc).querySelector(".n").textContent, doneAll);
    // 收起
    doc.getElementById("tag-toggle").click();
    assert.ok(doc.getElementById("todo-layout").classList.contains("tag-collapsed"));
    assert.ok(doc.querySelector("#tag-toggle .n"), "收起后显示角标");
    assert.ok(listIds(doc).every((id) => tagsOf(PA, id).some((t) => t.startsWith("工作"))), "筛选继续生效");
    // 窄屏顶部按钮显示当前条件
    assert.ok(doc.getElementById("tag-mbtn").textContent.includes("标签：工作"));
  }));

test("日历视图件数跟随显示范围", () =>
  withPage((p, PA, doc) => {
    const n = +allItem(doc).querySelector(".n").textContent;
    const ids = new Set([...doc.querySelectorAll("#cal-view [data-id]")].map((e) => e.dataset.id));
    assert.equal(n, ids.size);
    doc.getElementById("c-next").click();
    const ids2 = new Set([...doc.querySelectorAll("#cal-view [data-id]")].map((e) => e.dataset.id));
    assert.equal(+allItem(doc).querySelector(".n").textContent, ids2.size);
  }, "todos.html?view=cal"));
