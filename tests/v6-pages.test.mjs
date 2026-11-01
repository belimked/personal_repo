// S08：我盯着的事、交给我的资料、我了解的你（设计 §3.7 完成标准）
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, relTarget, sleep } from "./helpers.mjs";

const V = "v6";
const open = (url, opts = {}) => loadPage(url.split("?")[0], { session: "lily@demo.com", version: V, url, ...opts });
const items = (doc) => [...doc.querySelectorAll("#me-layers .me-item")];

test("watch.html：p1 第 30 天至少 5 个领域分组，有待办 / 想做的事入口", async () => {
  const p = await open("watch.html?persona=p1&stage=30");
  try {
    assert.deepEqual(p.errors, []);
    const groups = [...p.document.querySelectorAll(".watch-group")];
    assert.ok(groups.length >= 5, `领域分组 ${groups.length}`);
    const used = new Set(p.state().watch.map((w) => w.domain));
    groups.forEach((g) => assert.ok(used.has(g.dataset.domain), "只显示用到的领域：" + g.dataset.domain));
    assert.equal(groups.length, used.size);
    const item = p.document.querySelector(".watch-item");
    assert.ok(item.querySelector(".watch-doing").textContent.trim());
    assert.match(item.querySelector(".watch-next").textContent, /下一个时间点/);
    const subs = [...p.document.querySelectorAll("#watch-sub a")].map((a) => [a.textContent.trim(), relTarget(a.getAttribute("href"), V)]);
    assert.deepEqual(subs, [["全部待办 ›", "todos.html"], ["想做的事 ›", "ideas.html"]]);
  } finally {
    p.close();
  }
});

test("watch.html：第 1 天为空状态", async () => {
  const p = await open("watch.html?persona=p1&stage=1");
  try {
    assert.deepEqual(p.errors, []);
    assert.ok(p.document.querySelector(".watch-empty").textContent.includes("你告诉我的事会在这里，我替你盯着"));
    assert.equal(p.document.querySelectorAll(".watch-group").length, 0);
  } finally {
    p.close();
  }
});

test("watch.html：其他人物只显示自己用到的领域", async () => {
  const p = await open("watch.html?persona=p4&stage=30");
  try {
    assert.deepEqual(p.errors, []);
    const doms = [...p.document.querySelectorAll(".watch-group")].map((g) => g.dataset.domain).sort();
    assert.deepEqual(doms, ["人情", "小店"]);
  } finally {
    p.close();
  }
});

test("files.html：标题为“交给我的资料”，有拍照 / 截图 / 分享链接入口", async () => {
  const p = await open("files.html?persona=p1&stage=30");
  try {
    assert.deepEqual(p.errors, []);
    assert.equal(p.document.querySelector(".topbar .title").textContent, "交给我的资料");
    assert.match(p.document.title, /交给我的资料/);
    const head = p.document.querySelector(".files-head");
    assert.ok(!head.classList.contains("hidden"));
    assert.deepEqual([...head.querySelectorAll("[data-intake]")].map((b) => b.dataset.intake), ["photo", "shot", "link"]);
    assert.ok(p.document.querySelector(".files-empty").classList.contains("hidden"));
  } finally {
    p.close();
  }
});

test("files.html：第 1 天空状态说明交资料能换来什么；分享链接后空状态消失", async () => {
  const p = await open("files.html?persona=p1&stage=1");
  try {
    assert.deepEqual(p.errors, []);
    const empty = p.document.querySelector(".files-empty");
    assert.ok(!empty.classList.contains("hidden"));
    assert.ok(empty.textContent.includes("拍一张课表，以后每周日晚提醒你第二天带什么"));
    assert.equal(empty.querySelectorAll("[data-intake]").length, 3);
    assert.ok(p.document.querySelector(".files-layout").classList.contains("hidden"));
    empty.querySelector('[data-intake="link"]').click();
    p.document.querySelector("#link-in").value = "https://example.com/video/123";
    [...p.document.querySelectorAll(".modal-foot .btn")].find((b) => b.textContent === "交给我").click();
    assert.equal(p.state().files.length, 1);
    assert.ok(empty.classList.contains("hidden"));
  } finally {
    p.close();
  }
});

test("me.html：按五层显示；展开看证据", async () => {
  const p = await open("me.html?persona=p1&stage=30");
  try {
    assert.deepEqual(p.errors, []);
    const layers = [...p.document.querySelectorAll(".me-layer")];
    assert.deepEqual(layers.map((l) => l.dataset.layer), ["1", "2", "3", "4", "5"]);
    assert.ok(layers.map((l) => l.textContent).join("").includes("偏好和风格"));
    layers.forEach((l) => assert.ok(l.querySelectorAll(".me-item").length > 0));
    const first = items(p.document)[0];
    assert.equal(first.querySelector(".me-ev"), null);
    first.querySelector('[data-act="ev"]').click();
    const ev = p.document.querySelector(`[data-pid="${first.dataset.pid}"] .me-ev`);
    assert.ok(ev && ev.textContent.includes("深圳"), "应显示证据原文");
  } finally {
    p.close();
  }
});

