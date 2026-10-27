// 助手对话：消息统一为 {id, role, kind, text, data, ts}，按 kind 渲染；data 只放可序列化的内容，重新渲染只依赖 data 和当前状态
(function () {
  const PA = window.PA;
  const { state, esc, save, toast, log } = PA;
  const KINDS = {};
  const LIVE_KINDS = new Set(["greet", "overdue"]);
  const typingMs = () => (window.PA_TYPING_MS ?? 500);
  const botName = () => state.prefs.assistantName || "小禾";
  function messages() {
    state.chat = state.chat || {};
    const k = PA.today();
    return (state.chat[k] = state.chat[k] || []);
  }
  let box = null;
  const scrollEnd = (el) => el && el.scrollIntoView && el.scrollIntoView({ block: "end" });

  // ---------- 消息 ----------
  function renderMsg(m) {
    if (!box) return null;
    let el = box.querySelector(`[data-mid="${m.id}"]`);
    const fresh = !el;
    if (fresh) { el = document.createElement("div"); el.dataset.mid = m.id; box.insertBefore(el, box.querySelector(".msg.typing")); }
    el.className = "msg " + (m.role === "user" ? "me" : "bot");
    el.dataset.kind = m.kind;
    el.innerHTML = (m.role === "user" ? "" : `<div class="who" title="${esc(botName())}">${esc(botName().slice(0, 1))}</div>`) + '<div class="bubble"></div>';
    const b = el.querySelector(".bubble");
    (KINDS[m.kind] || KINDS.text)(b, m);
    if (fresh) scrollEnd(el);
    return b;
  }
  function push(role, kind, text, data = {}) {
    const m = { id: PA.uid("m"), role, kind, text: text || "", data, ts: PA.nowStr() };
    messages().push(m);
    save();
    renderMsg(m);
    document.dispatchEvent(new CustomEvent("pa:chat-message", { detail: m }));
    return m;
  }
  const bot = (kind, text, data) => push("bot", kind, text, data);
  const setData = (m, patch) => { Object.assign(m.data, patch); save(); renderMsg(m); };

  // 每条助手回复前先显示“正在输入”，回复按顺序排队
  let queue = Promise.resolve(), pending = 0;
  function showTyping() {
    const el = document.createElement("div");
    el.className = "msg bot typing";
    el.innerHTML = `<div class="who">${esc(botName().slice(0, 1))}</div><div class="bubble"><span class="dots"><i></i><i></i><i></i></span><span class="typing-text">正在输入…</span></div>`;
    box.appendChild(el); scrollEnd(el);
    return el;
  }
  function reply(fn) {
    const run = () => new Promise((ok) => {
      const t = showTyping();
      setTimeout(() => { t.remove(); try { fn(); } finally { ok(); } }, typingMs());
    });
    const p = (pending++ ? queue.then(run) : run()).finally(() => pending--);
    queue = p.catch(() => {});
    return p;
  }

  KINDS.text = (b, m) => {
    b.innerHTML = (m.text ? `<p>${esc(m.text).replace(/\n/g, "<br>")}</p>` : "") + (m.data.html || "")
      + ((m.data.files || []).length ? `<div class="me-files">${m.data.files.map((n) => `<span>📎 ${esc(n)}</span>`).join("")}</div>` : "");
  };

  // ---------- 撤销（可序列化） ----------
  function applyUndo(u) {
    if (u.op === "fields") u.items.forEach(([id, before]) => { const t = PA.todoById(id); if (t) Object.assign(t, before, { updatedAt: PA.nowStr() }); });
    else if (u.op === "status") u.items.forEach(([id, s]) => { const t = PA.todoById(id); if (t) { t.status = s; t.updatedAt = PA.nowStr(); } });
    else if (u.op === "remove") { const t = PA.todoById(u.id); state.todos = state.todos.filter((x) => x.id !== u.id); if (t) log("彻底删除待办", `撤销新建：${t.title}`); if (followUp?.todoId === u.id) followUp = null; }
    else if (u.op === "record") {
      const t = PA.todoById(u.id);
      if (t) { t.records = (t.records || []).filter((r) => r.id !== u.recId); t.attachments = u.before; }
      u.pending.forEach((id) => { const up = state.uploads.find((x) => x.id === id); if (up) up.todoIds = (up.todoIds || []).filter((x) => x !== u.id); });
    }
    save(); PA.todosChanged();
  }

  // ---------- 通用片段 ----------
  const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const rangeText = (t) => (t.time ? PA.timeRange(t) : "全天");
  const placeText = (t) => (t.date ? `已加入待办：${PA.cnDate(t.date)} ${rangeText(t)} · ${t.title}` : t.deadline ? `已放入待安排，期限 ${t.deadline.label} · ${t.title}` : `已放入待安排 · ${t.title}`);
  const todoLine = (t) => `<b>${esc(t.title)}</b> <span class="muted small">${esc(PA.whenText(t))}${t.location ? " · " + esc(t.location) : ""}</span>`;
  const snapshot = (t) => JSON.parse(JSON.stringify({ date: t.date, time: t.time, duration: t.duration, deadline: t.deadline || null, title: t.title, location: t.location }));
  const shortDate = (ds) => PA.cnDate(ds).replace(/（.*/, "");
  const rowHTML = (t, tail = "") => `<div class="crow ${t.status !== "open" ? "done" : ""}" data-todo-row>${PA.tickHTML(t)}<span class="ct">${t.date && t.date !== PA.today() ? esc(shortDate(t.date)) + " " : ""}${t.date ? rangeText(t) : "待安排"}</span><a class="ci" href="todo.html?id=${t.id}">${esc(t.title)}</a>${t.location ? `<span class="cl" title="${esc(t.location)}">📍${esc(t.location)}</span>` : ""}${tail}</div>`;
  const newTodo = (o) => ({ id: PA.uid("t"), title: "", date: "", time: "", duration: 0, deadline: null, location: "", status: "open", source: "text", attachments: [], notes: "", tags: [], records: [], starred: false, createdAt: PA.nowStr(), updatedAt: PA.nowStr(), ...o });

  function editForm(host, t, onSaved) {
    host.innerHTML = `<div class="field"><label>待办内容</label><input class="input" data-k="title" value="${esc(t.title)}"></div><div data-dtp></div>
      <div class="field" style="margin-top:8px"><label>地点</label><input class="input" data-k="location" value="${esc(t.location || "")}" placeholder="可不填"></div>
      <div class="actions"><button class="btn sm primary" data-e="save">保存</button><button class="btn sm" data-e="cancel">取消</button></div>`;
    const dtp = PA.dateTimePicker(host.querySelector("[data-dtp]"), { date: t.date, time: t.time, duration: t.duration, deadline: t.deadline });
    host.querySelector('[data-e="cancel"]').onclick = () => (host.innerHTML = "");
    host.querySelector('[data-e="save"]').onclick = () => {
      const title = host.querySelector('[data-k="title"]').value.trim();
      if (!title) { toast("待办内容不能为空"); return; }
      const v = dtp.value();
      Object.assign(t, { title, location: host.querySelector('[data-k="location"]').value.trim(), date: v.date, time: v.time, duration: v.duration, deadline: v.deadline, updatedAt: PA.nowStr() });
      save(); log("文字输入·更新待办", `${t.title}：${PA.whenText(t)}`); PA.todosChanged(); onSaved();
    };
  }

  // ---------- 附件 ----------
  let live = [];
  const onTick = () => { live = live.filter(([el, fn]) => el.isConnected && (fn(), true)); };
  const plain = (res) => res.map((r) => ({ kind: r.kind, reason: r.reason || "", uploadId: r.uploadId || "", fileId: r.fileId || "", name: r.f.name }));
  function fileStatus(r) {
    if (r.kind === "dup" || r.kind === "same") return ["green", r.reason];
    if (r.kind === "rejected" || r.kind === "ignored") return ["red", r.reason + "，未关联"];
    const u = state.uploads.find((x) => x.id === r.uploadId);
    if (!u) return ["red", "未上传"];
    if (u.status === "done") return ["green", r.kind === "joining" ? "另一个页面已上传完成，已关联" : "已上传到知识库"];
    if (u.status === "failed") return ["red", `处理失败：${u.error}（可在上传面板重试）`];
    if (r.kind === "joining") return ["blue", "另一个页面正在上传该文件，完成后自动关联"];
    return ["blue", u.status === "uploading" ? `上传中 ${Math.floor(u.progress)}%` : u.status === "waiting" ? "等待上传" : "处理中，完成后自动关联"];
  }
  const fileName = (r) => { const u = r.uploadId && state.uploads.find((x) => x.id === r.uploadId); return (r.fileId && PA.fileById(r.fileId)?.name) || (u && (u.displayName || u.name)) || r.name; };
  const filesHTML = (res) => res.map((r) => { const [c, s] = fileStatus(r); return `<div>📎 ${esc(fileName(r))} <span class="badge ${c}">${esc(s)}</span></div>`; }).join("");
  function liveFiles(el, res) { const p = () => (el.innerHTML = filesHTML(res)); p(); if (res.some((r) => r.uploadId)) live.push([el, p]); }
  const uploadToKB = (files) => (files.length ? plain(PA.startUpload(files, { quiet: true })) : []);
  const mediaName = (n) => ["audio", "video"].includes(PA.catOf(n.split(".").pop() || ""));

  // ---------- 问候与逾期 ----------
  const hiWord = () => { const h = new Date().getHours(); return h < 5 ? "夜深了" : h < 11 ? "早上好" : h < 13 ? "中午好" : h < 18 ? "下午好" : "晚上好"; };
  KINDS.greet = (b, m) => {
    const list = m.data.ids.map(PA.todoById).filter((t) => t && t.status !== "deleted");
    const left = list.filter((t) => t.status === "open");
    const first = left.find((t) => t.time) || left[0];
    const name = PA.me()?.name || "";
    const lead = !list.length ? "今天没有安排的事，想到什么随时跟我说。"
      : !left.length ? `今天的 ${list.length} 件事都做完了，辛苦了。`
      : `今天有 ${left.length} 件事${first.time ? `，最早是 <b>${esc(first.time)} ${esc(first.title)}</b>` : ""}。`;
    b.innerHTML = `<p>${esc(m.data.hi)}${name ? "，" + esc(name) : ""}。${lead}</p>`
      + (list.length ? `<div class="ccard">${list.map((t) => rowHTML(t)).join("")}</div><p class="hint">做完了点一下圆圈，或者直接跟我说“${esc((first || list[0]).title)}做完了”。</p>` : "");
  };
  const OVER_ACTS = [["today", "改到今天"], ["tomorrow", "改到明天"], ["done", "已经交了"]];
  const overLabel = (ds) => { const n = PA.diffDays(PA.today(), ds); return n === 1 ? "昨天" : n === 2 ? "前天" : `${n} 天前`; };
  KINDS.overdue = (b, m) => {
    const list = m.data.ids.map(PA.todoById).filter(Boolean);
    const lead = list.length === 1 ? `还有一件<b class="red">${esc(overLabel(list[0].date))}到期</b>没做：${esc(list[0].title)}。怎么处理？` : `还有 <b class="red">${list.length} 件</b>过了日期没做，怎么处理？`;
    b.innerHTML = `<p>${lead}</p><div class="ccard">${list.map((t) => {
      const act = m.data.acts[t.id];
      const tail = act ? `<span class="cl">${esc(act)}</span>` : t.status !== "open" ? '<span class="cl">已处理</span>'
        : `<span class="crow-acts">${OVER_ACTS.map(([k, l]) => `<button class="btn sm" data-over="${k}" data-id="${t.id}">${l}</button>`).join("")}</span>`;
      return rowHTML(t, tail);
    }).join("")}</div>`;
    b.querySelectorAll("[data-over]").forEach((x) => (x.onclick = () => overdueAct(m, x.dataset.id, x.dataset.over, x.textContent)));
  };
  function overdueAct(m, id, k, label) {
    const t = PA.todoById(id);
    if (!t || t.status !== "open") return;
    let undo, html;
    if (k === "done") {
      undo = { op: "status", items: [[t.id, t.status]] };
      PA.setStatus([t], "done", "文字输入·完成待办");
      html = `✅ 好的，「${esc(t.title)}」标为已完成。`;
    } else {
      const to = PA.addDays(PA.today(), k === "today" ? 0 : 1);
      undo = { op: "fields", items: [[t.id, snapshot(t)]] };
      t.date = to; t.updatedAt = PA.nowStr(); save();
      log("手动更新待办", `${t.title}：日期 → ${to}`);
      html = `✅ 已改到${k === "today" ? "今天" : "明天"}：${todoLine(t)}`;
    }
    m.data.acts[id] = label; save();
    PA.todosChanged();
    push("user", "text", label);
    reply(() => bot("result", "", { html, undo, editId: k === "done" ? "" : t.id, undoneMsg: "已撤销，恢复原来的样子。" }));
  }
  function opening() {
    reply(() => bot("greet", "", { hi: hiWord(), ids: PA.upcoming().days[0].list.map((t) => t.id) }));
    if (PA.upcoming().overdue.length) reply(() => { const ids = PA.upcoming().overdue.map((t) => t.id); if (ids.length) bot("overdue", "", { ids, acts: {} }); });
  }

  // ---------- 结果卡片 ----------
  KINDS.result = (b, m) => {
    const d = m.data, canEdit = d.editId && PA.todoById(d.editId);
    b.innerHTML = (m.text ? `<p>${esc(m.text)}</p>` : "") + `<div class="result-card">${d.undone ? `<span class="muted">${esc(d.undoneMsg || "已撤销。")}</span>`
      : `${d.html}${(d.uploads || []).length ? '<div class="rc-files"></div>' : ""}<div class="rc-edit"></div>${d.undo || canEdit ? `<div class="actions">${d.undo ? '<button class="btn sm" data-undo>撤销</button>' : ""}${canEdit ? '<button class="btn sm" data-edit>修改</button>' : ""}</div>` : ""}`}</div>`;
    if (d.undone) return;
    if ((d.uploads || []).length) liveFiles(b.querySelector(".rc-files"), d.uploads);
    const u = b.querySelector("[data-undo]"), e = b.querySelector("[data-edit]");
    if (u) u.onclick = () => { applyUndo(d.undo); setData(m, { undone: true }); };
    if (e) e.onclick = () => editForm(b.querySelector(".rc-edit"), PA.todoById(d.editId), () => setData(m, { html: `✅ 已修改：${todoLine(PA.todoById(d.editId))}` }));
  };

  // 待办卡片：修改 / 完成 / 删除 / 撤销（fresh=刚创建，撤销即彻底移除）
  KINDS.todo = (b, m) => {
    const d = m.data, t = PA.todoById(d.todoId);
    b.innerHTML = (d.lead ? `<p>${esc(d.lead)}</p>` : "") + '<div class="result-card"></div>';
    const host = b.querySelector(".result-card");
    if (!t || d.phase === "undone") { host.innerHTML = '<span class="muted">已撤销，这条待办已移除。</span>'; return; }
    const phase = d.phase || "open", uploads = d.uploads || [];
    const head = phase === "done" ? `✅ 已完成：${esc(t.title)}`
      : phase === "deleted" ? `🗑 已删除：${esc(t.title)}<div class="hint">删除后不再出现在待办列表和提醒中，可在“已删除”中恢复。附件仍保留在知识库中。</div>`
      : `✅ ${esc(d.fresh ? placeText(t) : t.title + " · " + PA.whenText(t))}`;
    const atts = (t.attachments || []).filter((id) => !uploads.some((r) => r.fileId === id || state.uploads.find((u) => u.id === r.uploadId)?.fileId === id)).map(PA.fileById).filter(Boolean);
    host.innerHTML = `<div class="rc-head">${head}</div>
      <div class="rc-meta">${t.location ? `<span>📍 ${esc(t.location)}</span>` : ""}${(t.tags || []).length ? `<span>🏷</span>${PA.tagChips(t.tags)}` : ""}</div>
      <div class="rc-files"></div>${atts.length ? `<div class="rc-files">${atts.map((f) => `<div>📎 ${esc(f.name)}</div>`).join("")}</div>` : ""}
      <div class="rc-edit"></div>
      <div class="actions">${phase === "open" ? `${d.fresh ? '<button class="btn sm" data-a="undo">撤销</button>' : ""}<button class="btn sm" data-a="edit">修改</button>${!t.date ? '<button class="btn sm" data-a="edit">设具体日期</button>' : ""}<button class="btn sm" data-a="done">完成</button><button class="btn sm" data-a="del">删除</button>` : `<button class="btn sm" data-a="restore">撤销${phase === "done" ? "完成" : "删除"}</button>`}<a class="btn ghost sm" href="todo.html?id=${t.id}">查看详情</a></div>
      ${d.ask && phase === "open" && !t.date ? `<div class="ask">💬 ${esc(d.ask)}</div>` : ""}`;
    if (uploads.length) liveFiles(host.querySelector(".rc-files"), uploads);
    const on = (a, fn) => host.querySelectorAll(`[data-a="${a}"]`).forEach((x) => (x.onclick = fn));
    const openEdit = () => editForm(host.querySelector(".rc-edit"), t, () => renderMsg(m));
    on("edit", openEdit);
    on("done", () => { PA.setStatus([t], "done", "文字输入·完成待办"); setData(m, { phase: "done" }); PA.todosChanged(); });
    on("del", () => { PA.setStatus([t], "deleted", "文字输入·删除待办"); setData(m, { phase: "deleted" }); PA.todosChanged(); });
    on("restore", () => { t.status = "open"; t.updatedAt = PA.nowStr(); save(); setData(m, { phase: "open" }); PA.todosChanged(); });
    on("undo", () => { applyUndo({ op: "remove", id: t.id }); setData(m, { phase: "undone" }); });
    if (d.editOpen) { delete d.editOpen; openEdit(); }
  };

  // ---------- 匹配 ----------
  const bigramList = (s) => { const c = s.replace(/[\s，。,.？?！!、:：“”"'（）()]/g, ""); const out = []; for (let i = 0; i < c.length - 1; i++) out.push(c.slice(i, i + 2)); return [...new Set(out)]; };
  const bigrams = (s) => new Set(bigramList(s));
  const STOP = new Set(["一下", "什么", "时候", "上次", "说了", "找一", "帮我", "我的", "的照", "一个", "那个", "这个", "已经", "标记", "了，", "不用", "用做", "改到", "提交", "交了", "是多", "多少", "那件", "件事", "再记", "记一", "有关", "的事", "哪些", "有哪", "上个", "个月"]);
  function matchTodos(text, statuses) {
    const q = bigrams(text);
    return state.todos.filter((t) => statuses.includes(t.status)).map((t) => {
      let s = 0; bigrams(t.title).forEach((x) => { if (q.has(x) && !STOP.has(x)) s++; }); return { t, s };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  }
  const SYN = { 到期: ["租期", "至"], 旅行: ["三亚", "海边", "旅行"], 照片: ["照片", "图片"], 会议: ["会议", "评审", "报价"], 体检: ["体检", "血脂"], 销售: ["销售", "华东"], 报告: ["报告"], 保险: ["保险", "车险", "保单"] };
  function searchTerms(text) {
    const q = bigramList(text).filter((x) => !STOP.has(x));
    Object.entries(SYN).forEach(([k, arr]) => { if (text.includes(k)) q.push(...arr); });
    return [...new Set(q)];
  }
  const score = (hay, terms) => { let s = 0; const hit = []; terms.forEach((t) => { if (hay.includes(t)) { s += t.length > 2 ? 2 : 1; hit.push(t); } }); return { s, hit }; };
  function searchFiles(text) {
    const terms = searchTerms(text);
    return state.files.filter((f) => f.status === "indexed").map((f) => {
      const hay = [f.name, f.content, f.ocr, f.desc, f.transcript].filter(Boolean).join("\n");
      const { s, hit } = score(hay, terms); return { f, s, hitTerms: hit, hay };
    }).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, 4);
  }
  function searchRecords(text) {
    const terms = searchTerms(text);
    return state.todos.filter((t) => t.status !== "deleted").flatMap((t) => (t.records || []).map((r) => ({ t, r, ...score(r.text, terms) })))
      .filter((x) => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, 4);
  }
  function searchTodos(text) {
    const terms = searchTerms(text);
    return state.todos.filter((t) => t.status !== "deleted").map((t) => ({ t, ...score([t.title, t.location, t.notes, ...(t.tags || [])].filter(Boolean).join("\n"), terms) }))
      .filter((x) => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, 5);
  }
  function snippet(hay, terms) {
    const parts = hay.split(/(?<=[。\n！？；])/).map((p) => p.trim()).filter(Boolean);
    const best = parts.map((p) => ({ p, s: terms.filter((t) => p.includes(t)).length })).sort((a, b) => b.s - a.s)[0];
    return PA.highlight((best?.p || parts[0] || "").replace(/^#+\s*/, "").slice(0, 120), terms);
  }

  // ---------- 意图 ----------
  const NOTE_RES = [
    /^(.+?)(?:那件事|那个事|这件事|那事)儿?[，,\s]*(?:再|帮我)?记(?:一下|一笔|个)?[:：，,\s]*([\s\S]*)$/,
    /^给(.+?)加(?:个|一条|一个|点)?想法[:：，,\s]*([\s\S]*)$/,
    /^关于(.+?)[，,\s]+(?:再|帮我)?记(?:一下|一笔)?[:：，,\s]*([\s\S]*)$/,
  ];
  const SCHED_RE = /^(?:帮我)?把(.+?)(?:排到|安排到|排在|安排在|放到|定在|定到)(.+)$/;
  const POSTPONE_RE = /(推迟|延后|往后[推挪延]|延期|顺延)/;
  function scopeOf(text) {
    const m = text.match(/今天|昨天|明天|本周|这周|这个星期|这礼拜/);
    const k = m ? m[0] : "今天", d0 = PA.today();
    if (k === "今天") return { key: "today", label: "今天", from: d0, to: d0 };
    if (k === "昨天") { const d = PA.addDays(d0, -1); return { key: "yesterday", label: "昨天", from: d, to: d }; }
    if (k === "明天") { const d = PA.addDays(d0, 1); return { key: "tomorrow", label: "明天", from: d, to: d }; }
    const dow = new Date(d0 + "T00:00:00").getDay(), mon = PA.addDays(d0, -((dow + 6) % 7));
    return { key: "week", label: "本周", from: mon, to: PA.addDays(mon, 6) };
  }
  function batchScope(text) {
    if (!/(都|全部?|统统)[^，,。]{0,4}(完成|做完|搞定|搞完|办完|弄完|做好|干完)/.test(text)) return null;
    if (!/今天|昨天|明天|本周|这周|这个星期|这礼拜/.test(text) && !/除了/.test(text)) return null;
    return scopeOf(text);
  }
  function postponeScope(text) {
    if (!POSTPONE_RE.test(text) || !/(都|全部|统统|所有|除了)/.test(text)) return null;
    return scopeOf(text);
  }
  function detectIntent(text) {
    if (NOTE_RES.some((r) => r.test(text))) return "note";
    if (SCHED_RE.test(text)) return "schedule";
    if (/(待确认会议|确认会议|处理会议|会议录音.*确认)/.test(text)) return "meeting";
    if (postponeScope(text)) return "postpone";
    if (/(查一下|查查|查询|查找|帮我查|找一下|找找|帮我找|搜|有没有|在哪|什么时候|说了什么|是多少|多少钱|哪份|哪个文件|有哪些|[?？]$)/.test(text)) return "search";
    if (batchScope(text)) return "batch";
    if (/(删除|删掉|删了|不做了|不用做|不需要做|不用了|取消|归档)/.test(text)) return "delete";
    if (/(完成了|做完|搞定|搞完|已完成|办完|标记完成|已经提交|弄完)/.test(text)) return "complete";
    if (/(改到|改成|改为|推迟|延期|提前到|修改|调整到|换到|挪到|地点改)/.test(text)) return "update";
    if (PA.parseWhen(text).precision !== "none" || /(提醒我|记得|安排|预约|待办|要去|需要|想|要)/.test(text)) return "create";
    return "unclear";
  }

  // ---------- 发送与分派 ----------
  let followUp = null;      // 上一条待追问到期日的待办
  let askCreate = null;     // 缺少内容时暂存的前半句
  const held = new Map();   // 等用户选定待办时暂存的附件（File 不能序列化）
  function send(text = "", files = []) {
    text = String(text || "").trim(); files = [...(files || [])];
    if (!text && !files.length) return Promise.resolve();
    push("user", "text", text, { files: files.map((f) => f.name) });
    return reply(() => route(text, files));
  }
  function route(text, files) {
    if (!text) return renderFilesOnly(files);
    if (followUp && !files.length && tryFollowUp(text)) return;
    let intent = detectIntent(text);
    if (askCreate) { const pre = askCreate; askCreate = null; if (intent === "create" || intent === "unclear") return renderCreate(pre + " " + text, files); }
    if (files.length && intent === "unclear") intent = "create";
    if (intent === "create" || intent === "note") return HANDLERS[intent](text, files);
    const res = uploadToKB(files);
    HANDLERS[intent](text);
    if (res.length) bot("files", "附带的文件已保存到个人知识库（没有关联待办）：", { uploads: res, offer: [] });
  }

  function tryFollowUp(text) {
    const t = PA.todoById(followUp.todoId);
    if (!t || t.status !== "open" || t.date) { followUp = null; return false; }
    const w = PA.parseWhen(text);
    if (!w.date) return false;
    let rest = text; w.used.forEach((u) => (rest = rest.replace(u, "")));
    if (rest.replace(/到期|截止|是|就|吧|的|了|那天|号|日|[，。,.!！\s]/g, "")) return false;
    followUp = null;
    const old = snapshot(t);
    Object.assign(t, { date: w.date, time: w.time, duration: w.time ? t.duration || PA.DEFAULT_DUR : 0, deadline: null, updatedAt: PA.nowStr() });
    save(); log("文字输入·更新待办", `${t.title}：设为 ${t.date}`); PA.todosChanged();
    bot("result", "", { html: `✅ 好的，「${esc(t.title)}」的日期设为 <b>${esc(PA.cnDate(t.date))} ${rangeText(t)}</b>，到时会出现在每日提醒里。`, undo: { op: "fields", items: [[t.id, old]] }, editId: t.id, undoneMsg: "已撤销，仍放在待安排中。" });
    return true;
  }

  const ASK_RE = /车险|保险|保单|证件|身份证|护照|驾照|合同|年检|会员|续费|到期/;
  function renderCreate(text, files = []) {
    const p = PA.parseTodo(text);
    let core = text; p.used.forEach((u) => (core = core.replace(u, "")));
    core = core.replace(/提醒我|提醒|记得|帮我|记一下|一下|待办|新建|添加|加个|[在去到]|[，,。！!\s]/g, "");
    let title = p.title.replace(/^想要?/, "") || p.title;
    if (!core) {
      if (!files.length) {
        askCreate = text;
        bot("text", `要提醒你做什么？${p.date ? `（时间：${PA.cnDate(p.date)} ${p.time || "全天"}）` : ""}直接告诉我就行，比如“交物业费”。`);
        return;
      }
      title = `处理《${files[0].name}》`;
    }
    const t = newTodo({ title, date: p.date, time: p.time, duration: p.time ? p.duration || PA.DEFAULT_DUR : 0, deadline: p.date ? null : p.deadline, location: p.location });
    state.todos.push(t);
    const res = files.length ? plain(PA.startUpload(files, { quiet: true, todoId: t.id })) : [];
    t.tags = PA.autoTags(text, res.filter((r) => r.fileId).map((r) => r.fileId));
    save(); log("文字输入·新增待办", `“${text}” → ${t.title}${files.length ? `（附件 ${files.length} 个）` : ""}`); PA.todosChanged();
    let ask = "";
    const m = !t.date && t.deadline && t.title.match(ASK_RE);
    if (m) { ask = `${m[0] === "到期" ? "" : m[0]}几号到期？告诉我可以按到期日提醒你（不说也没关系）`; followUp = { todoId: t.id }; }
    bot("todo", "", { todoId: t.id, fresh: true, uploads: res, ask });
  }

  // 只有文件：存进知识库；非音视频文件问要不要建待办
  function renderFilesOnly(files) {
    const res = uploadToKB(files);
    const ok = res.filter((r) => r.fileId || r.uploadId);
    const offer = ok.filter((r) => !mediaName(r.name)).map((r) => res.indexOf(r));
    bot("files", "", { uploads: res, offer, media: ok.some((r) => mediaName(r.name)) });
  }
  KINDS.files = (b, m) => {
    const d = m.data, offer = d.offer || [];
    b.innerHTML = (m.text ? `<p>${esc(m.text)}</p>` : "") + `<div class="result-card"><div class="rc-files"></div>
      ${d.media ? '<div class="small" style="margin-top:6px">🎙 音视频正在识别；如果是会议录音，识别完我会在这里跟你确认。</div>' : ""}
      ${offer.length && !d.answered ? `<div style="margin-top:8px">已保存到知识库，要为它建一条待办吗？</div><div class="actions">${offer.map((i) => `<button class="btn sm" data-mk="${i}">建待办${offer.length > 1 ? "：" + esc(d.uploads[i].name) : ""}</button>`).join("")}</div>` : ""}</div>`;
    liveFiles(b.querySelector(".rc-files"), d.uploads);
    b.querySelectorAll("[data-mk]").forEach((x) => (x.onclick = () => { const r = d.uploads[+x.dataset.mk]; push("user", "text", `为《${fileName(r)}》建待办`); reply(() => bot("filetodo", "", { upload: r })); }));
  };
  KINDS.filetodo = (b, m) => {
    const r = m.data.upload;
    if (m.data.cancelled) { b.innerHTML = '<span class="muted">好的，文件只保存在知识库里。</span>'; return; }
    b.innerHTML = `<p>好的，确认一下内容和时间：</p><div class="result-card"><div class="field"><label>待办内容</label><input class="input" data-k="title" value="${esc(`处理《${fileName(r)}》`)}"></div><div data-dtp></div>
      <div class="actions"><button class="btn sm primary" data-a="ok">创建</button><button class="btn sm" data-a="no">不用了</button></div></div>`;
    const host = b.querySelector(".result-card");
    const dtp = PA.dateTimePicker(host.querySelector("[data-dtp]"), {});
    host.querySelector('[data-a="no"]').onclick = () => setData(m, { cancelled: true });
    host.querySelector('[data-a="ok"]').onclick = () => {
      const title = host.querySelector('[data-k="title"]').value.trim();
      if (!title) { toast("待办内容不能为空"); return; }
      const v = dtp.value();
      const t = newTodo({ title, date: v.date, time: v.time, duration: v.duration, deadline: v.deadline });
      const u = r.uploadId && state.uploads.find((x) => x.id === r.uploadId);
      const fid = r.fileId || u?.fileId;
      if (fid) t.attachments.push(fid);
      else if (u) { u.todoIds = u.todoIds || []; u.todoIds.push(t.id); }
      t.tags = PA.autoTags(title, fid ? [fid] : []);
      state.todos.push(t); log("文字输入·新增待办", `为文件 ${fileName(r)} 建待办 → ${title}`);
      m.kind = "todo"; m.data = { todoId: t.id, fresh: true, uploads: [r] }; save(); renderMsg(m);
      PA.todosChanged();
    };
  };

  // 只有一个明确匹配时直接执行，否则让用户选
  function pickTarget(text, statuses, intent, extra, prefer) {
    let list = matchTodos(text, statuses);
    if (prefer && list.length > 1) list = list.sort((a, c) => c.s - a.s || prefer(c.t) - prefer(a.t));
    if (list.length === 1 || (list.length > 1 && list[0].s >= list[1].s + 2)) return ACTIONS[intent](list[0].t, extra);
    const cands = list.length ? list.slice(0, 4).map((x) => x.t) : state.todos.filter((t) => statuses.includes(t.status)).slice(-5).reverse();
    bot("pick", "", { intent, extra, ids: cands.map((t) => t.id), found: !!list.length });
  }
  KINDS.pick = (b, m) => {
    const d = m.data;
    if (d.cancelled) { b.innerHTML = '<span class="muted">已取消，没有改动。</span>'; return; }
    if (d.picked) { b.innerHTML = `<p>好的，是「${esc(PA.todoById(d.picked)?.title || "")}」。</p>`; return; }
    const rn = "c" + m.id;
    b.innerHTML = `<p>${d.found ? "找到多个可能的待办，是哪一个？" : "没有找到明确匹配的待办，请从最近的待办中选择："}</p>
      <div class="result-card">${d.ids.map(PA.todoById).filter(Boolean).map((t) => `<label class="row" style="padding:4px 0;cursor:pointer;gap:8px"><input type="radio" name="${rn}" value="${t.id}"> ${todoLine(t)}</label>`).join("")}
      <div class="actions"><button class="btn sm primary" data-a="pick">就是它</button><button class="btn sm" data-a="no">取消</button></div></div>`;
    b.querySelector('[data-a="pick"]').onclick = () => {
      const r = b.querySelector("input:checked");
      if (!r) { toast("请先选择一个待办"); return; }
      setData(m, { picked: r.value });
      reply(() => ACTIONS[d.intent](PA.todoById(r.value), d.extra));
    };
    b.querySelector('[data-a="no"]').onclick = () => { if (d.extra.held) held.delete(d.extra.held); setData(m, { cancelled: true }); };
  };

  const ACTIONS = {
    update(t, { text }) {
      const w = PA.parseWhen(text); const loc = PA.parseLocation(text.replace(/^.*?(改到|改成|改为|换到|挪到)/, "在"));
      const changes = [];
      if (w.date && w.date !== t.date) changes.push(["日期", t.date ? PA.cnDate(t.date) : "待安排", PA.cnDate(w.date), "date", w.date]);
      if (w.time && w.time !== t.time) changes.push(["时间", t.time || "全天", w.time, "time", w.time]);
      if (loc && !w.used.some((u) => loc.includes(u)) && loc !== t.location) changes.push(["地点", t.location || "—", loc, "location", loc]);
      if (!changes.length) return bot("todo", "", { todoId: t.id, lead: `没听出「${t.title}」要改成什么。可以直接说“改到后天下午3点”“地点改到星巴克”，或者在这里改：`, editOpen: true });
      const old = snapshot(t);
      changes.forEach(([, , , k, v]) => (t[k] = v));
      if (t.date) t.deadline = null;
      if (t.time && !t.duration) t.duration = PA.DEFAULT_DUR;
      t.updatedAt = PA.nowStr(); save(); log("文字输入·更新待办", `${t.title}：${changes.map((c) => c[0] + " " + c[1] + "→" + c[2]).join("，")}`); PA.todosChanged();
      bot("result", "", { html: `✅ 已修改：${todoLine(t)}<div class="diff" style="margin-top:6px">${changes.map(([k, o, n]) => `<span class="muted">${k}</span><span class="old">${esc(o)}</span><span>→</span><span class="new">${esc(n)}</span>`).join("")}</div>`, undo: { op: "fields", items: [[t.id, old]] }, editId: t.id, undoneMsg: "已撤销，恢复为修改前的样子。" });
    },
    complete(t) {
      const items = [[t.id, t.status]];
      PA.setStatus([t], "done", "文字输入·完成待办"); PA.todosChanged();
      bot("result", "", { html: `✅ 已完成：${todoLine(t)}`, undo: { op: "status", items }, undoneMsg: "已撤销，改回未完成。" });
    },
    delete(t) {
      const items = [[t.id, t.status]];
      PA.setStatus([t], "deleted", "文字输入·删除待办"); PA.todosChanged();
      bot("result", "", { html: `🗑 已删除：${todoLine(t)}<div class="hint">删除后不再出现在待办列表和提醒中，可在“已删除”中恢复。附件仍保留在知识库中。</div>`, undo: { op: "status", items }, undoneMsg: "已撤销，待办已恢复。" });
    },
    schedule(t, { text }) {
      const whenStr = text.match(SCHED_RE)[2];
      const w = PA.parseWhen(whenStr);
      let time = w.time, note = "";
      const pm = !time && whenStr.match(/上午|早上|中午|下午|晚上/);
      if (pm) { time = { 上午: "09:00", 早上: "08:00", 中午: "12:00", 下午: "14:00", 晚上: "20:00" }[pm[0]]; note = `“${pm[0]}”先按 ${time} 安排，可以在详情里调整。`; }
      const du = PA.parseDur(whenStr).min;
      const old = snapshot(t);
      Object.assign(t, { date: w.date, time, duration: time ? du || t.duration || PA.DEFAULT_DUR : 0, deadline: null, updatedAt: PA.nowStr() });
      save(); log("文字输入·更新待办", `${t.title}：排到 ${t.date} ${t.time || "全天"}`); PA.todosChanged();
      bot("result", "", { html: `✅ 已排到 <b>${esc(PA.cnDate(t.date))} ${rangeText(t)}</b> · ${esc(t.title)}<div class="hint">${esc(note)}想法记录和附件都保留在这条待办里。</div>`, undo: { op: "fields", items: [[t.id, old]] }, editId: t.id, undoneMsg: `已撤销，「${t.title}」回到原来的安排。` });
    },
    note(t, { text, held: hk }) {
      const files = (hk && held.get(hk)) || [];
      if (hk) held.delete(hk);
      const content = NOTE_RES.map((r) => text.match(r)).find(Boolean)[2].trim();
      const before = [...(t.attachments || [])];
      const raw = files.length ? PA.startUpload(files, { quiet: true, todoId: t.id }) : [];
      const fids = raw.filter((r) => r.fileId).map((r) => r.fileId), pend = raw.filter((r) => !r.fileId && r.uploadId).map((r) => r.uploadId);
      PA.addRecord(t, content || "（附件）", fids, pend);
      const rec = t.records[0];
      log("文字输入·追加想法", `${t.title}：${content.slice(0, 40)}${files.length ? `（附件 ${files.length} 个）` : ""}`); PA.todosChanged();
      bot("result", "", {
        html: `📝 已追加到「<a href="todo.html?id=${t.id}">${esc(t.title)}</a>」的想法记录：<div class="rec-hit">${PA.linkify(rec.text)}</div><div class="hint">这条事项现在有 ${t.records.length} 条想法记录。</div>`,
        uploads: plain(raw), undo: { op: "record", id: t.id, recId: rec.id, before, pending: pend }, editId: t.id, undoneMsg: "已撤销这条想法记录（文件仍保留在知识库中）。",
      });
    },
  };

  function renderSchedule(text) {
    const [, key, whenStr] = text.match(SCHED_RE);
    if (!PA.parseWhen(whenStr).date) { bot("text", `要把「${key}」排到哪天？比如“周六上午”“明天下午3点”。`); return; }
    pickTarget(key, ["open"], "schedule", { text }, (t) => (t.date ? 0 : 1));
  }
  function renderNote(text, files = []) {
    const m = NOTE_RES.map((r) => text.match(r)).find(Boolean);
    const key = m[1].trim(), content = m[2].trim();
    if (!content && !files.length) { bot("text", `要给「${key}」记点什么？把内容接在冒号后面就行，比如“${key}那件事，再记一下：……”`); return; }
    let hk = "";
    if (files.length) { hk = PA.uid("h"); held.set(hk, files); }
    pickTarget(key, ["open"], "note", { text, held: hk });
  }

  // ---------- 批量完成 / 批量推迟：范围 + “除了…” ----------
  function exclusionKw(text) {
    const m = text.match(/除了(.+?)(?:的事儿|的事情|的事|之外|以外|[，,]|都)/);
    if (!m) return null;
    const raw = m[1].trim();
    const kw = raw.replace(/^(那个|那件|关于|跟|和|给)/, "").replace(/^(买|去|做|办|交|看|找|跑|打|弄|搞)(?=..)/, "").replace(/(这件|那件|的)$/, "").trim();
    return { raw, kw: kw || raw };
  }
  function exclusionHits(t, frags) {
    const fields = [["标题", t.title], ["地点", t.location], ["备注", t.notes], ...(t.tags || []).map((x) => ["标签", x]),
      ...(t.attachments || []).map(PA.fileById).filter(Boolean).map((f) => ["附件", f.name]), ...(t.records || []).map((r) => ["想法记录", r.text])];
    return fields.filter(([, v]) => v && frags.some((f) => v.includes(f)));
  }
  const short = (s) => (s.length > 18 ? s.slice(0, 18) + "…" : s);
  function collect(text, sc, withOverdue) {
    const sort = (a, c) => (a.date + (a.time || "99")).localeCompare(c.date + (c.time || "99"));
    const open = state.todos.filter((t) => t.status === "open" && t.date);
    const inScope = open.filter((t) => t.date >= sc.from && t.date <= sc.to).sort(sort);
    const overdue = withOverdue ? open.filter((t) => t.date < sc.from).sort(sort) : [];
    const ex = exclusionKw(text);
    let hits = {}, noMatch = false;
    if (ex) {
      const run = (frags) => { hits = {}; [...inScope, ...overdue].forEach((t) => { const h = exclusionHits(t, frags); if (h.length) hits[t.id] = h; }); };
      run([ex.kw]);
      if (!Object.keys(hits).length && ex.kw.length > 2) run(bigramList(ex.kw).filter((x) => !STOP.has(x)));
      noMatch = !Object.keys(hits).length;
    }
    return { scope: sc, rangeLabel: sc.from === sc.to ? PA.cnDate(sc.from) : `${PA.cnDate(sc.from)} – ${PA.cnDate(sc.to)}`, ids: inScope.map((t) => t.id), overdue: overdue.map((t) => t.id), ex, hits, noMatch };
  }
  const exMsg = (d, verb) => (!d.ex ? "" : d.noMatch
    ? `<div class="note warn" style="margin:6px 0">${d.scope.label}没有找到和“${esc(d.ex.raw)}”相关的待办。为了不误操作，先全部不勾选，请手动勾选要${verb}的。</div>`
    : `<div class="small muted">按“除了${esc(d.ex.raw)}”排除了 ${d.ids.filter((id) => d.hits[id]).length} 项（在标题、地点、备注、标签、附件名、想法记录中匹配），可以手动改勾选。</div>`);
  function checkRow(d, t, checked, extra = "") {
    const h = d.hits[t.id];
    return `<label class="bt-row ${h ? "excl" : ""}"><input type="checkbox" data-id="${t.id}" ${checked ? "checked" : ""}><span class="bt-time">${d.scope.key === "today" && t.date === PA.today() ? "" : esc(shortDate(t.date)) + " "}${rangeText(t)}</span><b>${esc(t.title)}</b>${t.location ? `<span class="small muted">📍${esc(short(t.location))}</span>` : ""}${extra}${h ? `<span class="excl-why">已排除：${h.map(([k, v]) => `${k}「${esc(short(v))}」`).join("、")}</span>` : ""}</label>`;
  }
  function confirmCard(b, m, { verb, body, onOk, doneHTML }) {
    const d = m.data;
    if (d.cancelled) { b.innerHTML = '<span class="muted">已取消，没有改动。</span>'; return; }
    if (d.done) {
      b.innerHTML = `<div class="result-card">${d.undone ? `<span class="muted">已撤销，${d.done.length} 项已恢复原样。</span>` : `${doneHTML} · <a href="#" data-undo>撤销</a><div class="small muted" style="margin-top:4px">${d.done.map(PA.todoById).filter(Boolean).map((t) => esc(t.title)).join("、")}</div>`}</div>`;
      const u = b.querySelector("[data-undo]");
      if (u) u.onclick = (e) => { e.preventDefault(); applyUndo(d.undo); setData(m, { undone: true }); };
      return;
    }
    b.innerHTML = `<p>${d.scope.label} · ${esc(d.rangeLabel)} 有 ${d.ids.length} 项未完成，确认要${verb}哪些：</p><div class="result-card">${exMsg(d, verb)}${body}<div class="actions"><button class="btn sm primary" data-a="ok"></button><button class="btn sm" data-a="no">取消</button></div></div>`;
    const card = b.querySelector(".result-card"), ok = card.querySelector('[data-a="ok"]');
    const sync = () => { const n = card.querySelectorAll("input[data-id]:checked").length; ok.textContent = `${verb} ${n} 项`; ok.disabled = !n; };
    card.querySelectorAll("input[data-id]").forEach((c) => (c.onchange = sync)); sync();
    card.querySelector('[data-a="no"]').onclick = () => setData(m, { cancelled: true });
    ok.onclick = () => onOk([...card.querySelectorAll("input[data-id]:checked")].map((c) => PA.todoById(c.dataset.id)).filter(Boolean));
  }

  function renderBatch(text) {
    const d = collect(text, batchScope(text), batchScope(text).key === "today");
    if (!d.ids.length && !d.overdue.length) { bot("text", `${d.scope.label} · ${d.rangeLabel} 没有未完成的待办。`); return; }
    bot("batch", "", d);
  }
  KINDS.batch = (b, m) => {
    const d = m.data, d0 = PA.today(), hm = nowHM();
    const notYet = (t) => t.date > d0 || (t.date === d0 && t.time && t.time > hm);
    const rows = (ids, def) => ids.map(PA.todoById).filter(Boolean).map((t) => checkRow(d, t, def && !d.noMatch && !d.hits[t.id], notYet(t) ? '<span class="badge orange">还没到时间</span>' : "")).join("");
    confirmCard(b, m, {
      verb: "完成",
      body: (rows(d.ids, true) || '<div class="muted small">范围内没有未完成的待办。</div>') + (d.overdue.length ? `<details class="bt-fold"><summary>另有 ${d.overdue.length} 项已逾期，也一起完成？</summary>${rows(d.overdue, false)}</details>` : ""),
      doneHTML: `✅ 已完成 ${(d.done || []).length} 项`,
      onOk: (list) => {
        const items = list.map((t) => [t.id, t.status]);
        PA.setStatus(list, "done", "文字输入·批量完成待办"); PA.todosChanged();
        setData(m, { done: list.map((t) => t.id), undo: { op: "status", items } });
      },
    });
  };

  const CN_NUM = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  function postponeTarget(text) {
    const m = text.match(/(?:推迟|延后|往后[推挪延]?|延期|顺延)\s*([一两二三四五六七八九十\d]+)\s*(天|日|周|个?星期|个?礼拜)/);
    if (m) { const n = (/^\d+$/.test(m[1]) ? +m[1] : CN_NUM[m[1]] || 1) * (/天|日/.test(m[2]) ? 1 : 7); return { days: n, label: `推迟 ${n} 天` }; }
    const to = text.match(/(?:推迟|延后|挪|改|推|延期)到(.+)$/);
    const w = to && PA.parseWhen(to[1]);
    if (w && w.date) return { to: w.date, label: `改到 ${PA.cnDate(w.date)}` };
    return { days: 1, label: "推迟 1 天" };
  }
  const postponed = (d, t) => d.target.to || PA.addDays(t.date, d.target.days);
  function renderPostpone(text) {
    const d = { ...collect(text, postponeScope(text), false), target: postponeTarget(text) };
    if (!d.ids.length) { bot("text", `${d.scope.label} · ${d.rangeLabel} 没有未完成的待办，不用推迟。`); return; }
    bot("postpone", "", d);
  }
  KINDS.postpone = (b, m) => {
    const d = m.data;
    confirmCard(b, m, {
      verb: "推迟",
      body: `<div class="small muted">${esc(d.target.label)}，时间点不变。</div>` + d.ids.map(PA.todoById).filter(Boolean).map((t) => checkRow(d, t, !d.noMatch && !d.hits[t.id], `<span class="small">→ ${esc(shortDate(postponed(d, t)))}</span>`)).join(""),
      doneHTML: `✅ 已推迟 ${(d.done || []).length} 项（${esc(d.target.label)}）`,
      onOk: (list) => {
        const items = list.map((t) => [t.id, snapshot(t)]);
        list.forEach((t) => { t.date = postponed(d, t); t.updatedAt = PA.nowStr(); });
        save(); log("文字输入·更新待办", `批量推迟 ${list.length} 项：${list.map((t) => t.title).join("、")}`); PA.todosChanged();
        setData(m, { done: list.map((t) => t.id), undo: { op: "fields", items } });
      },
    });
  };

  // ---------- 查询：文件、待办、想法记录 ----------
  function renderSearch(text) {
    const hits = searchFiles(text), recs = searchRecords(text), todos = searchTodos(text);
    log("文字输入·知识库查询", `“${text}” → 命中 ${hits.length} 个文件、${todos.length} 条待办、${recs.length} 条想法记录`, 900 + Math.floor(Math.random() * 1500));
    bot("search", "", { text });
    const firstImg = hits.find((h) => h.f.cat === "image" || h.f.cat === "pdf");
    if (firstImg) PA.openPreview(firstImg.f.id, firstImg.hitTerms);
  }
  KINDS.search = (b, m) => {
    const text = m.data.text, hits = searchFiles(text), recs = searchRecords(text), todos = searchTodos(text);
    if (!hits.length && !recs.length && !todos.length) { b.innerHTML = "<p>在你上传的文件、待办和想法记录里都没有找到相关内容。可以换个说法，或先上传文件。</p>"; return; }
    b.innerHTML = (todos.length ? `<p>相关的待办有 ${todos.length} 件：</p><div class="ccard">${todos.map(({ t }) => rowHTML(t, t.status === "done" ? '<span class="cl">已完成</span>' : "")).join("")}</div>` : "")
      + (hits.length ? `<p>找到 ${hits.length} 个相关文件：</p>` : "") + hits.map(({ f, hitTerms, hay }) => {
        const links = PA.linkedTodos(f.id), media = f.cat === "audio" || f.cat === "video";
        return `<div class="hit">${f.img ? `<img class="thumb" src="${f.img}" alt="">` : PA.fileIcon(f)}
          <div style="flex:1;min-width:0"><div class="row" style="gap:8px"><b>${esc(f.name)}</b><span class="badge">${PA.CAT_LABEL[f.cat]}</span>${PA.tagChips(f.tags)}</div>
          <div class="snip">${f.cat === "image" || f.cat === "pdf" ? (f.ocr ? "OCR：" : "图片描述：") : media ? "转写：" : ""}${snippet(hay.replace(f.name, ""), hitTerms)}</div>
          ${links.length ? `<div class="small muted">关联待办：${links.map((t) => `<a href="todo.html?id=${t.id}">${esc(t.title)}</a>`).join("、")}</div>` : ""}
          <div class="actions" style="margin-top:6px;display:flex;gap:8px">${PA.canPreview(f) ? `<button class="btn sm" data-prev="${f.id}">预览</button>` : '<span class="hint">多媒体文件 V1 仅提供下载</span>'}<button class="btn sm" data-dl="${f.id}">下载</button></div></div></div>`;
      }).join("")
      + (recs.length ? `<p style="margin-top:10px"><b>相关待办的想法记录</b></p>` + recs.map(({ t, r, hit }) => `<div class="rec-hit"><a href="todo.html?id=${t.id}">${esc(t.title)}</a> <span class="small muted">${esc(PA.relTime(r.at))}</span><div>${PA.highlight(r.text, hit)}</div></div>`).join("") : "")
      + '<p class="hint">只在你本人上传的文件和你的待办里找，按意思匹配。</p>';
    b.querySelectorAll("[data-prev]").forEach((x) => (x.onclick = () => { const h = hits.find((y) => y.f.id === x.dataset.prev); PA.openPreview(x.dataset.prev, h.hitTerms); }));
    b.querySelectorAll("[data-dl]").forEach((x) => (x.onclick = () => PA.download(PA.fileById(x.dataset.dl))));
  };

  // ---------- 待确认会议 ----------
  function confirmMeeting(mt0, checked) {
    const [date, time] = (mt0.dateFromAudio || mt0.dateFromFile).split(" ");
    const title = mt0.fileName.replace(/\.\w+$/, "").replace(/[-_]\d+$/, "");
    const fid = PA.fileById(mt0.fileId) ? mt0.fileId : null;
    const mt = newTodo({ title, date, time: time || "", duration: time ? parseInt(mt0.duration) || 0 : 0, status: "done", source: "meeting", sourceFile: fid, attachments: fid ? [fid] : [], notes: "会议摘要：" + mt0.summary, actionItems: [], tags: PA.autoTags(title + "会议", fid ? [fid] : []) });
    const created = [];
    mt0.items.forEach((it, i) => {
      const ai = { owner: it.owner, text: it.text, due: "" };
      if (checked.includes(i)) {
        const nt = newTodo({ title: it.text, source: "meeting", sourceFile: fid, notes: `来自会议：${title}${it.owner !== "我" ? "（原负责人：" + it.owner + "）" : ""}`, tags: PA.autoTags(it.text, fid ? [fid] : []) });
        state.todos.push(nt); ai.converted = nt.id; created.push(nt);
      }
      mt.actionItems.push(ai);
    });
    state.todos.push(mt);
    state.inbox = state.inbox.filter((x) => x !== mt0);
    save(); log("确认会议待办", `${mt0.fileName}：创建会议记录 1 条，我的待办 ${created.length} 条`); PA.todosChanged();
    return { title, created };
  }
  KINDS.meetings = (b, m) => {
    const d = m.data, handled = d.handled || {};
    const list = d.later ? [] : state.inbox;
    if (!list.length && !Object.keys(handled).length) { b.innerHTML = "<p>没有待确认的会议录音。上传会议录音后，识别结果会在这里跟你确认。</p>"; return; }
    b.innerHTML = (list.length ? `<p>有 ${list.length} 个会议录音待确认。勾选的行动项会创建为你的待办，会议本身保存为一条已完成的记录：</p>` : "")
      + Object.values(handled).map((h) => `<div class="result-card">${h}</div>`).join("")
      + list.map((x) => `<div class="result-card" data-m="${x.id}"><div><b>🎙 ${esc(x.fileName)}</b> <span class="muted small">${esc(x.duration)} · 会议时间 ${esc(x.dateFromAudio || x.dateFromFile)}</span></div>
        <div class="muted small" style="margin:4px 0 6px">${esc(x.summary)}</div><div class="small"><b>识别出的行动项</b>（默认勾选负责人是“我”的）</div>
        <div class="mt-items">${x.items.map((it, i) => `<label><input type="checkbox" data-i="${i}" ${it.owner === "我" ? "checked" : ""}><span class="owner ${it.owner === "我" ? "me" : ""}">${esc(it.owner)}</span>${esc(it.text)}</label>`).join("")}</div>
        <div class="actions"><button class="btn sm primary" data-ok>确认</button><button class="btn sm" data-not>不是会议</button></div></div>`).join("")
      + (list.length ? '<div class="actions" style="display:flex;gap:8px;margin-top:8px"><button class="btn sm primary" data-all>全部确认</button><button class="btn sm" data-later>稍后处理</button></div>' : "")
      + (d.later ? '<p class="muted">好的，会议先放着，想处理时跟我说“处理待确认会议”。</p>' : "");
    const doOne = (card, acc) => {
      const x = state.inbox.find((y) => y.id === card.dataset.m);
      if (!x) return;
      const checked = [...card.querySelectorAll("[data-i]:checked")].map((c) => +c.dataset.i);
      const { title, created } = confirmMeeting(x, checked);
      acc[x.id] = `✅ 已确认会议「${esc(title)}」，新增 ${created.length} 条我的待办${created.length ? "：" + created.map((t) => `<a href="todo.html?id=${t.id}">${esc(t.title)}</a>`).join("、") : ""}<div class="hint">新待办放在“待安排”里，可以接着说“把…排到周五”。</div>`;
    };
    b.querySelectorAll("[data-m]").forEach((card) => {
      card.querySelector("[data-ok]").onclick = () => { const acc = { ...handled }; doOne(card, acc); setData(m, { handled: acc }); };
      card.querySelector("[data-not]").onclick = () => { state.inbox = state.inbox.filter((x) => x.id !== card.dataset.m); save(); PA.todosChanged(); setData(m, { handled: { ...handled, [card.dataset.m]: '<span class="muted">已作为普通文件保存，转写文本仍可被检索。</span>' } }); };
    });
    const all = b.querySelector("[data-all]"), later = b.querySelector("[data-later]");
    if (all) all.onclick = () => { const acc = { ...handled }; b.querySelectorAll("[data-m]").forEach((c) => doOne(c, acc)); setData(m, { handled: acc }); };
    if (later) later.onclick = () => setData(m, { later: true });
  };

  KINDS.unclear = (b, m) => {
    if (m.data.chosen) { b.innerHTML = `<p>好的，按“${esc(UNCLEAR[m.data.chosen])}”处理。</p>`; return; }
    b.innerHTML = `<p>我不太确定你想做什么，你是想：</p><div class="actions">${Object.entries(UNCLEAR).map(([k, l]) => `<button class="btn sm" data-i="${k}">${l}</button>`).join("")}</div>`;
    b.querySelectorAll("[data-i]").forEach((x) => (x.onclick = () => { const k = x.dataset.i; setData(m, { chosen: k }); reply(() => HANDLERS[k](m.data.text)); }));
  };
  const UNCLEAR = { create: "新增为待办", search: "在知识库中查询", update: "修改某个待办" };

  const HANDLERS = {
    create: renderCreate, note: renderNote, schedule: renderSchedule, search: renderSearch, batch: renderBatch, postpone: renderPostpone,
    update: (text) => pickTarget(text, ["open"], "update", { text }),
    complete: (text) => pickTarget(text, ["open"], "complete", { text }),
    delete: (text) => pickTarget(text, ["open", "done"], "delete", { text }),
    meeting: () => bot("meetings", "", { handled: {} }),
    unclear: (text) => bot("unclear", "", { text }),
  };

  // ---------- 输入框 ----------
  function bindComposer() {
    const input = document.getElementById("input"), attChips = document.getElementById("att-chips"), fileIn = document.getElementById("file-in"), cbox = document.getElementById("cbox");
    let pendingFiles = [];
    function renderChips() {
      attChips.classList.toggle("hidden", !pendingFiles.length);
      attChips.innerHTML = pendingFiles.map((f, i) => { const ext = (f.name.split(".").pop() || "").toLowerCase(); return `<span class="tag file" title="${esc(f.name)}">${PA.fileIcon({ ext, cat: PA.catOf(ext) })} ${esc(f.name)} <span class="small muted">${PA.fmtSize(f.size)}</span><span class="x" data-rm="${i}" title="移除">×</span></span>`; }).join("") + (pendingFiles.length ? '<span class="hint" style="align-self:center">发送时上传，同时保存到个人知识库</span>' : "");
      attChips.querySelectorAll("[data-rm]").forEach((x) => (x.onclick = () => { pendingFiles.splice(+x.dataset.rm, 1); renderChips(); }));
    }
    const addPending = (list) => { list.forEach((f) => { if (!pendingFiles.some((x) => x.name === f.name && x.size === f.size)) pendingFiles.push(f); }); renderChips(); input.focus(); };
    document.getElementById("upload-btn").onclick = () => fileIn.click();
    fileIn.onchange = () => { addPending([...fileIn.files]); fileIn.value = ""; };
    cbox.ondragover = (e) => { e.preventDefault(); cbox.classList.add("over"); };
    cbox.ondragleave = () => cbox.classList.remove("over");
    cbox.ondrop = (e) => { e.preventDefault(); cbox.classList.remove("over"); addPending([...e.dataTransfer.files]); };
    const submit = () => {
      const v = input.value.trim(), files = pendingFiles;
      if (!v && !files.length) return;
      input.value = ""; pendingFiles = []; renderChips();
      send(v, files);
    };
    document.getElementById("send").onclick = submit;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
  }

  function start() {
    box = document.getElementById("msgs");
    document.querySelectorAll("[data-bot-name]").forEach((el) => (el.textContent = botName()));
    document.querySelectorAll("[data-bot-avatar]").forEach((el) => (el.firstChild.textContent = botName().slice(0, 1)));
    messages().forEach(renderMsg);
    bindComposer();
    document.addEventListener("pa:todos-changed", () => messages().filter((m) => LIVE_KINDS.has(m.kind)).forEach(renderMsg));
    document.addEventListener("pa:uploads-tick", onTick);
    document.addEventListener("pa:files-changed", onTick);
    window.PA_CHAT.opening();
  }

  window.PA_CHAT = { start, send, messages, kinds: KINDS, push, bot, reply, renderMsg, setData, applyUndo, idle: () => queue, opening, confirmMeeting };
})();

// 建议说法、💡 随用随提示、“📅 最近安排”按钮与面板（面板内容不进聊天记录）
(function () {
  const PA = window.PA, C = window.PA_CHAT;
  const cbox = document.getElementById("cbox");
  if (!PA || !C || !cbox) return;
  const { state, esc, save } = PA;

  const SUGGESTIONS = [
    "帮我记：周五下午3点去仁济医院体检",
    "租房合同什么时候到期？",
    "跟保险有关的事有哪些？",
    "把明天的事都推迟一天",
    "今天除了银行的事儿，都搞完了",
  ];
  const TIPS = {
    add: "说错了直接补一句就行，比如“改到下午4点”。",
    kb: "我只在你自己上传的文件里找，而且是按意思找，不用记文件名和关键字。",
    "search-todo": "查到后可以接着说“把重疾险排到周六上午”。",
    postpone: "也可以说“除了周会，明天的都推迟”。",
    batch: "也可以说“今天除了买保险的事儿，都搞完了”。",
  };
  const shown = () => (state.tipsShown = state.tipsShown || []);
  // 返回 null 表示这条消息还没到能判断的时候（如确认卡片未确认）
  function tipsFor(m, b) {
    if (m.kind === "todo") return m.data.fresh ? ["add"] : [];
    if (m.kind === "search") return [b.querySelector(".hit") && "kb", b.querySelector(".ccard") && "search-todo"].filter(Boolean);
    if (m.kind === "postpone" || m.kind === "batch") return m.data.done ? [m.kind] : m.data.cancelled ? [] : null;
    return [];
  }
  ["todo", "search", "postpone", "batch"].forEach((k) => {
    const orig = C.kinds[k];
    C.kinds[k] = (b, m) => {
      orig(b, m);
      if (!m.data.tips) {
        const keys = tipsFor(m, b);
        if (keys) { m.data.tips = keys.filter((x) => !shown().includes(x)); shown().push(...m.data.tips); save(); }
      }
      (m.data.tips || []).forEach((x) => b.insertAdjacentHTML("beforeend", `<div class="tip">💡 ${esc(TIPS[x])}</div>`));
    };
  });

  const dock = document.createElement("div");
  dock.className = "dock";
  dock.innerHTML = `<div class="recent-sheet hidden" id="recent-sheet"><div class="sheet-head"><b>📅 最近安排</b><span class="muted small">已逾期 · 今天 · 明天 · 后天 · 期限快到</span><span class="spacer"></span><button class="x" data-sheet-x title="关闭">×</button></div><div id="recent-body"></div></div>
    <div class="dockrow"><button class="recent" id="recent-btn" title="查看最近 3 天的安排">📅 最近安排 <span class="n" data-recent-n></span><span class="over hidden" data-recent-over title="已逾期"></span></button>
    <div class="says" id="says">${SUGGESTIONS.map((s) => `<button class="say" data-say="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>`;
  cbox.before(dock);
  const sheet = dock.querySelector("#recent-sheet"), btn = dock.querySelector("#recent-btn"), body = dock.querySelector("#recent-body");
  dock.querySelectorAll("[data-say]").forEach((x) => (x.onclick = () => C.send(x.dataset.say)));

  const shortDate = (ds) => PA.cnDate(ds).replace(/（.*/, "");
  const timeOf = (t) => (t.time ? PA.timeRange(t) : "全天");
  function panelHTML() {
    const u = PA.upcoming();
    const row = (t, when) => `<div class="crow" data-todo-row>${PA.tickHTML(t)}<span class="ct">${esc(when)}</span><a class="ci" href="todo.html?id=${t.id}">${esc(t.title)}</a>${t.location ? `<span class="cl" title="${esc(t.location)}">📍${esc(t.location)}</span>` : ""}</div>`;
    const sec = (title, list, when, cls = "") => `<h4 class="${cls}">${esc(title)}</h4>` + (list.length ? `<div class="ccard">${list.map((t) => row(t, when(t))).join("")}</div>` : '<div class="muted small">没有安排</div>');
    const mail = state.prefs.dailyMail ? `每天 ${esc(state.prefs.mailTime || "08:00")} 邮件提醒` : "邮件提醒已关闭";
    return (u.overdue.length ? sec(`已逾期 ${u.overdue.length} 项`, u.overdue, (t) => `${shortDate(t.date)} ${timeOf(t)}`, "red") : "")
      + u.days.map((d) => sec(`${d.label} · ${shortDate(d.date)}`, d.list, timeOf)).join("")
      + (u.deadlines.length ? sec("期限快到", u.deadlines, (t) => PA.deadlineText(t).replace(/^期限：/, "")) : "")
      + `<div class="sheet-foot"><a href="todos.html">去待办页 ›</a><span>待安排 <b data-unsched>${u.unscheduled.length}</b> 件 · <a href="todos.html?tab=unscheduled">看看 ›</a></span><span>${mail} · <a href="profile.html#reminder">设置</a></span></div>`;
  }
  function refresh() {
    const u = PA.upcoming(), n = u.days[0].list.length, od = u.overdue.length;
    btn.querySelector("[data-recent-n]").textContent = n;
    const o = btn.querySelector("[data-recent-over]");
    o.textContent = od; o.classList.toggle("hidden", !od);
    btn.title = `今天未完成 ${n} 件${od ? `，已逾期 ${od} 件` : ""}`;
    if (!sheet.classList.contains("hidden")) body.innerHTML = panelHTML();
  }
  const setSheet = (on) => {
    sheet.classList.toggle("hidden", !on); btn.classList.toggle("on", on);
    if (on) body.innerHTML = panelHTML();
  };
  btn.onclick = (e) => { e.stopPropagation(); setSheet(sheet.classList.contains("hidden")); };
  sheet.querySelector("[data-sheet-x]").onclick = () => setSheet(false);
  document.addEventListener("click", (e) => { if (!sheet.classList.contains("hidden") && e.target.isConnected && !e.target.closest("#recent-sheet, #recent-btn")) setSheet(false); });
  document.addEventListener("pa:todos-changed", refresh);
  refresh();
  C.recent = { open: () => setSheet(true), close: () => setSheet(false), refresh };
})();

// 会议整理消息、按天的对话记录（保留 30 天，默认只显示今天）、问候规则（每天一次完整问候，之后只报变化）
(function () {
  const PA = window.PA, C = window.PA_CHAT;
  if (!PA || !C) return;
  const { state, esc, save } = PA;
  const KEEP_DAYS = 30;
  const remindMs = () => (window.PA_REMIND_MS ?? 30000);
  const shortDate = (ds) => PA.cnDate(ds).replace(/（.*/, "");
  const hiWord = () => { const h = new Date().getHours(); return h < 5 ? "夜深了" : h < 11 ? "早上好" : h < 13 ? "中午好" : h < 18 ? "下午好" : "晚上好"; };
  const snap = () => { const u = PA.upcoming(); return { today: u.days[0].list.map((t) => t.id), overdue: u.overdue.map((t) => t.id), meetings: state.inbox.map((m) => m.id) }; };
  const row = (t) => `<div class="crow ${t.status !== "open" ? "done" : ""}" data-todo-row>${PA.tickHTML(t)}<span class="ct">${t.time ? PA.timeRange(t) : "全天"}</span><a class="ci" href="todo.html?id=${t.id}">${esc(t.title)}</a>${t.location ? `<span class="cl" title="${esc(t.location)}">📍${esc(t.location)}</span>` : ""}</div>`;

  // ---------- 问候：模板 + 数据，再“模拟改写”加节日 / 天气开场；数字以程序数据为准 ----------
  function holidayOf(ds) {
    const H = PA.SEED.holidays || {};
    return (H.lunar || {})[ds] || (H.fixed || {})[ds.slice(5)] || null;
  }
  const WEATHER = ["今天天气不错，适合出门走走", "外面有点凉，出门多穿一件", "今天可能有小雨，出门记得带伞", "今天风有点大，注意保暖", "今天阴天，记得多喝水"];
  const weatherOf = (ds) => WEATHER[[...ds].reduce((s, c) => s + c.charCodeAt(0), 0) % WEATHER.length];
  function factsOf(ids) {
    const list = ids.map(PA.todoById).filter((t) => t && t.status !== "deleted");
    const left = list.filter((t) => t.status === "open");
    const first = left.find((t) => t.time) || left[0];
    return !list.length ? "今天没有安排的事，想到什么随时跟我说。"
      : !left.length ? `今天的 ${list.length} 件事都做完了，辛苦了。`
      : `今天有 ${left.length} 件事${first.time ? `，最早是 ${first.time} ${first.title}` : ""}。`;
  }
  const mockRewrite = ({ template, holiday, weather }) => `${holiday ? holiday[1] + "！" : weather + "。"}${template}`;
  const nums = (s) => (String(s).match(/\d+(?::\d+)?/g) || []).sort();
  function verified(out, template) {
    if (typeof out !== "string" || !out.trim()) return false;
    const a = nums(out), b = nums(template);
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  function greetData() {
    const d0 = PA.today(), ids = PA.upcoming().days[0].list.map((t) => t.id), hi = hiWord(), name = PA.me()?.name || "";
    const facts = factsOf(ids), template = `${hi}${name ? "，" + name : ""}。${facts}`, holiday = holidayOf(d0);
    let out = null;
    try { out = (window.PA_GREET_REWRITE || mockRewrite)({ template, facts, hi, name, holiday, weather: weatherOf(d0) }); } catch (e) { out = null; }
    const ok = verified(out, template);
    return { hi, ids, facts, text: ok ? out : template, rewritten: ok, holiday: ok && holiday ? holiday[0] : "" };
  }
  const origGreet = C.kinds.greet;
  C.kinds.greet = (b, m) => {
    origGreet(b, m);
    // 当天数据变了就回到模板的实时内容
    if (m.data.text && m.data.facts === factsOf(m.data.ids)) { const p = b.querySelector("p"); if (p) p.textContent = m.data.text; }
  };

  C.kinds.greetDelta = (b, m) => {
    const d = m.data, list = d.today.map(PA.todoById).filter((t) => t && t.status !== "deleted");
    const parts = [list.length && `今天又多了 ${list.length} 件事`, d.overdue.length && `又有 ${d.overdue.length} 件到期了`].filter(Boolean);
    b.innerHTML = `<p>补充一下：${parts.join("；")}。</p>` + (list.length ? `<div class="ccard">${list.map(row).join("")}</div>` : "");
  };

  // ---------- 会议整理消息 ----------
  const meetingsOf = (ids) => ids.map((id) => state.inbox.find((x) => x.id === id)).filter(Boolean);
  const mineN = (mt) => mt.items.filter((it) => it.owner === "我").length;
  function uploadedWhen(mt) {
    const ds = (mt.uploadedAt || "").slice(0, 10);
    return ds ? PA.relDay(ds) || shortDate(ds) : "";
  }
  function meetingMsg(ids, reminder) {
    const list = meetingsOf(ids);
    if (!list.length) return;
    list.forEach((mt) => { if (mt.remindLater === "waiting") mt.remindLater = "done"; });
    const s = state.greetSnapshot;
    if (s && state.greetedOn === PA.today()) s.meetings = [...new Set([...(s.meetings || []), ...list.map((x) => x.id)])];
    save();
    const n = list.reduce((s, x) => s + x.items.length, 0), mine = list.reduce((s, x) => s + mineN(x), 0);
    const lead = list.length === 1 ? `你${uploadedWhen(list[0])}上传的「${list[0].fileName.replace(/\.\w+$/, "")}」，我整理出 ${n} 条待办，有 ${mine} 条是分给你的。`
      : `有 ${list.length} 个会议录音整理好了，一共 ${n} 条待办，有 ${mine} 条是分给你的。`;
    C.bot("meetingNote", "", { ids: list.map((x) => x.id), reminder: !!reminder, lead });
  }
  C.kinds.meetingNote = (b, m) => {
    const d = m.data, list = meetingsOf(d.ids);
    b.innerHTML = `<p>${d.reminder ? "之前说晚点再看的会议，提醒你一下：" : ""}${esc(d.lead)}要一起过一下吗？</p>`
      + (d.chosen ? `<p class="muted small">已选择：${esc(d.chosen)}</p>` : !list.length ? '<p class="muted small">这些会议录音已经处理过了。</p>'
        : '<div class="actions"><button class="btn sm primary" data-mn="go">一起过一下</button><button class="btn sm" data-mn="later">晚点再说</button></div>');
    const go = b.querySelector('[data-mn="go"]'), later = b.querySelector('[data-mn="later"]');
    if (go) go.onclick = () => {
      C.setData(m, { chosen: "一起过一下" });
      C.push("user", "text", "一起过一下");
      C.reply(() => C.bot("meetingReview", "", { ids: meetingsOf(d.ids).map((x) => x.id), checked: {}, heard: {} }));
    };
    if (later) later.onclick = () => {
      C.setData(m, { chosen: "晚点再说" });
      laterFor(meetingsOf(d.ids));
      C.push("user", "text", "晚点再说");
      C.reply(() => C.bot("text", "好的，晚点再提醒你一次。想处理时也可以直接跟我说“处理待确认会议”。"));
    };
  };
  function laterFor(list) {
    const ids = list.filter((mt) => mt.remindLater !== "done").map((mt) => { mt.remindLater = "waiting"; return mt.id; });
    save();
    if (!ids.length) return;
    setTimeout(() => {
      const due = meetingsOf(ids).filter((mt) => mt.remindLater === "waiting");
      if (due.length && document.getElementById("msgs")) C.reply(() => meetingMsg(due.map((x) => x.id), true));
    }, remindMs());
  }

  const defaultChecked = (mt) => mt.items.map((it, i) => (it.owner === "我" ? i : -1)).filter((i) => i >= 0);
  C.kinds.meetingReview = (b, m) => {
    const d = m.data;
    if (d.result) { b.innerHTML = `<div class="result-card">${d.result}</div>`; return; }
    const list = meetingsOf(d.ids);
    if (!list.length) { b.innerHTML = '<p class="muted">这些会议录音已经处理过了。</p>'; return; }
    const checked = (mt) => d.checked[mt.id] || defaultChecked(mt);
    b.innerHTML = `<p>好的，逐条看一下。勾选的会加入你的待办，会议本身保存为一条已完成的记录：</p>` + list.map((mt) => `<div class="result-card mt-review" data-m="${mt.id}">
        <div><b>🎙 ${esc(mt.fileName)}</b> <span class="muted small">${esc(mt.duration)} · 会议时间 ${esc(mt.dateFromAudio || mt.dateFromFile)}</span></div>
        ${mt.items.map((it, i) => `<div class="mt-line"><label><input type="checkbox" data-i="${i}" ${checked(mt).includes(i) ? "checked" : ""}><span class="owner ${it.owner === "我" ? "me" : ""}">${esc(it.owner)}</span>${esc(it.text)}</label>
          <button class="btn ghost sm" data-hear="${i}">${d.heard[mt.id + ":" + i] ? "收起原话" : "听原话"}</button>
          ${d.heard[mt.id + ":" + i] ? `<div class="mt-quote">${it.at ? `<span class="muted small">[${esc(it.at)}]</span> ` : ""}“${esc(it.quote || it.text)}”${it.at ? "" : '<span class="muted small">（原型：这段录音没有逐句时间点）</span>'}</div>` : ""}</div>`).join("")}
      </div>`).join("") + `<div class="actions" style="display:flex;gap:8px;margin-top:8px"><button class="btn sm primary" data-mr="ok"></button><button class="btn sm" data-mr="later">晚点再说</button></div>`;
    const ok = b.querySelector('[data-mr="ok"]');
    const sync = () => {
      b.querySelectorAll("[data-m]").forEach((card) => (d.checked[card.dataset.m] = [...card.querySelectorAll("[data-i]:checked")].map((c) => +c.dataset.i)));
      save();
      const k = Object.values(d.checked).reduce((s, a) => s + a.length, 0);
      ok.textContent = k ? `加入待办（${k} 条）` : "都不用加，标记已处理";
    };
    b.querySelectorAll("[data-i]").forEach((c) => (c.onchange = sync));
    sync();
    b.querySelectorAll("[data-hear]").forEach((x) => (x.onclick = () => {
      const k = x.closest("[data-m]").dataset.m + ":" + x.dataset.hear;
      C.setData(m, { heard: { ...d.heard, [k]: !d.heard[k] } });
    }));
    ok.onclick = () => {
      sync();
      const done = meetingsOf(d.ids).map((mt) => C.confirmMeeting(mt, d.checked[mt.id] || []));
      const created = done.flatMap((x) => x.created);
      C.setData(m, { result: `✅ 已处理 ${done.length} 个会议，加入 ${created.length} 条待办${created.length ? "：" + created.map((t) => `<a href="todo.html?id=${t.id}">${esc(t.title)}</a>`).join("、") : ""}<div class="hint">新待办放在“待安排”里，可以接着说“把…排到周五”。</div>` });
    };
    b.querySelector('[data-mr="later"]').onclick = () => {
      laterFor(list);
      C.setData(m, { result: '<span class="muted">好的，会议先放着，晚点再提醒你一次。</span>' });
    };
  };

  // ---------- 开场：每天第一次完整问候，之后只说新增的 ----------
  C.opening = function () {
    const d0 = PA.today(), cur = snap();
    const full = state.greetedOn !== d0 || !C.messages().some((m) => m.kind === "greet");
    if (full) {
      state.greetedOn = d0; state.greetSnapshot = cur; save();
      C.reply(() => C.bot("greet", "", greetData()));
      if (cur.overdue.length) C.reply(() => { const ids = PA.upcoming().overdue.map((t) => t.id); if (ids.length) C.bot("overdue", "", { ids, acts: {} }); });
      const ms = state.inbox.filter((mt) => mt.remindLater !== "done");
      if (ms.length) C.reply(() => meetingMsg(ms.map((x) => x.id), ms.some((x) => x.remindLater === "waiting")));
      return;
    }
    const old = state.greetSnapshot || { today: [], overdue: [], meetings: [] };
    const added = (k) => cur[k].filter((id) => !(old[k] || []).includes(id));
    const nt = added("today"), no = added("overdue"), nm = added("meetings");
    state.greetSnapshot = { ...cur, meetings: [...new Set([...(old.meetings || []), ...cur.meetings])] }; save();
    if (nt.length || no.length) C.reply(() => C.bot("greetDelta", "", { today: nt, overdue: no }));
    if (no.length) C.reply(() => { const ids = no.filter((id) => PA.todoById(id)?.status === "open"); if (ids.length) C.bot("overdue", "", { ids, acts: {} }); });
    const ms = state.inbox.filter((mt) => mt.remindLater === "waiting" || (nm.includes(mt.id) && mt.remindLater !== "done"));
    if (ms.length) C.reply(() => meetingMsg(ms.map((x) => x.id), ms.some((x) => x.remindLater === "waiting")));
  };

  // ---------- 对话记录：保留 30 天，默认只显示今天，往上翻或点按钮加载更早的 ----------
  function prune() {
    const d0 = PA.today();
    state.chat = state.chat || {};
    Object.keys(state.chat).forEach((k) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || PA.diffDays(d0, k) > KEEP_DAYS) delete state.chat[k]; });
    save();
  }
  function history() {
    const box = document.getElementById("msgs"), d0 = PA.today();
    const older = Object.keys(state.chat).filter((k) => k < d0 && state.chat[k].length).sort().reverse();
    if (!older.length) return;
    const more = document.createElement("div");
    more.className = "chat-more";
    more.innerHTML = '<button class="btn ghost sm" data-more>查看更早的对话</button>';
    box.prepend(more);
    let next = 0;
    const loadDay = () => {
      if (next >= older.length) return;
      const day = older[next++], sec = document.createElement("div");
      sec.className = "chat-day"; sec.dataset.day = day;
      sec.innerHTML = `<div class="day-sep"><span>${esc(PA.cnDate(day))}</span></div>` + state.chat[day].map((m) => `<div data-mid="${esc(m.id)}"></div>`).join("");
      more.after(sec);
      state.chat[day].forEach((m) => C.renderMsg(m));
      if (next >= older.length) more.innerHTML = '<span class="muted small">更早的对话超过 30 天，已自动清理</span>';
    };
    more.querySelector("[data-more]").onclick = loadDay;
    const onTop = (y) => { if (y <= 0) loadDay(); };
    box.addEventListener("scroll", () => onTop(box.scrollTop));
    window.addEventListener("scroll", () => onTop(window.scrollY));
    C.loadEarlier = loadDay;
  }

  const LIVE = new Set(["greetDelta", "meetingNote", "meetingReview"]);
  const origStart = C.start;
  C.start = function () {
    prune();
    origStart();
    history();
    document.addEventListener("pa:todos-changed", () => {
      C.messages().filter((m) => LIVE.has(m.kind)).forEach(C.renderMsg);
      if (state.greetedOn === PA.today() && state.greetSnapshot) { const s = snap(); Object.assign(state.greetSnapshot, { today: s.today, overdue: s.overdue }); save(); }
    });
  };
})();
