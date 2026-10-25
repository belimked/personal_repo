(function () {
  const SEED = window.PA_SEED;
  const KEY = "pa_ITER1_v3";
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------------- store ----------------
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.version === 5) return s;
    } catch (e) {}
    const s = clone({ version: 5, files: SEED.files, todos: SEED.todos, inbox: SEED.inbox, users: SEED.users, fileTypes: SEED.fileTypes, models: SEED.models, logs: SEED.logs, config: SEED.config, uploads: [], session: null, prefs: { tz: "UTC+8", dailyMail: true, mailTime: "08:00", weeklyNudge: true, identity: [] }, userTags: ["合同"], blockedTags: [], tagHistory: [], tagRenames: {} });
    localStorage.setItem(KEY, JSON.stringify(s));
    return s;
  }
  const state = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  function reset() {
    const session = state.session;
    localStorage.removeItem(KEY);
    Object.keys(sessionStorage).filter((k) => k.startsWith("pa3_")).forEach((k) => sessionStorage.removeItem(k));
    const s = load();
    s.session = session;
    localStorage.setItem(KEY, JSON.stringify(s));
    location.reload();
  }

  // ---------------- helpers ----------------
  const fmtSize = (b) => (b >= 1024 * 1024 * 1024 ? (b / 1024 / 1024 / 1024).toFixed(2) + " GB" : b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
  const today = () => SEED.dayStr(0);
  const weekday = (ds) => "日一二三四五六"[new Date(ds + "T00:00:00").getDay()];
  const relDay = (ds) => {
    const diff = Math.round((new Date(ds + "T00:00:00") - new Date(today() + "T00:00:00")) / 86400000);
    return { "-1": "昨天", 0: "今天", 1: "明天", 2: "后天" }[diff] || "";
  };
  const DUR_PRESETS = [15, 30, 45, 60, 120];
  const DEFAULT_DUR = 30;
  const fmtDur = (m) => { m = +m || 0; const h = Math.floor(m / 60), r = m % 60; return h ? `${h} 小时${r ? ` ${r} 分` : ""}` : `${r} 分钟`; };
  const toMin = (hm) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
  const toHM = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const endOf = (t) => toHM(Math.min(24 * 60, toMin(t.time) + (+t.duration || DEFAULT_DUR)));
  const timeRange = (t) => (t.time ? `${t.time}–${endOf(t)}` : "");
  function durationPicker(el, { time = "", duration = 0 } = {}) {
    let val = +duration || (time ? DEFAULT_DUR : 0), hasTime = !!time;
    const maxDur = () => 1440 - toMin(time);
    // 色条显示的时间范围：至少 4 小时，并比当前时长多出 1 小时，不超过当天结束
    const windowOf = () => Math.min(maxDur(), Math.max(240, Math.ceil((val + 60) / 60) * 60));
    const endText = () => `结束时间 ${toHM(toMin(time) + val)}${toMin(time) + val >= 1440 ? "（不跨天，最晚到 24:00）" : ""}`;
    const label = () => `${time}–${toHM(toMin(time) + val)} · ${fmtDur(val)}`;
    const paint = () => {
      if (!hasTime) { el.innerHTML = '<span class="hint">先设置时间，才能选择时长（没有时间的待办按全天处理）</span>'; return; }
      const custom = val && !DUR_PRESETS.includes(val), s = toMin(time), W = windowOf();
      let ticks = "";
      for (let m = Math.ceil(s / 15) * 15; m <= s + W; m += 15) {
        const x = ((m - s) / W) * 100, hour = m % 60 === 0;
        ticks += `<span class="dur-tick ${hour ? "h" : ""}" style="left:${x}%"></span>` + (hour && x < 96 ? `<span class="dur-tl" style="left:${x}%">${toHM(m)}</span>` : "");
      }
      el.innerHTML = `<div class="chip-list">${DUR_PRESETS.map((m) => `<span class="chip ${m === val ? "on" : ""}" data-m="${m}">${fmtDur(m)}</span>`).join("")}${custom ? `<span class="chip on" data-custom title="拖动得到的时长">自定义 ${fmtDur(val)}</span>` : ""}</div>
        <div class="dur-track" data-w="${W}" title="拖动色条右端调整时长，按 15 分钟对齐">${ticks}<div class="dur-bar" style="width:${(val / W) * 100}%"><div class="dur-handle"></div></div><span class="dur-label"></span></div>
        <div class="hint" data-end>${endText()}；拖动色条右端可调整时长，也可以点击色条上的位置直接设定结束时间</div>`;
      el.querySelectorAll("[data-m]").forEach((c) => (c.onclick = () => { val = +c.dataset.m; paint(); }));
      const track = el.querySelector(".dur-track"), bar = el.querySelector(".dur-bar"), lab = el.querySelector(".dur-label");
      // 色条较宽时文字放在色条内，较窄时放在色条右侧，避免被拖动手柄挡住
      const placeLabel = () => {
        const pct = (val / W) * 100;
        lab.textContent = label();
        lab.classList.toggle("inside", pct > 55);
        lab.style.left = pct > 55 ? "8px" : `calc(${pct}% + 12px)`;
      };
      placeLabel();
      const setFromX = (clientX) => {
        const r = track.getBoundingClientRect();
        val = Math.max(15, Math.min(maxDur(), Math.round((((clientX - r.left) / r.width) * W) / 15) * 15));
        bar.style.width = (val / W) * 100 + "%";
        placeLabel();
        el.querySelector("[data-end]").firstChild.textContent = endText() + "；拖动色条右端可调整时长，也可以点击色条上的位置直接设定结束时间";
        el.querySelectorAll("[data-m]").forEach((c) => c.classList.toggle("on", +c.dataset.m === val));
      };
      track.onpointerdown = (e) => {
        e.preventDefault();
        track.setPointerCapture(e.pointerId); track.classList.add("dragging");
        setFromX(e.clientX);
        track.onpointermove = (ev) => setFromX(ev.clientX);
        track.onpointerup = () => { track.onpointermove = null; track.classList.remove("dragging"); paint(); };
      };
    };
    paint();
    return { value: () => (hasTime ? val : 0), setTime: (t) => { time = t; hasTime = !!t; if (hasTime && !val) val = DEFAULT_DUR; if (hasTime) val = Math.min(val, maxDur()); paint(); } };
  }
  const fmtDate = (ds, time) => (ds ? `${ds.slice(5)} 周${weekday(ds)}${relDay(ds) ? "（" + relDay(ds) + "）" : ""}${time ? " " + time : ""}` : "—");
  const catOf = (ext) => {
    ext = (ext || "").toLowerCase();
    if (["txt", "md", "csv", "json", "html", "htm", "xml", "log"].includes(ext)) return "text";
    if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "tif", "tiff"].includes(ext)) return "image";
    if (ext === "pdf") return "pdf";
    if (["mp3", "wav", "m4a", "aac", "flac", "ogg", "amr", "wma"].includes(ext)) return "audio";
    if (["mp4", "mov", "mkv", "avi", "webm", "flv"].includes(ext)) return "video";
    if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return "doc";
    return "other";
  };
  const CAT_LABEL = { text: "纯文本", image: "图片", pdf: "PDF", audio: "音频", video: "视频", doc: "Office 文档", other: "其他" };
  const fileIcon = (f) => `<span class="ficon ${f.cat}">${esc((f.ext || "?").slice(0, 3).toUpperCase())}</span>`;
  const canPreview = (f) => ["text", "image", "pdf"].includes(f.cat);
  const fileById = (id) => state.files.find((f) => f.id === id);
  const todoById = (id) => state.todos.find((t) => t.id === id);
  const linkedTodos = (fid) => state.todos.filter((t) => (t.attachments || []).includes(fid));
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nowStr = () => { const d = new Date(); return `${today()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const qs = (k) => new URLSearchParams(location.search).get(k);
  const usedBytes = () => state.files.reduce((s, f) => s + (f.size || 0), 0) + 80 * 1024 * 1024;
  const quotaBytes = () => (me()?.quota || 500) * 1024 * 1024;
  const me = () => state.users.find((u) => u.email === state.session?.email);

  function log(type, detail, ms) {
    const target = PA.ADMIN_TYPES.includes(type) ? state.logs.admin : state.logs.user;
    const d = new Date();
    target.unshift({ time: `${today()} ${d.toTimeString().slice(0, 8)}`, user: state.session?.email || "—", type, detail, ok: true, ms: ms || 50 + Math.floor(Math.random() * 300), ip: "10.0.0.8" });
    save();
  }

  // ---------------- toast & modal ----------------
  function toast(msg, ms = 2600) {
    let box = document.querySelector(".toasts");
    if (!box) { box = document.createElement("div"); box.className = "toasts"; document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  function modal({ title, body, actions = [], wide = false, onMount }) {
    const mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.innerHTML = `<div class="modal ${wide ? "wide" : ""}"><div class="modal-head"><h3>${esc(title)}</h3><button class="close" aria-label="关闭">×</button></div><div class="modal-body">${body}</div>${actions.length ? '<div class="modal-foot"></div>' : ""}</div>`;
    const close = () => mask.remove();
    mask.querySelector(".close").onclick = close;
    mask.addEventListener("mousedown", (e) => { if (e.target === mask) close(); });
    const foot = mask.querySelector(".modal-foot");
    actions.forEach((a) => {
      const b = document.createElement("button");
      b.className = "btn " + (a.cls || (a.primary ? "primary" : ""));
      b.textContent = a.label;
      b.onclick = () => { if (a.onClick && a.onClick(mask) === false) return; close(); };
      foot.appendChild(b);
    });
    document.body.appendChild(mask);
    onMount && onMount(mask, close);
    return { el: mask, close };
  }
  const confirmBox = (title, text, onOk, okLabel = "确认", danger = false) =>
    modal({ title, body: `<div>${text}</div>`, actions: [{ label: "取消" }, { label: okLabel, cls: danger ? "danger" : "primary", onClick: onOk }] });

  // ---------------- multi-select ----------------
  function multiSelect(el, options, placeholder = "全部") {
    const sel = new Set();
    el.classList.add("ms");
    el.innerHTML = `<div class="ms-btn">${esc(placeholder)}</div><div class="ms-pop">${options.map((o) => `<label><input type="checkbox" value="${esc(o.value)}">${esc(o.label)}</label>`).join("")}</div>`;
    const btn = el.querySelector(".ms-btn");
    btn.onclick = (e) => { e.stopPropagation(); document.querySelectorAll(".ms.open").forEach((m) => m !== el && m.classList.remove("open")); el.classList.toggle("open"); };
    el.querySelector(".ms-pop").addEventListener("click", (e) => e.stopPropagation());
    el.querySelectorAll("input").forEach((cb) => (cb.onchange = () => {
      cb.checked ? sel.add(cb.value) : sel.delete(cb.value);
      const labels = options.filter((o) => sel.has(o.value)).map((o) => o.label);
      btn.textContent = labels.length ? (labels.length > 2 ? `已选 ${labels.length} 项` : labels.join("、")) : placeholder;
      el.dispatchEvent(new Event("change"));
    }));
    return { values: () => [...sel] };
  }
  document.addEventListener("click", () => {
    document.querySelectorAll(".ms.open").forEach((m) => m.classList.remove("open"));
    document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
  });

  // ---------------- download ----------------
  function download(f) {
    let blob;
    if (f.content) blob = new Blob([f.content], { type: "text/plain;charset=utf-8" });
    else if (f.img) { const a = document.createElement("a"); a.href = f.img; a.download = f.name.replace(/\.\w+$/, ".svg"); a.click(); toast("原型：已下载占位图（真实系统下载原文件）"); log("下载文件", "下载 " + f.name); return; }
    else blob = new Blob([`原型占位文件：${f.name}\n真实系统中这里下载原始文件（${fmtSize(f.size)}）。`], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = f.content ? f.name : f.name + ".txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(f.content ? "已下载 " + f.name : "原型：已下载占位文件（真实系统下载原文件）");
    log("下载文件", "下载 " + f.name);
  }

  // ---------------- markdown / highlight ----------------
  function md(src) {
    const lines = esc(src).split("\n");
    let html = "", inList = false;
    for (const l of lines) {
      const line = l.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
      if (/^- /.test(line)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${line.slice(2)}</li>`; continue; }
      if (inList) { html += "</ul>"; inList = false; }
      const h = line.match(/^(#{1,3}) (.*)/);
      if (h) html += `<h${h[1].length}>${h[2]}</h${h[1].length}>`;
      else if (line.trim()) html += `<p>${line}</p>`;
    }
    return html + (inList ? "</ul>" : "");
  }
  function highlight(text, terms) {
    let out = esc(text);
    (terms || []).filter((t) => t && t.length > 1).forEach((t) => { out = out.split(esc(t)).join(`<mark>${esc(t)}</mark>`); });
    return out;
  }

  // ---------------- preview drawer ----------------
  const pv = JSON.parse(sessionStorage.getItem("pa3_preview") || '{"tabs":[],"active":null,"width":460,"hidden":false}');
  const savePv = () => sessionStorage.setItem("pa3_preview", JSON.stringify(pv));
  function renderPreview() {
    const drawer = document.getElementById("drawer");
    const toggle = document.getElementById("preview-toggle");
    if (!drawer) return;
    pv.tabs = pv.tabs.filter((t) => fileById(t.id));
    if (!pv.tabs.length) { drawer.classList.add("hidden"); toggle.classList.add("hidden"); savePv(); positionPanel(); return; }
    if (!pv.tabs.find((t) => t.id === pv.active)) pv.active = pv.tabs[0].id;
    drawer.classList.toggle("hidden", pv.hidden);
    setTimeout(positionPanel);
    toggle.classList.toggle("hidden", !pv.hidden);
    toggle.textContent = `预览（${pv.tabs.length}）`;
    drawer.style.width = pv.width + "px";
    const cur = pv.tabs.find((t) => t.id === pv.active);
    const f = fileById(cur.id);
    const links = linkedTodos(f.id);
    let body = "";
    if (f.cat === "text") {
      if (f.ext === "md") body = `<div class="md">${md(f.content)}</div>`;
      else if (f.ext === "html" || f.ext === "htm") body = `<iframe sandbox="" srcdoc="${esc(f.content)}"></iframe>`;
      else body = `<pre>${highlight(f.content, cur.terms)}</pre>`;
    } else {
      body = `<img src="${f.img}" alt="${esc(f.name)}">`;
      if (f.ocr) body += `<h4 style="margin:14px 0 6px">OCR 识别文本</h4><pre>${highlight(f.ocr, cur.terms)}</pre>`;
      if (f.desc) body += `<h4 style="margin:14px 0 6px">图片描述（多模态 LLM 生成）</h4><pre>${highlight(f.desc, cur.terms)}</pre>`;
    }
    drawer.innerHTML = `
      <div class="drawer-resize" title="拖动调整宽度"></div>
      <div class="drawer-tabs">
        <div class="tabs-scroll">${pv.tabs.map((t) => { const tf = fileById(t.id); return `<div class="dtab ${t.id === pv.active ? "active" : ""}" data-id="${t.id}" title="${esc(tf.name)}">${fileIcon(tf)}<span class="name">${esc(tf.name)}</span><button class="x" data-close="${t.id}" title="关闭">×</button></div>`; }).join("")}</div>
        <div class="drawer-tools">
          <button class="icon-btn" data-act="closeall" title="关闭全部">⊗</button>
          <button class="icon-btn" data-act="hide" title="收起预览">⇥</button>
        </div>
      </div>
      <div class="drawer-meta">${fileIcon(f)}<b style="color:var(--text)">${esc(f.name)}</b><span>${fmtSize(f.size)}</span><span>🏷 ${esc((f.tags || []).join("、") || "未打标签")}</span><span>${links.length ? "关联 " + links.length + " 个待办" : "未关联待办"}</span><span class="spacer"></span><button class="btn sm" data-act="dl">下载</button></div>
      <div class="drawer-body">${body}</div>`;
    drawer.querySelectorAll(".dtab").forEach((el) => (el.onclick = (e) => { if (e.target.dataset.close) return; pv.active = el.dataset.id; savePv(); renderPreview(); }));
    drawer.querySelectorAll("[data-close]").forEach((el) => (el.onclick = () => { pv.tabs = pv.tabs.filter((t) => t.id !== el.dataset.close); savePv(); renderPreview(); }));
    drawer.querySelector('[data-act="closeall"]').onclick = () => { pv.tabs = []; savePv(); renderPreview(); };
    drawer.querySelector('[data-act="hide"]').onclick = () => { pv.hidden = true; savePv(); renderPreview(); };
    drawer.querySelector('[data-act="dl"]').onclick = () => download(f);
    const handle = drawer.querySelector(".drawer-resize");
    handle.onmousedown = (e) => {
      e.preventDefault(); handle.classList.add("dragging");
      const frames = drawer.querySelectorAll("iframe"); frames.forEach((fr) => (fr.style.pointerEvents = "none"));
      const move = (ev) => { pv.width = Math.min(window.innerWidth * 0.75, Math.max(300, window.innerWidth - ev.clientX)); drawer.style.width = pv.width + "px"; positionPanel(); };
      const up = () => { handle.classList.remove("dragging"); frames.forEach((fr) => (fr.style.pointerEvents = "")); document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); savePv(); };
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
    };
  }
  function openPreview(id, terms) {
    const f = fileById(id);
    if (!f) return;
    if (!canPreview(f)) { toast("多媒体文件 V1 不提供预览，请下载查看"); return; }
    const ex = pv.tabs.find((t) => t.id === id);
    if (ex) ex.terms = terms; else pv.tabs.push({ id, terms });
    if (pv.tabs.length > 8) pv.tabs.shift();
    pv.active = id; pv.hidden = false; savePv(); renderPreview();
  }

  // ---------------- upload engine ----------------
  const CAT_ORDER = { text: 0, doc: 0, other: 0, image: 1, pdf: 1, audio: 2, video: 2 };
  const STAGES = {
    text: ["读取文本", "建立索引"], doc: ["仅存储（解析方式待定）"], other: ["仅存储"],
    image: ["OCR 识别", "生成图片描述", "建立索引"], pdf: ["提取文字层 / OCR", "建立索引"],
    audio: ["语音识别", "判断是否会议", "建立索引"], video: ["语音识别（直接读取视频）", "判断是否会议", "建立索引"],
  };
  const STAGE_SEC = { text: 1.5, doc: 1, other: 1, image: 3, pdf: 3.5, audio: 6, video: 7 };
  const UPLOAD_CONCURRENCY = 3, PROCESS_CONCURRENCY = 2;
  let panelCollapsed = sessionStorage.getItem("pa3_up_collapsed") === "1";
  let panelFilter = "all";

  function allowedExts() { return new Set(state.fileTypes.map((t) => t.ext)); }

  function pickFiles(opts = {}) {
    const input = document.createElement("input");
    input.type = "file"; input.multiple = true;
    input.onchange = () => startUpload([...input.files], opts);
    input.click();
  }

  // 重复判断（原型模拟）：真实系统在浏览器计算 SHA-256，只在本人文件内比对，服务端再以“用户 + 指纹”唯一约束兜底
  function classifyFiles(list) {
    const c = state.config.upload, exts = allowedExts();
    const out = [], seen = new Set();
    const inflight = state.uploads.filter((u) => !["done", "failed"].includes(u.status));
    for (const f of list) {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      const key = f.name + "|" + f.size;
      if (!f.name.includes(".") || !exts.has(ext)) { out.push({ f, kind: "rejected", reason: `不支持的文件类型 .${ext}` }); continue; }
      if (f.size > c.maxFileMB * 1024 * 1024) { out.push({ f, kind: "rejected", reason: `超过单文件上限 ${c.maxFileMB}MB（${fmtSize(f.size)}）` }); continue; }
      if (seen.has(key)) { out.push({ f, kind: "ignored", reason: "本次重复选择，已忽略" }); continue; }
      seen.add(key);
      const same = state.files.find((x) => x.name === f.name && Math.abs(x.size - f.size) < 1024);
      if (same) { out.push({ f, kind: "dup", file: same, reason: "已在知识库中，直接关联" }); continue; }
      const sameContent = state.files.find((x) => Number.isInteger(x.size) && x.size === f.size && x.name !== f.name);
      if (sameContent) { out.push({ f, kind: "same", file: sameContent, reason: `与知识库中的《${sameContent.name}》内容相同，直接关联` }); continue; }
      const running = inflight.find((u) => u.name === f.name && u.size === f.size);
      if (running) { out.push({ f, kind: "joining", upload: running, reason: "另一个页面正在上传该文件，完成后自动关联" }); continue; }
      const taken = (n) => state.files.some((x) => x.name === n) || inflight.some((u) => (u.displayName || u.name) === n);
      let displayName = f.name;
      if (taken(displayName)) { const dot = f.name.lastIndexOf("."); let i = 1; do { displayName = `${f.name.slice(0, dot)}(${i})${f.name.slice(dot)}`; i++; } while (taken(displayName)); }
      out.push({ f, kind: "new", displayName, reason: displayName !== f.name ? `同名但内容不同，保存为 ${displayName}` : "" });
    }
    return out;
  }
  function attachExisting(todoId, fileId) {
    const t = todoById(todoId);
    if (t && !t.attachments.includes(fileId)) t.attachments.push(fileId);
  }
  // opts.quiet：表单、助手里的内联上传，没有阻断问题时不弹确认框，直接开始；返回每个文件的处理结果
  function startUpload(list, opts = {}) {
    const c = state.config.upload;
    if (!list.length) return [];
    const res = classifyFiles(list);
    const accepted = res.filter((r) => r.kind === "new");
    const total = accepted.reduce((s, r) => s + r.f.size, 0);
    const remain = quotaBytes() - usedBytes();
    let blocker = "";
    if (list.length > c.maxCount) blocker = `一次最多上传 ${c.maxCount} 个文件，本次选择了 ${list.length} 个。`;
    else if (total > remain) blocker = `存储空间不足：本次需要 ${fmtSize(total)}，剩余配额 ${fmtSize(Math.max(0, remain))}。`;
    else if (total > c.maxBatchMB * 1024 * 1024) blocker = `单次上传总大小不能超过 ${c.maxBatchMB}MB，本次为 ${fmtSize(total)}。`;
    const apply = () => {
      res.forEach((r) => {
        if ((r.kind === "dup" || r.kind === "same") && opts.todoId) attachExisting(opts.todoId, r.file.id);
        if (r.kind === "joining" && opts.todoId) { r.upload.todoIds = r.upload.todoIds || []; if (!r.upload.todoIds.includes(opts.todoId)) r.upload.todoIds.push(opts.todoId); }
      });
      const ids = enqueue(accepted.map((r) => Object.assign(r.f, { displayName: r.displayName })), opts);
      accepted.forEach((r, i) => (r.uploadId = ids[i]));
      res.filter((r) => r.kind === "joining").forEach((r) => (r.uploadId = r.upload.id));
      res.filter((r) => r.file).forEach((r) => (r.fileId = r.file.id));
      save();
      opts.onDone && opts.onDone(res);
    };
    if (opts.quiet && !blocker) {
      apply();
      res.filter((r) => r.reason).forEach((r) => toast(`${r.f.name}：${r.reason}`, 4000));
      return res;
    }
    const badge = { new: ["green", "可上传"], dup: ["orange", "已存在"], same: ["orange", "内容相同"], joining: ["blue", "正在上传中"], ignored: ["", "重复选择"], rejected: ["red", "不可上传"] };
    const rows = res.map((r) => `<tr><td>${esc(r.f.name)}</td><td>${r.kind === "rejected" ? "" : fmtSize(r.f.size)}</td><td><span class="badge ${badge[r.kind][0]}">${badge[r.kind][1]}</span> <span class="small muted">${esc(r.reason || "")}</span></td></tr>`).join("");
    const cnt = (k) => res.filter((r) => r.kind === k).length;
    modal({
      title: "上传确认", wide: true,
      body: `${blocker ? `<div class="note warn">⛔ ${esc(blocker)}</div>` : ""}
        <div class="row" style="margin-bottom:10px"><span>共选择 <b>${list.length}</b> 个文件</span><span class="badge green">可上传 ${accepted.length}（${fmtSize(total)}）</span>${cnt("dup") + cnt("same") + cnt("joining") ? `<span class="badge orange">重复 ${cnt("dup") + cnt("same") + cnt("joining")}</span>` : ""}${cnt("rejected") ? `<span class="badge red">不可上传 ${cnt("rejected")}</span>` : ""}</div>
        <div class="hint" style="margin-bottom:8px">限制：单次 ≤ ${c.maxCount} 个、≤ ${c.maxBatchMB}MB；单文件 ≤ ${c.maxFileMB}MB；剩余配额 ${fmtSize(Math.max(0, remain))}（配额优先校验）。重复判断：真实系统在浏览器计算 SHA-256，只在本人文件内比对，与文件名无关；同一份文件只存一份，多个待办引用它。</div>
        <div class="table-wrap" style="max-height:300px"><table class="table"><tr><th>文件</th><th>大小</th><th>结果</th></tr>${rows}</table></div>`,
      actions: [{ label: "取消" }, ...(blocker ? [] : [{ label: accepted.length ? `开始上传 ${accepted.length} 个文件` : "确定", primary: true, onClick: apply }])],
    });
    return res;
  }

  function enqueue(files, opts) {
    const batch = uid("b"), ids = [];
    files.forEach((f, i) => {
      const ext = f.name.split(".").pop().toLowerCase();
      const u = { id: uid("u"), batch, seq: Date.now() + i, name: f.name, displayName: f.displayName || f.name, size: f.size, ext, cat: catOf(ext), status: "waiting", progress: 0, stage: 0, stageT: 0, todoIds: opts.todoId ? [opts.todoId] : [] };
      state.uploads.push(u); ids.push(u.id);
    });
    if (!files.length) return ids;
    log("上传文件", `上传 ${files.length} 个文件，共 ${fmtSize(files.reduce((s, f) => s + f.size, 0))}`);
    panelCollapsed = !!opts.quiet; sessionStorage.setItem("pa3_up_hidden", "0");
    save(); renderUploads(); ensureTick();
    return ids;
  }
  // 上传完成后关联到所有等待它的待办（包括表单里还没创建的待办：创建后由表单补关联），并补上想法记录里的附件
  function linkUploadToTodos(u) {
    (u.todoIds || []).forEach((tid) => {
      const t = todoById(tid);
      if (!t) return;
      if (!t.attachments.includes(u.fileId)) t.attachments.push(u.fileId);
      (t.records || []).forEach((r) => { if ((r.pending || []).includes(u.id)) { r.pending = r.pending.filter((x) => x !== u.id); if (!r.files.includes(u.fileId)) r.files.push(u.fileId); } });
    });
  }

  let ticking = null;
  function ensureTick() { if (!ticking) ticking = setInterval(tick, 300); }
  function tick() {
    const ups = state.uploads;
    const active = ups.filter((u) => !["done", "failed"].includes(u.status));
    if (!active.length) { clearInterval(ticking); ticking = null; renderUploads(); return; }
    // 上传阶段：按选择顺序，最多同时 3 个
    let uploading = ups.filter((u) => u.status === "uploading");
    ups.filter((u) => u.status === "waiting").sort((a, b) => a.seq - b.seq).slice(0, Math.max(0, UPLOAD_CONCURRENCY - uploading.length)).forEach((u) => (u.status = "uploading"));
    ups.filter((u) => u.status === "uploading").forEach((u) => {
      u.progress += Math.max(4, 3000000 / Math.max(u.size, 1) * 3);
      if (u.progress >= 100) { u.progress = 100; u.status = "queued"; }
    });
    // 处理阶段：文本 → 图片/PDF → 音视频，同一用户最多同时 2 个
    const processing = ups.filter((u) => u.status === "processing");
    ups.filter((u) => u.status === "queued").sort((a, b) => CAT_ORDER[a.cat] - CAT_ORDER[b.cat] || a.seq - b.seq).slice(0, Math.max(0, PROCESS_CONCURRENCY - processing.length)).forEach((u) => { u.status = "processing"; u.stage = 0; u.stageT = 0; });
    ups.filter((u) => u.status === "processing").forEach((u) => {
      u.stageT += 0.3;
      if (u.stageT < STAGE_SEC[u.cat]) return;
      if (u.stage === 0 && !u.retried && Math.random() < 0.1 && u.cat !== "other" && u.cat !== "doc") { u.status = "failed"; u.error = u.cat === "text" ? "文件编码无法识别" : u.cat === "image" || u.cat === "pdf" ? "OCR 服务超时" : "语音识别失败"; return; }
      u.stage++; u.stageT = 0;
      if (u.stage >= STAGES[u.cat].length) finish(u);
    });
    save(); renderUploads();
    document.dispatchEvent(new CustomEvent("pa:uploads-tick"));
  }

  function finish(u) {
    u.status = "done";
    const f = { id: uid("f"), name: u.displayName || u.name, ext: u.ext, cat: u.cat, size: u.size, tags: autoTags(u.name, [], u.cat), uploadedAt: nowStr(), status: "indexed" };
    if (u.cat === "text") f.content = `（原型）${u.name} 的文本内容。真实系统会显示文件原文。`;
    if (u.cat === "image" || u.cat === "pdf") { f.img = SEED.svgImg(u.name, "#45aaf2", "#2d98da", "刚上传的文件（占位图）"); f.ocr = "（原型）OCR 识别文本"; }
    if (u.cat === "audio" || u.cat === "video") {
      f.transcript = "（原型）转写文本";
      const isMeeting = /会议|meeting|沟通|评审|例会|周会|访谈/i.test(u.name) || Math.random() < 0.4;
      f.meeting = isMeeting;
      if (isMeeting) {
        state.inbox.unshift({ id: uid("m"), fileId: f.id, fileName: u.name, duration: `${20 + Math.floor(Math.random() * 70)} 分钟`, size: u.size, uploadedAt: nowStr(),
          summary: "（原型）会议摘要：讨论了项目进度和下一步分工，约定下周复盘。",
          dateFromAudio: Math.random() < 0.5 ? SEED.dayStr(-1) + " 10:00" : "", dateFromFile: SEED.dayStr(-1) + " 11:20",
          items: [{ owner: "我", text: "汇总会议纪要并发给参会人" }, { owner: "王五", text: "跟进供应商报价" }, { owner: "未识别", text: "下周复盘项目进度" }] });
        toast(`识别到会议录音「${u.name}」，已加入“待确认”`, 4000);
      }
    }
    state.files.push(f);
    u.fileId = f.id;
    linkUploadToTodos(u);
    log("文件处理", `${u.name} 处理完成`, 2000 + Math.floor(Math.random() * 60000));
    updateBadges();
    document.dispatchEvent(new CustomEvent("pa:files-changed"));
  }

  function statusText(u) {
    if (u.status === "waiting") return '<span class="badge">等待上传</span>';
    if (u.status === "uploading") return `<span class="badge blue">上传中 ${Math.floor(u.progress)}%</span>`;
    if (u.status === "queued") return '<span class="badge">排队等待处理</span>';
    if (u.status === "processing") return `<span class="badge blue">${STAGES[u.cat][u.stage]}…</span><span>步骤 ${u.stage + 1}/${STAGES[u.cat].length}</span>`;
    if (u.status === "done") return `<span class="badge green">完成</span>${u.fileId && canPreview(fileById(u.fileId) || {}) ? `<a href="#" data-prev="${u.fileId}">预览</a>` : ""}`;
    return `<span class="badge red">失败：${esc(u.error)}</span><a href="#" data-retry="${u.id}">重试</a>`;
  }

  function renderUploads() {
    let panel = document.getElementById("up-panel");
    const ups = state.uploads;
    const hidden = sessionStorage.getItem("pa3_up_hidden") === "1";
    if (!ups.length || hidden || !document.querySelector(".app")) { panel && panel.remove(); return; }
    if (!panel) { panel = document.createElement("div"); panel.id = "up-panel"; panel.className = "up-panel"; document.body.appendChild(panel); }
    panel.classList.toggle("collapsed", panelCollapsed);
    positionPanel();
    const done = ups.filter((u) => u.status === "done").length, failed = ups.filter((u) => u.status === "failed").length;
    const running = ups.length - done - failed;
    const list = ups.filter((u) => panelFilter === "all" || (panelFilter === "running" ? !["done", "failed"].includes(u.status) : u.status === panelFilter))
      .sort((a, b) => (a.status === "failed") - (b.status === "failed") || 0);
    panel.innerHTML = `
      <div class="up-head"><b>上传与处理</b><span class="small">${running ? `进行中 ${running} · ` : ""}完成 ${done}/${ups.length}${failed ? ` · 失败 ${failed}` : ""}</span><span class="spacer"></span>
        <button class="icon-btn" data-a="toggle" title="${panelCollapsed ? "展开" : "收起"}">${panelCollapsed ? "▴" : "▾"}</button>
        <button class="icon-btn" data-a="close" title="${running ? "隐藏（后台继续处理）" : "关闭并清空记录"}">×</button></div>
      <div class="up-sum"><div class="progress"><div style="width:${(done / ups.length) * 100}%"></div></div>
        <div style="margin-top:6px">离开本页面也会继续：上传在浏览器中进行，解析和建索引在服务端后台进行。</div></div>
      <div class="up-filter">${[["all", "全部"], ["running", "进行中"], ["failed", "失败"], ["done", "完成"]].map(([k, l]) => `<button class="chip" style="${panelFilter === k ? "border-color:var(--primary);color:var(--primary)" : ""}" data-f="${k}">${l}</button>`).join("")}
        ${failed ? '<span class="spacer"></span><button class="btn sm" data-a="retryall">全部重试</button>' : ""}</div>
      <div class="up-list">${list.map((u) => `<div class="up-item">${fileIcon(u)}<div class="nm" title="${esc(u.name)}">${esc(u.name)}</div><span class="small muted">${fmtSize(u.size)}</span>
        <div class="st">${statusText(u)}</div>${u.status === "uploading" ? `<div class="progress"><div style="width:${u.progress}%"></div></div>` : ""}</div>`).join("") || '<div class="empty small">没有记录</div>'}</div>
      <div class="up-foot">处理顺序：纯文本 → 图片/PDF → 音视频；上传并发 ${UPLOAD_CONCURRENCY}，每用户同时处理 ${PROCESS_CONCURRENCY} 个</div>`;
    panel.querySelector('[data-a="toggle"]').onclick = () => { panelCollapsed = !panelCollapsed; sessionStorage.setItem("pa3_up_collapsed", panelCollapsed ? "1" : "0"); renderUploads(); };
    panel.querySelector('[data-a="close"]').onclick = () => {
      if (running) { sessionStorage.setItem("pa3_up_hidden", "1"); toast("已隐藏，处理会在后台继续；可在“个人知识库”页重新打开"); }
      else { state.uploads = []; save(); }
      renderUploads();
    };
    panel.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { panelFilter = b.dataset.f; renderUploads(); }));
    const ra = panel.querySelector('[data-a="retryall"]');
    if (ra) ra.onclick = () => { ups.filter((u) => u.status === "failed").forEach(retry); save(); ensureTick(); renderUploads(); };
    panel.querySelectorAll("[data-retry]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); retry(ups.find((u) => u.id === a.dataset.retry)); save(); ensureTick(); renderUploads(); }));
    panel.querySelectorAll("[data-prev]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); openPreview(a.dataset.prev); }));
  }
  function positionPanel() {
    const panel = document.getElementById("up-panel"), drawer = document.getElementById("drawer");
    if (!panel) return;
    panel.style.right = (drawer && !drawer.classList.contains("hidden") ? drawer.offsetWidth + 20 : 20) + "px";
    const composer = document.querySelector(".composer");
    panel.style.bottom = composer ? composer.offsetHeight + 12 + "px" : "";
  }
  function retry(u) { u.status = "queued"; u.retried = true; u.stage = 0; u.stageT = 0; u.error = ""; }
  function showUploadPanel() { sessionStorage.setItem("pa3_up_hidden", "0"); renderUploads(); if (!state.uploads.length) toast("暂无上传记录"); }

  // ---------------- 日期工具 ----------------
  const D = (ds) => new Date(ds + "T00:00:00");
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (ds, n) => { const d = D(ds); d.setDate(d.getDate() + n); return ymd(d); };
  const diffDays = (a, b) => Math.round((D(a) - D(b)) / 86400000);
  const weekEndOf = (ds) => addDays(ds, (7 - D(ds).getDay()) % 7);
  const monthEndOf = (ds) => { const d = D(ds); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
  const cnDate = (ds) => (ds ? `${+ds.slice(5, 7)}月${+ds.slice(8)}日（周${weekday(ds)}）` : "");

  // ---------------- 期限（时间段） ----------------
  function makeDeadline(kind, base = today()) {
    if (kind === "week") return { from: base, to: weekEndOf(base), label: "本周内" };
    if (kind === "nextweek") { const mon = addDays(weekEndOf(base), 1); return { from: mon, to: addDays(mon, 6), label: "下周内" }; }
    if (kind === "month") return { from: base, to: monthEndOf(base), label: "本月内" };
    if (kind === "nextmonth") { const d = D(base); const a = new Date(d.getFullYear(), d.getMonth() + 1, 1); return { from: ymd(a), to: monthEndOf(ymd(a)), label: `${a.getMonth() + 1}月内` }; }
    if (kind === "year") return { from: base, to: `${base.slice(0, 4)}-12-31`, label: "年底前" };
    return null;
  }
  const daysLeft = (t) => (t.deadline ? diffDays(t.deadline.to, today()) : null);
  const inDeadlineWindow = (t) => t.status === "open" && !t.date && !!t.deadline && daysLeft(t) <= 6;
  function deadlineText(t, withLeft = true) {
    if (!t.deadline) return "";
    const left = daysLeft(t);
    const tail = !withLeft || left > 6 ? "" : left < 0 ? "（已过期限）" : left === 0 ? "（今天截止）" : `（还剩 ${left} 天）`;
    return `期限：${t.deadline.label}${tail}`;
  }
  // 待办的“时间”一行文字：具体日期 / 期限 / 待安排
  function whenText(t) {
    if (t.date) return `${cnDate(t.date)} ${t.time ? timeRange(t) : "全天"}`;
    return t.deadline ? `待安排 · ${deadlineText(t)}` : "待安排";
  }

  // ---------------- 时间识别（原型中模拟 LLM 的结构化输出：只提取时间及精度，归类由规则决定） ----------------
  const CN = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12, 日: 0, 天: 0 };
  const num = (s) => (/^\d+$/.test(s) ? +s : CN[s] ?? (s.startsWith("十") ? 10 + (CN[s.slice(1)] || 0) : NaN));
  function parseWhen(text) {
    let date = "", time = "", deadline = null, m;
    const used = [], d0 = today(), dow = D(d0).getDay() || 7;
    if ((m = text.match(/大后天|后天|明天|今天/))) { date = addDays(d0, { 今天: 0, 明天: 1, 后天: 2, 大后天: 3 }[m[0]]); used.push(m[0]); }
    else if ((m = text.match(/(下下?)(?:个)?(?:周|星期|礼拜)([一二三四五六日天])(?:之?前)?/))) { const target = num(m[2]) || 7; date = addDays(d0, 7 - dow + target + 7 * (m[1].length - 1)); used.push(m[0]); }
    else if ((m = text.match(/(?:这|本)?(?:周|星期|礼拜)([一二三四五六日天])(?:之?前)?/))) { const target = num(m[1]) || 7; let diff = target - dow; if (diff < 0) diff += 7; date = addDays(d0, diff); used.push(m[0]); }
    else if ((m = text.match(/(\d{1,2}|[一二三四五六七八九十]{1,3})月(\d{1,2}|[一二三四五六七八九十]{1,3})[日号](?:之?前)?/))) {
      let y = +d0.slice(0, 4); const mo = num(m[1]), da = num(m[2]);
      let ds = `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`; if (ds < d0) ds = `${y + 1}${ds.slice(4)}`;
      date = ds; used.push(m[0]);
    }
    else if ((m = text.match(/下个?月(?:内|底前|底)?/))) { deadline = makeDeadline("nextmonth"); used.push(m[0]); }
    else if ((m = text.match(/(?:这个月|本月|这月)(?:内|底前|底)?|月底前|月底/))) { deadline = makeDeadline("month"); used.push(m[0]); }
    else if ((m = text.match(/下(?:个)?(?:周|星期|礼拜)(?:内)?/))) { deadline = makeDeadline("nextweek"); used.push(m[0]); }
    else if ((m = text.match(/(?:这|本)(?:个)?(?:周|星期|礼拜)(?:内|之内)?|周末前/))) { deadline = makeDeadline("week"); used.push(m[0]); }
    else if ((m = text.match(/年底前|年底|今年内|年内/))) { deadline = makeDeadline("year"); used.push(m[0]); }
    else if ((m = text.match(/(\d{1,2}|[一二三四五六七八九十]{1,3})月(?:份)?(?:内|底前|底)?/))) {
      const mo = num(m[1]); let y = +d0.slice(0, 4); if (mo < +d0.slice(5, 7)) y++;
      const from = `${y}-${String(mo).padStart(2, "0")}-01`; deadline = { from: from < d0 ? d0 : from, to: monthEndOf(from), label: `${mo}月内` }; used.push(m[0]);
    }
    if ((m = text.match(/(上午|早上|中午|下午|晚上)?\s*(\d{1,2}|[一二两三四五六七八九十]{1,3})[点:：](半|(\d{1,2})分?)?/))) {
      let h = num(m[2]); const min = m[3] === "半" ? 30 : m[4] ? +m[4] : 0;
      if ((m[1] === "下午" || m[1] === "晚上") && h < 12) h += 12;
      if (m[1] === "中午" && h < 11) h += 12;
      if (!isNaN(h) && h < 24) { time = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`; used.push(m[0]); if (!date && !deadline) date = d0; }
    }
    if (time && deadline) deadline = null;
    const precision = date ? (time ? "time" : "day") : deadline ? "range" : "none";
    return { date, time, deadline, precision, used };
  }
  function parseDur(text) {
    const m = text.match(/(半个?小时)|(\d+|[一两二三四])个?半?(?:小时|钟头)|(\d+)\s*分钟/);
    if (!m) return { min: 0, used: "" };
    const n = (x) => ({ 一: 1, 两: 2, 二: 2, 三: 3, 四: 4 }[x] ?? +x);
    const min = m[1] ? 30 : m[2] ? n(m[2]) * 60 + (m[0].includes("半") ? 30 : 0) : +m[3];
    return { min: Math.min(min, 1440), used: m[0] };
  }
  function parseLocation(text) {
    const m = text.match(/在([^，,。\s]{2,14}?)(?=做|开|见|参加|办理|吃|和|跟|与|，|,|。|$)/) || text.match(/(?:去|到)([^，,。\s]{2,10}?)(?=做|开|见|参加|办理|吃|买|拿|取|，|,|。|$)/);
    return m ? m[1] : "";
  }
  // 一句话 → 待办字段（标题去掉识别出的时间、时长、地点）
  function parseTodo(text) {
    const w = parseWhen(text), du = parseDur(text), loc = parseLocation(text);
    let title = text;
    [...w.used, du.used].filter(Boolean).forEach((u) => (title = title.replace(u, "")));
    if (loc) title = title.replace("在" + loc, "").replace("去" + loc, "").replace("到" + loc, "");
    title = title.replace(/^(提醒我|记得|帮我|我要|要|得)/, "").replace(/^(要|得|需要)/, "").replace(/[，,]?\s*(大概|大约|预计|约)?\s*$/, "").replace(/了[。！!]?$/, "").replace(/^[，,。\s]+|[，,。\s]+$/g, "").trim() || text;
    return { title, date: w.date, time: w.time, duration: du.min, deadline: w.deadline, precision: w.precision, location: loc, used: [...w.used, du.used, loc].filter(Boolean) };
  }

  // ---------------- 标签 ----------------
  const PRESET_FULL = SEED.presetTags.flatMap((p) => [p.top, ...p.subs.map((s) => p.top + "/" + s)]);
  const normTag = (s) => String(s || "").trim().replace(/\s*\/\s*/g, "/").split("/").filter(Boolean).slice(0, 2).join("/");
  function allTags() {
    const set = new Set(state.userTags || []);
    state.files.forEach((f) => (f.tags || []).forEach((t) => set.add(t)));
    state.todos.filter((t) => t.status !== "deleted").forEach((t) => (t.tags || []).forEach((x) => set.add(x)));
    return [...set].sort((a, b) => a.localeCompare(b, "zh"));
  }
  // 侧栏树：父标签数量按条目去重
  function tagTree(items) {
    const tops = new Map();
    items.forEach((it) => {
      const seenTop = new Set();
      (it.tags || []).forEach((tag) => {
        const [top, sub] = tag.split("/");
        if (!tops.has(top)) tops.set(top, { top, ids: new Set(), subs: new Map() });
        const node = tops.get(top);
        if (!seenTop.has(top)) { node.ids.add(it.id); seenTop.add(top); }
        if (sub) { if (!node.subs.has(sub)) node.subs.set(sub, new Set()); node.subs.get(sub).add(it.id); }
      });
    });
    return [...tops.values()].sort((a, b) => a.top.localeCompare(b.top, "zh")).map((n) => ({ top: n.top, count: n.ids.size, subs: [...n.subs.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh")).map(([s, ids]) => ({ name: s, full: n.top + "/" + s, count: ids.size })) }));
  }
  const hasTag = (it, tag) => (it.tags || []).some((t) => t === tag || t.startsWith(tag + "/"));
  const tagChips = (tags) => (tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const AUTO_RULES = [
    [/月报|周报|季度报告|报告|汇报/, "工作/报告"], [/会议|周会|例会|评审|开会/, "工作/会议"], [/方案|策划/, "工作/方案"], [/模板/, "工作/模板"],
    [/(?<!租房|租赁|房屋)(合同|协议)/, "工作/合同协议"], [/客户/, "生意/客户"], [/供应商|进货|报价/, "生意/供应商"], [/订单/, "生意/订单"], [/员工|工资条/, "生意/员工"],
    [/简历/, "求职/简历"], [/面试/, "求职/面试"], [/考试|复习/, "学习/考试"], [/论文/, "学习/论文"], [/课程|上课|网课/, "学习/课程"], [/读书|笔记|《/, "学习/读书笔记"],
    [/车险|保险|保单/, "生活/保险"], [/体检|医院|牙医|复诊|看病|药/, "生活/健康医疗"], [/健身|跑步/, "生活/健康医疗"], [/租房|房租|物业|租赁/, "生活/房屋租住"], [/旅行|旅游|机票|酒店|出行/, "生活/出行旅游"], [/照片|相册/, "生活/照片"], [/身份证|护照|驾照|证件/, "生活/证件"],
    [/发票|报销/, "财务/发票报销"], [/个税|税务|报税/, "财务/税务"], [/理财|基金|股票/, "财务/理财"], [/水电|账单|缴费|转账|开支|费/, "财务/账单"],
    [/孩子|儿子|女儿|家长会|作业/, "家庭/孩子教育"], [/妈妈|爸爸|老人|父母|爷爷|奶奶/, "家庭/老人照护"], [/猫|狗|宠物/, "家庭/宠物"], [/菜谱|做饭|买菜/, "家庭/菜谱"], [/衣服|家里|家务/, "家庭"],
  ];
  // 原型中模拟文件管理模型的增量打标签：最多 3 个，优先已有标签和预设库，被用户删除过的标签不再使用
  function autoTags(text, fileIds = [], cat) {
    const out = [];
    AUTO_RULES.forEach(([re, tag]) => { if (re.test(text) && !out.includes(tag)) out.push(tag); });
    fileIds.map(fileById).filter(Boolean).forEach((f) => (f.tags || []).slice(0, 1).forEach((t) => !out.includes(t) && out.push(t)));
    if (!out.length && cat) out.push({ image: "生活/照片", video: "资料/视频", audio: "资料/参考", pdf: "资料/参考", text: "资料/参考" }[cat] || "资料/参考");
    return out.filter((t) => !(state.blockedTags || []).includes(t)).slice(0, 3);
  }
  // 标签编辑：点 × 去掉，点 ＋ 输入（自动补全已有标签和预设库，没有就新建）
  function tagEditor(el, { value = [], onChange } = {}) {
    let tags = [...value];
    const listId = uid("dl");
    const paint = () => {
      el.innerHTML = `<div class="tag-edit">${tags.map((t, i) => `<span class="tag">${esc(t)}<span class="x" data-i="${i}" title="去掉">×</span></span>`).join("")}<span class="tag add" data-add>＋ 标签</span></div><datalist id="${listId}">${[...new Set([...allTags(), ...PRESET_FULL])].map((t) => `<option value="${esc(t)}">`).join("")}</datalist>`;
      el.querySelectorAll("[data-i]").forEach((x) => (x.onclick = (e) => { e.stopPropagation(); const removed = tags.splice(+x.dataset.i, 1)[0]; paint(); onChange && onChange([...tags], { removed }); }));
      el.querySelector("[data-add]").onclick = (e) => {
        e.stopPropagation();
        const add = e.currentTarget;
        add.outerHTML = `<input class="tag-input" list="${listId}" placeholder="如 工作/报告，回车确认">`;
        const inp = el.querySelector(".tag-input"); inp.focus();
        const commit = () => {
          const raw = inp.value; const v = normTag(raw);
          if (raw.split("/").filter((x) => x.trim()).length > 2) toast("标签最多两层，已保留前两层");
          if (v && !tags.includes(v)) { tags.push(v); paint(); onChange && onChange([...tags], { added: v }); } else paint();
        };
        inp.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); commit(); } if (ev.key === "Escape") paint(); };
        inp.onblur = commit;
      };
    };
    paint();
    return { value: () => [...tags], set: (v) => { tags = [...v]; paint(); } };
  }

  // ---------------- 日期 / 时间 / 时长 快捷选择 ----------------
  const TIME_PRESETS = ["09:00", "10:00", "14:00", "15:00", "20:00"];
  const DEADLINE_KINDS = [["week", "本周内"], ["month", "本月内"], ["nextmonth", "下个月"], ["year", "年底前"]];
  function dateChips() {
    const d0 = today(), sat = addDays(d0, (6 - D(d0).getDay() + 7) % 7), mon = addDays(weekEndOf(d0), 1);
    const satLabel = D(d0).getDay() === 0 || sat <= addDays(d0, 2) ? "下周六" : "本周六";
    const list = [["今天", d0], ["明天", addDays(d0, 1)], ["后天", addDays(d0, 2)], [satLabel, satLabel === "下周六" && sat <= addDays(d0, 2) ? addDays(sat, 7) : sat], ["下周一", mon]];
    return list.filter(([, d], i) => list.findIndex((x) => x[1] === d) === i);
  }
  // 用户手动点过的项记为 touched，之后从待办内容识别出的结果不再覆盖它
  function dateTimePicker(el, init = {}, { onChange, allowDeadline = true } = {}) {
    let v = { date: init.date || "", time: init.time || "", duration: +init.duration || 0, deadline: init.deadline || null };
    let customTime = !!(v.time && !TIME_PRESETS.includes(v.time)), showDateInput = false, dp = null;
    const touched = new Set(), flash = new Set();
    const syncDur = () => { if (dp && v.time) v.duration = dp.value(); };
    const fire = () => onChange && onChange(value());
    const value = () => { syncDur(); return { date: v.date, time: v.date ? v.time : "", duration: v.date && v.time ? v.duration || DEFAULT_DUR : 0, deadline: v.date ? null : v.deadline }; };
    const result = () => { const x = value(); return x.date ? `${cnDate(x.date)} ${x.time ? `${x.time}–${toHM(Math.min(1440, toMin(x.time) + x.duration))}` : "全天"}` : x.deadline ? `待安排 · 期限 ${x.deadline.label}（${x.deadline.to.slice(5).replace("-", "/")} 前）` : "待安排（没有日期，不进日历和每日提醒）"; };
    function paint() {
      syncDur();
      const chips = dateChips(), onChip = chips.some(([, d]) => d === v.date);
      const fl = (k) => (flash.has(k) ? " flash" : "");
      el.innerHTML = `<div class="dtp">
        <div class="dtp-row${fl("date")}"><span class="dtp-k">日期</span><div class="chip-list">${chips.map(([l, d]) => `<span class="chip ${v.date === d ? "on" : ""}" data-d="${d}">${l}<span class="sub">${+d.slice(5, 7)}/${+d.slice(8)}</span></span>`).join("")}${v.date && !onChip ? `<span class="chip on" data-d="${v.date}">${cnDate(v.date)}</span>` : ""}<span class="chip" data-pick>选择日期…</span>${showDateInput ? `<input class="input inline" type="date" data-dateinput value="${v.date}">` : ""}</div></div>
        ${!v.date && allowDeadline ? `<div class="dtp-row${fl("deadline")}"><span class="dtp-k">期限</span><div class="chip-list">${DEADLINE_KINDS.map(([k, l]) => `<span class="chip ${v.deadline && v.deadline.kind === k ? "on" : ""}" data-dl="${k}">${l}</span>`).join("")}${v.deadline && !v.deadline.kind ? `<span class="chip on" data-dl="keep">${esc(v.deadline.label)}</span>` : ""}<span class="hint">可选；没有具体日期但有时间要求时用，最后 7 天会进入提醒</span></div></div>` : ""}
        ${v.date ? `<div class="dtp-row${fl("time")}"><span class="dtp-k">时间</span><div class="chip-list"><span class="chip ${!v.time ? "on" : ""}" data-t="">全天</span>${TIME_PRESETS.map((t) => `<span class="chip ${v.time === t && !customTime ? "on" : ""}" data-t="${t}">${t}</span>`).join("")}<span class="chip ${customTime ? "on" : ""}" data-custom>自定义${customTime && v.time ? " " + v.time : ""}</span>${customTime ? `<input class="input inline" type="time" step="900" data-timeinput value="${v.time}">` : ""}</div></div>` : ""}
        ${v.date && v.time ? `<div class="dtp-row${fl("duration")}"><span class="dtp-k">时长</span><div class="dtp-dur" style="flex:1;min-width:0"></div></div>` : ""}
        <div class="dtp-result">🕒 ${esc(result())}</div></div>`;
      flash.clear();
      if (v.date && v.time) {
        const box = el.querySelector(".dtp-dur");
        dp = durationPicker(box, { time: v.time, duration: v.duration || DEFAULT_DUR });
        box.addEventListener("pointerdown", () => touched.add("duration"));
        box.addEventListener("click", () => setTimeout(() => { el.querySelector(".dtp-result").textContent = "🕒 " + result(); fire(); }));
        box.addEventListener("pointerup", () => setTimeout(() => { el.querySelector(".dtp-result").textContent = "🕒 " + result(); fire(); }));
      } else dp = null;
      el.querySelectorAll("[data-d]").forEach((c) => (c.onclick = () => { touched.add("date"); v.date = v.date === c.dataset.d ? "" : c.dataset.d; showDateInput = false; paint(); fire(); }));
      el.querySelector("[data-pick]").onclick = () => { showDateInput = true; paint(); const i = el.querySelector("[data-dateinput]"); i.focus(); i.showPicker && i.showPicker(); };
      const di = el.querySelector("[data-dateinput]");
      if (di) di.onchange = () => { touched.add("date"); v.date = di.value; showDateInput = false; paint(); fire(); };
      el.querySelectorAll("[data-dl]").forEach((c) => (c.onclick = () => { touched.add("deadline"); const k = c.dataset.dl; if (k === "keep" || (v.deadline && v.deadline.kind === k)) v.deadline = null; else v.deadline = Object.assign(makeDeadline(k), { kind: k }); paint(); fire(); }));
      el.querySelectorAll("[data-t]").forEach((c) => (c.onclick = () => { touched.add("time"); customTime = false; v.time = c.dataset.t; if (v.time && !v.duration) v.duration = DEFAULT_DUR; paint(); fire(); }));
      const cu = el.querySelector("[data-custom]");
      if (cu) cu.onclick = () => { touched.add("time"); customTime = true; if (!v.time) v.time = "12:00"; paint(); el.querySelector("[data-timeinput]").focus(); fire(); };
      const ti = el.querySelector("[data-timeinput]");
      if (ti) ti.onchange = () => { if (!ti.value) return; const m = Math.round(toMin(ti.value) / 15) * 15; v.time = toHM(Math.min(m, 1425)); if (!v.duration) v.duration = DEFAULT_DUR; paint(); fire(); };
    }
    paint();
    return {
      value,
      touched: () => new Set(touched),
      // auto=true：来自内容识别，只填用户没手动改过的项，并闪一下提示
      set(nv, { auto = false } = {}) {
        syncDur();
        ["date", "time", "duration", "deadline"].forEach((k) => {
          if (!(k in nv) || (auto && touched.has(k))) return;
          const val = k === "duration" ? +nv[k] || 0 : nv[k] || (k === "deadline" ? null : "");
          if (auto && JSON.stringify(val) === JSON.stringify(v[k])) return;
          if (auto && !val) return;
          v[k] = val; if (auto) flash.add(k);
        });
        if (nv.time !== undefined) customTime = !!(v.time && !TIME_PRESETS.includes(v.time));
        dp = null;
        paint();
      },
    };
  }

  // ---------------- 撤销提示、完成 / 删除 ----------------
  function undoToast(msg, undo, ms = 5000) {
    let box = document.querySelector(".toasts");
    if (!box) { box = document.createElement("div"); box.className = "toasts"; document.body.appendChild(box); }
    const t = document.createElement("div"); t.className = "toast";
    t.innerHTML = `${esc(msg)} <a href="#" style="color:#8fb4ff;margin-left:10px">撤销</a>`;
    t.querySelector("a").onclick = (e) => { e.preventDefault(); undo(); t.remove(); };
    box.appendChild(t); setTimeout(() => t.remove(), ms);
  }
  const todosChanged = () => { updateBadges(); document.dispatchEvent(new CustomEvent("pa:todos-changed")); };
  function setStatus(list, status, logType) {
    const old = list.map((t) => [t, t.status]);
    list.forEach((t) => { t.status = status; t.updatedAt = nowStr(); });
    save();
    log(logType || "手动更新待办", list.map((t) => t.title).join("、") + " → " + PA.STATUS_LABEL[status]);
    return () => { old.forEach(([t, s]) => (t.status = s)); save(); todosChanged(); };
  }
  function completeTodos(list, { logType, toastMsg } = {}) {
    const undo = setStatus(list, "done", logType);
    undoToast(toastMsg || (list.length === 1 ? `已完成：${list[0].title}` : `已完成 ${list.length} 项`), undo);
    return undo;
  }
  function deleteTodo(t, logType = "删除待办") {
    const undo = setStatus([t], "deleted", logType);
    undoToast(`已删除：${t.title}（可在“已删除”中恢复，附件仍保留在知识库）`, undo);
    todosChanged();
    return undo;
  }
  function purgeTodo(t, after) {
    confirmBox("彻底删除", `彻底删除“${esc(t.title)}”后<b>不能恢复</b>。只删除这条待办及它与文件的关联，知识库中的文件不会被删除。`, () => {
      state.todos = state.todos.filter((x) => x !== t); save(); log("彻底删除待办", t.title); toast("已彻底删除"); todosChanged(); after && after();
    }, "彻底删除", true);
  }
  // 圆形勾选框：所有列表通用，点一下完成，不弹确认，可撤销
  const tickHTML = (t) => (t.status === "deleted" ? "" : `<button class="tick ${t.status === "done" ? "on" : ""}" data-tick="${t.id}" title="${t.status === "done" ? "改回未完成" : "标记完成"}"></button>`);
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tick]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const t = todoById(b.dataset.tick);
    if (!t) return;
    if (t.status === "done") { setStatus([t], "open"); toast("已改回未完成"); todosChanged(); return; }
    b.classList.add("on");
    const row = b.closest("[data-todo-row]") || b.parentElement;
    row && row.classList.add("just-done");
    completeTodos([t]);
    setTimeout(todosChanged, 700);
  }, true);

  // ---------------- 想法记录 ----------------
  const linkify = (text) => esc(text).replace(/https?:\/\/[^\s<，。）)]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  function relTime(at) {
    if (!at) return "";
    const d = diffDays(today(), at.slice(0, 10));
    return d === 0 ? `今天 ${at.slice(11)}` : d === 1 ? `昨天 ${at.slice(11)}` : `${d} 天前`;
  }
  function addRecord(t, text, files = [], pending = []) {
    t.records = t.records || [];
    t.records.unshift({ id: uid("r"), at: nowStr(), text, files: [...files], pending: [...pending] });
    files.forEach((f) => !t.attachments.includes(f) && t.attachments.push(f));
    t.updatedAt = nowStr();
    save();
  }
  // compact：有日期的待办里平时只显示“＋ 追加想法”，有记录后才展开
  function recordsBox(el, t, { compact = false, onChange } = {}) {
    let open = !compact || (t.records || []).length > 0, picked = [];
    const paint = () => {
      const recs = t.records || [];
      if (!open) { el.innerHTML = `<a href="#" class="small" data-open>＋ 追加想法</a> <span class="hint">随手记下新的想法、链接或文件，按时间保存</span>`; el.querySelector("[data-open]").onclick = (e) => { e.preventDefault(); open = true; paint(); el.querySelector("textarea").focus(); }; return; }
      el.innerHTML = `<div class="rec-add"><textarea class="input" rows="2" placeholder="追加一条想法（Ctrl+Enter 保存）；网址会自动变成链接"></textarea>
          <div class="row" style="gap:6px;margin-top:6px"><button class="btn sm" data-att>📎 附件</button><span class="small muted" data-picked>${picked.length ? `已选 ${picked.length} 个文件` : ""}</span><span class="spacer"></span><button class="btn sm primary" data-save>追加</button></div></div>
        <div class="rec-list">${recs.map((r) => `<div class="rec"><div class="rec-at">${esc(relTime(r.at))}<span class="muted"> · ${esc(r.at.slice(5))}</span></div><div class="rec-text">${linkify(r.text)}</div>${r.files.length || (r.pending || []).length ? `<div class="rec-files">${r.files.map(fileById).filter(Boolean).map((f) => `<span class="tag file" data-prev="${f.id}">${fileIcon(f)} ${esc(f.name)}</span>`).join("")}${(r.pending || []).length ? `<span class="small muted">${r.pending.length} 个文件上传中…</span>` : ""}</div>` : ""}</div>`).join("") || '<div class="hint" style="padding:6px 0">还没有想法记录。</div>'}</div>`;
      const ta = el.querySelector("textarea");
      el.querySelector("[data-att]").onclick = () => {
        const input = document.createElement("input"); input.type = "file"; input.multiple = true;
        input.onchange = () => { const res = startUpload([...input.files], { quiet: true, todoId: t.id }); picked.push(...res.filter((r) => r.fileId || r.uploadId)); el.querySelector("[data-picked]").textContent = `已选 ${picked.length} 个文件`; };
        input.click();
      };
      const commit = () => {
        const text = ta.value.trim();
        if (!text && !picked.length) { toast("先写点内容或选择文件"); return; }
        const files = picked.filter((r) => r.fileId).map((r) => r.fileId);
        const pending = picked.filter((r) => !r.fileId).map((r) => { const u = state.uploads.find((x) => x.id === r.uploadId); return u && u.fileId ? null : r.uploadId; }).filter(Boolean);
        picked.filter((r) => !r.fileId).forEach((r) => { const u = state.uploads.find((x) => x.id === r.uploadId); if (u && u.fileId) files.push(u.fileId); });
        addRecord(t, text || "（附件）", files, pending);
        log("手动更新待办", `${t.title}：追加想法`);
        picked = []; paint(); onChange && onChange();
      };
      el.querySelector("[data-save]").onclick = commit;
      ta.onkeydown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); } };
      el.querySelectorAll("[data-prev]").forEach((x) => (x.onclick = () => openPreview(x.dataset.prev)));
    };
    paint();
    document.addEventListener("pa:uploads-tick", function h() { if (!el.isConnected) return document.removeEventListener("pa:uploads-tick", h); if (open && (t.records || []).some((r) => (r.pending || []).length) && !el.contains(document.activeElement)) paint(); });
    return { refresh: paint };
  }

  // ---------------- 表单附件：直接上传 + 从知识库选择 ----------------
  // todoId 可以是还没创建的待办的预分配编号：上传完成时待办已创建就自动关联，否则由表单在创建时带上
  function attachBox(el, { fileIds = [], todoId } = {}) {
    let items = fileIds.map((id) => ({ fileId: id }));
    let newUploads = 0;
    const has = (fid) => items.some((x) => x.fileId === fid || (x.uploadId && state.uploads.find((u) => u.id === x.uploadId)?.fileId === fid));
    const add = (files) => {
      const res = startUpload(files, { quiet: true, todoId });
      res.forEach((r) => {
        if (r.fileId) { if (!has(r.fileId)) items.push({ fileId: r.fileId }); }
        else if (r.uploadId && !items.some((x) => x.uploadId === r.uploadId)) { items.push({ uploadId: r.uploadId }); if (r.kind === "new") newUploads++; }
      });
      paint();
    };
    function paint() {
      items.forEach((x) => { if (x.uploadId) { const u = state.uploads.find((y) => y.id === x.uploadId); if (u && u.fileId) { x.fileId = u.fileId; delete x.uploadId; } } });
      items = items.filter((x, i) => !x.fileId || items.findIndex((y) => y.fileId === x.fileId) === i);
      el.innerHTML = `<div class="att-box" data-drop>
        <div class="att-list">${items.map((x, i) => {
          if (x.fileId) { const f = fileById(x.fileId); return f ? `<span class="tag file">${fileIcon(f)} ${esc(f.name)}<span class="x" data-rm="${i}" title="移除（不删除知识库中的文件）">×</span></span>` : ""; }
          const u = state.uploads.find((y) => y.id === x.uploadId);
          if (!u) return "";
          const st = u.status === "failed" ? `<span style="color:var(--danger)">失败</span>` : u.status === "uploading" ? `上传中 ${Math.floor(u.progress)}%` : u.status === "waiting" ? "等待上传" : "处理中…";
          return `<span class="tag file uploading">${fileIcon(u)} ${esc(u.displayName || u.name)} <span class="small muted">${st}</span><span class="x" data-rm="${i}">×</span></span>`;
        }).join("")}</div>
        <div class="row" style="gap:8px"><button type="button" class="btn sm" data-up>⬆ 上传文件</button><button type="button" class="btn sm" data-kb>从知识库选择</button><span class="hint">或把文件拖到这里 · 新文件同时保存到个人知识库，可以不等上传完成就创建</span></div></div>`;
      el.querySelectorAll("[data-rm]").forEach((x) => (x.onclick = () => { items.splice(+x.dataset.rm, 1); paint(); }));
      el.querySelector("[data-up]").onclick = () => { const input = document.createElement("input"); input.type = "file"; input.multiple = true; input.onchange = () => add([...input.files]); input.click(); };
      el.querySelector("[data-kb]").onclick = () => kbPicker(items.filter((x) => x.fileId).map((x) => x.fileId), (ids) => { items = items.filter((x) => x.uploadId).concat(ids.map((id) => ({ fileId: id }))); paint(); });
      const zone = el.querySelector("[data-drop]");
      zone.ondragover = (e) => { e.preventDefault(); zone.classList.add("over"); };
      zone.ondragleave = () => zone.classList.remove("over");
      zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove("over"); add([...e.dataTransfer.files]); };
    }
    paint();
    document.addEventListener("pa:uploads-tick", function h() { if (!el.isConnected) return document.removeEventListener("pa:uploads-tick", h); if (items.some((x) => x.uploadId)) paint(); });
    return {
      fileIds: () => { paint(); return items.filter((x) => x.fileId).map((x) => x.fileId); },
      pending: () => items.filter((x) => x.uploadId).map((x) => x.uploadId),
      newUploadCount: () => newUploads,
    };
  }
  function kbPicker(selected, onOk) {
    const sel = new Set(selected);
    const files = state.files.filter((f) => f.status === "indexed");
    modal({
      title: "从个人知识库选择", wide: true,
      body: `<input class="input" placeholder="搜索文件名或标签" data-q style="margin-bottom:8px"><div class="table-wrap" style="max-height:340px"><table class="table" data-tb></table></div>`,
      onMount: (m) => {
        const tb = m.querySelector("[data-tb]"), q = m.querySelector("[data-q]");
        const paint = () => {
          const k = q.value.trim();
          tb.innerHTML = files.filter((f) => !k || f.name.includes(k) || (f.tags || []).some((t) => t.includes(k))).map((f) => `<tr><td style="width:30px"><input type="checkbox" value="${f.id}" ${sel.has(f.id) ? "checked" : ""}></td><td>${fileIcon(f)} ${esc(f.name)}</td><td>${tagChips(f.tags)}</td></tr>`).join("") || '<tr><td class="empty">没有匹配的文件</td></tr>';
          tb.querySelectorAll("input").forEach((c) => (c.onchange = () => (c.checked ? sel.add(c.value) : sel.delete(c.value))));
        };
        q.oninput = paint; paint(); setTimeout(() => q.focus());
      },
      actions: [{ label: "取消" }, { label: "确定", primary: true, onClick: () => onOk([...sel]) }],
    });
  }

  // ---------------- 近 3 天（助手页、邮件共用） ----------------
  function upcoming() {
    const d0 = today(), d1 = addDays(d0, 1), d2 = addDays(d0, 2);
    const open = state.todos.filter((t) => t.status === "open" && t.date);
    const sort = (a, b) => (a.date + (a.time || "99")).localeCompare(b.date + (b.time || "99"));
    return {
      overdue: open.filter((t) => t.date < d0).sort(sort),
      days: [["今天", d0], ["明天", d1], ["后天", d2]].map(([label, date]) => ({ label, date, list: open.filter((t) => t.date === date).sort(sort) })),
      deadlines: state.todos.filter(inDeadlineWindow).sort((a, b) => a.deadline.to.localeCompare(b.deadline.to)),
      unscheduled: state.todos.filter((t) => t.status === "open" && !t.date),
    };
  }
  const upcomingCount = () => { const u = upcoming(); return u.overdue.length + u.days.reduce((s, d) => s + d.list.length, 0) + u.deadlines.length; };
  function previewMail() {
    const u = me(), up = upcoming();
    const item = (t) => `<li style="margin:4px 0">${t.date ? (t.time ? timeRange(t) : "全天") : esc(deadlineText(t))} ${esc(t.title)}${t.location ? "（" + esc(t.location) + "）" : ""} <a href="#" data-mail-done="${t.id}" style="font-size:12px;margin-left:6px">✓ 完成</a></li>`;
    const sec = (title, list) => (list.length ? `<h4 style="margin:12px 0 6px">${title}</h4><ul style="margin:0;padding-left:18px">${list.map(item).join("")}</ul>` : "");
    const unsched = up.unscheduled.sort((a, b) => !!b.starred - !!a.starred);
    const body = sec("已逾期", up.overdue) + up.days.map((d) => sec(`${d.label}（${cnDate(d.date)}）`, d.list)).join("") + sec("期限快到了", up.deadlines);
    modal({
      title: "邮件预览", wide: true,
      body: `<div class="small muted">发件人：${esc(state.config.mail.fromName)} &lt;${esc(state.config.mail.from)}&gt;<br>收件人：${esc(u.email)}<br>主题：【日常助手】最近 3 天待办提醒（${today()}）</div><hr style="border:none;border-top:1px solid var(--border)">
        <div>你好 ${esc(u.name)}，以下是你最近 3 天的待办：</div>${body || '<p class="muted">最近 3 天没有待办。</p>'}
        <div style="margin-top:14px;padding:10px;background:var(--bg);border-radius:6px"><b>每周一附加：你有 ${unsched.length} 件待安排的事</b>，要排进这周吗？<ul style="margin:6px 0 0;padding-left:18px">${unsched.slice(0, 5).map((t) => `<li>${t.starred ? "⭐ " : ""}${esc(t.title)}${t.deadline ? ` <span style="color:var(--muted)">${esc(deadlineText(t))}</span>` : ""}</li>`).join("")}</ul><div class="hint">超过 30 天没有动静的事项，会顺带问一句“还要做吗？”</div></div>
        <div class="note" style="margin-top:12px">“✓ 完成”是免登录的一次性链接（带签名、有有效期）。原型里点击会直接完成该待办；是否实现在需求阶段决定。</div>`,
      onMount: (m) => m.querySelectorAll("[data-mail-done]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); const t = todoById(a.dataset.mailDone); if (t && t.status === "open") { completeTodos([t], { toastMsg: `已通过邮件链接完成：${t.title}` }); todosChanged(); a.outerHTML = '<span style="color:var(--success);font-size:12px;margin-left:6px">已完成</span>'; } })),
    });
  }

  // 其他标签页修改了数据（如另一个页面上传完成）时同步过来
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY || !e.newValue || ticking) return;
    try {
      const n = JSON.parse(e.newValue);
      ["files", "todos", "inbox", "uploads", "userTags", "blockedTags", "tagHistory", "tagRenames"].forEach((k) => (state[k] = n[k]));
      updateBadges();
      document.dispatchEvent(new CustomEvent("pa:files-changed"));
      document.dispatchEvent(new CustomEvent("pa:todos-changed"));
    } catch (err) {}
  });

  // ---------------- layout ----------------
  const NAV_USER = [
    ["home", "home.html", "💬", "助手"],
    ["todos", "todos.html", "✅", "待办事项"],
    ["inbox", "inbox.html", "📥", "待确认"],
    ["files", "files.html", "📁", "个人知识库"],
    ["profile", "profile.html", "⚙️", "个人设置"],
  ];
  const NAV_ADMIN = [
    ["admin-users", "admin-users.html", "👥", "用户管理"],
    ["admin-models", "admin-models.html", "🧠", "模型与服务"],
    ["admin-system", "admin-system.html", "🛠", "系统设置"],
    ["admin-filetypes", "admin-filetypes.html", "📄", "文件类型"],
    ["admin-usage", "admin-usage.html", "📊", "存储与数据用量"],
    ["admin-logs", "admin-logs.html", "📜", "操作日志"],
  ];
  function updateBadges() {
    const n = state.inbox.length;
    document.querySelectorAll('[data-badge="inbox"]').forEach((el) => { el.textContent = n; el.classList.toggle("hidden", !n); });
    const r = upcomingCount();
    document.querySelectorAll('[data-badge="home"]').forEach((el) => { el.textContent = r; el.classList.toggle("hidden", !r); });
  }

  function mount({ page, title, admin = false, narrow = true }) {
    if (!state.session) { location.href = "index.html"; return false; }
    if (admin && state.session.role !== "admin") { location.href = "home.html"; return false; }
    const u = me();
    const content = document.getElementById("page");
    const nav = (items) => items.map(([k, href, ico, label]) => `<a class="nav-item ${k === page ? "active" : ""}" href="${href}"><span class="ico">${ico}</span>${label}${k === "inbox" || k === "home" ? `<span class="count hidden" data-badge="${k}"></span>` : ""}</a>`).join("");
    const app = document.createElement("div");
    app.className = "app";
    app.innerHTML = `
      <aside class="sidebar">
        <div class="brand"><span class="logo">助</span>个人日常助手</div>
        <div class="nav-group"><div class="nav-title">我的</div>${nav(NAV_USER)}</div>
        ${state.session.role === "admin" ? `<div class="nav-group"><div class="nav-title">系统管理（管理员）</div>${nav(NAV_ADMIN)}</div>` : ""}
        <div class="sidebar-foot">ITER1 · 原型 v3 · 数据仅保存在本浏览器<br><button id="reset-demo" style="margin-top:6px">重置演示数据</button></div>
      </aside>
      <div class="workspace">
        <div class="main-col">
          <header class="topbar"><span class="title">${esc(title)}</span><a class="proto-tag" href="../../" title="查看所有版本">ITER1 · 原型 v3</a><span class="spacer"></span>
            <div class="user-chip" id="user-chip"><span class="avatar">${esc((u?.name || "?").slice(0, 1))}</span><span>${esc(u?.name || "")}</span><span class="badge ${state.session.role === "admin" ? "blue" : ""}">${state.session.role === "admin" ? "管理员" : "一般用户"}</span>
              <div class="menu" id="user-menu"><a href="profile.html">个人设置</a><button id="logout">退出登录</button></div></div>
          </header>
          <div class="content ${narrow ? "narrow" : ""}" id="content"></div>
        </div>
        <aside class="drawer hidden" id="drawer"></aside>
      </div>
      <div class="preview-toggle hidden" id="preview-toggle"></div>`;
    document.body.prepend(app);
    app.querySelector("#content").appendChild(content);
    app.querySelector("#user-chip").onclick = (e) => { e.stopPropagation(); app.querySelector("#user-menu").classList.toggle("open"); };
    app.querySelector("#logout").onclick = () => { log("退出登录", "—"); state.session = null; save(); location.href = "index.html"; };
    app.querySelector("#reset-demo").onclick = () => confirmBox("重置演示数据", "将清除你在原型中做的所有修改，恢复初始演示数据。", reset, "重置", true);
    app.querySelector("#preview-toggle").onclick = () => { pv.hidden = false; savePv(); renderPreview(); };
    updateBadges(); if (!admin) renderPreview(); renderUploads();
    if (state.uploads.some((x) => !["done", "failed"].includes(x.status))) ensureTick();
    return true;
  }

  window.PA = {
    state, save, reset, esc, fmtSize, fmtDate, today, weekday, relDay, catOf, CAT_LABEL, fileIcon, canPreview, fileById, todoById, linkedTodos,
    uid, nowStr, qs, log, DUR_PRESETS, DEFAULT_DUR, fmtDur, toMin, toHM, endOf, timeRange, durationPicker, toast, modal, confirmBox, multiSelect, download, md, highlight, openPreview, renderPreview, pickFiles, startUpload,
    showUploadPanel, mount, updateBadges, usedBytes, quotaBytes, me, SEED,
    addDays, diffDays, cnDate, makeDeadline, daysLeft, inDeadlineWindow, deadlineText, whenText, DEADLINE_KINDS,
    parseWhen, parseDur, parseLocation, parseTodo,
    PRESET_FULL, normTag, allTags, tagTree, hasTag, tagChips, autoTags, tagEditor,
    TIME_PRESETS, dateTimePicker, undoToast, todosChanged, setStatus, completeTodos, deleteTodo, purgeTodo, tickHTML,
    linkify, relTime, addRecord, recordsBox, attachBox, kbPicker, upcoming, upcomingCount, previewMail,
    ADMIN_TYPES: SEED.logTypesAdmin,
    SOURCE_LABEL: { text: "文字输入", manual: "手动创建", meeting: "会议录音" },
    STATUS_LABEL: { open: "未完成", done: "已完成", deleted: "已删除" },
  };
})();
