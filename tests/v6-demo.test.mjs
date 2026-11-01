// S05：演示控制条、快照切换、时刻与说明模式（设计 §3.3 完成标准）
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, waitFor, sleep } from "./helpers.mjs";

const V = "v6";
const open = (url, opts = {}) => loadPage(url.split("?")[0], { session: "lily@demo.com", version: V, url, ...opts });

test("?persona=p1&stage=1 时“我了解的你”≤ 2 条，stage=30 时 ≥ 25 条", async () => {
  const a = await open("home.html?persona=p1&stage=1");
  try {
    assert.deepEqual(a.errors, []);
    const s = a.state();
    assert.equal(s.demo.persona, "p1");
    assert.equal(s.demo.stage, 1);
    assert.ok(s.profile.length <= 2, `第 1 天画像 ${s.profile.length} 条`);
    assert.equal(s.session.email, "lily@demo.com", "切换快照保留登录会话");
  } finally {
    a.close();
  }
  const b = await open("home.html?persona=p1&stage=30");
  try {
    assert.deepEqual(b.errors, []);
    assert.ok(b.state().profile.length >= 25, `第 30 天画像 ${b.state().profile.length} 条`);
    assert.ok(b.state().deliveries.length >= 6);
  } finally {
    b.close();
  }
});

test("地址参数优先于已存的 demo 设置，且应用后从地址栏去掉", async () => {
  const a = await open("home.html?persona=p1&stage=30");
  const saved = a.state();
  a.close();
  const b = await open("home.html?stage=7", { state: saved });
  try {
    assert.equal(b.state().demo.stage, 7);
    assert.equal(b.state().profile.length, 8);
    assert.ok(!b.window.location.search.includes("stage"), "演示参数应从地址栏去掉");
  } finally {
    b.close();
  }
});

test("控制条挂在外壳顶部；切换人物到 p2 后阶段 1、7 置灰", async () => {
  const p = await open("home.html?persona=p1&stage=7");
  try {
    const bar = p.document.querySelector(".main-col > #demo-bar");
    assert.ok(bar, "控制条应在主栏顶部");
    assert.match(bar.dataset.rule, /R-冷启动-/);
    const btn = (s) => bar.querySelector(`[data-stage="${s}"]`);
    assert.ok(!btn(1).disabled && !btn(7).disabled && !btn(30).disabled);
    const sel = bar.querySelector("#demo-persona");
    assert.deepEqual([...sel.options].map((o) => o.value), ["p1", "p2", "p3", "p4"]);
    sel.value = "p2";
    sel.dispatchEvent(new p.window.Event("change"));
    const s = p.state();
    assert.equal(s.demo.persona, "p2");
    assert.equal(s.demo.stage, 30, "p2 只有第 30 天");
    assert.equal(s.personaInfo.id, "p2");
    assert.equal(s.session.email, "lily@demo.com");
    const bar2 = p.document.querySelector("#demo-bar");
    assert.ok(bar2.querySelector('[data-stage="1"]').disabled, "阶段 1 置灰");
    assert.ok(bar2.querySelector('[data-stage="7"]').disabled, "阶段 7 置灰");
    assert.ok(!bar2.querySelector('[data-stage="30"]').disabled);
  } finally {
    p.close();
  }
  const q = await open("home.html?persona=p3");
  try {
    assert.equal(q.state().demo.stage, 30, "只有第 30 天的人物自动用第 30 天");
    assert.ok(q.document.querySelector('#demo-bar [data-stage="1"]').disabled);
  } finally {
    q.close();
  }
});

test("时刻下拉列出快照定义的时刻，选中后“现在”设为该时刻", async () => {
  const p = await open("home.html?persona=p1&stage=30&moment=d30-fri", { today: "2026-10-21" });
  try {
    assert.deepEqual(p.errors, []);
    const opts = [...p.document.querySelectorAll("#demo-moment option")].map((o) => o.value);
    assert.deepEqual(opts, p.state().moments.map((m) => m.id));
    assert.ok(opts.length >= 6);
    assert.equal(p.state().demo.moment, "d30-fri");
    // 2026-10-21 是周三，同一周的周五是 10-23
    assert.equal(p.window.PA.today(), "2026-10-23");
    assert.equal(p.window.PA.nowStr(), "2026-10-23 16:00");
    assert.equal(p.window.PA.now().getHours(), 16);
    const sel = p.document.querySelector("#demo-moment");
    sel.value = "d30-mon";
    sel.dispatchEvent(new p.window.Event("change"));
    assert.equal(p.state().demo.moment, "d30-mon");
    assert.equal(p.window.PA.nowStr(), "2026-10-19 08:30");
  } finally {
    p.close();
  }
});

