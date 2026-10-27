import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadPage, relTarget, V4_DIR } from "./helpers.mjs";

const TODAY = "2026-03-04";
const USER_PAGES = ["home.html", "todos.html", "files.html", "profile.html"];

test("菜单默认收成图标栏，名称放在 title 上", async () => {
  const p = await loadPage("todos.html", { session: "lily@demo.com", today: TODAY });
  try {
    assert.deepEqual(p.errors, []);
    const side = p.document.querySelector(".sidebar");
    assert.ok(side.classList.contains("collapsed"));
    assert.ok(p.document.body.classList.contains("nav-collapsed"));
    const items = [...side.querySelectorAll("a.nav-item")];
    assert.ok(items.length >= 4);
    for (const a of items) assert.ok(a.title, `缺少 title：${a.href}`);
    assert.equal(p.document.querySelector("#nav-toggle .ico").textContent, "»");
  } finally {
    p.close();
  }
});

test("点 » 展开并写入 localStorage，重新加载和换页后保持；再点 « 收起", async () => {
  const p1 = await loadPage("todos.html", { session: "lily@demo.com", today: TODAY });
  let saved;
  try {
    p1.document.querySelector("#nav-toggle").click();
    assert.ok(!p1.document.querySelector(".sidebar").classList.contains("collapsed"));
    assert.ok(!p1.document.body.classList.contains("nav-collapsed"));
    assert.equal(p1.document.querySelector("#nav-toggle .ico").textContent, "«");
    saved = p1.state();
    assert.equal(saved.prefs.navExpanded, true);
  } finally {
    p1.close();
  }
  for (const name of ["todos.html", "files.html"]) {
    const p2 = await loadPage(name, { session: "lily@demo.com", today: TODAY, state: saved });
    try {
      assert.ok(!p2.document.querySelector(".sidebar").classList.contains("collapsed"), name);
      if (name === "files.html") {
        p2.document.querySelector("#nav-toggle").click();
        assert.ok(p2.document.querySelector(".sidebar").classList.contains("collapsed"));
        assert.equal(p2.state().prefs.navExpanded, false);
      }
    } finally {
      p2.close();
    }
  }
});

test("菜单和链接里没有“待确认”和 inbox.html", async () => {
  for (const [name, session] of [...USER_PAGES.map((n) => [n, "lily@demo.com"]), ["admin-users.html", "admin@demo.com"]]) {
    const p = await loadPage(name, { session, today: TODAY });
    try {
      assert.deepEqual(p.errors, [], name);
      for (const a of p.document.querySelectorAll(".sidebar a, .mnav a")) assert.ok(!a.textContent.includes("待确认"), `${name}：${a.textContent}`);
      for (const a of p.document.querySelectorAll("a[href]")) assert.notEqual(relTarget(a.getAttribute("href")), "inbox.html", name);
    } finally {
      p.close();
    }
  }
});

test("inbox.html 跳转到助手页", () => {
  const html = readFileSync(path.join(V4_DIR, "inbox.html"), "utf8");
  const m = html.match(/<meta http-equiv="refresh" content="0; url=([^"]+)">/);
  assert.ok(m, "缺少跳转 meta");
  assert.equal(relTarget(m[1]), "home.html");
});

const todo = (id, title, date, status = "open") => ({ id, title, date, time: "", location: "", status, source: "manual", attachments: [], notes: "", createdAt: "", updatedAt: "", tags: [], records: [] });

test("助手菜单显示今天未完成件数，有逾期时红色", async () => {
  const p0 = await loadPage("todos.html", { session: "lily@demo.com", today: TODAY });
  const base = p0.state();
  p0.close();
  const withTodos = (todos) => ({ ...base, todos });
  const badge = (p) => p.document.querySelector('.sidebar [data-badge="home"]');

  let p = await loadPage("todos.html", { session: "lily@demo.com", today: TODAY, state: withTodos([todo("a", "今天1", TODAY), todo("b", "今天2", TODAY), todo("c", "已完成", TODAY, "done"), todo("d", "明天", "2026-03-05")]) });
  try {
    const b = badge(p);
    assert.equal(b.textContent, "2");
    assert.ok(!b.classList.contains("hidden"));
    assert.ok(!b.classList.contains("overdue"));
    assert.equal(p.document.querySelector('.mnav [data-badge="home"]').textContent, "2");
  } finally {
    p.close();
  }

  p = await loadPage("todos.html", { session: "lily@demo.com", today: TODAY, state: withTodos([todo("a", "今天1", TODAY), todo("e", "逾期", "2026-03-01")]) });
  try {
    const b = badge(p);
    assert.equal(b.textContent, "1");
    assert.ok(b.classList.contains("overdue"));
    assert.match(b.title, /逾期 1/);
  } finally {
    p.close();
  }

  p = await loadPage("todos.html", { session: "lily@demo.com", today: TODAY, state: withTodos([]) });
  try {
    assert.ok(badge(p).classList.contains("hidden"));
  } finally {
    p.close();
  }
});

test("窄屏导航覆盖全部页面", async () => {
  const css = readFileSync(path.join(V4_DIR, "assets/app.css"), "utf8");
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.sidebar \{ display: none; \}/);
  for (const [session, expected] of [["lily@demo.com", USER_PAGES], ["admin@demo.com", [...USER_PAGES, "admin-users.html", "admin-models.html", "admin-system.html", "admin-filetypes.html", "admin-usage.html", "admin-logs.html"]]]) {
    const p = await loadPage("home.html", { session, today: TODAY });
    try {
      const hrefs = [...p.document.querySelectorAll(".mnav a")].map((a) => relTarget(a.getAttribute("href")));
      assert.deepEqual(hrefs.sort(), [...expected].sort(), session);
    } finally {
      p.close();
    }
  }
});
