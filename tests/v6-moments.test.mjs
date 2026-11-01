// S07：主动时刻与 8 个领域场景（设计 §3.6 完成标准）
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, sleep } from "./helpers.mjs";

const V = "v6";
const DOMAINS = ["出行", "孩子", "家务", "健康", "工作", "学习", "人情", "小店"];
const open = (persona, stage, moment) => {
  const url = `home.html?persona=${persona}&stage=${stage}${moment ? `&moment=${moment}` : ""}`;
  return loadPage("home.html", { session: "lily@demo.com", version: V, url });
};
const proCards = (doc) => [...doc.querySelectorAll("#butler .home-proactive .pa-card")];
const tick = () => sleep(20);

async function listMoments() {
  const p = await open("p1", 30);
  try {
    const P = p.window.PA_PERSONAS;
    const out = [];
    for (const persona of Object.keys(P).sort())
      for (const stage of Object.keys(P[persona]).map(Number).filter((s) => s > 1))
        for (const m of P[persona][stage].moments) out.push({ persona, stage, moment: m.id, label: m.label, dels: P[persona][stage].deliveries.filter((d) => d.moment === m.id) });
    return out;
  } finally {
    p.close();
  }
}

test("每个人物的每个时刻：首页都有主动消息，推送带“📣 推送”和原因，安静的标明不推送，且无脚本错误", async () => {
  const all = await listMoments();
  assert.ok(all.length >= 14, "时刻数量");
  const seenDomains = new Set();
  for (const { persona, stage, moment, label, dels } of all) {
    const p = await open(persona, stage, moment);
    try {
      await tick();
      const tag = `${persona}/${stage}/${label}`;
      assert.deepEqual(p.errors, [], tag);
      const sec = p.document.querySelector("#butler .home-proactive");
      assert.ok(sec, `${tag} 应有主动消息`);
      assert.ok(sec.textContent.includes(label), tag);
      const cs = proCards(p.document);
      assert.ok(cs.length >= 1 && cs.length === dels.length, tag);
      for (const d of dels) {
        const c = sec.querySelector(`.pa-card[data-delivery-id="${d.id}"]`);
        assert.ok(c, `${tag} 卡片 ${d.id}`);
        for (const r of d.rules) assert.ok(c.dataset.rule.includes(r), `${d.id} 规则 ${r}`);
        assert.equal(c.querySelector(".pc-domain").textContent, d.domain, `${d.id} 领域`);
        const mark = c.querySelector(".pc-push");
        assert.ok(mark, `${d.id} 推送标记`);
        assert.equal(c.dataset.push, d.push ? "push" : "quiet");
        if (d.push) {
          assert.ok(mark.textContent.includes("📣 推送"));
          assert.ok(d.pushReason && mark.textContent.includes(d.pushReason), `${d.id} 推送原因`);
        } else {
          assert.ok(!mark.textContent.includes("📣"));
          assert.ok(mark.textContent.includes("安静出现在首页"));
        }
        seenDomains.add(c.querySelector(".pc-domain").textContent);
      }
    } finally {
      p.close();
    }
  }
  for (const d of DOMAINS) assert.ok(seenDomains.has(d), `领域 ${d} 应在卡片中出现`);
});

test("p1 秋假一步到位、体检骨架且含“不做诊断”；p1 与 p2 秋假卡片第一项不同", async () => {
  const p = await open("p1", 30, "d30-trip");
  let p1First;
  try {
    await tick();
    const trip = p.document.querySelector('#butler .home-proactive .pa-card[data-delivery-id="d30-trip"]');
    assert.equal(trip.dataset.depth, "full");
    assert.ok(trip.querySelector(".pc-depth").textContent.includes("一步到位"));
    p1First = trip.querySelector(".pc-body").textContent.split(/[：:]/)[0];
    assert.equal(p1First, "交通行程");
  } finally {
    p.close();
  }
  const c = await open("p1", 30, "d30-checkup");
  try {
    await tick();
    const card = c.document.querySelector('#butler .home-proactive .pa-card[data-delivery-id="d30-checkup"]');
    assert.equal(card.dataset.depth, "skeleton");
    assert.ok(card.querySelector(".pc-depth").textContent.includes("骨架"));
    assert.ok(card.querySelector(".pc-notice").textContent.includes("只做安排和提醒，不做诊断"));
    assert.match(card.dataset.rule, /R-健康-01/);
    card.querySelector('[data-c="expand"]').click();
    await tick();
    const c2 = c.document.querySelector('#butler .pa-card[data-delivery-id="d30-checkup"]');
    assert.ok(c2.querySelector(".pc-notice"), "展开后说明仍在");
  } finally {
    c.close();
  }
  const q = await open("p2", 30, "p2-trip");
  try {
    await tick();
    const trip = q.document.querySelector('#butler .home-proactive .pa-card[data-delivery-id="p2-d-trip"]');
    const first = trip.querySelector(".pc-body").textContent.split(/[：:]/)[0];
    assert.ok(first.includes("行李"));
    assert.notEqual(first, p1First);
  } finally {
    q.close();
  }
});

test("47 天前的想法被重提：点“开始做”生成轻量成品，想做的事状态更新", async () => {
  const p = await open("p1", 30, "d30-mon");
  try {
    await tick();
    assert.deepEqual(p.errors, []);
    const card = p.document.querySelector('#butler .home-proactive .pa-card[data-delivery-id="d30-greet"]');
    assert.ok(card.textContent.includes("47 天前"));
    const btn = card.querySelector('[data-c="start"]');
    assert.equal(btn.textContent, "开始做");
    const idea0 = p.state().ideas.find((i) => i.id === "i-ledger");
    assert.equal((idea0.records || []).length, 0);
    btn.click();
    await tick();
    const s = p.state();
    const idea = s.ideas.find((i) => i.id === "i-ledger");
    assert.equal(idea.progress, "started");
    assert.ok(idea.records[0].text.includes("轻量成品"));
    assert.ok(s.watch.find((w) => w.ideaId === "i-ledger").doing.includes("已开始"));
    const prod = p.document.querySelector('#butler .pa-card[data-delivery-id="d30-ledger-page"]');
    assert.ok(prod, "应出现轻量成品卡片");
    assert.ok(prod.textContent.includes("说明页"));
    const g2 = p.document.querySelector('#butler .pa-card[data-delivery-id="d30-greet"]');
    assert.equal(g2.querySelector('[data-c="start"]'), null);
    assert.ok(g2.textContent.includes("已开始做"));
    assert.deepEqual(p.errors, []);
  } finally {
    p.close();
  }
});

test("人情卡片：祝福图只出草稿，看草稿不扣点", async () => {
  const p = await open("p1", 30, "d30-mombday");
  try {
    await tick();
    const card = p.document.querySelector('#butler .home-proactive .pa-card[data-delivery-id="d30-mombday"]');
    assert.ok(card.querySelector(".pc-notice").textContent.includes("只出草稿，不扣点"));
    const bal = p.state().points.balance;
    const logN = p.state().points.log.length;
    card.querySelector("[data-more]").click();
    await tick();
    const c2 = p.document.querySelector('#butler .pa-card[data-delivery-id="d30-mombday"]');
    assert.ok(c2.querySelector(".pc-more-item").textContent.includes("草稿"));
    assert.equal(p.state().points.balance, bal);
    assert.equal(p.state().points.log.length, logN);
    assert.ok(c2.querySelector(".pc-push"), "重绘后标记仍在");
  } finally {
    p.close();
  }
});
