import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPage } from "./helpers.mjs";

const V = "v5";
const TODAY = "2026-10-29";
// 页面里的数组属于 jsdom 的 realm，比较前转成本进程的普通值
const plain = (x) => JSON.parse(JSON.stringify(x));
const open = () => loadPage("todos.html", { session: "lily@demo.com", version: V, today: TODAY });

async function withPage(fn) {
  const p = await open();
  try {
    assert.deepEqual(p.errors, []);
    await fn(p, p.window.PA);
  } finally {
    p.close();
  }
}

test("v5 演示数据：所有未删除的待办都有 date；期限待办 date = deadline.to、全天", () =>
  withPage((p, PA) => {
    const live = PA.state.todos.filter((t) => t.status !== "deleted");
    assert.ok(live.length > 0);
    for (const t of live) assert.ok(t.date, `待办「${t.title}」缺少 date`);
    for (const title of ["买车险", "更新简历", "预约年底体检"]) {
      const t = live.find((x) => x.title === title);
      assert.ok(t, title);
      assert.ok(t.deadline, `${title} 应保留 deadline`);
      assert.equal(t.date, t.deadline.to);
      assert.equal(t.time, "");
    }
    assert.equal(live.find((x) => x.title === "预约年底体检").date, "2026-12-31");
    for (const title of ["整理家里的旧衣服", "研究新能源车的购车补贴"]) assert.ok(!PA.state.todos.some((t) => t.title === title), `${title} 不应再是待办`);
    assert.deepEqual(plain(PA.upcoming().unscheduled), []);
    // 数据进了 localStorage
    assert.ok(Array.isArray(p.state().ideas) && p.state().ideas.length === PA.state.ideas.length);
  }));

test("v5 演示数据：state.ideas 含演示条目，新能源车保留星标和 2 条想法记录", () =>
  withPage((p, PA) => {
    const titles = PA.state.ideas.map((i) => i.title);
    for (const t of ["整理家里的旧衣服", "研究新能源车的购车补贴", "研究一下保险", "想学游泳", "带孩子去趟云南", "周报可以加个图表", "做个记家里开销的小程序"]) assert.ok(titles.includes(t), t);
    const nev = PA.state.ideas.find((i) => i.title === "研究新能源车的购车补贴");
    assert.equal(nev.starred, true);
    assert.equal(nev.records.length, 2);
    for (const i of PA.state.ideas) {
      for (const k of ["id", "title", "notes", "records", "attachments", "tags", "tagsRemoved", "starred", "status", "source", "createdAt", "updatedAt", "askedDone"]) assert.ok(k in i, `${i.title} 缺 ${k}`);
      assert.equal(i.status, "active");
    }
    // 研究一下保险 关联已有待办“联系平安的客户经理”
    const ins = PA.state.ideas.find((i) => i.title === "研究一下保险");
    assert.deepEqual(plain(PA.linkedTodos(ins).map((t) => t.title)), ["联系平安的客户经理"]);
    assert.equal(PA.ideaById(ins.id), ins);
    // 至少一件超过 90 天没动静
    assert.ok(PA.state.ideas.some((i) => PA.diffDays(TODAY, i.updatedAt.slice(0, 10)) > 90));
    // 预设标签库含“灵光一现”
    assert.ok(PA.PRESET_FULL.includes("灵光一现"));
  }));

test("期限显示：whenText / deadlineText 显示“M/D 前”与“截止”，inDeadlineWindow 基于截止日", () =>
  withPage((p, PA) => {
    const car = PA.state.todos.find((t) => t.title === "买车险");
    assert.equal(car.date, "2026-11-30");
    assert.match(PA.whenText(car), /11\/30 前/);
    assert.match(PA.whenText(car), /截止/);
    assert.match(PA.deadlineText(car), /截止/);
    assert.match(PA.deadlineText(car), /11\/30 前/);
    assert.equal(PA.inDeadlineWindow(car), false);
    const near = { status: "open", date: "2026-11-01", time: "", deadline: { from: TODAY, to: "2026-11-01", label: "本周内" } };
    assert.equal(PA.inDeadlineWindow(near), true);
    assert.match(PA.deadlineText(near), /还剩 3 天/);
    assert.equal(PA.inDeadlineWindow({ ...near, date: "" }), false, "没有 date 的不算");
    assert.equal(PA.inDeadlineWindow({ ...near, deadline: null }), false, "普通待办不算");
    // 普通待办照旧
    const t1 = PA.state.todos.find((t) => t.id === "t1");
    assert.match(PA.whenText(t1), /10月29日/);
    // 时间段归类：parseTodo 给出截止日
    const pt = PA.parseTodo("月底前交房租");
    assert.equal(pt.date, "2026-10-31");
    assert.ok(pt.deadline);
  }));

