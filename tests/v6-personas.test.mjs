import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { V6_DIR } from "./helpers.mjs";

const load = () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  for (const f of ["rules.js", "personas-p1.js"]) vm.runInContext(readFileSync(path.join(V6_DIR, "assets", f), "utf8"), ctx, { filename: f });
  return ctx.window;
};
const { PA_PERSONAS, PA_RULES } = load();
const p1 = PA_PERSONAS.p1;
const STAGES = [1, 7, 30];
const DOMAINS = ["出行", "孩子", "家务", "健康", "工作", "学习", "人情", "小店", "想做的事"];
const SOURCES = ["told", "file", "todo", "feedback", "meeting"];
const SENSITIVE = [null, "health", "finance", "child", "location", "face"];
const ACTIONS = ["adopt", "edit", "ignore", "reject", "more"];

test("p1 三个阶段快照都存在，字段齐全", () => {
  assert.deepEqual(Object.keys(p1).map(Number).sort((a, b) => a - b), STAGES);
  for (const s of STAGES) {
    const snap = p1[s];
    assert.equal(snap.stage, s);
    for (const k of ["moments", "profile", "evidence", "watch", "files", "deliveries", "feedback"]) assert.ok(Array.isArray(snap[k]), `${s}.${k}`);
    assert.equal(Object.keys(snap.uiFactors).length, 7, `${s} 界面因素 7 个`);
    for (const k of ["balance", "monthly"]) assert.equal(typeof snap.points[k], "number");
    assert.ok(Array.isArray(snap.points.log));
    assert.deepEqual(Object.keys(snap.consents).sort(), ["child", "face", "finance", "health", "location"]);
    assert.equal(typeof snap.generalMode, "boolean");
  }
});

test("画像条目字段合法，证据可追溯", () => {
  for (const s of STAGES) {
    const { profile, evidence } = p1[s];
    const evIds = new Set(evidence.map((e) => e.id));
    for (const e of evidence) for (const k of ["id", "kind", "refId", "text", "at"]) assert.ok(e[k], `${s} 证据 ${e.id}.${k}`);
    for (const e of evidence) assert.equal(typeof e.aboutSelf, "boolean");
    assert.equal(new Set(profile.map((x) => x.id)).size, profile.length, "画像 id 唯一");
    for (const x of profile) {
      assert.ok([1, 2, 3, 4, 5].includes(x.layer), x.id);
      assert.ok(x.key && x.value && x.updatedAt, x.id);
      assert.ok(SOURCES.includes(x.source), `${x.id} source`);
      assert.ok(x.confidence >= 0 && x.confidence <= 1, `${x.id} confidence`);
      assert.ok(["confirmed", "guess", "pending"].includes(x.status), `${x.id} status`);
      assert.ok(SENSITIVE.includes(x.sensitive), `${x.id} sensitive`);
      assert.ok(x.evidenceIds.length > 0, `${x.id} 至少一条证据`);
      for (const id of x.evidenceIds) assert.ok(evIds.has(id), `${s} ${x.id} 证据 ${id} 不存在`);
    }
  }
});

test("画像条目数随阶段递增：第 1 天 ≤2，第 7 天 5～10 且约一半猜测，第 30 天 ≥25", () => {
  const n = STAGES.map((s) => p1[s].profile.length);
  assert.ok(n[0] >= 1 && n[0] <= 2, `第 1 天 ${n[0]}`);
  assert.ok(n[1] >= 5 && n[1] <= 10, `第 7 天 ${n[1]}`);
  assert.ok(n[2] >= 25, `第 30 天 ${n[2]}`);
  assert.ok(n[0] < n[1] && n[1] < n[2]);
  const guess = p1[7].profile.filter((x) => x.status === "guess").length;
  assert.ok(guess / n[1] >= 0.35 && guess / n[1] <= 0.65, `第 7 天猜测 ${guess}/${n[1]}`);
});

