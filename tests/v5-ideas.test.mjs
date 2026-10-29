import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, relTarget } from "./helpers.mjs";

const V = "v5";
const TODAY = "2026-10-29";
const open = (name, opts = {}) => loadPage(name, { session: "lily@demo.com", version: V, today: TODAY, ...opts });
const titles = (doc) => [...doc.querySelectorAll("#list .idea-card .idea-title")].map((a) => a.textContent.trim());

async function withPage(name, fn, opts) {
  const p = await open(name, opts);
  try {
    assert.deepEqual(p.errors, []);
    await fn(p, p.window.PA, p.document);
  } finally {
    p.close();
  }
}

test("菜单含“想做的事”链接，排在“待办事项”之后", () =>
  withPage("home.html", (p, PA, doc) => {
    const items = [...doc.querySelectorAll(".sidebar .nav-item[href]")].map((a) => a.getAttribute("href"));
    assert.ok(items.includes("ideas.html"));
    assert.equal(items.indexOf("ideas.html"), items.indexOf("todos.html") + 1);
    assert.equal(doc.querySelector('.sidebar a[href="ideas.html"]').dataset.name, "想做的事");
  }));

test("ideas.html 列出所有进行中的演示条目，星标排最前；有问助手入口", () =>
  withPage("ideas.html", (p, PA, doc) => {
    const act = PA.state.ideas.filter((i) => i.status === "active").map((i) => i.title);
    const shown = titles(doc);
    assert.equal(shown.length, act.length);
    assert.deepEqual([...shown].sort(), [...act].sort());
    assert.equal(shown[0], "研究新能源车的购车补贴");
    assert.ok(doc.querySelector(".askbar #ask").placeholder.includes("保险那件事，排到周六上午"));
    // 已关联待办的显示进度
    const ins = doc.querySelector('[data-idea="i3"]');
    assert.ok(ins.textContent.includes("已排 1 条 · 完成 0"));
    assert.ok(!doc.querySelector('[data-idea="i1"]').textContent.includes("已排"));
  }));

test("点“灵光一现”小块后只剩两件灵光一现", () =>
  withPage("ideas.html", (p, PA, doc) => {
    const chips = [...doc.querySelectorAll("#filters .chip")];
    assert.equal(chips[0].textContent, "全部");
    assert.equal(chips[1].textContent, "灵光一现");
    chips[1].click();
    assert.deepEqual(titles(doc).sort(), ["周报可以加个图表", "做个记家里开销的小程序"].sort());
    doc.querySelector('#filters [data-f=""]').click();
    assert.equal(titles(doc).length, 7);
  }));

test("输入“想学吉他”回车后新增一张卡片并保存", () =>
  withPage("ideas.html", (p, PA, doc) => {
    const inp = doc.getElementById("idea-input");
    inp.value = "想学吉他";
    inp.dispatchEvent(new p.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    assert.ok(titles(doc).includes("想学吉他"));
    assert.equal(inp.value, "");
    const saved = p.state().ideas.find((i) => i.title === "想学吉他");
    assert.ok(saved && saved.status === "active");
  }));

test("排个时间 → 明天：生成关联待办，卡片显示“已排 1 条”，可撤销", () =>
  withPage("ideas.html", (p, PA, doc) => {
    const n0 = PA.state.todos.length;
    doc.querySelector('[data-sched="i1"]').click();
    const chip = [...doc.querySelectorAll(".idea-sched [data-d]")].find((c) => c.textContent.startsWith("明天"));
    assert.ok(chip);
    chip.click();
    const t = p.state().todos.find((x) => x.ideaId === "i1");
    assert.ok(t);
    assert.equal(t.date, "2026-10-30");
    assert.equal(PA.state.todos.length, n0 + 1);
    assert.ok(doc.querySelector('[data-idea="i1"]').textContent.includes("已排 1 条"));
    const toast = [...doc.querySelectorAll(".toast")].find((x) => x.textContent.includes("已排到"));
    assert.ok(toast && toast.textContent.includes("可撤销"));
    toast.querySelector("a").click();
    assert.ok(!p.state().todos.some((x) => x.ideaId === "i1"));
    assert.ok(!doc.querySelector('[data-idea="i1"]').textContent.includes("已排"));
  }));

test("idea.html 显示关联待办；点“放下了”后状态为 dropped，列表不再显示", async () => {
  let saved;
  await withPage("idea.html?id=i3", (p, PA, doc) => {
    const box = doc.getElementById("i-todos");
    const a = box.querySelector('a[href="todo.html?id=t20"]');
    assert.ok(a && a.textContent.includes("联系平安的客户经理"));
    assert.ok(doc.getElementById("i-rec").textContent.includes("平安的客户经理"));
    assert.ok(doc.getElementById("i-tags").textContent.includes("生活/保险"));
    doc.querySelector('[data-op="dropped"]').click();
    assert.equal(PA.ideaById("i3").status, "dropped");
    assert.ok(doc.querySelector('[data-op="active"]'), "已结束应显示恢复");
    saved = p.state();
    assert.equal(saved.ideas.find((i) => i.id === "i3").status, "dropped");
  });
  await withPage("ideas.html", (p, PA, doc) => {
    assert.ok(!titles(doc).includes("研究一下保险"));
    const tg = doc.querySelector("[data-toggle-ended]");
    assert.ok(tg.textContent.includes("已做成 0 · 已放下 1"));
    tg.click();
    assert.ok(doc.querySelector('#ended [data-idea="i3"]'));
  }, { state: saved });
});

test("idea.html 删除后回到列表", () =>
  withPage("idea.html?id=i4", (p, PA, doc) => {
    doc.querySelector('[data-op="delete"]').click();
    const ok = [...doc.querySelectorAll(".modal-mask button, .modal button")].find((b) => b.textContent.trim() === "删除");
    assert.ok(ok);
    ok.click();
    assert.ok(!p.state().ideas.some((i) => i.id === "i4"));
    assert.deepEqual(p.navigations.map((h) => relTarget(h, V)), ["ideas.html"]);
  }));