test("me.html：删除一条后条目数减 1；确认猜测后变为已确认；修改写回", async () => {
  const p = await open("me.html?persona=p1&stage=30");
  try {
    const n0 = items(p.document).length, s0 = p.state().profile.length;
    const del = items(p.document)[0], delId = del.dataset.pid;
    del.querySelector('[data-act="del"]').click();
    assert.equal(items(p.document).length, n0 - 1);
    assert.equal(p.state().profile.length, s0 - 1);
    assert.ok(!p.state().profile.some((x) => x.id === delId));

    const g = items(p.document).find((el) => el.dataset.status === "guess");
    const gid = g.dataset.pid;
    g.querySelector('[data-act="confirm"]').click();
    const after = p.document.querySelector(`[data-pid="${gid}"]`);
    assert.equal(after.querySelector(".me-status").textContent, "已确认");
    assert.equal(p.state().profile.find((x) => x.id === gid).status, "confirmed");

    const e = items(p.document)[0], eid = e.dataset.pid;
    e.querySelector('[data-act="edit"]').click();
    const inp = p.document.querySelector(`[data-pid="${eid}"] .me-edit`);
    inp.value = "广州";
    p.document.querySelector(`[data-pid="${eid}"] [data-act="save"]`).click();
    assert.equal(p.state().profile.find((x) => x.id === eid).value, "广州");
    assert.ok(p.document.querySelector(`[data-pid="${eid}"] .me-val`).textContent.includes("广州"));
  } finally {
    p.close();
  }
});

test("me.html：关掉“孩子”敏感开关后孩子相关条目隐藏，写入 consents", async () => {
  const p = await open("me.html?persona=p1&stage=30");
  try {
    const childIds = p.state().profile.filter((x) => x.sensitive === "child").map((x) => x.id);
    assert.ok(childIds.length > 0);
    assert.ok(childIds.every((id) => p.document.querySelector(`[data-pid="${id}"]`)));
    const sw = p.document.querySelector('[data-sens="child"]');
    sw.checked = false;
    sw.dispatchEvent(new p.window.Event("change"));
    assert.equal(p.state().consents.child, false);
    assert.ok(childIds.every((id) => !p.document.querySelector(`[data-pid="${id}"]`)), "孩子条目应隐藏");
    assert.equal([...p.document.querySelectorAll("[data-sens]")].length, 5);
  } finally {
    p.close();
  }
});

test("打开通用模式后首页不再有“因为”黄条", async () => {
  const p = await open("me.html?persona=p1&stage=30&moment=d30-fri");
  let saved;
  try {
    const sw = p.document.querySelector("#me-general-sw");
    assert.equal(sw.checked, false);
    sw.checked = true;
    sw.dispatchEvent(new p.window.Event("change"));
    saved = p.state();
    assert.equal(saved.generalMode, true);
  } finally {
    p.close();
  }
  const h = await open("home.html", { state: saved });
  try {
    assert.deepEqual(h.errors, []);
    await sleep(30);
    assert.ok(h.document.querySelectorAll("#butler .pa-card").length > 0);
    assert.equal(h.document.querySelectorAll(".pc-because").length, 0);
  } finally {
    h.close();
  }
  saved.generalMode = false;
  const h2 = await open("home.html", { state: saved });
  try {
    await sleep(30);
    assert.ok(h2.document.querySelectorAll(".pc-because").length > 0, "对照：关闭通用模式时有黄条");
  } finally {
    h2.close();
  }
});

test("me.html：导出生成 JSON Blob", async () => {
  const p = await open("me.html?persona=p1&stage=30");
  try {
    let blob = null;
    p.window.URL.createObjectURL = (b) => { blob = b; return "blob:x"; };
    p.window.URL.revokeObjectURL = () => {};
    p.document.querySelector("#me-export").click();
    assert.ok(blob, "应生成 Blob");
    assert.match(blob.type, /json/);
    assert.match(p.window.PA_LAST_EXPORT.name, /\.json$/);
    const text = await new Promise((r) => { const fr = new p.window.FileReader(); fr.onload = () => r(fr.result); fr.readAsText(blob); });
    const data = JSON.parse(text);
    assert.equal(data.profile.length, p.state().profile.length);
  } finally {
    p.close();
  }
});

test("me.html：忘掉我二次确认后清空 profile、evidence、feedback", async () => {
  const p = await open("me.html?persona=p1&stage=30");
  try {
    p.document.querySelector("#me-forget").click();
    const btns = [...p.document.querySelectorAll(".modal-foot .btn")];
    assert.ok(p.state().profile.length > 0, "确认前不清空");
    btns.find((b) => b.textContent === "取消").click();
    assert.ok(p.state().profile.length > 0);
    p.document.querySelector("#me-forget").click();
    [...p.document.querySelectorAll(".modal-foot .btn")].find((b) => b.textContent === "确认忘掉").click();
    const s = p.state();
    assert.deepEqual([s.profile.length, s.evidence.length, s.feedback.length], [0, 0, 0]);
    assert.equal(items(p.document).length, 0);
  } finally {
    p.close();
  }
});

test("me.html：第 30 天显示上次界面调整，撤回后 uiFactors 恢复默认；第 1 天不显示", async () => {
  const p = await open("me.html?persona=p1&stage=30");
  try {
    const box = p.document.querySelector(".me-uiadj");
    assert.ok(box && box.textContent.includes("上次界面调整"));
    p.document.querySelector("#me-ui-undo").click();
    assert.deepEqual(p.state().uiFactors, JSON.parse(JSON.stringify(p.window.PA.uiFactorsDefault())));
    assert.equal(p.state().uiReverted, "p1/30");
    assert.ok(p.document.querySelector(".me-uiadj").textContent.includes("已撤回"));
  } finally {
    p.close();
  }
  const q = await open("me.html?persona=p1&stage=1");
  try {
    assert.deepEqual(q.errors, []);
    assert.equal(q.document.querySelector(".me-uiadj"), null);
    assert.ok(items(q.document).length <= 2);
  } finally {
    q.close();
  }
});
