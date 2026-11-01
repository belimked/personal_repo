// 原型 v6 演示控制（S05）：快照切换（人物 × 阶段）、时刻、说明模式、顶部演示控制条。
// 引入顺序：data.js → personas-p1.js → personas-others.js → app.js → demo.js → 页面脚本。
// - 加载时就把当前快照写进 PA.state（页面脚本渲染前），只替换业务数据，保留登录会话和 demo 设置；
// - 包装 PA.mount：外壳渲染后在 .main-col 顶部挂控制条；
// - 地址参数 ?persona=&stage=&moment=&explain= 优先于已存的 demo 设置，应用后从地址栏去掉；
// - 说明模式：给 [data-rule] 元素旁加 .rule-badge 角标，点开显示规则（window.PA_RULES）。
(function () {
  const PA = window.PA;
  const PERSONAS = window.PA_PERSONAS || {};
  if (!PA || !PA.state) return;
  const { state, save, esc } = PA;
  const BACKUP_KEY = "pa_ITER1_v6_demo"; // demo 设置的备份：侧栏“重置演示数据”清空 state 后仍能恢复
  const BIZ = ["profile", "evidence", "watch", "deliveries", "feedback", "todos", "ideas", "files", "uiFactors", "points", "consents"];
  const PARAMS = ["persona", "stage", "moment", "explain"];
  const BAR_RULES = "R-冷启动-01 R-冷启动-03";
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const BASE_DAY = window.PA_TODAY || ymd(new Date()); // 时刻按“基准日所在的这一周”换算成日期

  // ---------------- 快照 ----------------
  const personaIds = () => Object.keys(PERSONAS).sort();
  const stagesOf = (p) => Object.keys(PERSONAS[p] || {}).map(Number).sort((a, b) => a - b);
  const snapOf = (p, s) => (PERSONAS[p] || {})[s] || null;
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

  // 把设置修正到合法组合：人物不存在退回 p1；阶段不存在取该人物最大阶段；时刻不存在取第一个
  function normalize(d) {
    const ids = personaIds();
    const persona = ids.includes(d.persona) ? d.persona : ids.includes("p1") ? "p1" : ids[0];
    const stages = stagesOf(persona);
    const stage = stages.includes(+d.stage) ? +d.stage : stages[stages.length - 1];
    const moments = (snapOf(persona, stage) || {}).moments || [];
    const moment = moments.some((m) => m.id === d.moment) ? d.moment : moments[0] ? moments[0].id : "";
    return { persona, stage, moment, explain: !!d.explain, barCollapsed: !!d.barCollapsed };
  }

  const KIND = { photo: ["jpg", "image"], image: ["jpg", "image"], audio: ["m4a", "audio"], video: ["mp4", "video"], doc: ["pdf", "pdf"], text: ["md", "text"] };
  const SIZE = { image: 2.4, audio: 38, video: 60, pdf: 1.2, text: 0.01 };
  // 快照里的资料补齐现有资料页需要的字段（ext/cat/size/uploadedAt/status）
  function normFile(f) {
    const m = /\.([a-z0-9]+)$/i.exec(f.name || "");
    const [ext0, cat0] = KIND[f.kind] || ["", "other"];
    const ext = (f.ext || (m ? m[1] : ext0)).toLowerCase();
    const cat = f.cat || (PA.catOf(ext) !== "other" ? PA.catOf(ext) : cat0);
    const textKey = cat === "audio" || cat === "video" ? "transcript" : cat === "text" ? "content" : "ocr";
    return Object.assign({ ext, cat, size: (SIZE[cat] || 0.1) * 1024 * 1024, tags: [], uploadedAt: f.at || PA.today(), status: "indexed", [textKey]: f.summary || "" }, f);
  }
  function normIdea(i) {
    const at = i.createdAt || `${PA.addDays(PA.today(), -(+i.createdDaysAgo || 0))} 21:00`;
    return Object.assign({ notes: "", records: [], attachments: [], tags: [], tagsRemoved: [], starred: false, status: "active", source: "text", sourceNote: "", askedDone: [], createdAt: at, updatedAt: at }, i);
  }

  // 用快照替换业务数据（不动 session、demo、users、配置等）
  function applySnapshot(d) {
    const snap = snapOf(d.persona, d.stage);
    if (!snap) return false;
    BIZ.forEach((k) => (state[k] = clone(snap[k]) ?? (k === "uiFactors" || k === "points" || k === "consents" ? {} : [])));
    state.files = state.files.map(normFile);
    state.ideas = state.ideas.map(normIdea);
    state.inbox = clone(snap.inbox) || []; // 旧种子里的会议录音指向已不存在的文件，一并换掉
    state.uploads = [];
    state.personaInfo = clone(snap.persona) || null;
    state.moments = clone(snap.moments) || [];
    state.generalMode = !!snap.generalMode;
    state.savedHours = snap.savedHours || 0;
    state.demoSnap = `${d.persona}/${d.stage}`;
    return true;
  }

  function persistDemo() {
    save();
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(state.demo)); } catch (e) {}
  }

  // ---------------- 初始化：存储 → 备份 → 地址参数 ----------------
  let saved = state.demo;
  if (!saved) { try { saved = JSON.parse(localStorage.getItem(BACKUP_KEY)); } catch (e) {} }
  const d0 = Object.assign({ persona: "p1", stage: 1, moment: "", explain: false, barCollapsed: false }, saved || {});
  const sp = new URLSearchParams(location.search);
  const hasParam = PARAMS.some((k) => sp.has(k));
  if (sp.has("persona")) d0.persona = sp.get("persona");
  if (sp.has("stage")) d0.stage = +sp.get("stage");
  if (sp.has("moment")) d0.moment = sp.get("moment");
  if (sp.has("explain")) d0.explain = !["0", "false", ""].includes(sp.get("explain"));
  state.demo = normalize(d0);
  if (state.demoSnap !== `${state.demo.persona}/${state.demo.stage}`) applySnapshot(state.demo);
  persistDemo();
  if (hasParam && history.replaceState) {
    // 去掉演示参数，之后用控制条切换再刷新时不会被地址参数改回去
    PARAMS.forEach((k) => sp.delete(k));
    const q = sp.toString();
    history.replaceState(history.state, "", location.pathname + (q ? "?" + q : "") + location.hash);
  }

  // ---------------- 时刻：把“现在”设为该时刻 ----------------
  const WD = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
  const curMoment = () => (state.moments || []).find((m) => m.id === state.demo.moment) || null;
  let nowTime = "09:00";
  function applyMoment() {
    const m = curMoment();
    const r = m && /周([一二三四五六日天])\s*(\d{1,2}):(\d{2})/.exec(m.at || "");
    if (!r) return;
    const base = new Date(BASE_DAY + "T00:00:00");
    const monday = new Date(base);
    monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    const target = new Date(monday);
    target.setDate(monday.getDate() + ((WD[r[1]] + 6) % 7));
    window.PA_TODAY = ymd(target);
    nowTime = `${pad(+r[2])}:${r[3]}`;
  }
  applyMoment();
  PA.now = () => new Date(`${PA.today()}T${nowTime}:00`);
  PA.nowStr = () => `${PA.today()} ${nowTime}`;
  PA.demoMoment = curMoment;

  // ---------------- 切换 ----------------
  const reload = () => { try { location.reload(); } catch (e) {} };
  function setDemo(patch, { reloadPage = true } = {}) {
    const next = normalize(Object.assign({}, state.demo, patch));
    const changedSnap = next.persona !== state.demo.persona || next.stage !== state.demo.stage;
    if (changedSnap && !("moment" in patch)) next.moment = normalize(Object.assign({}, next, { moment: "" })).moment;
    state.demo = next;
    if (changedSnap) applySnapshot(next);
    persistDemo();
    applyMoment();
    renderBar();
    scheduleScan();
    if (reloadPage) reload();
    return next;
  }
  function resetSnapshot({ reloadPage = true } = {}) {
    applySnapshot(state.demo);
    persistDemo();
    if (reloadPage) reload();
  }

  // ---------------- 控制条 ----------------
  let bar = null;
  const personaLabel = (p) => {
    const info = (snapOf(p, stagesOf(p)[0]) || {}).persona || {};
    return `${info.name || p}${info.job ? " · " + info.job : ""}${p === "p1" ? "（主角）" : ""}`;
  };
  function renderBar() {
    if (!bar) return;
    const d = state.demo;
    const stages = stagesOf(d.persona);
    bar.classList.toggle("collapsed", d.barCollapsed);
    bar.innerHTML = d.barCollapsed
      ? `<span class="demo-lbl">演示</span><span class="muted small">${esc(personaLabel(d.persona))} · 第 ${d.stage} 天${curMoment() ? " · " + esc(curMoment().label) : ""}</span><button type="button" class="demo-toggle" id="demo-toggle" title="展开演示控制条">展开 ▾</button>`
      : `<span class="demo-lbl">演示</span>
        <span class="demo-group" data-rule="${BAR_RULES}">阶段${[1, 7, 30].map((s) => `<button type="button" class="demo-stage ${s === d.stage ? "on" : ""}" data-stage="${s}" ${stages.includes(s) ? "" : 'disabled title="这个人物没有该阶段"'}>第 ${s} 天</button>`).join("")}</span>
        <label class="demo-group">人物<select id="demo-persona">${personaIds().map((p) => `<option value="${p}" ${p === d.persona ? "selected" : ""}>${esc(personaLabel(p))}</option>`).join("")}</select></label>
        <label class="demo-group">时刻<select id="demo-moment">${(state.moments || []).map((m) => `<option value="${esc(m.id)}" ${m.id === d.moment ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></label>
        <label class="demo-group"><input type="checkbox" id="demo-explain" ${d.explain ? "checked" : ""}>说明模式</label>
        <button type="button" id="demo-reset" title="恢复当前快照的初始数据">重置</button>
        <span class="spacer"></span>
        <button type="button" class="demo-toggle" id="demo-toggle" title="收起演示控制条">收起 ▴</button>`;
    bar.querySelector("#demo-toggle").onclick = () => { state.demo.barCollapsed = !state.demo.barCollapsed; persistDemo(); renderBar(); };
    if (d.barCollapsed) return;
    bar.querySelectorAll("[data-stage]").forEach((b) => (b.onclick = () => { if (!b.disabled && +b.dataset.stage !== state.demo.stage) setDemo({ stage: +b.dataset.stage }); }));
    bar.querySelector("#demo-persona").onchange = (e) => setDemo({ persona: e.target.value });
    bar.querySelector("#demo-moment").onchange = (e) => setDemo({ moment: e.target.value });
    bar.querySelector("#demo-explain").onchange = (e) => setDemo({ explain: e.target.checked }, { reloadPage: false });
    bar.querySelector("#demo-reset").onclick = () =>
      PA.confirmBox("重置演示数据", `恢复“${esc(personaLabel(state.demo.persona))} · 第 ${state.demo.stage} 天”的初始数据，你在原型里做的修改会被清除。`, () => resetSnapshot(), "重置", true);
  }
  function mountBar() {
    const col = document.querySelector(".app .main-col");
    if (!col || document.getElementById("demo-bar")) return;
    bar = document.createElement("div");
    bar.className = "demo-bar";
    bar.id = "demo-bar";
    bar.dataset.rule = BAR_RULES;
    col.prepend(bar);
    renderBar();
  }
  const origMount = PA.mount;
  PA.mount = function () {
    const ok = origMount.apply(this, arguments);
    if (ok) { mountBar(); scheduleScan(); }
    return ok;
  };
  // 由 app.js 补加载时外壳已渲染，直接挂控制条
  if (state.session && document.querySelector(".app .main-col")) mountBar();

  // ---------------- 说明模式 ----------------
  const badges = new WeakMap(); // 元素 → 角标容器
  let observer = null, scanTimer = null;
  const isOurs = (n) => n.nodeType === 1 && (n.classList.contains("rule-badges") || n.classList.contains("rule-pop") || !!n.closest?.(".rule-badges, .rule-pop"));
  function clearBadges() {
    document.querySelectorAll(".rule-badges, .rule-pop").forEach((n) => n.remove());
  }
  function scan() {
    scanTimer = null;
    if (!state.demo.explain) { clearBadges(); return; }
    const els = [...document.querySelectorAll("[data-rule]")].filter((el) => !isOurs(el));
    const live = new Set();
    els.forEach((el) => {
      const ids = (el.dataset.rule || "").split(/\s+/).filter(Boolean);
      if (!ids.length) return;
      let w = badges.get(el);
      if (!(w && w.isConnected && w.previousSibling === el && w.dataset.rules === ids.join(" "))) {
        if (w) w.remove();
        w = document.createElement("span");
        w.className = "rule-badges";
        w.dataset.rules = ids.join(" ");
        w.innerHTML = ids.map((id) => `<button type="button" class="rule-badge" data-rule-id="${esc(id)}" title="${esc(id)}">${esc(id.replace(/^R-/, ""))}</button>`).join("");
        w.querySelectorAll(".rule-badge").forEach((b) => (b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); showRule(b.dataset.ruleId, b); }));
        el.after(w);
        badges.set(el, w);
      }
      live.add(w);
    });
    document.querySelectorAll(".rule-badges").forEach((w) => live.has(w) || w.remove());
  }
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(scan, 0);
    if (state.demo.explain && !observer && window.MutationObserver && document.body) {
      observer = new MutationObserver((list) => {
        if (list.every((m) => [...m.addedNodes, ...m.removedNodes].every((n) => n.nodeType !== 1 || isOurs(n)) && (m.type !== "attributes" || !isOurs(m.target)))) return;
        if (!scanTimer) scanTimer = setTimeout(scan, 0);
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-rule"] });
    }
    if (!state.demo.explain && observer) { observer.disconnect(); observer = null; }
  }
  function showRule(id, anchor) {
    document.querySelectorAll(".rule-pop").forEach((n) => n.remove());
    const r = (window.PA_RULES || {})[id];
    const pop = document.createElement("div");
    pop.className = "rule-pop";
    pop.innerHTML = `<button type="button" class="close" aria-label="关闭">×</button>
      <div class="rule-id">${esc(id)}</div>
      ${r ? `<div class="rule-title">${esc(r.title)}</div><div class="rule-text">${esc(r.text)}</div><div class="rule-sec">功能说明 §${esc(r.section)}${r.docOnly ? " · 仅文档" : ""}</div>` : '<div class="rule-text muted">功能说明里没有这条规则</div>'}`;
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    pop.style.top = Math.min(rect.bottom + 6, (window.innerHeight || 600) - 160) + "px";
    pop.style.left = Math.max(8, Math.min(rect.left, (window.innerWidth || 800) - 320)) + "px";
    const close = () => { pop.remove(); document.removeEventListener("mousedown", outside, true); };
    const outside = (e) => { if (!pop.contains(e.target) && !e.target.closest?.(".rule-badge")) close(); };
    pop.querySelector(".close").onclick = close;
    document.addEventListener("mousedown", outside, true);
    return pop;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleScan);
  else scheduleScan();
  window.addEventListener("load", scheduleScan);

  window.PA_DEMO = {
    personas: personaIds, stagesOf, snapshot: () => snapOf(state.demo.persona, state.demo.stage), settings: () => state.demo,
    set: setDemo, reset: resetSnapshot, applySnapshot, scan, showRule, now: () => PA.now(),
  };
})();
