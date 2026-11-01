// S09：按意思搜索与周报出处（设计 §3.8 完成标准）
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage, waitFor } from "./helpers.mjs";

const V = "v6";
const open = (url, opts = {}) => loadPage(url.split("?")[0], { session: "lily@demo.com", version: V, url, ...opts });
const total = (doc) => +doc.querySelector("#sem .sem-total").textContent;
const btnByText = (root, re) => [...root.querySelectorAll("button")].find((b) => re.test(b.textContent));

test("规则模拟：planQuery 出查询计划标签，runQuery 按类型分组", async () => {
  const p = await open("files.html?persona=p1&stage=30");
  try {
    assert.deepEqual(p.errors, []);
    const { PA } = p.window;
    const plan = PA.planQuery("今年一个 30 岁左右女博主讲 AI 泡沫的视频");
    const labels = plan.map((t) => t.label);
    assert.ok(labels.includes("今年") && labels.includes("视频") && labels.includes("AI 泡沫"), labels.join("|"));
    const sp = plan.find((t) => t.type === "speaker");
    assert.ok(sp && sp.sortOnly, "主讲人估计只用于排序");
    const r = PA.runQuery(plan);
    assert.deepEqual(r.groups.map((g) => g.kind).join(","), "video");
    assert.equal(r.elapsed, "用时 1.2 秒");
    // 估计属性不过滤：去掉主讲人标签后结果数不变
    assert.equal(PA.runQuery(plan.filter((t) => t !== sp)).total, r.total);
  } finally {
    p.close();
  }
});

test("资料页：搜索框下说明能搜什么，并给出两个示例问法", async () => {
  const p = await open("files.html?persona=p1&stage=30");
  try {
    const can = p.document.querySelector("#sem .sem-can");
    assert.ok(can, "应有能搜什么说明");
    for (const w of ["说过的话", "画面里的字", "场景和人物"]) assert.ok(can.textContent.includes(w), w);
    assert.equal(can.querySelectorAll("[data-sem-ex]").length, 2);
  } finally {
    p.close();
  }
});

test("样例 a：先提示纳木错在西藏、给两个改正选项；人脸未开启先弹同意卡片；最后结果含视频和照片", async () => {
  const p = await open("files.html?persona=p1&stage=30");
  try {
    assert.deepEqual(p.errors, []);
    assert.equal(p.state().consents.face, false);
    const doc = p.document;
    doc.querySelector('[data-sem-ex="a"]').click();
    assert.ok(doc.querySelector("#sem .sem-plan .sem-tag"), "应显示查询计划标签");
    const fix = doc.querySelector("#sem .sem-fix");
    assert.ok(fix && fix.textContent.includes("纳木错在西藏"), "应先提示纳木错在西藏");
    const opts = [...fix.querySelectorAll("[data-fix]")].map((b) => b.textContent);
    assert.equal(opts.length, 2);
    assert.ok(opts.some((t) => t.includes("赛里木湖")) && opts.some((t) => t.includes("连着走")), opts.join("|"));
    assert.equal(doc.querySelector("#sem .sem-group"), null, "纠错前不直接给结果");
    btnByText(fix, /连着走/).click();
    const consent = doc.querySelector("#sem .sem-consent");
    assert.ok(consent, "人脸未开启时先出现同意卡片");
    assert.equal(doc.querySelector("#sem .sem-group"), null);
    consent.querySelector('[data-face="yes"]').click();
    assert.equal(p.state().consents.face, true);
    const kinds = [...doc.querySelectorAll("#sem .sem-group")].map((g) => g.dataset.kind);
    assert.ok(kinds.includes("video") && kinds.includes("photo"), kinds.join("|"));
    const video = doc.querySelector('#sem .sem-group[data-kind="video"]');
    assert.ok(video.textContent.includes("纳木错") && video.textContent.includes("12:34"), "定位到时刻");
    const photos = doc.querySelectorAll('#sem .sem-group[data-kind="photo"] .sem-item');
    assert.ok(photos.length >= 2, "多次新疆行程中的照片");
    assert.ok(doc.querySelector("#sem .sem-time").textContent.includes("用时 1.2 秒"));
  } finally {
    p.close();
  }
});

test("样例 b：第一条为指定视频并说明主讲人估计，其余仍在结果里并标“只是提到”", async () => {
  const p = await open("files.html?persona=p1&stage=30");
  try {
    const doc = p.document;
    doc.querySelector('[data-sem-ex="b"]').click();
    assert.equal(doc.querySelector("#sem .sem-consent"), null);
    const items = [...doc.querySelectorAll("#sem .sem-item")];
    assert.ok(items.length > 1, "结果总数大于 1");
    assert.equal(items[0].dataset.id, "s-v-ai-f30");
    assert.ok(items[0].textContent.includes("主讲人估计：女性，约 30 岁；主要在讲 AI 泡沫（占 80%）"));
    items.slice(1).forEach((it) => assert.ok(it.textContent.includes("只是提到"), it.dataset.id));
    assert.ok(items.some((it) => it.textContent.includes("男")) || items.length >= 3);
  } finally {
    p.close();
  }
});

test("点掉一个查询计划标签后结果重新计算，结果数变化", async () => {
  const p = await open("files.html?persona=p1&stage=30");
  try {
    const doc = p.document;
    doc.querySelector('[data-sem-ex="b"]').click();
    const before = total(doc);
    const tags = [...doc.querySelectorAll("#sem .sem-tag")];
    const year = tags.find((t) => t.textContent.includes("今年"));
    year.querySelector("[data-x]").click();
    assert.ok(doc.querySelector("#sem .sem-tag.off"), "标签显示为已点掉");
    assert.notEqual(total(doc), before);
  } finally {
    p.close();
  }
});

test("周报每句都有出处标签，点开显示来源标题；只引用待办和笔记", async () => {
  const p = await open("home.html?persona=p1&stage=30&moment=d30-fri");
  try {
    assert.deepEqual(p.errors, []);
    const card = await waitFor(() => {
      const c = p.document.querySelector('#butler .pa-card[data-delivery-id="d30-weekly"]');
      return c && c.querySelector(".wk-src") && c;
    }, { label: "周报出处" });
    const d = p.state().deliveries.find((x) => x.id === "d30-weekly");
    const lines = card.querySelectorAll(".wk-line");
    assert.equal(lines.length, d.sources.length);
    lines.forEach((l) => assert.ok(l.querySelector(".wk-src"), "每句有出处标签"));
    d.sources.forEach((s) => assert.ok(["待办", "笔记"].includes(s.kind), s.kind));
    lines.forEach((l, i) => {
      l.querySelector(".wk-src").click();
      const pop = card.querySelector(".wk-pop");
      assert.ok(!pop.classList.contains("hidden"));
      assert.ok(pop.textContent.includes(d.sources[i].title));
    });
  } finally {
    p.close();
  }
});
