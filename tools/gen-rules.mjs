#!/usr/bin/env node
// 从 v6 功能说明生成原型使用的规则表 rules.js（只用 Node 标准库）
// 用法：node tools/gen-rules.mjs [--check] [--doc <功能说明.md>] [--out <rules.js>]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_DOC = path.join(ROOT, "docs/ITER1/spec/原型v6-功能说明.md");
export const DEFAULT_OUT = path.join(ROOT, "public/ITER1/v6/assets/rules.js");
export const MODULES = ["冷启动", "画像", "收集", "帮什么", "做多深", "出行", "孩子", "家务", "健康", "工作", "学习", "人情", "小店", "资料", "搜索", "界面", "生成", "信任", "模型"];
const DOC_ONLY = "〔仅文档〕";
const RULE_RE = /^- \*\*R-([^\s*-]+)-(\d{2})\*\* ([^：]+?)：(.+)$/;
const HEAD_RE = /^#{1,6}\s+(\d+(?:\.\d+)*)[.、]?\s/;

// 解析文档，返回 { rules, errors }
export function parseDoc(text) {
  const rules = {};
  const errors = [];
  let section = "";
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trimEnd();
    const n = i + 1;
    const h = line.match(HEAD_RE);
    if (h) { section = h[1]; return; }
    if (!/^\s*[-*]\s+\*\*R-/.test(line)) return;
    const m = line.match(RULE_RE);
    if (!m) { errors.push(`第 ${n} 行格式不对（应为 "- **R-<模块>-<两位数>** <标题>：<内容>"）：${line}`); return; }
    const [, mod, num, title, rest] = m;
    const id = `R-${mod}-${num}`;
    if (!MODULES.includes(mod)) { errors.push(`第 ${n} 行模块名不在固定列表里：${mod}`); return; }
    if (rules[id]) { errors.push(`第 ${n} 行编号重复：${id}（首次出现在第 ${rules[id]._line} 行）`); return; }
    let body = rest.trim();
    const docOnly = body.endsWith(DOC_ONLY);
    if (docOnly) body = body.slice(0, -DOC_ONLY.length).trim();
    if (body.includes(DOC_ONLY)) { errors.push(`第 ${n} 行 ${DOC_ONLY} 只能放在行末：${id}`); return; }
    if (!section) { errors.push(`第 ${n} 行规则不在带编号的章节下：${id}`); return; }
    rules[id] = { title: title.trim(), text: body, section, docOnly, _line: n };
  });
  for (const id of Object.keys(rules)) delete rules[id]._line;
  return { rules, errors };
}

export function render(rules) {
  return "// 自动生成，勿手改：由 node tools/gen-rules.mjs 从 docs/ITER1/spec/原型v6-功能说明.md 生成\n" +
    "window.PA_RULES = " + JSON.stringify(rules, null, 2) + ";\n";
}

function main(argv) {
  const arg = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : def; };
  const check = argv.includes("--check");
  const doc = arg("--doc", DEFAULT_DOC);
  const out = arg("--out", DEFAULT_OUT);
  if (!existsSync(doc)) { console.error(`找不到功能说明：${doc}`); return 1; }
  const { rules, errors } = parseDoc(readFileSync(doc, "utf8"));
  if (errors.length) { errors.forEach((e) => console.error(e)); return 1; }
  const content = render(rules);
  const count = Object.keys(rules).length;
  if (check) {
    const cur = existsSync(out) ? readFileSync(out, "utf8") : null;
    if (cur === null) { console.error(`rules.js 不存在：${out}，请运行 node tools/gen-rules.mjs`); return 1; }
    if (cur !== content) { console.error(`rules.js 与功能说明不一致：${out}，请运行 node tools/gen-rules.mjs`); return 1; }
    console.log(`检查通过：${count} 条规则`);
    return 0;
  }
  writeFileSync(out, content);
  console.log(`已生成 ${path.relative(process.cwd(), out)}：${count} 条规则`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