test("todoFromIdea 生成带 ideaId 的待办，标签一致，ideaProgress 计数正确，updatedAt 更新", () =>
  withPage((p, PA) => {
    const idea = PA.state.ideas.find((i) => i.title === "研究一下保险");
    const before = PA.ideaProgress(idea);
    assert.equal(before.scheduled, 1);
    assert.equal(before.done, 0);
    idea.updatedAt = "2026-01-01 00:00";
    const t = PA.todoFromIdea(idea, { date: "2026-10-31", time: "10:00", title: "周六看三款重疾险" });
    assert.equal(t.ideaId, idea.id);
    assert.equal(t.title, "周六看三款重疾险");
    assert.equal(t.date, "2026-10-31");
    assert.equal(t.time, "10:00");
    assert.deepEqual(plain(t.tags), plain(idea.tags));
    assert.ok(PA.state.todos.includes(t));
    assert.notEqual(idea.updatedAt, "2026-01-01 00:00");
    const t2 = PA.todoFromIdea(idea, { date: "2026-11-04" });
    assert.equal(t2.title, idea.title);
    assert.equal(t2.time, "");
    t2.status = "done";
    const pr = PA.ideaProgress(idea);
    assert.equal(pr.scheduled, 3);
    assert.equal(pr.done, 1);
    assert.match(pr.text, /已排 3 条 · 完成 1/);
    // 想做的事仍在
    assert.ok(PA.ideaById(idea.id));
    assert.ok(p.state().todos.some((x) => x.id === t.id && x.ideaId === idea.id));
  }));

test("todoToIdea：待办消失，新想做的事标题一致，保留想法记录、附件、标签、备注", () =>
  withPage((p, PA) => {
    const todo = PA.state.todos.find((t) => t.title === "预约年底体检");
    const n = PA.state.ideas.length;
    const idea = PA.todoToIdea(todo);
    assert.ok(!PA.state.todos.some((t) => t.id === todo.id));
    assert.ok(!p.state().todos.some((t) => t.id === todo.id));
    assert.equal(PA.state.ideas.length, n + 1);
    assert.equal(idea.title, "预约年底体检");
    assert.equal(idea.source, "todo");
    assert.equal(idea.status, "active");
    assert.deepEqual(plain(idea.records.map((r) => r.text)), plain(todo.records.map((r) => r.text)));
    assert.deepEqual(plain(idea.attachments), ["f4"]);
    assert.deepEqual(plain(idea.tags), plain(todo.tags));
    assert.equal(idea.notes, todo.notes);
    assert.equal(PA.ideaById(idea.id), idea);
  }));

test("灵光一现：演示数据与规则判断；不影响文件和待办的标签；tagsRemoved 不再加回", () =>
  withPage((p, PA) => {
    const byTitle = (t) => PA.state.ideas.find((i) => i.title === t);
    assert.equal(PA.isSpark(byTitle("周报可以加个图表")), true);
    assert.equal(PA.isSpark(byTitle("做个记家里开销的小程序")), true);
    assert.equal(PA.isSpark(byTitle("想学游泳")), false);
    assert.equal(PA.isSpark(byTitle("研究一下保险")), false);
    assert.ok(PA.autoIdeaTags("周报可以加个图表").includes("灵光一现"));
    assert.ok(PA.autoIdeaTags("突然想到店里可以试试会员积分").includes("灵光一现"));
    assert.ok(!PA.autoIdeaTags("想学游泳").includes("灵光一现"));
    assert.ok(!PA.autoIdeaTags("想带孩子去趟云南").includes("灵光一现"));
    // 文件、待办的打标签不受影响
    assert.ok(!PA.autoTags("周报可以加个图表").includes("灵光一现"));
    assert.ok(!PA.autoTags("做个记家里开销的小程序.csv", [], "text").includes("灵光一现"));
    // 用户去掉后不再加回
    const idea = { tagsRemoved: ["灵光一现"] };
    assert.ok(!PA.autoIdeaTags("周报可以加个图表", idea).includes("灵光一现"));
    assert.ok(PA.autoIdeaTags("周报可以加个图表", idea).includes("工作/报告"));
    // 从灵光一现生成的待办：其余标签继承；“灵光一现”只用于想做的事，不带到待办
    const t = PA.todoFromIdea(byTitle("周报可以加个图表"), { date: TODAY });
    assert.ok(t.tags.includes("工作/报告"));
    assert.ok(!t.tags.includes("灵光一现"));
  }));
