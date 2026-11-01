// S06：管家首页三个阶段与结果卡片组件（设计 §3.5 完成标准）
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, sleep } from "./helpers.mjs";

const V = "v6";
const open = (url, opts = {}) => loadPage(url.split("?")[0], { session: "lily@demo.com", version: V, url, ...opts });
const cards = (doc) => [...doc.querySelectorAll("#butler .pa-card")];

test("第 1 天首页只问第一件事，没有历史对话", async () => {
  const p = await open("home.html?persona=p1&stage=1");
  try {
    assert.deepEqual(p.errors, []);
    await sleep(30);
    const text = p.document.querySelector("#butler").textContent;
    assert.ok(text.includes("这周最想搞定的一件事"));
    assert.equal(p.document.querySelectorAll("#butler [data-ex]").length, 4);
    assert.equal(p.document.querySelectorAll("#msgs .msg").length, 0, "不应有对话");
    assert.equal(p.document.querySelector("#butler .pa-card"), null);
  } finally {
    p.close();
  }
});

test("点第一个例子：当场出结果卡和一个追问；选项后卡片文字更新、画像加 1 条", async () => {
  const p = await open("home.html?persona=p1&stage=1");
  try {
    const n0 = p.state().profile.length;
    p.document.querySelector("#butler [data-ex]").click();
    const [card] = cards(p.document);
    assert.ok(card, "应出现结果卡片");
    assert.ok(card.dataset.rule.includes("R-冷启动-02"));
    assert.ok(card.querySelector(".pc-because").textContent.includes("因为"));
    assert.equal(card.querySelectorAll(".pc-ask").length, 1);
    const opts = card.querySelectorAll("[data-ans]");
    assert.ok(opts.length >= 2 && opts.length <= 3);
    const before = card.querySelector(".pc-body").textContent;
    opts[1].click();
    const after = cards(p.document)[0];
    assert.notEqual(after.querySelector(".pc-body").textContent, before, "卡片文字应变化");
    assert.equal(p.state().profile.length, n0 + 1);
    assert.match(after.querySelector(".pc-noted").textContent, /我记下了：.+，可以随时改/);
    assert.equal(after.querySelector(".pc-ask"), null);
  } finally {
    p.close();
  }
});

test("第 1 天直接输入第一件事也会当场给结果", async () => {
  const p = await open("home.html?persona=p1&stage=1");
  try {
    const input = p.document.querySelector("#input");
    input.value = "周末想把周报写完";
    p.document.querySelector("#send").click();
    const [card] = cards(p.document);
    assert.ok(card.textContent.includes("周报"));
    assert.equal(p.document.querySelectorAll("#msgs .msg.me").length, 0, "不走普通对话");
  } finally {
    p.close();
  }
});

test("首次涉及孩子信息弹同意卡；拒绝后不记孩子画像，同意则记", async () => {
  for (const ok of [false, true]) {
    const p = await open("home.html?persona=p1&stage=1");
    try {
      const n0 = p.state().profile.length;
      p.document.querySelector('#butler [data-ex="ptm"]').click();
      cards(p.document)[0].querySelector("[data-ans]").click();
      const cc = p.document.querySelector("#butler .consent-card");
      assert.ok(cc, "应弹出同意卡片");
      assert.match(cc.dataset.rule, /R-收集-05/);
      cc.querySelector(`[data-consent="${ok ? "yes" : "no"}"]`).click();
      const s = p.state();
      assert.equal(s.consents.child, ok);
      assert.ok(s.consents.childAsked);
      if (ok) assert.equal(s.profile.length, n0 + 1);
      else assert.equal(s.profile.filter((x) => x.sensitive === "child").length, 0, "拒绝后不留孩子画像");
      assert.equal(p.document.querySelector("#butler .consent-card"), null);
    } finally {
      p.close();
    }
  }
});

test("第 7 天：顶部盯事和待决定数量，家长会前一晚出现主动消息", async () => {
  const p = await open("home.html?persona=p1&stage=7&moment=d7-ptm");
  try {
    assert.deepEqual(p.errors, []);
    const top = p.document.querySelector("#butler .home-top").textContent;
    assert.match(top, /替你盯着的 \d+ 件事/);
    assert.match(top, /需要你决定的 \d+ 件事/);
    const pro = p.document.querySelector("#butler .home-proactive");
    assert.ok(pro, "应有主动消息");
    assert.ok(pro.textContent.includes("家长会"));
    assert.ok(pro.querySelector('.pa-card[data-delivery-id="d7-ptm"]'));
  } finally {
    p.close();
  }
});

