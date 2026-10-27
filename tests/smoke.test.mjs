import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { loadPage, relTarget, V4_DIR } from "./helpers.mjs";

const pages = readdirSync(V4_DIR).filter((f) => f.endsWith(".html")).sort();
const LOGIN_PAGES = ["index.html", "forgot.html"];

test("v4 包含全部页面", () => {
  for (const p of ["index.html", "home.html", "todos.html", "files.html", "inbox.html", "profile.html", "admin-users.html"]) assert.ok(pages.includes(p), p);
});

for (const name of pages) {
  test(`冒烟：${name}`, async () => {
    const session = LOGIN_PAGES.includes(name) ? undefined : name.startsWith("admin-") ? "admin@demo.com" : "lily@demo.com";
    const p = await loadPage(name, { session });
    try {
      if (name === "reminders.html") {
        const meta = p.document.querySelector('meta[http-equiv="refresh"]');
        assert.ok(meta, "缺少跳转 meta");
        assert.equal(relTarget(meta.content.split("url=")[1].trim()), "home.html");
        return;
      }
      assert.deepEqual(p.errors, []);
      assert.deepEqual(p.navigations, [], "页面不应跳转");
      assert.ok(p.document.body.textContent.includes("原型 v4"), "页面应含“原型 v4”");
      assert.ok(!p.document.body.textContent.includes("原型 v3"));
    } finally {
      p.close();
    }
  });
}

test("PA_TODAY 覆盖今天，数据随之生成", async () => {
  const p = await loadPage("home.html", { session: "lily@demo.com", today: "2026-03-04" });
  try {
    assert.deepEqual(p.errors, []);
    assert.equal(p.window.PA.today(), "2026-03-04");
    assert.equal(p.window.PA.SEED.dayStr(1), "2026-03-05");
    assert.equal(p.state().session.email, "lily@demo.com");
  } finally {
    p.close();
  }
});

test("未登录访问会跳转到登录页", async () => {
  const p = await loadPage("todos.html");
  try {
    assert.deepEqual(p.navigations.map(relTarget), ["index.html"]);
  } finally {
    p.close();
  }
});
