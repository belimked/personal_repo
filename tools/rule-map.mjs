#!/usr/bin/env node
// 生成功能说明第 6 节“对照表”：规则编号 → 原型位置 → 阶段 → 状态（只用 Node 标准库）
// 用法：node tools/rule-map.mjs [--check] [--doc <功能说明.md>] [--dir <原型目录>]
// - 扫描原型目录下 html / js 中的规则引用：data-rule="…"、dataset.rule = "…"、rules: […]（可多个编号，空格或逗号分隔）
// - 无参数：重写文档里 <!-- MAP:BEGIN --> 与 <!-- MAP:END --> 之间的对照表
// - --check：非〔仅文档〕规则在原型里找不到引用、原型引用了文档里不存在的编号、对照表过期，任一情况退出码 1
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDoc, DEFAULT_DOC } from "./gen-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_DIR = path.join(ROOT, "public/ITER1/v6");
export const BEGIN = "<!-- MAP:BEGIN -->";
export const END = "<!-- MAP:END -->";
const SKIP = new Set(["assets/rules.js"]); // 生成的规则表本身不算引用
const REF_RE = /data-rule=(["'])([^"']*)\1|dataset\.rule\s*=\s*(["'`])([^"'`]*)\3|\brules:\s*\[([^\]]*)\]/g;
const ID_RE = /R-[^\s"'`,\[\]<>$]+?-\d{2}(?!\d)/g;
const SECTION_RE = /^\s*(?:\/\/|<!--)\s*-{3,}/; // 分节注释：带“第 N 天”就进入该阶段，否则回到通用
const STAGE_RE = /\bstage:\s*(1|7|30)\b|\|\|\s*\{\}\)\[(1|7|30)\]/; // 快照字面量 stage: N，或 (PA_PERSONAS.pX || {})[N]
const STAGES = ["1", "7", "30"];

function listFiles(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else if (/\.(html|js)$/.test(e.name)) out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out.sort();
}

// 扫描一个文件的内容，返回 [{ id, stage, line }]；stage 按所在快照（stage: N / [N]）或分节注释里的“第 N 天”推断，推断不出为 null
export function scanText(text) {
  const refs = [];
  let stage = null;
  text.split(/\r?\n/).forEach((line, i) => {
    if (SECTION_RE.test(line)) { const m = line.match(/第\s*(1|7|30)\s*天/); stage = m ? m[1] : null; }
    const s = line.match(STAGE_RE);
    if (s) stage = s[1] || s[2];
    for (const m of line.matchAll(REF_RE)) {
      const val = m[2] ?? m[4] ?? m[5] ?? "";
      for (const id of val.match(ID_RE) || []) refs.push({ id, stage, line: i + 1 });
    }
  });
  return refs;
}

// 扫描原型目录，返回 Map<id, { files: Set, stages: Set, at: [文件:行] }>
export function scanDir(dir) {
  const map = new Map();
  for (const f of listFiles(dir)) {
    if (SKIP.has(f)) continue;
    for (const r of scanText(readFileSync(path.join(dir, f), "utf8"))) {
      if (!map.has(r.id)) map.set(r.id, { files: new Set(), stages: new Set(), at: [] });
      const e = map.get(r.id);
      e.files.add(f);
      if (r.stage) e.stages.add(r.stage);
      e.at.push(`${f}:${r.line}`);
    }
  }
  return map;
}

const cell = (s) => String(s).replace(/\|/g, "\\|");

export function renderTable(rules, refs) {
  const rows = Object.entries(rules).map(([id, r]) => {
    const e = refs.get(id);
    const files = e ? [...e.files].join("、") : "—";
    const stages = e && e.stages.size ? STAGES.filter((s) => e.stages.has(s)).join("/") : "通用";
    const status = r.docOnly ? "仅文档" : "原型已体现";
    return `| ${id} | ${cell(r.title)} | ${cell(files)} | ${stages} | ${status} |`;
  });
  return ["| 编号 | 标题 | 原型位置 | 阶段 | 状态 |", "|---|---|---|---|---|", ...rows].join("\n");
}

// 把对照表放进 MAP 标记之间；找不到标记返回 null
export function replaceMap(doc, table) {
  const a = doc.indexOf(BEGIN), b = doc.indexOf(END);
  if (a < 0 || b < a) return null;
  return doc.slice(0, a + BEGIN.length) + "\n" + table + "\n" + doc.slice(b);
}

// 返回 { errors, next, count }
export function analyze(docText, dir) {
  const { rules, errors } = parseDoc(docText);
  if (errors.length) return { errors, next: null, count: 0 };
  const refs = scanDir(dir);
  const out = [];
  for (const [id, r] of Object.entries(rules)) if (!r.docOnly && !refs.has(id)) out.push(`原型里找不到引用：${id} ${r.title}（补 data-rule，或在文档里改成〔仅文档〕）`);
  for (const [id, e] of refs) if (!rules[id]) out.push(`原型引用了文档里不存在的编号：${id}（${e.at.slice(0, 3).join("，")}）`);
  const next = replaceMap(docText, renderTable(rules, refs));
  if (next === null) out.push(`文档里找不到 ${BEGIN} 与 ${END} 标记`);
  return { errors: out, next, count: Object.keys(rules).length };
}

function main(argv) {
  const arg = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : def; };
  const check = argv.includes("--check");
  const docPath = arg("--doc", DEFAULT_DOC);
  const dir = arg("--dir", DEFAULT_DIR);
  if (!existsSync(docPath)) { console.error(`找不到功能说明：${docPath}`); return 1; }
  if (!existsSync(dir)) { console.error(`找不到原型目录：${dir}`); return 1; }
  const doc = readFileSync(docPath, "utf8");
  const { errors, next, count } = analyze(doc, dir);
  if (check) {
    if (next !== null && next !== doc) errors.push(`对照表已过期：${docPath}，请运行 node tools/rule-map.mjs`);
    if (errors.length) { errors.forEach((e) => console.error(e)); return 1; }
    console.log(`检查通过：对照表 ${count} 条规则`);
    return 0;
  }
  if (next === null) { errors.forEach((e) => console.error(e)); return 1; }
  if (next !== doc) writeFileSync(docPath, next);
  errors.forEach((e) => console.error("警告：" + e));
  console.log(`已更新对照表：${count} 条规则${errors.length ? `，${errors.length} 个问题（--check 会失败）` : ""}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
