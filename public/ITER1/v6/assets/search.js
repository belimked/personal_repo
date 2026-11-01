// 原型 v6 S09：按意思搜索（资料页）与周报出处（管家首页）。规则模拟，不调模型。
// 引入顺序：… → app.js → demo.js → （页面脚本）→ search.js。
// - PA.planQuery(text) → 查询计划标签数组 [{ key, type, value, label, appliesTo, sortOnly, off }]
//   type：year 年份 / region 地区 / trip 行程 / spot 地点 / kind 类型 / person 人物 / topic 话题 / speaker 主讲人估计（只排序）
//   appliesTo：标签只约束哪些类型（一句话里“再找……的照片”这类分段）；空数组 = 全部类型
// - PA.checkPlan(plan) → null 或 { text, options: [{ label, plan }] }（条件矛盾时的提示和改正选项）
// - PA.runQuery(plan) → { total, items, groups: [{ kind, label, items }] }；off 的标签不参与
// - 演示索引取当前快照的 searchIndex（personas-p1.js），也可以 PA.runQuery(plan, index) 传入。
(function () {
  const PA = window.PA;
  if (!PA || !PA.state) return;
  const { state, esc, save, toast } = PA;
  const KINDS = [["video", "视频", /视频|录像|vlog/i], ["audio", "录音", /录音|音频|语音/], ["photo", "照片", /照片|相片|合影|图片/], ["doc", "文档", /文档|文件|行程单|pdf|笔记/i]];
  const KIND_LABEL = Object.fromEntries(KINDS.map(([k, l]) => [k, l]));
  const YEARS = ["今年", "去年", "前年"];
  const REGIONS = ["新疆", "西藏", "湖南"];
  const TOPICS = [["AI 泡沫", /AI\s*泡沫|人工智能泡沫/i]];
  const ELAPSED = "用时 1.2 秒";

  function currentIndex() {
    const d = state.demo || {};
    const snap = ((window.PA_PERSONAS || {})[d.persona] || {})[d.stage];
    return (snap && snap.searchIndex) || null;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------------- 查询计划 ----------------
  function parseSegment(seg, index) {
    const tags = [];
    const kinds = KINDS.filter(([, , re]) => re.test(seg)).map(([k]) => k);
    const add = (type, value, label, extra = {}) => tags.push(Object.assign({ type, value, label }, extra));
    YEARS.forEach((y) => seg.includes(y) && add("year", y, y));
    REGIONS.forEach((r) => seg.includes(r) && add("region", r, r));
    Object.keys((index && index.places) || {}).forEach((p) => { if (seg.includes(p) && !REGIONS.includes(p)) add("spot", p, p); });
    kinds.forEach((k) => add("kind", k, KIND_LABEL[k]));
    if (/这个人|这人|此人|照片里的人/.test(seg)) add("person", "face-a", "照片里的这个人");
    TOPICS.forEach(([t, re]) => re.test(seg) && add("topic", t, t));
    const gender = /女(博主|生|性|的)?/.test(seg) ? "女" : /男(博主|生|性|的)?/.test(seg) ? "男" : "";
    const age = (seg.match(/(\d{2})\s*岁/) || [])[1];
    if (gender || age) add("speaker", { gender, age: age ? +age : null }, `主讲人：${[gender && gender + "性", age && `约 ${age} 岁`].filter(Boolean).join("，")}（只排序）`, { sortOnly: true });
    return { tags, kinds };
  }

  function planQuery(text, index = currentIndex()) {
    const segs = String(text || "").split(/[，,。；;]\s*(?=再|还有|另外|然后)|(?:再找|再搜)/).map((s) => s.trim()).filter(Boolean);
    const plan = [];
    const parts = segs.map((s) => parseSegment(s, index));
    const multi = parts.filter((p) => p.kinds.length).length > 1;
    parts.forEach(({ tags, kinds }) => {
      tags.forEach((t) => {
        t.appliesTo = multi && t.type !== "kind" ? kinds.slice() : [];
        t.key = `${t.type}:${typeof t.value === "object" ? JSON.stringify(t.value) : t.value}:${t.appliesTo.join("+")}`;
        t.off = false;
        if (!plan.some((x) => x.key === t.key)) plan.push(t);
      });
    });
    return plan;
  }

  // 同一分段里：地点不在所选地区 → 提示 + 两个改正选项
  function checkPlan(plan, index = currentIndex()) {
    if (!index) return null;
    const on = plan.filter((t) => !t.off);
    for (const spot of on.filter((t) => t.type === "spot")) {
      const home = index.places[spot.value];
      const same = (t) => t.appliesTo.join("+") === spot.appliesTo.join("+");
      const reg = on.find((t) => t.type === "region" && same(t) && t.value !== home);
      if (!home || !reg) continue;
      const alt = Object.keys(index.places).find((p) => index.places[p] === reg.value && /湖|错|池/.test(p) && p !== spot.value);
      const trip = (index.trips || []).find((tr) => tr.regions.includes(reg.value) && tr.regions.includes(home));
      const options = [];
      if (alt) options.push({ label: `你说的是${alt}？`, plan: plan.map((t) => (t === spot ? Object.assign(clone(t), { value: alt, label: alt, key: t.key.replace(spot.value, alt) }) : t)) });
      if (trip) options.push({ label: `${reg.value}${home}连着走的那次`, plan: plan.map((t) => (t === reg ? Object.assign(clone(t), { type: "trip", value: trip.id, label: `${reg.value}${home}连着走的那次`, key: `trip:${trip.id}:${t.appliesTo.join("+")}` }) : t)) });
      return { text: `${spot.value}在${home}，不在${reg.value}。`, options };
    }
    return null;
  }

  // ---------------- 执行 ----------------
  function score(item, speakers) {
    let s = item.topicShare || 0;
    speakers.forEach(({ value: v }) => {
      if (!item.speaker) return;
      if (v.gender && item.speaker.gender === v.gender) s += 0.5;
      if (v.age) s += Math.max(0, 1 - Math.abs(item.speaker.age - v.age) / 20) * 0.5;
    });
    return s;
  }
  function runQuery(plan, index = currentIndex()) {
    const on = (plan || []).filter((t) => !t.off);
    const items = ((index && index.items) || []).slice();
    const kindTags = on.filter((t) => t.type === "kind");
    const kinds = kindTags.length ? new Set(kindTags.map((t) => t.value)) : null;
    const applies = (t, it) => !t.appliesTo.length || t.appliesTo.includes(it.kind);
    const trips = Object.fromEntries(((index && index.trips) || []).map((t) => [t.id, t]));
    const match = (t, it) => {
      switch (t.type) {
        case "year": return it.year === t.value;
        case "region": return it.regions.includes(t.value);
        case "trip": return it.tripId === t.value;
        case "spot": return it.spots.includes(t.value);
        case "person": return it.people.includes(t.value);
        case "topic": return it.topics.includes(t.value);
        default: return true; // speaker 只排序，不过滤（R-搜索-04）
      }
    };
    const speakers = on.filter((t) => t.type === "speaker");
    const hits = items.filter((it) => (!kinds || kinds.has(it.kind)) && on.every((t) => t.type === "kind" || !applies(t, it) || match(t, it)))
      .map((it) => Object.assign(clone(it), { score: score(it, speakers), trip: trips[it.tripId] ? trips[it.tripId].title : "", mainly: (it.topicShare || 0) >= 0.5 }))
      .sort((a, b) => b.score - a.score);
    const groups = KINDS.map(([k, l]) => ({ kind: k, label: l, items: hits.filter((h) => h.kind === k) })).filter((g) => g.items.length);
    return { total: hits.length, items: hits, groups, elapsed: ELAPSED };
  }

  PA.planQuery = planQuery;
  PA.checkPlan = checkPlan;
  PA.runQuery = runQuery;
  PA.searchIndex = currentIndex;

  // ---------------- 资料页界面 ----------------
  const EXAMPLES = {
    a: { text: "去年去新疆在纳木错拍的视频，再找新疆旅行时和这个人的照片", photo: true },
    b: { text: "今年一个 30 岁左右女博主讲 AI 泡沫的视频", photo: false },
  };
  function locate(it) {
    if (it.kind === "video") return `<span class="sem-at">▶ ${esc(it.at)}</span> ${esc(it.text)}`;
    if (it.kind === "audio") return `<span class="sem-at">🔊 ${esc(it.at)}</span> <mark>${esc(it.text)}</mark>`;
    if (it.kind === "photo") return `<span class="sem-at">🔍 识别出的文字</span> ${esc(it.text.replace(/^照片里的字：/, ""))}`;
    return `<span class="sem-at">¶ 段落</span> ${esc(it.text)}`;
  }
  function itemNote(it, plan) {
    const topic = plan.find((t) => !t.off && t.type === "topic");
    if (!topic || !it.speaker) return "";
    if (!it.mainly) return '<span class="badge sem-mention">只是提到</span>';
    return `<div class="sem-note" data-rule="R-搜索-04">主讲人估计：${esc(it.speaker.gender)}性，约 ${esc(String(it.speaker.age))} 岁；主要在讲 ${esc(topic.value)}（占 ${Math.round(it.topicShare * 100)}%）</div>`;
  }

  function mountFiles() {
    const page = document.getElementById("page");
    if (!page || !document.querySelector(".files-layout") || document.getElementById("sem")) return;
    if (!((currentIndex() || {}).items || []).length) return;
    const box = document.createElement("div");
    box.className = "card sem-card";
    box.id = "sem";
    box.innerHTML = `<div class="row"><b>按意思搜索</b><span class="hint">不用记文件名，像跟人说话一样描述</span></div>
      <div class="sem-bar"><input class="input" id="sem-q" placeholder="比如：去年在湖边拍的视频"><button type="button" class="btn" id="sem-attach">📎 附人物照片</button><button type="button" class="btn primary" id="sem-go">搜索</button></div>
      <div class="hint sem-can" data-rule="R-搜索-06">能搜：说过的话、画面里的字、场景和人物。试试：
        <a href="#" data-sem-ex="a">${esc(EXAMPLES.a.text)}</a>；<a href="#" data-sem-ex="b">${esc(EXAMPLES.b.text)}</a></div>
      <div id="sem-att" class="sem-att hidden">📎 人物照片.jpg <a href="#" id="sem-att-x">移除</a></div>
      <div id="sem-out"></div>`;
    const head = page.querySelector(".files-head");
    page.insertBefore(box, head ? head.nextSibling : page.firstChild);
    const q = box.querySelector("#sem-q"), out = box.querySelector("#sem-out"), att = box.querySelector("#sem-att");
    let plan = [], attached = false, consentAsked = false, fixed = false;
    const setAttached = (v) => { attached = v; att.classList.toggle("hidden", !v); };

    function render() {
      if (!plan.length) { out.innerHTML = '<p class="muted small">没认出查询条件，换个说法试试。</p>'; return; }
      const tagsHTML = `<div class="sem-plan" data-rule="R-搜索-01"><span class="muted small">查询计划</span>${plan.map((t, i) => `<span class="sem-tag ${t.off ? "off" : ""} ${t.sortOnly ? "sort" : ""}" data-tag="${i}">${t.appliesTo.length ? `<i>${esc(t.appliesTo.map((k) => KIND_LABEL[k]).join("/"))}</i>` : ""}${esc(t.label)}<button type="button" class="sem-x" data-x="${i}" title="${t.off ? "恢复" : "点掉"}">${t.off ? "↺" : "×"}</button></span>`).join("")}</div>`;
      const fix = !fixed && checkPlan(plan);
      if (fix) {
        out.innerHTML = tagsHTML + `<div class="note warn sem-fix" data-rule="R-搜索-02">💡 ${esc(fix.text)}你想找的是：<div class="sem-fix-opts">${fix.options.map((o, i) => `<button type="button" class="btn sm" data-fix="${i}">${esc(o.label)}</button>`).join("")}</div></div>`;
        out.querySelectorAll("[data-fix]").forEach((b) => (b.onclick = () => { plan = fix.options[+b.dataset.fix].plan; fixed = true; render(); }));
        bindTags();
        return;
      }
      const c = state.consents = state.consents && typeof state.consents === "object" ? state.consents : {};
      const person = plan.find((t) => !t.off && t.type === "person");
      if (person && !c.face && !consentAsked) {
        out.innerHTML = tagsHTML + `<div class="consent-card sem-consent" data-rule="R-资料-05 R-信任-01"><b>🔒 要认照片里的人，先问你一声</b>
          <p>按人找照片需要开启人脸识别：只在你的资料里比对，不给别人看，可随时在“我了解的你”里关闭并删除。孩子的脸需要你作为监护人同意。</p>
          <div class="actions"><button type="button" class="btn primary sm" data-face="yes">同意并开启</button><button type="button" class="btn sm" data-face="no">不开启</button></div></div>`;
        out.querySelectorAll("[data-face]").forEach((b) => (b.onclick = () => {
          const ok = b.dataset.face === "yes";
          c.face = ok; c.faceAsked = true; c.faceAt = PA.nowStr(); consentAsked = true;
          if (!ok) plan.forEach((t) => t.type === "person" && (t.off = true));
          save(); toast(ok ? "已开启人脸识别，可随时关闭" : "好，不按人找，其他条件照样搜");
          render();
        }));
        bindTags();
        return;
      }
      const r = runQuery(plan);
      out.innerHTML = tagsHTML + `<div class="sem-meta"><span>共 <b class="sem-total">${r.total}</b> 条</span><span class="sem-time" data-rule="R-搜索-05">${esc(r.elapsed)}</span></div>`
        + (r.total ? r.groups.map((g) => `<div class="sem-group" data-kind="${g.kind}" data-rule="R-搜索-03"><div class="sem-gh">${esc(g.label)} · ${g.items.length}</div>${g.items.map((it) => `<div class="sem-item" data-id="${esc(it.id)}"><div><b>${esc(it.title)}</b>${it.trip ? ` <span class="muted small">${esc(it.trip)}</span>` : ""} ${it.mainly ? "" : itemNote(it, plan)}</div><div class="sem-loc">${locate(it)}</div>${it.mainly ? itemNote(it, plan) : ""}</div>`).join("")}</div>`).join("")
          : '<p class="muted small">按这些条件没找到，点掉一个标签放宽试试。</p>');
      bindTags();
    }
    function bindTags() {
      out.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => { const t = plan[+b.dataset.x]; t.off = !t.off; render(); }));
    }
    function go(text) {
      const t = (text ?? q.value).trim();
      if (!t) { q.focus(); return; }
      plan = planQuery(t);
      if (plan.some((x) => x.type === "person") && !attached) setAttached(true);
      consentAsked = false; fixed = false;
      render();
    }
    box.querySelector("#sem-go").onclick = () => go();
    q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); go(); } });
    box.querySelector("#sem-attach").onclick = () => { setAttached(true); toast("已附上一张人物照片（原型演示）"); };
    box.querySelector("#sem-att-x").onclick = (e) => { e.preventDefault(); setAttached(false); };
    box.querySelectorAll("[data-sem-ex]").forEach((a) => (a.onclick = (e) => {
      e.preventDefault();
      const ex = EXAMPLES[a.dataset.semEx];
      q.value = ex.text; setAttached(ex.photo); go(ex.text);
    }));
    PA_SEARCH.go = go;
  }

  // ---------------- 周报出处（首页卡片） ----------------
  function decorateWeekly(card) {
    const d = (state.deliveries || []).find((x) => x.id === card.dataset.deliveryId);
    const body = card.querySelector(".pc-body");
    if (!d || !(d.sources || []).length || !body || body.querySelector(".wk-src")) return;
    body.dataset.rule = "R-工作-02 R-工作-03";
    body.innerHTML = d.sources.map((s, i) => `<span class="wk-line">${esc(s.text)}<button type="button" class="wk-src" data-src="${i}" title="看出处">出处</button></span>`).join(" ")
      + '<span class="wk-pop hidden"></span>';
    const pop = body.querySelector(".wk-pop");
    body.querySelectorAll(".wk-src").forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      const s = d.sources[+b.dataset.src];
      const same = !pop.classList.contains("hidden") && pop.dataset.i === b.dataset.src;
      pop.dataset.i = b.dataset.src;
      pop.innerHTML = `来源 · ${esc(s.kind)}：<b class="wk-title">${esc(s.title)}</b>`;
      pop.classList.toggle("hidden", same);
    }));
  }
  function watchHome() {
    const host = document.getElementById("butler");
    if (!host || host.dataset.s09) return;
    host.dataset.s09 = "1";
    const all = () => host.querySelectorAll(".pa-card").forEach(decorateWeekly);
    all();
    new MutationObserver(all).observe(host, { childList: true, subtree: true });
  }

  const PA_SEARCH = (window.PA_SEARCH = { EXAMPLES, decorateWeekly });
  function boot() { mountFiles(); watchHome(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
