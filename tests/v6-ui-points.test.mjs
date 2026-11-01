// S10：界面三池映射与生图点数流程（设计 §3.9 完成标准）
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { loadPage, sleep, V6_DIR } from "./helpers.mjs";

const V = "v6";
const open = (persona, stage = 30, extra = "") => loadPage("home.html", { session: "lily@demo.com", version: V, url: `home.html?persona=${persona}&stage=${stage}${extra}` });
const tick = () => sleep(30);
const SLOT_RE = /\bhome-(proactive|done|watch|decide)\b/;
const slotOrder = (doc) => [...doc.querySelector("#butler").children].filter((el) => SLOT_RE.test(el.className) && !el.classList.contains("hidden")).map((el) => el.className.match(SLOT_RE)[1]);

const loadRules = () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  for (const f of ["personas-p1.js", "personas-others.js", "ui-rules.js"]) vm.runInContext(readFileSync(path.join(V6_DIR, "assets", f), "utf8"), ctx, { filename: f });
  return ctx.window;
};

test("ui-rules：导出三池与规则，PA_POINTS 有快速 / 精细档位", () => {
  const { PA_UI, PA_POINTS } = loadRules();
  assert.equal(PA_UI.factors.length, 7);
  for (const k of ["factors", "needs", "components", "rules"]) assert.ok(PA_UI[k], k);
  assert.ok(PA_UI.rules.factorToNeed.every((r) => PA_UI.needs[r.need]), "规则里的需求都在需求池里");
  assert.equal(PA_POINTS.cost("生图", "fast"), 20);
  assert.ok(PA_POINTS.cost("生图", "fine") > PA_POINTS.cost("生图", "fast"));
  assert.equal(PA_POINTS.cost("视频", "fast", 10), 20, "视频按秒数 × 档位");
});

test("uiConfig 单元：p1 孩子优先、详细；p3 简洁、语音；p4 大字、少槽位；三者槽位顺序互不相同", () => {
  const { PA_UI, PA_PERSONAS } = loadRules();
  const c = (p) => PA_UI.uiConfig(PA_PERSONAS[p][30].uiFactors);
  const [p1, p3, p4] = [c("p1"), c("p3"), c("p4")];
  for (const cfg of [p1, p3, p4]) for (const k of ["slotOrder", "density", "fontScale", "wording", "inputDefault"]) assert.ok(k in cfg, k);
  assert.ok(p1.needs.includes("childFirst"));
  assert.equal(p1.density, "detailed");
  assert.equal(p3.density, "compact");
  assert.equal(p3.inputDefault, "voice");
  assert.equal(p1.inputDefault, "text");
  assert.ok(p4.fontScale > 1);
  assert.ok(p4.slotOrder.length < p1.slotOrder.length, "p4 槽位更少");
  assert.equal(p4.wording, "plain");
  const keys = [p1, p3, p4].map((x) => x.slotOrder.join(","));
  assert.equal(new Set(keys).size, 3, keys.join(" | "));
  // 只调已有参数：槽位都来自已有区块
  for (const cfg of [p1, p3, p4]) for (const s of cfg.slotOrder) assert.ok(PA_UI.SLOTS.includes(s));
});

test("uiConfig 单元：改因素或改映射规则，槽位顺序随之变化", () => {
  const { PA_UI, PA_PERSONAS } = loadRules();
  const f = JSON.parse(JSON.stringify(PA_PERSONAS.p1[30].uiFactors));
  const before = PA_UI.uiConfig(f).slotOrder.join(",");
  f.roles = ["产品经理"];
  assert.notEqual(PA_UI.uiConfig(f).slotOrder.join(","), before, "去掉家长角色后顺序变化");
  f.digital = "低";
  assert.deepEqual([...PA_UI.uiConfig(f).slotOrder], [...PA_UI.components.slotOrder.fewSlots]);
  // 改映射：把“家长 → 孩子优先”规则去掉
  const R = { ...PA_UI.rules, factorToNeed: PA_UI.rules.factorToNeed.filter((r) => r.need !== "childFirst") };
  const p1f = PA_PERSONAS.p1[30].uiFactors;
  assert.notEqual(PA_UI.uiConfig(p1f, R).slotOrder.join(","), PA_UI.uiConfig(p1f).slotOrder.join(","));
  assert.deepEqual([...PA_UI.uiConfig({}).slotOrder], [...PA_UI.components.slotOrder.default], "空因素给默认排版");
});

