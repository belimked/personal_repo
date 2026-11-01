import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { V6_DIR } from "./helpers.mjs";

const load = () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  for (const f of ["rules.js", "personas-p1.js", "personas-others.js"]) vm.runInContext(readFileSync(path.join(V6_DIR, "assets", f), "utf8"), ctx, { filename: f });
  return ctx.window;
};
const { PA_PERSONAS, PA_RULES } = load();
const OTHERS = ["p2", "p3", "p4"];
const EIGHT = ["出行", "孩子", "家务", "健康", "工作", "学习", "人情", "小店"];
const DOMAINS = [...EIGHT, "想做的事"];
const SOURCES = ["told", "file", "todo", "feedback", "meeting"];
const SENSITIVE = [null, "health", "finance", "child", "location", "face"];
const ACTIONS = ["adopt", "edit", "ignore", "reject", "more"];
const firstItem = (d) => d.body.split(/[：:]/)[0];

test("p2/p3/p4 只有第 30 天，字段与 p1 一致", () => {
  const p1Keys = Object.keys(PA_PERSONAS.p1[30]).sort();
  for (const p of OTHERS) {
    assert.deepEqual(Object.keys(PA_PERSONAS[p]), ["30"], p);
    const snap = PA_PERSONAS[p][30];
    assert.deepEqual(Object.keys(snap).sort(), p1Keys, `${p} 字段`);
    assert.equal(snap.stage, 30);
    assert.equal(snap.persona.id, p);
    assert.deepEqual(Object.keys(snap.uiFactors).sort(), Object.keys(PA_PERSONAS.p1[30].uiFactors).sort(), `${p} 界面因素`);
    for (const k of ["balance", "monthly"]) assert.equal(typeof snap.points[k], "number");
    assert.deepEqual(Object.keys(snap.consents).sort(), ["child", "face", "finance", "health", "location"]);
    assert.equal(typeof snap.generalMode, "boolean");
  }
});

test("画像、证据、交付、反馈字段合法", () => {
  for (const p of OTHERS) {
    const snap = PA_PERSONAS[p][30];
    const evIds = new Set(snap.evidence.map((e) => e.id));
    for (const e of snap.evidence) { for (const k of ["id", "kind", "refId", "text", "at"]) assert.ok(e[k], `${p} ${e.id}.${k}`); assert.equal(typeof e.aboutSelf, "boolean"); }
    assert.equal(new Set(snap.profile.map((x) => x.id)).size, snap.profile.length);
    for (const x of snap.profile) {
      assert.ok([1, 2, 3, 4, 5].includes(x.layer) && x.key && x.value && x.updatedAt, `${p} ${x.id}`);
      assert.ok(SOURCES.includes(x.source) && SENSITIVE.includes(x.sensitive), `${p} ${x.id}`);
      assert.ok(["confirmed", "guess", "pending"].includes(x.status) && x.confidence >= 0 && x.confidence <= 1);
      assert.ok(x.evidenceIds.length > 0);
      for (const id of x.evidenceIds) assert.ok(evIds.has(id), `${p} ${x.id} 证据 ${id}`);
    }
    const mIds = new Set(snap.moments.map((m) => m.id));
    for (const d of snap.deliveries) {
      assert.ok(mIds.has(d.moment), `${p} ${d.id} moment`);
      assert.ok(DOMAINS.includes(d.domain), `${p} ${d.id} domain`);
      assert.ok(["skeleton", "full"].includes(d.depth));
      assert.ok(d.title && d.body && d.because);
      for (const m of d.more) assert.ok(m.label && m.body);
      assert.ok(d.rules.length > 0);
      for (const r of d.rules) assert.ok(PA_RULES[r], `${p} ${d.id} 规则 ${r}`);
      assert.equal(typeof d.push, "boolean");
      if (d.push) assert.ok(d.pushReason);
    }
    for (const m of snap.moments) assert.ok(snap.deliveries.some((d) => d.moment === m.id), `${p} 时刻 ${m.label} 无卡片`);
    for (const w of snap.watch) assert.ok(w.id && DOMAINS.includes(w.domain) && w.title && w.doing && w.nextAt);
    for (const f of snap.files) assert.ok(["photo", "audio", "video", "doc"].includes(f.kind));
    for (const f of snap.feedback) assert.ok(ACTIONS.includes(f.action));
  }
});

test("p2：管家里后勤；秋假第一推荐行李与孩子用品，more 为交通、预算；与 p1 第一项不同", () => {
  const p2 = PA_PERSONAS.p2[30];
  assert.ok(p2.profile.some((x) => x.layer === 3 && x.key.includes("管家里后勤") && x.status === "confirmed"));
  const t1 = PA_PERSONAS.p1[30].deliveries.find((d) => d.title.includes("秋假"));
  const t2 = p2.deliveries.find((d) => d.title.includes("秋假"));
  assert.ok(t1 && t2);
  assert.equal(t2.domain, "出行");
  assert.ok(t2.body.startsWith("行李与孩子用品"), "第一项为行李与孩子用品");
  assert.ok(/天气/.test(t2.body) && /\d+ 岁/.test(t2.body), "按天气和孩子年龄");
  assert.deepEqual([...t2.more.map((m) => m.label)], ["交通", "预算"]);
  assert.notEqual(firstItem(t1), firstItem(t2), "p1/p2 秋假第一项不同");
});

test("p3：学习计划 + 社团报名接龙轻量成品；简洁、语音优先", () => {
  const p3 = PA_PERSONAS.p3[30];
  assert.ok(p3.deliveries.some((d) => d.domain === "学习" && d.title.includes("60 天")));
  assert.ok(p3.deliveries.some((d) => d.title.includes("接龙") && d.body.includes("轻量成品")));
  assert.equal(p3.uiFactors.infoPref, "简洁");
  assert.ok(p3.uiFactors.inputPref.includes("语音优先"));
});

test("p4：七夕促销、老客回访、人情；大字、数字熟练度低；点数余额 120", () => {
  const p4 = PA_PERSONAS.p4[30];
  const qixi = p4.deliveries.find((d) => d.title.includes("七夕"));
  assert.ok(qixi && qixi.domain === "小店" && qixi.rules.includes("R-生成-01"));
  assert.ok(p4.deliveries.some((d) => d.domain === "小店" && d.title.includes("30 天没下单")));
  assert.ok(p4.deliveries.some((d) => d.domain === "人情"));
  assert.equal(p4.uiFactors.infoPref, "大字");
  assert.equal(p4.uiFactors.digital, "低");
  assert.equal(p4.points.balance, 120);
});

test("p1–p4 第 30 天卡片合计覆盖 8 个领域", () => {
  const doms = new Set(["p1", ...OTHERS].flatMap((p) => PA_PERSONAS[p][30].deliveries.map((d) => d.domain)));
  for (const d of EIGHT) assert.ok(doms.has(d), `缺领域 ${d}`);
});
