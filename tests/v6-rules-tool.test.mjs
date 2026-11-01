import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { parseDoc, MODULES, DEFAULT_DOC, DEFAULT_OUT } from "../tools/gen-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = path.join(ROOT, "tools/gen-rules.mjs");
const run = (...args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8" });
const doc = readFileSync(DEFAULT_DOC, "utf8");

test("功能说明含 7 个一级章节", () => {
  const heads = doc.split("\n").filter((l) => /^## \d+\. /.test(l)).map((l) => l.match(/^## (\d+)\./)[1]);
  assert.deepEqual(heads, ["1", "2", "3", "4", "5", "6", "7"]);
  assert.ok(doc.includes("<!-- MAP:BEGIN -->") && doc.includes("<!-- MAP:END -->"));
});

test("19 个模块各至少 3 条规则，无格式错误和重复编号", () => {
  const { rules, errors } = parseDoc(doc);
  assert.deepEqual(errors, []);
  assert.equal(MODULES.length, 19);
  for (const m of MODULES) {
    const n = Object.keys(rules).filter((id) => id.startsWith(`R-${m}-`)).length;
    assert.ok(n >= 3, `${m} 只有 ${n} 条`);
  }
  const ids = [...doc.matchAll(/\*\*(R-[^*]+)\*\*/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(rules["R-画像-01"].section, /^4\.\d+$/);
});

test("--check 通过，rules.js 内容与文档一致", () => {
  const r = run("--check");
  assert.equal(r.status, 0, r.stderr);
  const src = readFileSync(DEFAULT_OUT, "utf8");
  assert.ok(src.startsWith("// 自动生成，勿手改"));
  const ctx = { window: {} };
  vm.runInNewContext(src, ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.PA_RULES)), parseDoc(doc).rules);
  const docOnly = Object.entries(ctx.window.PA_RULES).find(([, v]) => v.docOnly);
  assert.ok(docOnly && !docOnly[1].text.includes("仅文档"));
});

test("临时文档：重复编号、格式错误、不一致都报错", () => {
  mkdirSync("/tmp/stepwise-scratch", { recursive: true });
  const dir = mkdtempSync("/tmp/stepwise-scratch/gen-rules-");
  try {
    const d = path.join(dir, "doc.md");
    const out = path.join(dir, "rules.js");
    writeFileSync(d, "## 4. 规则\n### 4.1 画像\n- **R-画像-01** 甲：内容一\n- **R-画像-01** 乙：内容二\n");
    let r = run("--doc", d, "--out", out);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /编号重复：R-画像-01/);

    writeFileSync(d, "## 4. 规则\n### 4.1 画像\n- **R-画像-1** 甲：内容一\n");
    r = run("--doc", d, "--out", out, "--check");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /格式不对/);

    writeFileSync(d, "## 4. 规则\n### 4.1 画像\n- **R-画像-01** 甲：内容一〔仅文档〕\n");
    assert.equal(run("--doc", d, "--out", out).status, 0);
    assert.equal(run("--doc", d, "--out", out, "--check").status, 0);
    const ctx = { window: {} };
    vm.runInNewContext(readFileSync(out, "utf8"), ctx);
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.PA_RULES)), { "R-画像-01": { title: "甲", text: "内容一", section: "4.1", docOnly: true } });

    writeFileSync(d, "## 4. 规则\n### 4.1 画像\n- **R-画像-01** 甲：内容改了\n");
    r = run("--doc", d, "--out", out, "--check");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /不一致/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("v6 页面加载规则表", async () => {
  const { loadPage, sleep } = await import("./helpers.mjs");
  const p = await loadPage("home.html", { session: "lily@demo.com", version: "v6" });
  try {
    for (let i = 0; i < 50 && !p.window.PA_RULES; i++) await sleep(20);
    assert.deepEqual(p.errors, []);
    assert.ok(p.window.PA_RULES && p.window.PA_RULES["R-冷启动-01"]);
  } finally {
    p.close();
  }
});
