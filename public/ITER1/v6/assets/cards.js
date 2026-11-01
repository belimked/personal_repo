// 原型 v6 S06：结果卡片组件 PA.renderCard + 管家首页三个阶段（第 1 天“第一件事”、第 7 天开始盯事、第 30 天完整汇报）
// 引入顺序：… → app.js → demo.js → chat.js → cards.js → 页面脚本。
// - PA.renderCard(delivery, opts) 返回卡片根元素（.pa-card，带 data-rule = delivery.rules 合并卡片模块规则），后续页面复用；
//   delivery 直接传 state 里的对象，展开、“还可以帮你”、“这个别记”的结果写回该对象并 save()。
//   opts：{ lead, rules: [额外规则], generalMode, onDraw(el, delivery), onChange(delivery) }
// - 首页：包装 PA_CHAT.start，在对话区上方挂 #butler；第 1 天不显示开场问候和对话记录，输入框先用来回答“第一件事”。
(function () {
  const PA = window.PA;
  if (!PA || !PA.state) return;
  const { state, esc, save, toast } = PA;
  const stage = () => (state.demo && +state.demo.stage) || 1;
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const arr = (k) => (state[k] = Array.isArray(state[k]) ? state[k] : []);

  // ---------------- 结果卡片 ----------------
  const CARD_RULES = ["R-帮什么-03", "R-帮什么-05", "R-信任-02"];
  const DEPTH_RULES = { skeleton: ["R-做多深-01", "R-做多深-05"], full: ["R-做多深-01"] };
  const ruleAttr = (d, extra = []) => uniq([...(d.rules || []), ...CARD_RULES, ...(DEPTH_RULES[d.depth] || DEPTH_RULES.full), ...extra]).join(" ");
  // “这个别记”按领域找对应的画像条目（卡片自己记下的条目优先）
  const DOMAIN_RE = {
    出行: /出行|行程|订票|旅/, 孩子: /孩子|家长|学校|老大|老二/, 工作: /工作|周报|产品|职业/, 健康: /体检|健康/, 家务: /证件|护照|后勤/,
    人情: /妈妈|生日|家人|送礼/, 想做的事: /记账/, 小店: /店|接单|客户/, 学习: /考研|学|社团/,
  };
  const fullOf = (d) => d.full || [d.body, ...(d.more || []).map((m) => `${m.label}：${m.body}`)].filter(Boolean).join(" ");
  const becauseText = (s) => (/^因为/.test(s) ? s : "因为" + s);

  function findProfileFor(d) {
    const prof = arr("profile");
    if ((d.profileIds || []).length) return prof.filter((p) => d.profileIds.includes(p.id));
    const re = DOMAIN_RE[d.domain];
    const hit = re && prof.find((p) => re.test(p.key) && p.layer === 3) || re && prof.find((p) => re.test(p.key + p.value));
    return hit ? [hit] : [];
  }

  function renderCard(d, opts = {}) {
    const el = document.createElement("div");
    el.className = "pa-card";
    el.dataset.deliveryId = d.id || "";
    const changed = () => { save(); draw(); opts.onChange && opts.onChange(d); };
    function draw() {
      const general = opts.generalMode ?? !!state.generalMode;
      const skeleton = d.depth === "skeleton" && !d.expanded;
      const more = (d.more || []).slice(0, 2);
      const opened = d.moreOpened || [];
      el.dataset.rule = ruleAttr(d, opts.rules);
      el.dataset.depth = skeleton ? "skeleton" : "full";
      el.classList.toggle("skeleton", skeleton);
      el.innerHTML = `${opts.lead ? `<div class="pc-lead">${esc(opts.lead)}</div>` : ""}
        <div class="pc-title">${esc(d.title)}${skeleton ? '<span class="badge pc-depth">骨架</span>' : `<span class="badge pc-depth full">${d.depth === "skeleton" ? "完整版" : "一步到位"}</span>`}</div>
        ${skeleton ? '<div class="pc-hint">先给你个大概，展开看完整版</div>' : ""}
        <div class="pc-body">${esc(skeleton ? d.body : d.depth === "skeleton" ? fullOf(d) : d.body)}</div>
        ${skeleton ? '<div class="pc-expand"><button type="button" class="btn sm" data-c="expand">展开看完整版</button></div>' : ""}
        ${!general && d.because ? `<div class="pc-because" data-rule="R-帮什么-05">🎯 ${esc(becauseText(d.because))}</div>` : ""}
        <div class="pc-slot"></div>
        ${more.length ? `<div class="pc-more" data-rule="R-帮什么-03 R-帮什么-04"><span class="pc-more-lbl">还可以帮你</span>${more.map((m, i) => `<button type="button" class="btn sm" data-more="${i}" ${opened.includes(i) ? "disabled" : ""}>${esc(m.label)}</button>`).join("")}</div>
          <div class="pc-more-out">${opened.filter((i) => more[i]).map((i) => `<div class="pc-more-item"><b>${esc(more[i].label)}</b>：${esc(more[i].body)}</div>`).join("")}</div>` : ""}
        <div class="pc-foot">${d.forgotten ? `<span class="muted small">已不记：${esc(d.forgotten)}</span>` : '<button type="button" class="btn ghost sm" data-c="forget" data-rule="R-信任-02">这个别记</button>'}</div>`;
      const ex = el.querySelector('[data-c="expand"]');
      if (ex) ex.onclick = () => { d.expanded = true; changed(); };
      el.querySelectorAll("[data-more]").forEach((b) => (b.onclick = () => {
        const i = +b.dataset.more, m = more[i];
        if (!m || opened.includes(i)) return;
        d.moreOpened = [...opened, i];
        arr("feedback").push({ id: PA.uid("fb"), deliveryId: d.id, action: "more", at: PA.nowStr(), signal: "职责:" + (m.domain || d.domain || "其他") });
        changed();
      }));
      const fg = el.querySelector('[data-c="forget"]');
      if (fg) fg.onclick = () => {
        const hits = findProfileFor(d);
        if (!hits.length) { toast("这张卡片没有用到要记的信息"); return; }
        state.profile = state.profile.filter((p) => !hits.includes(p));
        d.forgotten = hits.map((p) => `${p.key}：${p.value}`).join("；");
        d.profileIds = [];
        toast(`好，这条不记了：${d.forgotten}`);
        changed();
      };
      if (opts.onDraw) opts.onDraw(el, d);
    }
    el.redraw = draw;
    draw();
    return el;
  }

  // ---------------- 画像与同意 ----------------
  function addProfile(p, d, said) {
    const at = PA.nowStr();
    const ev = { id: PA.uid("e"), kind: "told", refId: d.id, text: said, aboutSelf: true, at };
    arr("evidence").push(ev);
    const entry = { id: PA.uid("pr"), layer: p.layer, key: p.key, value: p.value, source: "told", evidenceIds: [ev.id], confidence: 0.9, status: "confirmed", sensitive: p.sensitive || null, updatedAt: at };
    arr("profile").push(entry);
    d.profileIds = [...(d.profileIds || []), entry.id];
    d.forgotten = "";
    return entry;
  }
  const consents = () => (state.consents = state.consents && typeof state.consents === "object" ? state.consents : {});
  const needConsent = (p) => p && p.sensitive === "child" && !consents().child && !consents().childAsked;

  // ---------------- 第 1 天：第一件事 ----------------
  const FIRST = [
    {
      id: "trip", label: "秋假带孩子出去玩", re: /玩|旅|秋假|出游|度假|景点/,
      delivery: {
        domain: "出行", title: "秋假去哪：三个短途去处", depth: "skeleton",
        body: "从深圳出发 3～4 天：长沙（高铁 3 小时，历史博物馆）、潮汕（美食、古城）、桂林阳朔（山水、骑行）。",
        full: "完整版：长沙——高铁深圳北到长沙南 3 小时，湖南博物院、橘子洲、岳麓山，四口人约 6000 元；潮汕——高铁 2 小时，牌坊街、南澳岛，约 4500 元；桂林阳朔——高铁 3 小时，漓江竹筏、遇龙河骑行，约 6500 元。",
        because: "因为你说想秋假带孩子出去玩，从深圳出发",
        more: [{ label: "交通怎么走", body: "三个去处都有高铁直达，周六早班余票最多，提前 7 天开售" }, { label: "按孩子年龄挑景点", body: "按年龄挑：博物馆和古城适合大一点的孩子，骑行和沙滩适合小的", domain: "孩子" }],
        rules: ["R-冷启动-02", "R-帮什么-01", "R-出行-01"],
      },
      ask: { q: "打算玩几天？", opts: [
        { label: "两三天", body: "两三天就选近的：潮汕（高铁 2 小时），第 1 天牌坊街吃一圈，第 2 天南澳岛，第 3 天上午返程。", profile: { layer: 4, key: "出行时长", value: "秋假想玩两三天" } },
        { label: "四五天", body: "四五天推荐长沙：第 1 天湖南博物院，第 2 天岳麓山和书院，第 3 天橘子洲，第 4 天下午返程。", profile: { layer: 4, key: "出行时长", value: "秋假想玩四五天" } },
        { label: "一周左右", body: "一周可以长沙 + 张家界连着玩：前 3 天长沙城里，后 4 天张家界森林公园和天门山。", profile: { layer: 4, key: "出行时长", value: "秋假想玩一周左右" } },
      ] },
    },
    {
      id: "ptm", label: "下周家长会要准备什么", re: /家长会|老师|学校|班主任|开学/,
      delivery: {
        domain: "孩子", title: "家长会准备：要带的、要问的", depth: "full",
        body: "要带：成绩单签字页、笔和本子。要问：最近作业量、课后托管时间、孩子在班里的状态。",
        because: "因为你说下周要开家长会",
        more: [{ label: "设个提醒", body: "家长会前一晚 20:30 提醒你看一遍这张清单" }, { label: "整理要问老师的问题", body: "按学习、作业、在校表现各列 2 个问题" }],
        rules: ["R-冷启动-02", "R-孩子-03"],
      },
      ask: { q: "孩子上几年级？", opts: [
        { label: "小学低年级", body: "要带：签字页、笔。要问：拼音和识字进度、课后托管时间、在班里交到朋友没有。", profile: { layer: 1, key: "孩子", value: "孩子上小学低年级", sensitive: "child" } },
        { label: "小学高年级", body: "要带：签字页、错题本。要问：数学错题多的原因、小升初的安排、课后托管时间。", profile: { layer: 1, key: "孩子", value: "孩子上小学高年级", sensitive: "child" } },
        { label: "初中", body: "要带：成绩单、笔。要问：中考体育怎么练、各科短板、晚自习安排。", profile: { layer: 1, key: "孩子", value: "孩子上初中", sensitive: "child" } },
      ] },
    },
    {
      id: "weekly", label: "把这周的周报写了", re: /周报|工作|汇报|总结|报告/,
      delivery: {
        domain: "工作", title: "本周周报初稿", depth: "full",
        body: "1. 本周完成：……（从你的待办里补）。2. 进行中：……。3. 下周计划：……。我先按通用格式排好了。",
        because: "因为你说这周要交周报",
        more: [{ label: "改成三行简版", body: "完成什么、卡在哪、下周做什么，各一行" }, { label: "每周五提醒我", body: "每周五 16:00 先备好初稿" }],
        rules: ["R-冷启动-02", "R-工作-01"],
      },
      ask: { q: "周报主要给谁看？", opts: [
        { label: "直属领导", body: "给领导看的版本：先写结果和数字，再写风险和需要支持的事，控制在 5 行以内。", profile: { layer: 3, key: "工作周报", value: "每周给直属领导交周报" } },
        { label: "整个团队", body: "给团队看的版本：按项目分段，写清楚谁在做什么、下周的分工和时间点。", profile: { layer: 3, key: "工作周报", value: "每周给团队发周报" } },
      ] },
    },
    {
      id: "mom", label: "妈妈生日送什么", re: /生日|礼物|妈|送/,
      delivery: {
        domain: "人情", title: "妈妈生日礼物：三个思路", depth: "skeleton",
        body: "按摩靠垫、家庭相册、约一次全家视频吃蛋糕。",
        full: "完整版：按摩靠垫（300 元左右，适合久坐）；家庭相册（挑 30 张老照片，冲印约 200 元，5 天到）；全家视频吃蛋糕（提前订好送到妈妈家的蛋糕，约 260 元）。",
        because: "因为你说想给妈妈过生日",
        more: [{ label: "写张祝福卡", body: "先出一段祝福语草稿，你改完再生成卡片" }, { label: "生日前 3 天提醒我", body: "生日前 3 天晚上提醒你下单" }],
        rules: ["R-冷启动-02", "R-人情-01"],
      },
      ask: { q: "预算大概多少？", opts: [
        { label: "300 以内", body: "300 以内：家庭相册 + 一张手写祝福卡，心意最足。", profile: { layer: 4, key: "送礼预算", value: "给家人送礼 300 元以内" } },
        { label: "300～1000", body: "300～1000：按摩靠垫 + 送到家的蛋糕，再约一次视频一起吹蜡烛。", profile: { layer: 4, key: "送礼预算", value: "给家人送礼 300～1000 元" } },
        { label: "1000 以上", body: "1000 以上：周末带妈妈做一次全身体检或短途泡温泉，再配一本家庭相册。", profile: { layer: 4, key: "送礼预算", value: "给家人送礼 1000 元以上" } },
      ] },
    },
  ];
  const customExample = (t) => ({
    id: "custom", label: t,
    delivery: {
      domain: "其他", title: `先帮你把“${t}”拆成三步`, depth: "skeleton",
      body: "1. 定下完成时间；2. 列出要准备的东西；3. 到点我提醒你。",
      full: `完整版：“${t}”——今晚先列出要准备的东西（我按常见做法先列了 5 项），明天确认谁来做，完成前一天提醒你检查一遍。`,
      because: `因为你说这周最想搞定“${t}”`,
      more: [{ label: "列个准备清单", body: "按常见做法先列 5 项，你删改就行" }, { label: "到点提醒我", body: "完成前一天 20:00 提醒你" }],
      rules: ["R-冷启动-02", "R-冷启动-04"],
    },
    ask: { q: "这件事想什么时候搞定？", opts: [
      { label: "这周内", body: `这周内搞定“${t}”：今晚列清单，周四确认，周五前我提醒你收尾。`, profile: { layer: 5, key: "这周想搞定", value: t } },
      { label: "下周", body: `下周搞定“${t}”：周日晚上我把清单发你，下周三提醒你进度。`, profile: { layer: 5, key: "下周想搞定", value: t } },
    ] },
  });
  const matchExample = (t) => FIRST.find((x) => x.re.test(t)) || customExample(t);
  const firstDelivery = () => (state.deliveries || []).find((d) => d.firstThing);

  function chooseFirst(ex, said) {
    const d = Object.assign(clone(ex.delivery), { id: "ft-" + ex.id + "-" + Date.now().toString(36), firstThing: true, said, moment: (state.demo && state.demo.moment) || "", push: false, pushReason: "", ask: Object.assign(clone(ex.ask), { answered: null }) });
    arr("deliveries").unshift(d);
    arr("evidence").push({ id: PA.uid("e"), kind: "told", refId: d.id, text: "这周最想搞定：" + said, aboutSelf: true, at: PA.nowStr() });
    save();
    renderHome();
  }
  function answerFirst(d, i) {
    const o = d.ask.opts[i];
    if (!o || d.ask.answered != null) return;
    d.ask.answered = i;
    d.body = o.body;
    if (d.depth === "skeleton" && d.full) d.full = o.body + " " + d.full.replace(/^完整版：/, "完整版：");
    if (needConsent(o.profile)) d.ask.consent = "pending";
    else recordFirst(d);
    save();
    renderHome();
  }
  function recordFirst(d) {
    const o = d.ask.opts[d.ask.answered];
    if (!o || !o.profile) return;
    if (o.profile.sensitive === "child" && !consents().child) { d.ask.refused = true; return; }
    const e = addProfile(o.profile, d, o.label);
    d.ask.noted = `${e.key}：${e.value}`;
  }
  function decideConsent(d, ok) {
    const c = consents();
    c.child = ok;
    c.childAsked = true;
    c.childAt = PA.nowStr();
    d.ask.consent = ok ? "yes" : "no";
    if (!ok) state.profile = arr("profile").filter((p) => p.sensitive !== "child"); // 拒绝后孩子相关画像一条不留
    recordFirst(d);
    save();
    toast(ok ? "已记下你的同意，可在设置里随时撤回" : "好，孩子相关的信息我都不记");
    renderHome();
  }
  function drawAsk(el, d) {
    const slot = el.querySelector(".pc-slot"), a = d.ask;
    if (!slot || !a) return;
    if (a.answered == null) {
      slot.innerHTML = `<div class="pc-ask" data-rule="R-冷启动-02 R-收集-01 R-收集-02">💬 ${esc(a.q)}<div class="pc-ask-opts">${a.opts.map((o, i) => `<button type="button" class="btn sm" data-ans="${i}">${esc(o.label)}</button>`).join("")}</div></div>`;
      slot.querySelectorAll("[data-ans]").forEach((b) => (b.onclick = () => answerFirst(d, +b.dataset.ans)));
      return;
    }
    if (a.consent === "pending") {
      slot.innerHTML = `<div class="consent-card" data-rule="R-收集-05 R-孩子-04 R-信任-01"><b>🔒 要记下孩子的信息，先问你一声</b>
        <p>孩子的年级这类信息，只用来帮你准备学校的事，不给别人看，也不用来训练模型。不满 14 岁孩子的信息需要你作为监护人单独同意，你随时可以在设置里撤回。</p>
        <div class="actions"><button type="button" class="btn primary sm" data-consent="yes">同意</button><button type="button" class="btn sm" data-consent="no">不同意</button></div></div>`;
      slot.querySelectorAll("[data-consent]").forEach((b) => (b.onclick = () => decideConsent(d, b.dataset.consent === "yes")));
      return;
    }
    slot.innerHTML = a.noted && (d.profileIds || []).length
      ? `<div class="pc-noted" data-rule="R-冷启动-03 R-信任-02">✍️ 我记下了：${esc(a.noted)}，可以随时改 <a href="me.html">去看看</a></div>`
      : a.refused ? '<div class="pc-noted" data-rule="R-收集-05">好，孩子相关的信息我不记，结果照样给你。</div>' : "";
  }

  // ---------------- 首页 ----------------
  let host = null;
  function section(title, inner, cls = "", rule = "") {
    const s = document.createElement("section");
    s.className = "home-sec " + cls;
    if (rule) s.dataset.rule = rule;
    s.innerHTML = `<h3>${title}</h3>`;
    if (typeof inner === "string") s.insertAdjacentHTML("beforeend", inner);
    else inner.forEach((n) => s.appendChild(n));
    return s;
  }
  function renderDay1() {
    const d = firstDelivery();
    const msgs = document.getElementById("msgs");
    if (msgs) msgs.classList.toggle("hidden", !d);
    if (!d) {
      host.innerHTML = `<div class="home-first" data-rule="R-冷启动-01 R-冷启动-04">
        <h2>这周最想搞定的一件事是什么？</h2>
        <p class="muted">说一件就行，我当场先帮你做出来。点个例子，或者直接在下面输入。</p>
        <div class="home-examples">${FIRST.map((x) => `<button type="button" class="home-ex" data-ex="${x.id}">${esc(x.label)}</button>`).join("")}</div></div>`;
      host.querySelectorAll("[data-ex]").forEach((b) => (b.onclick = () => { const ex = FIRST.find((x) => x.id === b.dataset.ex); chooseFirst(ex, ex.label); }));
      return;
    }
    host.innerHTML = "";
    host.appendChild(renderCard(d, { lead: `你说：“${d.said}”，我先做好了这个`, onDraw: drawAsk }));
  }
  const decidedIds = () => new Set((state.feedback || []).filter((f) => f.action === "adopt" || f.action === "reject").map((f) => f.deliveryId));
  function renderLater() {
    const s = stage(), m = PA.demoMoment ? PA.demoMoment() : null;
    const dels = state.deliveries || [], watch = state.watch || [], decided = decidedIds();
    const pro = m ? dels.filter((d) => d.moment === m.id) : [];
    const needDecide = (d) => d.depth === "skeleton" && !d.expanded && !decided.has(d.id);
    const pend = (state.profile || []).filter((p) => p.status === "pending");
    const decideN = dels.filter(needDecide).length + pend.length;
    const rest = dels.filter((d) => !pro.includes(d));
    const onChange = () => renderHome();
    const card = (d, lead) => renderCard(d, { lead, onChange });
    const watchHTML = watch.length ? `<ul class="home-list">${watch.map((w) => `<li><span class="badge">${esc(w.domain)}</span> ${esc(w.title)} <span class="muted small">· ${esc(w.doing)} · 下次 ${esc(w.nextAt)}</span></li>`).join("")}</ul>` : '<p class="muted small">还没有替你盯着的事。</p>';
    const pendHTML = pend.length ? `<ul class="home-list">${pend.map((p) => `<li>待确认：${esc(p.key)}——${esc(p.value)} <a class="small" href="me.html">去确认</a></li>`).join("")}</ul>` : "";
    host.innerHTML = "";
    if (s >= 30) {
      const head = document.createElement("div");
      head.className = "home-report-head";
      head.dataset.rule = "R-冷启动-05";
      head.innerHTML = `<h2>管家汇报</h2><span class="home-saved">本周替你省下 <b>${esc(String(state.savedHours || 0))}</b> 小时</span>`;
      host.appendChild(head);
    } else {
      const top = document.createElement("div");
      top.className = "home-top";
      top.dataset.rule = "R-帮什么-01 R-做多深-03";
      top.innerHTML = `<details class="home-count" data-k="watch"><summary>👀 替你盯着的 <b>${watch.length}</b> 件事</summary>${watchHTML}</details>
        <details class="home-count" data-k="decide"><summary>🤔 需要你决定的 <b>${decideN}</b> 件事</summary>${dels.filter(needDecide).length ? `<ul class="home-list">${dels.filter(needDecide).map((d) => `<li>${esc(d.title)}</li>`).join("")}</ul>` : ""}${pendHTML || (dels.filter(needDecide).length ? "" : '<p class="muted small">暂时没有。</p>')}</details>`;
      host.appendChild(top);
    }
    if (pro.length) {
      host.appendChild(section(`🔔 ${esc(m.label)}，我先替你出手了`, pro.map((d) => card(d, d.push && d.pushReason ? `主动提醒：${d.pushReason}` : "主动替你准备好了")), "home-proactive", "R-做多深-03"));
    }
    if (s >= 30) {
      const done = rest.filter((d) => !needDecide(d)), decide = rest.filter(needDecide);
      host.appendChild(section("✅ 替你做好的", done.length ? done.map((d) => card(d)) : '<p class="muted small">暂时没有。</p>', "home-done"));
      host.appendChild(section("👀 替你盯着的", watchHTML, "home-watch"));
      const ds = section("🤔 需要你决定的", decide.map((d) => card(d)), "home-decide");
      if (pendHTML) ds.insertAdjacentHTML("beforeend", pendHTML);
      if (!decide.length && !pendHTML) ds.insertAdjacentHTML("beforeend", '<p class="muted small">暂时没有。</p>');
      host.appendChild(ds);
    } else if (rest.length) {
      host.appendChild(section("📌 最近替你做的", rest.map((d) => card(d)), "home-recent"));
    }
  }
  function renderHome() {
    if (!host) return;
    if (stage() <= 1) renderDay1();
    else { const msgs = document.getElementById("msgs"); if (msgs) msgs.classList.remove("hidden"); renderLater(); }
  }
  // 第 1 天还没说第一件事时，输入框的内容当作“第一件事”
  function interceptComposer() {
    const input = document.getElementById("input"), btn = document.getElementById("send");
    if (!input || !btn) return;
    const active = () => stage() <= 1 && !firstDelivery();
    const take = () => { const v = input.value.trim(); if (!v) return; input.value = ""; chooseFirst(matchExample(v), v); };
    input.addEventListener("keydown", (e) => { if (active() && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopImmediatePropagation(); take(); } }, true);
    const orig = btn.onclick;
    btn.onclick = function (e) { if (active()) take(); else if (orig) orig.call(this, e); };
  }
  function mountHome() {
    const page = document.getElementById("page"), msgs = document.getElementById("msgs");
    if (!page || !msgs || document.getElementById("butler")) return;
    host = document.createElement("div");
    host.id = "butler";
    host.className = "butler";
    page.insertBefore(host, msgs);
    renderHome();
    interceptComposer();
  }

  const C = window.PA_CHAT;
  if (C) {
    const origOpening = C.opening;
    C.opening = function () { if (stage() <= 1) return; return origOpening.apply(this, arguments); };
    const origStart = C.start;
    C.start = function () { const r = origStart.apply(this, arguments); mountHome(); return r; };
  }

  PA.renderCard = renderCard;
  PA.renderHome = renderHome;
  window.PA_HOME = { FIRST, matchExample, chooseFirst, render: renderHome, firstDelivery };
})();
