import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { loadPage, relTarget, stateKey, V5_DIR } from "./helpers.mjs";

const V = "v5";
const pages = readdirSync(V5_DIR).filter((f) => f.endsWith(".html")).sort();
const LOGIN_PAGES = ["index.html", "forgot.html"];
const sessionFor = (name) => (LOGIN_PAGES.includes(name) ? undefined : name.startsWith("admin-") ? "admin@demo.com" : "lily@demo.com");

test("v5 包含全部页面", () => {
  for (const p of ["index.html", "home.html", "todos.html", "todo.html", "files.html", "inbox.html", "profile.html", "admin-users.html"]) assert.ok(pages.includes(p), p);
});

for (const name of pages) {
  test(`v5 冒烟：${name}`, async () => {
    const p = await loadPage(name, { session: sessionFor(name), version: V });
    try {
      assert.deepEqual(p.errors, []);
      const text = p.document.body.textContent;
      if (name === "reminders.html") {
        const meta = p.document.querySelector('meta[http-equiv="refresh"]');
        assert.ok(meta, "缺少跳转 meta");
        assert.equal(relTarget(meta.content.split("url=")[1].trim(), V), "home.html");
        assert.ok(!text.includes("原型 v4"));
        return;
      }
      assert.deepEqual(p.navigations, [], "页面不应跳转");
      assert.ok(text.includes("原型 v5"), "页面应含“原型 v5”");
      assert.ok(!text.includes("原型 v4"), "页面不应含“原型 v4”");
    } finally {
      p.close();
    }
  });
}

test("v5 使用独立的演示数据键", async () => {
  const p = await loadPage("home.html", { session: "lily@demo.com", version: V });
  try {
    assert.deepEqual(p.errors, []);
    assert.equal(stateKey(V), "pa_ITER1_v5");
    assert.ok(p.window.localStorage.getItem("pa_ITER1_v5"));
    assert.equal(p.window.localStorage.getItem("pa_ITER1_v4"), null);
    assert.equal(p.state().session.email, "lily@demo.com");
  } finally {
    p.close();
  }
});

test("v5 未登录访问会跳转到登录页", async () => {
  const p = await loadPage("todos.html", { version: V });
  try {
    assert.deepEqual(p.navigations.map((h) => relTarget(h, V)), ["index.html"]);
  } finally {
    p.close();
  }
});

test("菜单收起/展开按钮是图标，title 随状态切换并记住", async () => {
  const p = await loadPage("home.html", { session: "lily@demo.com", version: V });
  let navExpanded;
  try {
    assert.deepEqual(p.errors, []);
    const btn = () => p.document.querySelector("#nav-toggle");
    const sidebar = () => p.document.querySelector(".sidebar");
    const check = (open) => {
      const b = btn();
      assert.ok(b.querySelector("svg"), "按钮应含 svg 图标");
      assert.ok(!/[»«]/.test(b.textContent), "不应含 » «");
      assert.equal(b.title, open ? "收起菜单" : "展开菜单");
      assert.equal(sidebar().classList.contains("collapsed"), !open);
      if (open) assert.ok(b.textContent.includes("收起菜单"), "展开时显示“收起菜单”文字");
    };
    const iconOf = () => btn().querySelector("svg").innerHTML;
    check(false);
    const collapsedIcon = iconOf();
    btn().click();
    check(true);
    assert.notEqual(iconOf(), collapsedIcon, "两种状态图标方向不同");
    assert.equal(p.state().prefs.navExpanded, true);
    navExpanded = p.state();
  } finally {
    p.close();
  }
  // 重新打开页面仍是展开状态
  const p2 = await loadPage("todos.html", { session: "lily@demo.com", version: V, state: navExpanded });
  try {
    assert.deepEqual(p2.errors, []);
    const b = p2.document.querySelector("#nav-toggle");
    assert.equal(b.title, "收起菜单");
    assert.ok(!p2.document.querySelector(".sidebar").classList.contains("collapsed"));
    b.click();
    assert.equal(b.title, "展开菜单");
    assert.equal(p2.state().prefs.navExpanded, false);
  } finally {
    p2.close();
  }
});
