import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { loadPage, relTarget, stateKey, V6_DIR } from "./helpers.mjs";

const V = "v6";
const pages = readdirSync(V6_DIR).filter((f) => f.endsWith(".html")).sort();
const LOGIN_PAGES = ["index.html", "forgot.html"];
const sessionFor = (name) => (LOGIN_PAGES.includes(name) ? undefined : name.startsWith("admin-") ? "admin@demo.com" : "lily@demo.com");

test("v6 包含全部页面", () => {
  for (const p of ["index.html", "home.html", "todos.html", "todo.html", "ideas.html", "idea.html", "files.html", "inbox.html", "profile.html", "admin-users.html"]) assert.ok(pages.includes(p), p);
});

for (const name of pages) {
  test(`v6 冒烟：${name}`, async () => {
    const p = await loadPage(name, { session: sessionFor(name), version: V });
    try {
      assert.deepEqual(p.errors, []);
      const text = p.document.body.textContent;
      assert.ok(!text.includes("原型 v5"), "页面不应含“原型 v5”");
      if (name === "reminders.html") {
        const meta = p.document.querySelector('meta[http-equiv="refresh"]');
        assert.ok(meta, "缺少跳转 meta");
        assert.equal(relTarget(meta.content.split("url=")[1].trim(), V), "home.html");
        return;
      }
      assert.deepEqual(p.navigations, [], "页面不应跳转");
      assert.ok(text.includes("原型 v6"), "页面应含“原型 v6”");
    } finally {
      p.close();
    }
  });
}

test("v6 使用独立的演示数据键", async () => {
  const p = await loadPage("home.html", { session: "lily@demo.com", version: V });
  try {
    assert.deepEqual(p.errors, []);
    assert.equal(stateKey(V), "pa_ITER1_v6");
    assert.ok(p.window.localStorage.getItem("pa_ITER1_v6"));
    assert.equal(p.window.localStorage.getItem("pa_ITER1_v5"), null);
    assert.equal(p.state().session.email, "lily@demo.com");
  } finally {
    p.close();
  }
});

test("v6 一级菜单为管家五项，不含待办事项、想做的事", async () => {
  const p = await loadPage("home.html", { session: "lily@demo.com", version: V });
  try {
    assert.deepEqual(p.errors, []);
    const items = [...p.document.querySelector(".sidebar .nav-group").querySelectorAll(".nav-item")];
    assert.deepEqual(items.map((a) => a.dataset.name), ["管家", "我盯着的事", "交给我的资料", "我了解的你", "设置"]);
    assert.deepEqual(items.map((a) => relTarget(a.getAttribute("href"), V)), ["home.html", "watch.html", "files.html", "me.html", "profile.html"]);
    const navText = [...p.document.querySelectorAll(".sidebar .nav-item, .mnav a")].map((a) => a.textContent).join("|");
    assert.ok(!navText.includes("待办事项"), "一级菜单不应含“待办事项”");
    assert.ok(!navText.includes("想做的事"), "一级菜单不应含“想做的事”");
    assert.equal(p.document.querySelectorAll(".mnav a").length, 5);
    assert.equal(p.document.querySelector("#input").placeholder, "吩咐一声…");
  } finally {
    p.close();
  }
});

test("v6 待办、想做的事页面仍可访问", async () => {
  for (const name of ["todos.html", "ideas.html"]) {
    const p = await loadPage(name, { session: "lily@demo.com", version: V });
    try {
      assert.deepEqual(p.errors, []);
      assert.deepEqual(p.navigations, []);
    } finally {
      p.close();
    }
  }
});

test("v6 未登录访问会跳转到登录页", async () => {
  const p = await loadPage("todos.html", { version: V });
  try {
    assert.deepEqual(p.navigations.map((h) => relTarget(h, V)), ["index.html"]);
  } finally {
    p.close();
  }
});
