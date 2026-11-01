import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDoc, DEFAULT_DOC } from "../tools/gen-rules.mjs";
import { scanText, scanDir, BEGIN, END, DEFAULT_DIR } from "../tools/rule-map.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = path.join(ROOT, "tools/rule-map.mjs");
const run = (...args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8" });
const doc = readFileSync(DEFAULT_DOC, "utf8");
const mapRows = (text) => text.slice(text.indexOf(BEGIN), text.indexOf(END)).split("\n").filter((l) => /^\| R-/.test(l));

test("--check 通过；对照表行数等于规则总数，列与状态正确", () => {
  const r = run("--check");
  assert.equal(r.status, 0, r.stderr);
  const { rules } = parseDoc(doc);
  const rows = mapRows(doc);
  assert.equal(rows.length, Object.keys(rules).length);
  assert.ok(doc.includes("| 编号 | 标题 | 原型位置 | 阶段 | 状态 |"));
  for (const row of rows) {
    const [id, title, files, stage, status] = row.split("|").slice(1, -1).map((s) => s.trim());
    assert.ok(rules[id], id);
    assert.equal(title, rules[id].title);
    assert.equal(status, rules[id].docOnly ? "仅文档" : "原型已体现");
    assert.match(stage, /^(通用|(1|7|30)(\/(7|30))*)$/, `${id} 阶段 ${stage}`);
    if (!rules[id].docOnly) assert.notEqual(files, "—", `${id} 没有原型位置`);
  }
});

test("每条非〔仅文档〕规则都在原型里被引用，原型引用的编号都在文档里", () => {
  const { rules } = parseDoc(doc);
  const refs = scanDir(DEFAULT_DIR);
  for (const [id, r] of Object.entries(rules)) if (!r.docOnly) assert.ok(refs.has(id), `${id} 未被引用`);
  for (const id of refs.keys()) assert.ok(rules[id], `${id} 不在文档里`);
});

test("scanText：识别 data-rule、dataset.rule、rules 数组，多个编号，按快照和分节推断阶段", () => {
  const refs = scanText([
    '<div data-rule="R-冷启动-01 R-收集-02"></div>',
    "// ---------- 第 7 天 ----------",
    'el.dataset.rule = "R-画像-01";',
    "  const s = { stage: 30, rules: [\"R-出行-01\", \"R-出行-02\"] };",
    "// ---------- 通用 ----------",
    "x = { rules: [额外规则] };",
  ].join("\n"));
  assert.deepEqual(refs.map((r) => [r.id, r.stage]), [
    ["R-冷启动-01", null], ["R-收集-02", null], ["R-画像-01", "7"], ["R-出行-01", "30"], ["R-出行-02", "30"],
  ]);
});

test("演示剧本覆盖 4 个人物和 3 个阶段，页面清单不再有“待补”", () => {
  const s5 = doc.slice(doc.indexOf("## 5. 演示剧本"), doc.indexOf("## 6. 对照表"));
  for (const h of ["### 5.1 第 1 天", "### 5.2 第 7 天", "### 5.3 第 30 天"]) assert.ok(s5.includes(h), h);
  for (const name of ["苏晴", "林舟", "周可", "何姐"]) assert.ok(s5.includes(name), name);
  const ids = s5.match(/R-[^\s、，）～]+-\d{2}/g) || [];
  const { rules } = parseDoc(doc);
  assert.ok(ids.length >= 30);
  for (const id of ids) assert.ok(rules[id], `剧本里的 ${id} 不在文档里`);
  const s3 = doc.slice(doc.indexOf("## 3. 页面清单"), doc.indexOf("## 4. 功能规则"));
  assert.ok(!s3.includes("待补"));
});

test("临时目录：缺引用、未知编号、表过期都报错；重写后通过", () => {
  mkdirSync("/tmp/stepwise-scratch", { recursive: true });
  const dir = mkdtempSync("/tmp/stepwise-scratch/rule-map-");
  try {
    const d = path.join(dir, "doc.md");
    const proto = path.join(dir, "proto");
    mkdirSync(path.join(proto, "assets"), { recursive: true });
    const base = `## 4. 规则\n### 4.1 画像\n- **R-画像-01** 甲：内容一\n- **R-画像-02** 乙：内容二〔仅文档〕\n## 6. 对照表\n${BEGIN}\n${END}\n`;
    writeFileSync(d, base);
    writeFileSync(path.join(proto, "a.html"), '<div data-rule="R-画像-01"></div>');
    let r = run("--doc", d, "--dir", proto, "--check");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /已过期/);
    assert.equal(run("--doc", d, "--dir", proto).status, 0);
    assert.equal(run("--doc", d, "--dir", proto, "--check").status, 0);
    const out = readFileSync(d, "utf8");
    assert.equal(mapRows(out).length, 2);
    assert.ok(out.includes("| R-画像-01 | 甲 | a.html | 通用 | 原型已体现 |"));
    assert.ok(out.includes("| R-画像-02 | 乙 | — | 通用 | 仅文档 |"));

    writeFileSync(path.join(proto, "assets/x.js"), 'const s = { stage: 7, rules: ["R-画像-09"] };');
    r = run("--doc", d, "--dir", proto, "--check");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /不存在的编号：R-画像-09/);

    writeFileSync(path.join(proto, "assets/x.js"), "");
    writeFileSync(path.join(proto, "a.html"), "<div></div>");
    r = run("--doc", d, "--dir", proto, "--check");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /找不到引用：R-画像-01/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
