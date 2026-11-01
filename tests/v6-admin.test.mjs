// S11：后台三个配置页（设计 §3.10 完成标准）
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { loadPage, relTarget, V6_DIR } from "./helpers.mjs";

const V = "v6";
const ADMIN = "admin@demo.com";
const USER = "lily@demo.com";

// 读 ui-rules.js / rules.js 的导出，用页面同源的规则做断言
const loadAssets = () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  for (const f of ["personas-p1.js", "personas-others.js", "ui-rules.js", "rules.js"]) {
    vm.runInContext(readFileSync(path.join(V6_DIR, "assets", f), "utf8"), ctx, { filename: f });
  }
  return ctx.window;
};
const RULE_COUNT = (UI) =>
  (UI.rules.factorToNeed || []).length + Object.values(UI.rules.needToComponent || {}).reduce((n, a) => n + a.length, 0);
const ruleIds = (doc) => [...doc.querySelectorAll("[data-rule]")].flatMap((el) => el.dataset.rule.split(/\s+/)).filter(Boolean);

test("S11：管理员菜单追加领域包、界面三池、点数规则三项", async () => {
  const p = await loadPage("home.html", { session: ADMIN, version: V });
  try {
    assert.deepEqual(p.errors, []);
    const groups = [...p.document.querySelectorAll(".sidebar .nav-group")];
    assert.equal(groups.length, 2, "管理员应有两个菜单分组");
    const admin = [...groups[1].querySelectorAll(".nav-item")];
    const names = admin.map((a) => a.dataset.name);
    for (const n of ["领域包", "界面三池", "点数规则"]) assert.ok(names.includes(n), n);
    const links = admin.map((a) => relTarget(a.getAttribute("href"), V));
    for (const h of ["admin-domains.html", "admin-ui-pools.html", "admin-points.html"]) assert.ok(links.includes(h), h);
    assert.ok(p.document.querySelectorAll(".sidebar .nav-group").length === 2, "旧后台页保留");
    for (const h of ["admin-models.html", "admin-users.html", "admin-logs.html"]) assert.ok(links.includes(h), h);
  } finally {
    p.close();
  }
});

test("S11：一般用户看不到三个配置页", async () => {
  const p = await loadPage("home.html", { session: USER, version: V });
  try {
    assert.deepEqual(p.errors, []);
    assert.equal(p.document.querySelectorAll(".sidebar .nav-group").length, 1);
    const hrefs = [...p.document.querySelectorAll(".sidebar .nav-item")].map((a) => relTarget(a.getAttribute("href"), V));
    for (const h of ["admin-domains.html", "admin-ui-pools.html", "admin-points.html"]) assert.ok(!hrefs.includes(h), h);
  } finally {
    p.close();
  }
  const q = await loadPage("admin-domains.html", { session: USER, version: V });
  try {
    assert.deepEqual(q.navigations.map((h) => relTarget(h, V)), ["home.html"], "非管理员访问后台页应跳回首页");
  } finally {
    q.close();
  }
});

test("S11：admin-domains 显示 8 个领域及帮助清单、触发规则、结果模板、外部数据、评测样例数", async () => {
  const { PA_RULES } = loadAssets();
  const p = await loadPage("admin-domains.html", { session: ADMIN, version: V });
  try {
    assert.deepEqual(p.errors, []);
    const cards = [...p.document.querySelectorAll("#list [data-domain]")];
    assert.equal(cards.length, 8);
    assert.deepEqual(cards.map((c) => c.dataset.domain), ["出行", "孩子", "家务", "健康", "工作", "学习", "人情", "小店"]);
    for (const card of cards) {
      const text = card.textContent;
      for (const label of ["帮助清单", "触发规则", "结果模板", "外部数据"]) assert.ok(text.includes(label), `${card.dataset.domain} 缺 ${label}`);
      assert.ok(text.includes("评测样例"), `${card.dataset.domain} 缺评测样例数`);
      assert.ok(card.querySelectorAll('[data-field="helps"] .tag').length > 0, `${card.dataset.domain} 帮助清单为空`);
      assert.ok(card.querySelector('[data-field="trigger"]').textContent.trim().length > 0);
      assert.ok(card.querySelector('[data-field="template"]').textContent.trim().length > 0);
      assert.ok(card.querySelectorAll('[data-field="external"] .tag').length > 0);
      assert.ok(+card.querySelector("[data-samples]").textContent > 0, `${card.dataset.domain} 评测样例数应为正数`);
      assert.ok(card.dataset.rule, `${card.dataset.domain} 缺 data-rule`);
    }
    assert.equal(+p.document.querySelector("[data-domain-count]").textContent, 8);
    // 页面引用的规则编号都要在功能说明生成的规则表里
    const ids = ruleIds(p.document);
    assert.ok(ids.length >= 8);
    for (const id of ids) assert.ok(PA_RULES[id], `规则编号不存在：${id}`);
    // 8 个领域的规则编号都出现
    for (const d of ["出行", "孩子", "家务", "健康", "工作", "学习", "人情", "小店"]) {
      assert.ok(ids.some((id) => id.startsWith(`R-${d}-`)), `缺 ${d} 的规则编号`);
    }
  } finally {
    p.close();
  }
});