test("首页：p1、p3、p4 第 30 天槽位顺序互不相同；p4 大字样式类；p3 默认语音输入", async () => {
  const got = {};
  for (const id of ["p1", "p3", "p4"]) {
    const p = await open(id);
    try {
      await tick();
      assert.deepEqual(p.errors, [], id);
      got[id] = slotOrder(p.document);
      assert.deepEqual(got[id], [...p.window.PA.uiConfig(p.state().uiFactors).slotOrder].filter((s) => p.document.querySelector(`#butler .home-${s}`)), id);
      const b = p.document.body;
      if (id === "p4") { assert.ok(b.classList.contains("ui-large"), "p4 大字"); assert.ok(!p.document.querySelector("#butler .home-watch:not(.hidden)"), "p4 少槽位"); }
      else assert.ok(!b.classList.contains("ui-large"), id);
      if (id === "p3") {
        assert.ok(b.classList.contains("ui-compact"));
        assert.equal(b.dataset.input, "voice");
        assert.ok(p.document.querySelector(".composer .mic").classList.contains("default"));
      }
      assert.equal(b.dataset.input, id === "p1" ? "text" : "voice", id);
      if (id === "p1") assert.ok(b.classList.contains("ui-detailed"));
      // 导航位置固定
      assert.equal(p.document.querySelectorAll(".sidebar .nav-group .nav-item").length, 5);
    } finally {
      p.close();
    }
  }
  assert.equal(new Set(Object.values(got).map((x) => x.join(","))).size, 3, JSON.stringify(got));
});

test("首页：修改界面因素后重新应用，槽位顺序随之变化", async () => {
  const p = await open("p1");
  try {
    await tick();
    const before = slotOrder(p.document).join(",");
    p.window.PA.state.uiFactors.infoPref = "简洁";
    p.window.PA.state.uiFactors.roles = [];
    p.window.PA.applyUi();
    assert.notEqual(slotOrder(p.document).join(","), before);
    assert.ok(p.document.body.classList.contains("ui-compact"));
    p.window.PA.state.uiFactors.digital = "低";
    p.window.PA.state.uiFactors.age = "60-70";
    p.window.PA.applyUi();
    assert.ok(p.document.body.classList.contains("ui-large"));
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

const posterCard = (doc) => doc.querySelector('#butler .pa-card[data-delivery-id="p4-d-qixi"]');
const modal = (doc) => doc.querySelector(".modal-mask .pt-confirm")?.closest(".modal-mask") ?? null;
const btn = (m, label) => [...m.querySelectorAll(".modal-foot button")].find((b) => b.textContent === label);

test("p4 海报：草稿不扣点；弹确认显示消耗与剩余；取消不变", async () => {
  const p = await open("p4", 30, "&moment=p4-qixi");
  try {
    await tick();
    const s0 = p.state().points;
    const card = posterCard(p.document);
    assert.ok(card.querySelector(".pc-poster").textContent.includes("草稿不扣点"));
    card.querySelector('[data-c="poster"]').click();
    const m = modal(p.document);
    assert.ok(m, "应弹确认框");
    assert.match(m.textContent, /约消耗 20 点，本月还剩 120 点/);
    assert.ok(m.textContent.includes("快速") && m.textContent.includes("精细"));
    assert.deepEqual(p.state().points, s0, "确认前点数不变");
    btn(m, "取消").click();
    assert.equal(modal(p.document), null);
    assert.deepEqual(p.state().points, s0, "取消不变");
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("p4 海报：确认后按档位扣点并写记录（快速 20、精细 40）", async () => {
  for (const [tier, cost] of [["fast", 20], ["fine", 40]]) {
    const p = await open("p4", 30, "&moment=p4-qixi");
    try {
      await tick();
      const { balance, log } = p.state().points;
      posterCard(p.document).querySelector('[data-c="poster"]').click();
      const m = modal(p.document);
      const r = m.querySelector(`input[name="pt-tier"][value="${tier}"]`);
      r.checked = true;
      r.dispatchEvent(new p.window.Event("change"));
      assert.match(m.querySelector(".pt-line").textContent, new RegExp(`约消耗 ${cost} 点`));
      btn(m, "确认生成").click();
      await tick();
      const pts = p.state().points;
      assert.equal(pts.balance, balance - cost, tier);
      assert.equal(pts.log.length, log.length + 1);
      assert.equal(pts.log.at(-1).cost, cost);
      assert.equal(pts.log.at(-1).ability, "生图");
      assert.ok(posterCard(p.document).querySelector(".pt-done"), "显示已生成");
      assert.deepEqual(p.errors, []);
    } finally {
      p.close();
    }
  }
});

test("p4 海报：生成失败不扣点", async () => {
  const p = await open("p4", 30, "&moment=p4-qixi");
  try {
    await tick();
    const s0 = p.state().points;
    posterCard(p.document).querySelector('[data-c="poster"]').click();
    const m = modal(p.document);
    m.querySelector("[data-fail]").checked = true;
    btn(m, "确认生成").click();
    await tick();
    assert.deepEqual(p.state().points, s0);
    assert.ok(posterCard(p.document).querySelector(".pt-failed"));
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});