test("第 30 天画像覆盖五层、三种状态，出行职责已确认", () => {
  const prof = p1[30].profile;
  assert.deepEqual([...new Set(prof.map((x) => x.layer))].sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual([...new Set(prof.map((x) => x.status))].sort(), ["confirmed", "guess", "pending"]);
  const confirmed = prof.filter((x) => x.status === "confirmed").length;
  assert.ok(confirmed > prof.length / 2, "多数已确认");
  const trip = prof.find((x) => x.layer === 3 && x.key.includes("出行"));
  assert.ok(trip, "有出行职责条目");
  assert.equal(trip.status, "confirmed");
});

test("交付卡片字段合法，规则编号存在，按 moment 关联", () => {
  for (const s of STAGES) {
    const snap = p1[s];
    const mIds = new Set(snap.moments.map((m) => m.id));
    for (const m of snap.moments) assert.ok(m.label && m.at, m.id);
    for (const d of snap.deliveries) {
      assert.ok(mIds.has(d.moment), `${d.id} moment ${d.moment}`);
      assert.ok(DOMAINS.includes(d.domain), `${d.id} domain`);
      assert.ok(["skeleton", "full"].includes(d.depth), `${d.id} depth`);
      assert.ok(d.title && d.body && d.because, d.id);
      assert.ok(Array.isArray(d.more));
      for (const m of d.more) assert.ok(m.label && m.body, `${d.id} more`);
      assert.ok(d.rules.length > 0, `${d.id} rules`);
      for (const r of d.rules) assert.ok(PA_RULES[r], `${d.id} 规则 ${r} 不在 rules.js`);
      assert.equal(typeof d.push, "boolean");
      if (d.push) assert.ok(d.pushReason, `${d.id} 推送须写原因`);
    }
    for (const m of snap.moments) assert.ok(snap.deliveries.some((d) => d.moment === m.id), `${s} 时刻 ${m.label} 无卡片`);
    for (const w of snap.watch) assert.ok(w.id && w.domain && w.title && w.doing && w.nextAt, `${s} watch ${w.id}`);
  }
});

test("时刻：第 7 天有家长会前一晚，第 30 天含 §3.6 的 p1 时刻", () => {
  assert.ok(p1[7].moments.some((m) => m.label === "家长会前一晚"));
  const labels = p1[30].moments.map((m) => m.label);
  for (const l of ["周一 8:30", "周五 16:00", "出发前 3 天", "体检预约前一天", "护照到期前 60 天", "妈妈生日前 5 天"]) assert.ok(labels.includes(l), l);
});

test("第 30 天：秋假出游一步到位且先给交通行程，体检先给骨架且不做诊断", () => {
  const ds = p1[30].deliveries;
  const trip = ds.find((d) => d.title.includes("秋假"));
  assert.ok(trip);
  assert.equal(trip.domain, "出行");
  assert.equal(trip.depth, "full");
  assert.ok(trip.body.startsWith("交通行程"), "第一项为交通行程");
  const check = ds.find((d) => d.title.includes("体检"));
  assert.ok(check);
  assert.equal(check.domain, "健康");
  assert.equal(check.depth, "skeleton");
  assert.ok(check.body.includes("不做诊断"));
  const doms = new Set(ds.map((d) => d.domain));
  for (const d of ["出行", "健康", "工作", "家务", "人情"]) assert.ok(doms.has(d), d);
  assert.ok(ds.some((d) => d.body.includes("47 天前")), "旧想法被重提");
});

test("资料与反馈：少量资料，第 30 天反馈 ≥3 条且动作合法", () => {
  assert.equal(p1[1].files.length, 0, "第 1 天没有资料");
  assert.ok(p1[7].files.length >= 1, "第 7 天第一次上传");
  assert.ok(p1[30].files.length >= 3);
  for (const s of STAGES) for (const f of p1[s].files) assert.ok(["photo", "audio", "video", "doc"].includes(f.kind), f.id);
  assert.ok(p1[30].feedback.length >= 3);
  for (const s of STAGES) for (const f of p1[s].feedback) assert.ok(ACTIONS.includes(f.action), f.id);
});