test("S11：admin-ui-pools 显示三池，规则条数与 PA_UI.rules 一致", async () => {
  const { PA_UI } = loadAssets();
  const p = await loadPage("admin-ui-pools.html", { session: ADMIN, version: V });
  try {
    assert.deepEqual(p.errors, []);
    for (const pool of ["factors", "needs", "components", "rules"]) {
      assert.ok(p.document.querySelector(`[data-pool="${pool}"]`), `缺 ${pool} 池`);
    }
    assert.equal(p.document.querySelectorAll('[data-pool="factors"] [data-factor]').length, PA_UI.factors.length);
    assert.equal(p.document.querySelectorAll('[data-pool="factors"] [data-factor]').length, 7);
    assert.equal(p.document.querySelectorAll('[data-pool="needs"] [data-need]').length, Object.keys(PA_UI.needs).length);
    assert.equal(p.document.querySelectorAll('[data-pool="components"] [data-component]').length, Object.keys(PA_UI.components).length);

    const shown = +p.document.querySelector("[data-rule-count]").textContent;
    const expected = RULE_COUNT(PA_UI);
    assert.equal(shown, expected, "显示的规则条数应与 PA_UI.rules 一致");
    assert.equal(p.window.PA_UI.rules.length, expected, "页面回写的 PA_UI.rules.length");
    const rows = p.document.querySelectorAll("[data-rule-table] tr[data-uid]");
    assert.equal(rows.length, expected, "每条规则都应出现在映射表里");
    for (const row of rows) assert.ok(row.dataset.rule, "规则行带 data-rule");

    // 演示试算：切换演示因素后配置随之变化
    const before = p.document.querySelector('[data-config="slotOrder"]').textContent;
    p.document.querySelector('[data-preset-btn="p4"]').click();
    const after = p.document.querySelector('[data-config="slotOrder"]').textContent;
    assert.notEqual(after, before, "切到 p4 后槽位顺序应变化");
    assert.equal(p.document.querySelector('[data-config="fontScale"]').textContent, "1.25");
    assert.equal(p.document.querySelector('[data-config="inputDefault"]').textContent, "voice");
    assert.equal(p.document.querySelector('[data-preset="p4"]').textContent, "p4 店主 · 大字少槽位");
    assert.ok(PA_UI.factors.every((f) => p.document.body.textContent.includes(f.label)), "因素池标签齐全");
  } finally {
    p.close();
  }
});

test("S11：admin-points 读 PA_POINTS，含快速 / 精细档位、扣点、每月赠送、每日上限", async () => {
  const { PA_POINTS } = loadAssets();
  const p = await loadPage("admin-points.html", { session: ADMIN, version: V });
  try {
    assert.deepEqual(p.errors, []);
    const text = p.document.body.textContent;
    assert.ok(text.includes("快速") && text.includes("精细"));
    for (const [key, a] of Object.entries(PA_POINTS.abilities)) {
      assert.ok(p.document.querySelector(`[data-ability="${key}"]`), `缺能力：${key}`);
      for (const [tier, t] of Object.entries(a.tiers)) {
        const row = p.document.querySelector(`[data-ability-row="${key}"][data-tier="${tier}"]`);
        assert.ok(row, `${key} 缺 ${tier} 档`);
        assert.ok(row.textContent.includes(String(t.cost)), `${key} ${tier} 扣点应为 ${t.cost}`);
        if (a.perSecond) assert.ok(row.textContent.includes("点 / 秒"), "视频按秒");
        assert.ok(row.dataset.rule, "档位行带 data-rule");
      }
    }
    assert.equal(p.document.querySelector("[data-daily-limit]").textContent, String(PA_POINTS.dailyLimit));
    assert.equal(p.document.querySelector("[data-free-tweaks]").textContent, String(PA_POINTS.freeTweaks));
    assert.equal(+p.document.querySelector("[data-monthly]").textContent, p.state().points.monthly);
    assert.ok(text.includes("每月赠送"), "应写明会员每月赠送");
    assert.ok(text.includes("不自动付费生成"));
    const ids = ruleIds(p.document);
    const { PA_RULES } = loadAssets();
    for (const id of ids) assert.ok(PA_RULES[id], `规则编号不存在：${id}`);
  } finally {
    p.close();
  }
});