test("explain=1 时出现规则角标，点开含规则标题和功能说明章节；关闭后不显示", async () => {
  const p = await open("home.html?persona=p1&stage=1&explain=1");
  try {
    assert.deepEqual(p.errors, []);
    await waitFor(() => p.window.PA_RULES, { label: "规则表加载" });
    const badge = await waitFor(() => p.document.querySelector('.rule-badge[data-rule-id="R-冷启动-01"]'), { label: "角标" });
    badge.click();
    const pop = p.document.querySelector(".rule-pop");
    assert.ok(pop, "点角标应弹出说明");
    const r = p.window.PA_RULES["R-冷启动-01"];
    assert.ok(pop.textContent.includes(r.title), "弹层含规则标题");
    assert.ok(pop.textContent.includes(r.text));
    assert.ok(pop.textContent.includes(`功能说明 §${r.section}`));
    // 动态加入的 data-rule 元素也会补上角标
    const el = p.document.createElement("div");
    el.dataset.rule = "R-收集-01";
    p.document.querySelector("#content").appendChild(el);
    await waitFor(() => el.nextElementSibling?.classList.contains("rule-badges"), { label: "动态元素角标" });
    // 关闭说明模式后角标消失
    const cb = p.document.querySelector("#demo-explain");
    cb.checked = false;
    cb.dispatchEvent(new p.window.Event("change"));
    await waitFor(() => !p.document.querySelector(".rule-badge"), { label: "角标消失" });
    assert.equal(p.state().demo.explain, false);
  } finally {
    p.close();
  }
});

test("未开说明模式时不显示角标", async () => {
  const p = await open("home.html?persona=p1&stage=30&explain=0");
  try {
    await sleep(50);
    assert.ok(p.document.querySelector("[data-rule]"));
    assert.equal(p.document.querySelector(".rule-badge"), null);
  } finally {
    p.close();
  }
});

test("控制条收起后刷新仍收起", async () => {
  const a = await open("home.html?persona=p1&stage=7");
  let saved;
  try {
    a.document.querySelector("#demo-toggle").click();
    assert.ok(a.document.querySelector("#demo-bar").classList.contains("collapsed"));
    saved = a.state();
    assert.equal(saved.demo.barCollapsed, true);
  } finally {
    a.close();
  }
  const b = await open("home.html", { state: saved });
  try {
    const bar = b.document.querySelector("#demo-bar");
    assert.ok(bar.classList.contains("collapsed"), "刷新后仍收起");
    assert.equal(bar.querySelector("#demo-persona"), null);
    assert.equal(b.state().demo.stage, 7, "无地址参数时沿用已存设置");
    bar.querySelector("#demo-toggle").click();
    assert.ok(!b.document.querySelector("#demo-bar").classList.contains("collapsed"));
  } finally {
    b.close();
  }
});

test("“重置”恢复当前快照初始数据，保留会话与 demo 设置", async () => {
  const p = await open("home.html?persona=p1&stage=30");
  try {
    const { PA, PA_DEMO } = p.window;
    PA.state.profile.splice(0, 5);
    PA.save();
    assert.ok(p.state().profile.length < 25);
    p.document.querySelector("#demo-reset").click();
    p.document.querySelector(".modal-foot .danger").click();
    const s = p.state();
    assert.equal(s.profile.length, PA_DEMO.snapshot().profile.length);
    assert.equal(s.demo.persona, "p1");
    assert.equal(s.demo.stage, 30);
    assert.equal(s.session.email, "lily@demo.com");
  } finally {
    p.close();
  }
});

test("其他页面也有控制条，读同一份快照", async () => {
  const a = await open("home.html?persona=p4");
  const saved = a.state();
  a.close();
  for (const name of ["files.html", "todos.html", "profile.html"]) {
    const p = await open(name, { state: saved });
    try {
      assert.deepEqual(p.errors, [], name);
      await waitFor(() => p.document.querySelector("#demo-bar"), { label: `${name} 控制条` });
      assert.equal(p.state().demo.persona, "p4", name);
      assert.equal(p.state().personaInfo.id, "p4", name);
    } finally {
      p.close();
    }
  }
});
