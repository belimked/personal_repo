(function () {
  const SEED = window.PA_SEED;
  const KEY = "pa_proto_v1";
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------------- store ----------------
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.version === 4) return s;
    } catch (e) {}
    const s = clone({ version: 4, files: SEED.files, todos: SEED.todos, inbox: SEED.inbox, users: SEED.users, fileTypes: SEED.fileTypes, models: SEED.models, logs: SEED.logs, config: SEED.config, uploads: [], session: null, prefs: { tz: "UTC+8", dailyMail: true, mailTime: "08:00" } });
    localStorage.setItem(KEY, JSON.stringify(s));
    return s;
  }
  const state = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  function reset() {
    const session = state.session;
    localStorage.removeItem(KEY);
    sessionStorage.clear();
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
  const pv = JSON.parse(sessionStorage.getItem("pa_preview") || '{"tabs":[],"active":null,"width":460,"hidden":false}');
  const savePv = () => sessionStorage.setItem("pa_preview", JSON.stringify(pv));
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
      <div class="drawer-meta">${fileIcon(f)}<b style="color:var(--text)">${esc(f.name)}</b><span>${fmtSize(f.size)}</span><span>📁 ${esc(f.folder)}</span><span>${links.length ? "关联 " + links.length + " 个待办" : "未关联待办"}</span><span class="spacer"></span><button class="btn sm" data-act="dl">下载</button></div>
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
  const FOLDER_BY_CAT = { text: "未整理/文档", doc: "未整理/文档", other: "未整理/其他", image: "生活/照片", pdf: "未整理/文档", audio: "未整理/音频", video: "资料/视频" };
  const UPLOAD_CONCURRENCY = 3, PROCESS_CONCURRENCY = 2;
  let panelCollapsed = sessionStorage.getItem("pa_up_collapsed") === "1";
  let panelFilter = "all";

  function allowedExts() { return new Set(state.fileTypes.map((t) => t.ext)); }

  function pickFiles(opts = {}) {
    const input = document.createElement("input");
    input.type = "file"; input.multiple = true;
    input.onchange = () => startUpload([...input.files], opts);
    input.click();
  }

  function startUpload(list, opts = {}) {
    const c = state.config.upload;
    if (!list.length) return;
    const exts = allowedExts();
    const accepted = [], rejected = [], dups = [];
    for (const f of list) {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      if (!f.name.includes(".") || !exts.has(ext)) rejected.push([f.name, `不支持的文件类型 .${ext}`]);
      else if (f.size > c.maxFileMB * 1024 * 1024) rejected.push([f.name, `超过单文件上限 ${c.maxFileMB}MB（${fmtSize(f.size)}）`]);
      else if (state.files.some((x) => x.name === f.name && Math.abs(x.size - f.size) < 1024)) dups.push(f);
      else accepted.push(f);
    }
    const total = accepted.reduce((s, f) => s + f.size, 0);
    const remain = quotaBytes() - usedBytes();
    let blocker = "";
    if (list.length > c.maxCount) blocker = `一次最多上传 ${c.maxCount} 个文件，本次选择了 ${list.length} 个。`;
    else if (total > remain) blocker = `存储空间不足：本次需要 ${fmtSize(total)}，剩余配额 ${fmtSize(Math.max(0, remain))}。`;
    else if (total > c.maxBatchMB * 1024 * 1024) blocker = `单次上传总大小不能超过 ${c.maxBatchMB}MB，本次为 ${fmtSize(total)}。`;

    const rows = [
      ...accepted.map((f) => `<tr><td>${esc(f.name)}</td><td>${fmtSize(f.size)}</td><td><span class="badge green">可上传</span></td></tr>`),
      ...dups.map((f) => `<tr><td>${esc(f.name)}</td><td>${fmtSize(f.size)}</td><td><span class="badge orange">已存在，跳过${opts.todoId ? "并直接关联" : ""}</span></td></tr>`),
      ...rejected.map(([n, r]) => `<tr><td>${esc(n)}</td><td></td><td><span class="badge red">${esc(r)}</span></td></tr>`),
    ].join("");
    modal({
      title: "上传确认", wide: true,
      body: `${blocker ? `<div class="note warn">⛔ ${esc(blocker)}</div>` : ""}
        <div class="row" style="margin-bottom:10px"><span>共选择 <b>${list.length}</b> 个文件</span><span class="badge green">可上传 ${accepted.length}（${fmtSize(total)}）</span>${dups.length ? `<span class="badge orange">重复 ${dups.length}</span>` : ""}${rejected.length ? `<span class="badge red">不可上传 ${rejected.length}</span>` : ""}</div>
        <div class="hint" style="margin-bottom:8px">限制：单次 ≤ ${c.maxCount} 个、≤ ${c.maxBatchMB}MB；单文件 ≤ ${c.maxFileMB}MB；剩余配额 ${fmtSize(Math.max(0, remain))}（配额优先校验）。重复判断：真实系统在浏览器计算 SHA-256，只在本人文件内比对。</div>
        <div class="table-wrap" style="max-height:300px"><table class="table"><tr><th>文件</th><th>大小</th><th>结果</th></tr>${rows}</table></div>`,
      actions: [{ label: "取消" }, ...(blocker || !accepted.length ? [] : [{ label: `开始上传 ${accepted.length} 个文件`, primary: true, onClick: () => enqueue(accepted, dups, opts) }])],
    });
  }

  function enqueue(accepted, dups, opts) {
    const batch = uid("b");
    accepted.forEach((f, i) => {
      const ext = f.name.split(".").pop().toLowerCase();
      const cat = catOf(ext);
      state.uploads.push({ id: uid("u"), batch, seq: Date.now() + i, name: f.name, size: f.size, ext, cat, status: "waiting", progress: 0, stage: 0, stageT: 0, todoId: opts.todoId || null });
    });
    if (opts.todoId) {
      const t = todoById(opts.todoId);
      dups.forEach((d) => { const ex = state.files.find((x) => x.name === d.name); if (ex && !t.attachments.includes(ex.id)) t.attachments.push(ex.id); });
    }
    log("上传文件", `上传 ${accepted.length} 个文件，共 ${fmtSize(accepted.reduce((s, f) => s + f.size, 0))}`);
    panelCollapsed = false; sessionStorage.setItem("pa_up_hidden", "0");
    save(); renderUploads(); ensureTick();
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
  }

  function finish(u) {
    u.status = "done";
    const f = { id: uid("f"), name: u.name, ext: u.ext, cat: u.cat, size: u.size, folder: FOLDER_BY_CAT[u.cat], uploadedAt: nowStr(), status: "indexed" };
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
    if (u.todoId) { const t = todoById(u.todoId); if (t && !t.attachments.includes(f.id)) t.attachments.push(f.id); }
    u.fileId = f.id;
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
    const hidden = sessionStorage.getItem("pa_up_hidden") === "1";
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
    panel.querySelector('[data-a="toggle"]').onclick = () => { panelCollapsed = !panelCollapsed; sessionStorage.setItem("pa_up_collapsed", panelCollapsed ? "1" : "0"); renderUploads(); };
    panel.querySelector('[data-a="close"]').onclick = () => {
      if (running) { sessionStorage.setItem("pa_up_hidden", "1"); toast("已隐藏，处理会在后台继续；可在“个人知识库”页重新打开"); }
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
    if (panel) panel.style.right = (drawer && !drawer.classList.contains("hidden") ? drawer.offsetWidth + 20 : 20) + "px";
  }
  function retry(u) { u.status = "queued"; u.retried = true; u.stage = 0; u.stageT = 0; u.error = ""; }
  function showUploadPanel() { sessionStorage.setItem("pa_up_hidden", "0"); renderUploads(); if (!state.uploads.length) toast("暂无上传记录"); }

  // ---------------- layout ----------------
  const NAV_USER = [
    ["home", "home.html", "💬", "助手"],
    ["reminders", "reminders.html", "⏰", "近 3 天提醒"],
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
    const r = state.todos.filter((t) => t.status === "open" && t.date && t.date <= SEED.dayStr(2)).length;
    document.querySelectorAll('[data-badge="reminders"]').forEach((el) => { el.textContent = r; el.classList.toggle("hidden", !r); });
  }

  function mount({ page, title, admin = false, narrow = true }) {
    if (!state.session) { location.href = "index.html"; return false; }
    if (admin && state.session.role !== "admin") { location.href = "home.html"; return false; }
    const u = me();
    const content = document.getElementById("page");
    const nav = (items) => items.map(([k, href, ico, label]) => `<a class="nav-item ${k === page ? "active" : ""}" href="${href}"><span class="ico">${ico}</span>${label}${k === "inbox" || k === "reminders" ? `<span class="count hidden" data-badge="${k}"></span>` : ""}</a>`).join("");
    const app = document.createElement("div");
    app.className = "app";
    app.innerHTML = `
      <aside class="sidebar">
        <div class="brand"><span class="logo">助</span>个人日常助手</div>
        <div class="nav-group"><div class="nav-title">我的</div>${nav(NAV_USER)}</div>
        ${state.session.role === "admin" ? `<div class="nav-group"><div class="nav-title">系统管理（管理员）</div>${nav(NAV_ADMIN)}</div>` : ""}
        <div class="sidebar-foot">原型 V1 · 数据仅保存在本浏览器<br><button id="reset-demo" style="margin-top:6px">重置演示数据</button></div>
      </aside>
      <div class="workspace">
        <div class="main-col">
          <header class="topbar"><span class="title">${esc(title)}</span><span class="proto-tag">原型演示</span><span class="spacer"></span>
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
    uid, nowStr, qs, log, toast, modal, confirmBox, multiSelect, download, md, highlight, openPreview, renderPreview, pickFiles, startUpload,
    showUploadPanel, mount, updateBadges, usedBytes, quotaBytes, me, SEED,
    ADMIN_TYPES: SEED.logTypesAdmin,
    SOURCE_LABEL: { text: "文字输入", manual: "手动创建", meeting: "会议录音" },
    STATUS_LABEL: { open: "未完成", done: "已完成", archived: "已归档" },
  };
})();
