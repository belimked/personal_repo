// 原型 v6 S10：界面三池映射（因素 → 界面需求 → 组件参数）与生图点数流程
// 引入顺序：… → app.js → demo.js → chat.js → cards.js → 页面脚本 → ui-rules.js（首页）；后台页只读 PA_UI / PA_POINTS。
// - window.PA_UI = { factors, needs, components, rules }；PA.uiConfig(uiFactors) → { slotOrder, density, fontScale, wording, inputDefault, needs }
//   只调已有参数（槽位顺序、信息密度、字号、用词、默认输入方式），不新增布局；首页按它重排 #butler 里的已有区块、给 body 加样式类。
// - window.PA_POINTS：生图 / 视频的档位与扣点规则；PA_POINTS.cost(ability, tier, seconds)。
// - 海报流程：草稿不扣点；点“生成正式海报”弹确认（快速 / 精细、消耗、剩余）；确认扣 points.balance 并写 points.log；取消、失败都不扣。
(function () {
  const W = window;
  const has = (s, re) => re.test(String(s || ""));
  const roles = (f) => (Array.isArray(f.roles) ? f.roles : []);

  // ---------------- 第一池：画像因素（7 个，R-界面-05） ----------------
  const factors = [
    { key: "age", label: "年龄段和视力" },
    { key: "digital", label: "数字熟练度" },
    { key: "roles", label: "主要角色组合" },
    { key: "focus", label: "当前重点" },
    { key: "timeDevice", label: "使用时段和设备" },
    { key: "infoPref", label: "信息偏好" },
    { key: "inputPref", label: "输入偏好" },
  ];

  // ---------------- 第二池：界面需求 ----------------
  const needs = {
    bigText: { label: "看得清：字大一点" },
    fewSlots: { label: "少而精：首页块少一点" },
    plainWords: { label: "说人话：用词更直白" },
    childFirst: { label: "孩子的事放前面" },
    detailed: { label: "信息给全一点" },
    compact: { label: "简洁：一眼看完" },
    resultFirst: { label: "先看做好的结果" },
    voiceFirst: { label: "张嘴就能说" },
  };

  // ---------------- 第三池：组件参数（只调已有参数） ----------------
  const SLOTS = ["proactive", "done", "watch", "decide"];
  const components = {
    slotOrder: {
      default: ["proactive", "done", "watch", "decide"],
      fewSlots: ["proactive", "done", "decide"],
      childFirst: ["proactive", "decide", "done", "watch"],
      resultFirst: ["done", "proactive", "decide", "watch"],
    },
    density: { default: "normal", detailed: "detailed", compact: "compact" },
    fontScale: { default: 1, bigText: 1.25 },
    wording: { default: "standard", plainWords: "plain" },
    inputDefault: { default: "text", voiceFirst: "voice" },
  };

  // ---------------- 规则：因素 → 需求（不一对一），需求 → 组件（按先后取第一条命中） ----------------
  const rules = {
    factorToNeed: [
      { id: "U-01", need: "bigText", why: "年龄 45 岁以上或要求大字", when: (f) => has(f.age, /^(4[5-9]|[5-9]\d)/) || has(f.infoPref, /大字/) },
      { id: "U-02", need: "fewSlots", why: "数字熟练度低", when: (f) => has(f.digital, /低/) },
      { id: "U-03", need: "plainWords", why: "数字熟练度低", when: (f) => has(f.digital, /低/) },
      { id: "U-04", need: "childFirst", why: "角色里有家长", when: (f) => roles(f).includes("家长") },
      { id: "U-05", need: "detailed", why: "家长要看全孩子的事，或偏好详细 / 清单", when: (f) => roles(f).includes("家长") || has(f.infoPref, /详细|清单/) },
      { id: "U-06", need: "compact", why: "偏好简洁", when: (f) => has(f.infoPref, /简洁/) },
      { id: "U-07", need: "compact", why: "数字熟练度低，信息少一点", when: (f) => has(f.digital, /低/) },
      { id: "U-08", need: "resultFirst", why: "偏好简洁，先看结果", when: (f) => has(f.infoPref, /简洁/) },
      { id: "U-09", need: "voiceFirst", why: "输入偏好以语音开头", when: (f) => has(f.inputPref, /^语音/) },
    ],
    needToComponent: {
      slotOrder: ["fewSlots", "childFirst", "resultFirst"],
      density: ["detailed", "compact"],
      fontScale: ["bigText"],
      wording: ["plainWords"],
      inputDefault: ["voiceFirst"],
    },
  };

  function needsOf(f, R = rules) {
    const out = [];
    (R.factorToNeed || []).forEach((r) => { if (r.when(f || {}) && !out.includes(r.need)) out.push(r.need); });
    return out;
  }
  function uiConfig(uiFactors, R = rules) {
    const f = uiFactors || {};
    const ns = needsOf(f, R);
    const pick = (comp) => {
      const n = (R.needToComponent[comp] || []).find((x) => ns.includes(x));
      const v = components[comp][n || "default"];
      return Array.isArray(v) ? v.slice() : v;
    };
    return { slotOrder: pick("slotOrder"), density: pick("density"), fontScale: pick("fontScale"), wording: pick("wording"), inputDefault: pick("inputDefault"), needs: ns };
  }

  W.PA_UI = { factors, needs, components, rules, SLOTS, needsOf, uiConfig };

  // ---------------- 点数规则（S11 后台读取） ----------------
  const PA_POINTS = {
    unit: "点",
    draftCost: 0, // 草稿 / 分镜不扣点（R-生成-04）
    failCharge: 0, // 失败不扣点（R-生成-05）
    freeTweaks: 2, // 成片后有限次免费微调
    dailyLimit: 10, // 每天正式生成上限（R-生成-06）
    abilities: {
      生图: { label: "生图", tiers: { fast: { label: "快速", cost: 20 }, fine: { label: "精细", cost: 40 } } },
      视频: { label: "视频", perSecond: true, tiers: { fast: { label: "快速", cost: 2 }, fine: { label: "精细", cost: 5 } } },
    },
    cost(ability, tier, seconds) {
      const a = PA_POINTS.abilities[ability];
      const t = a && a.tiers[tier];
      if (!t) return 0;
      return a.perSecond ? t.cost * Math.max(1, Math.ceil(+seconds || 1)) : t.cost;
    },
  };
  W.PA_POINTS = PA_POINTS;

  const PA = W.PA;
  if (!PA) return;
  PA.uiConfig = uiConfig;
  if (!PA.state || typeof document === "undefined") return;
  const { state, esc, save, toast } = PA;

  // ---------------- 首页应用 uiConfig ----------------
  const slotOf = (el) => SLOTS.find((s) => el.classList && el.classList.contains("home-" + s));
  const delOf = (id) => (state.deliveries || []).find((d) => d.id === id);
  const VOICE_PH = "按 🎤 说一声，或在这里打字…";

  function applyBody(cfg) {
    const b = document.body;
    b.classList.toggle("ui-large", cfg.fontScale > 1);
    b.classList.toggle("ui-compact", cfg.density === "compact");
    b.classList.toggle("ui-detailed", cfg.density === "detailed");
    b.classList.toggle("ui-plain", cfg.wording === "plain");
    b.classList.toggle("ui-voice", cfg.inputDefault === "voice");
    b.style.setProperty("--ui-font-scale", String(cfg.fontScale));
    b.dataset.input = cfg.inputDefault;
    b.dataset.density = cfg.density;
    b.dataset.wording = cfg.wording;
    const mic = document.querySelector(".composer .mic"), input = document.getElementById("input");
    if (mic) mic.classList.toggle("default", cfg.inputDefault === "voice");
    if (input) {
      if (!input.dataset.phText) input.dataset.phText = input.placeholder;
      input.placeholder = cfg.inputDefault === "voice" ? VOICE_PH : input.dataset.phText;
    }
  }

  function applySlots(host, cfg) {
    const kids = [...host.children];
    const slotEls = kids.filter(slotOf);
    if (!slotEls.length) return;
    const rank = (el) => { const i = cfg.slotOrder.indexOf(slotOf(el)); return i < 0 ? 99 : i; };
    const sorted = slotEls.slice().sort((a, b) => rank(a) - rank(b));
    slotEls.forEach((el) => {
      const hide = !cfg.slotOrder.includes(slotOf(el));
      el.classList.toggle("hidden", hide);
      if (hide) el.dataset.uiHidden = "1"; else delete el.dataset.uiHidden;
    });
    if (sorted.some((el, i) => el !== slotEls[i])) {
      let ref = slotEls[0].previousSibling;
      sorted.forEach((el) => { host.insertBefore(el, ref ? ref.nextSibling : host.firstChild); ref = el; });
    }
    if (cfg.needs.includes("childFirst")) {
      host.querySelectorAll(".home-sec").forEach((sec) => {
        const cards = [...sec.querySelectorAll(":scope > .pa-card")];
        const kid = cards.filter((c) => (delOf(c.dataset.deliveryId) || {}).domain === "孩子");
        if (!kid.length || cards.slice(0, kid.length).every((c, i) => c === kid[i])) return;
        const rest = cards.filter((c) => !kid.includes(c));
        kid.forEach((c) => sec.insertBefore(c, rest[0]));
      });
    }
    host.dataset.slotOrder = cfg.slotOrder.join(",");
    host.dataset.rule = "R-界面-01 R-界面-03";
  }

  // ---------------- 海报：草稿不扣点，确认后扣点 ----------------
  const pts = () => (state.points = state.points && typeof state.points === "object" ? state.points : { balance: 0, monthly: 0, log: [] });
  function confirmPoster(d) {
    const P = PA_POINTS, ab = (d.poster && d.poster.ability) || "生图";
    const tiers = P.abilities[ab].tiers;
    let tier = "fast";
    const line = () => { const c = P.cost(ab, tier); return `约消耗 <b data-cost>${c}</b> 点，本月还剩 <b data-left>${pts().balance}</b> 点`; };
    PA.modal({
      title: "生成正式海报",
      body: `<div class="pt-confirm" data-rule="R-生成-01 R-生成-03 R-生成-05">
        <div class="pt-tiers">${Object.entries(tiers).map(([k, t]) => `<label class="pt-tier"><input type="radio" name="pt-tier" value="${k}" ${k === tier ? "checked" : ""}> ${esc(t.label)}（${t.cost} 点）</label>`).join("")}</div>
        <p class="pt-line">${line()}</p>
        <label class="pt-fail small muted"><input type="checkbox" data-fail> 演示：这次生成失败（失败不扣点）</label></div>`,
      onMount(mask) {
        mask.querySelectorAll('input[name="pt-tier"]').forEach((r) => (r.onchange = () => { tier = r.value; mask.querySelector(".pt-line").innerHTML = line(); }));
      },
      actions: [
        { label: "取消" },
        {
          label: "确认生成", primary: true,
          onClick(mask) {
            const p = pts(), cost = P.cost(ab, tier), tl = tiers[tier].label;
            if (mask.querySelector("[data-fail]").checked) {
              d.poster.failed = PA.nowStr();
              save();
              toast("生成失败了，没有扣点，可以再试一次");
              rerender();
              return;
            }
            if (p.balance < cost) { toast(`点数不够：需要 ${cost} 点，还剩 ${p.balance} 点`); return false; }
            p.balance -= cost;
            p.log = Array.isArray(p.log) ? p.log : [];
            const at = PA.nowStr();
            p.log.push({ at, ability: ab, cost, tier, note: `${d.poster.note || d.title}（${tl}）` });
            d.poster.done = { tier, cost, at };
            d.poster.failed = "";
            d.poster.tweaksLeft = P.freeTweaks;
            save();
            toast(`正式海报生成好了，扣 ${cost} 点，还剩 ${p.balance} 点`);
            rerender();
          },
        },
      ],
    });
  }
  function rerender() { if (PA.renderHome) PA.renderHome(); }
  function decoratePoster(card) {
    const d = delOf(card.dataset.deliveryId);
    if (!d || !d.poster || card.querySelector(":scope > .pc-poster")) return;
    const p = d.poster, done = p.done;
    const box = document.createElement("div");
    box.className = "pc-poster";
    box.dataset.rule = "R-生成-03 R-生成-04 R-生成-05 R-生成-06";
    box.innerHTML = done
      ? `<div class="pt-done">✅ 正式海报已生成（${esc(PA_POINTS.abilities[p.ability || "生图"].tiers[done.tier].label)}，扣 ${done.cost} 点）</div>
         <button type="button" class="btn sm" data-c="tweak" ${p.tweaksLeft > 0 ? "" : "disabled"}>免费微调（剩 ${p.tweaksLeft || 0} 次）</button>`
      : `<div class="pt-draft">🖼️ ${esc(p.draft || "海报草稿已备好")}（草稿不扣点）</div>
         ${p.failed ? '<div class="pt-failed small">上次生成失败，没有扣点</div>' : ""}
         <button type="button" class="btn primary sm" data-c="poster">生成正式海报</button>`;
    const anchor = card.querySelector(".pc-notice") || card.querySelector(".pc-body");
    if (anchor) anchor.insertAdjacentElement("afterend", box); else card.appendChild(box);
    const g = box.querySelector('[data-c="poster"]');
    if (g) g.onclick = () => confirmPoster(d);
    const t = box.querySelector('[data-c="tweak"]');
    if (t) t.onclick = () => { if (p.tweaksLeft > 0) { p.tweaksLeft--; save(); toast(`已微调，不扣点；还能免费微调 ${p.tweaksLeft} 次`); rerender(); } };
  }

  function applyHome() {
    const cfg = uiConfig(state.uiFactors);
    applyBody(cfg);
    const host = document.getElementById("butler");
    if (host) { applySlots(host, cfg); host.querySelectorAll(".pa-card").forEach(decoratePoster); }
    return cfg;
  }
  function boot() {
    const host = document.getElementById("butler");
    if (!host) return;
    applyHome();
    if (host.dataset.s10) return;
    host.dataset.s10 = "1";
    new MutationObserver(() => applyHome()).observe(host, { childList: true, subtree: true });
  }
  PA.applyUi = applyHome;
  PA.confirmPoster = confirmPoster;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