test("第 30 天：完整管家汇报，含“本周替你省下”与三块内容；卡片都带 data-rule", async () => {
  const p = await open("home.html?persona=p1&stage=30&moment=d30-trip");
  try {
    assert.deepEqual(p.errors, []);
    const b = p.document.querySelector("#butler");
    assert.ok(b.textContent.includes("本周替你省下"));
    for (const t of ["替你做好的", "替你盯着的", "需要你决定的"]) assert.ok(b.textContent.includes(t), t);
    const cs = cards(p.document);
    assert.ok(cs.length >= 6);
    cs.forEach((c) => assert.ok(c.dataset.rule && c.dataset.rule.trim(), c.dataset.deliveryId));
    assert.ok(p.document.querySelector('#butler .home-proactive .pa-card[data-delivery-id="d30-trip"]'));
  } finally {
    p.close();
  }
});

test("骨架卡点“展开看完整版”后出现完整版内容", async () => {
  const p = await open("home.html?persona=p1&stage=30");
  try {
    const card = p.document.querySelector('#butler .pa-card[data-depth="skeleton"]');
    assert.ok(card.textContent.includes("先给你个大概，展开看完整版"));
    const id = card.dataset.deliveryId;
    card.querySelector('[data-c="expand"]').click();
    const c2 = p.document.querySelector(`#butler .pa-card[data-delivery-id="${id}"]`);
    assert.equal(c2.dataset.depth, "full");
    assert.ok(c2.querySelector(".pc-body").textContent.includes("：") && c2.querySelector('[data-c="expand"]') === null);
    assert.ok(p.state().deliveries.find((d) => d.id === id).expanded);
  } finally {
    p.close();
  }
});

test("点“还可以帮你”：展开内容并记一条职责信号", async () => {
  const p = await open("home.html?persona=p1&stage=30");
  try {
    const n0 = p.state().feedback.length;
    const card = p.document.querySelector('#butler .pa-card[data-delivery-id="d30-trip"]');
    card.querySelector("[data-more]").click();
    const fb = p.state().feedback;
    assert.equal(fb.length, n0 + 1);
    assert.deepEqual([fb.at(-1).action, fb.at(-1).signal, fb.at(-1).deliveryId], ["more", "职责:出行", "d30-trip"]);
    const c2 = p.document.querySelector('#butler .pa-card[data-delivery-id="d30-trip"]');
    assert.ok(c2.querySelector(".pc-more-item").textContent.includes("行李清单"));
  } finally {
    p.close();
  }
});

test("“这个别记”删除对应画像条目并提示", async () => {
  const p = await open("home.html?persona=p1&stage=30");
  try {
    assert.ok(p.state().profile.some((x) => x.key === "家里出行"));
    p.document.querySelector('#butler .pa-card[data-delivery-id="d30-trip"] [data-c="forget"]').click();
    assert.ok(!p.state().profile.some((x) => x.key === "家里出行"));
    assert.ok(p.document.querySelector(".toasts").textContent.includes("不记了"));
    assert.ok(p.document.querySelector('#butler .pa-card[data-delivery-id="d30-trip"]').textContent.includes("已不记"));
  } finally {
    p.close();
  }
});

test("PA.renderCard 可复用；generalMode 为真时不显示“因为…”黄条", async () => {
  const p = await open("home.html?persona=p1&stage=30");
  try {
    const { PA } = p.window;
    const d = { id: "x", domain: "工作", title: "测试卡", depth: "full", body: "内容", because: "因为测试", more: [], rules: ["R-工作-01"] };
    const el = PA.renderCard(d);
    assert.match(el.dataset.rule, /R-工作-01/);
    assert.match(el.dataset.rule, /R-帮什么-05/);
    assert.ok(el.querySelector(".pc-because"));
    assert.equal(PA.renderCard(d, { generalMode: true }).querySelector(".pc-because"), null);
    PA.state.generalMode = true;
    assert.equal(PA.renderCard(d).querySelector(".pc-because"), null);
  } finally {
    p.close();
  }
});
