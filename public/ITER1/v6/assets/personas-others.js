// 原型 v6 演示快照：p2 林舟、p3 周可、p4 何姐（只有第 30 天）。字段与 personas-p1.js 一致，见 docs/design/原型v6-设计.md §3.4、§3.6。
// 领域 id：出行 孩子 家务 健康 工作 学习 人情 小店（另有“想做的事”）
(function () {
  const P = (window.PA_PERSONAS = window.PA_PERSONAS || {});
  const pf = (id, layer, key, value, source, evidenceIds, confidence, status, sensitive, updatedAt) => ({ id, layer, key, value, source, evidenceIds, confidence, status, sensitive: sensitive || null, updatedAt });
  const ev = (id, kind, refId, text, aboutSelf, at) => ({ id, kind, refId, text, aboutSelf, at });

  // ---------- p2 林舟 ----------
  P.p2 = {
    30: {
      persona: { id: "p2", name: "林舟", age: 40, city: "深圳", job: "工程师", summary: "苏晴的爱人，管家里后勤：收拾行李、孩子用品、采购" },
      stage: 30,
      moments: [
        { id: "p2-trip", label: "出发前 3 天", at: "周三 20:00" },
        { id: "p2-kids", label: "周日 20:00", at: "周日 20:00" },
      ],
      profile: [
        pf("q1", 1, "城市", "深圳", "told", ["g1"], 0.95, "confirmed", "location", "第 2 天 21:00"),
        pf("q2", 1, "孩子", "两个孩子：15 岁、9 岁", "told", ["g1"], 0.95, "confirmed", "child", "第 2 天 21:00"),
        pf("q3", 2, "家长", "两个孩子的家长", "told", ["g1"], 0.95, "confirmed", "child", "第 2 天 21:00"),
        pf("q4", 3, "管家里后勤", "管家里后勤：收拾行李、孩子用品、采购", "told", ["g2"], 0.92, "confirmed", null, "第 16 天 21:10"),
        pf("q5", 3, "家里出行", "订票和行程由苏晴负责", "told", ["g2"], 0.85, "confirmed", null, "第 16 天 21:10"),
        pf("q6", 4, "采购习惯", "习惯在网上一次买齐", "feedback", ["g3"], 0.6, "guess", null, "第 20 天 22:00"),
        pf("q7", 5, "临近的大事", "秋假出游 3 天后出发（长沙）", "told", ["g2"], 0.9, "confirmed", null, "第 27 天 20:00"),
        pf("q8", 5, "老二的鞋", "老二的运动鞋可能小了", "file", ["g4"], 0.4, "pending", "child", "第 25 天 19:00"),
      ],
      evidence: [
        ev("g1", "told", "chat-q2", "我们在深圳，两个娃一个 15 一个 9 岁", true, "第 2 天 21:00"),
        ev("g2", "told", "chat-q16", "票她订，行李和孩子的东西我来收拾", true, "第 16 天 21:10"),
        ev("g3", "feedback", "fb-q1", "采购清单选了“一键加购物车”", true, "第 20 天 22:00"),
        ev("g4", "file", "f-shoe", "拍的老二运动鞋照片", true, "第 25 天 19:00"),
      ],
      watch: [
        { id: "w1", domain: "出行", title: "秋假长沙 4 天：行李和孩子用品", doing: "按长沙天气和孩子年龄列清单", nextAt: "出发前 2 天 20:00" },
        { id: "w2", domain: "孩子", title: "老二换运动鞋", doing: "周末前提醒量脚长", nextAt: "周日 20:00" },
      ],
      ideas: [],
      files: [{ id: "f-shoe", kind: "photo", name: "运动鞋.jpg", at: "第 25 天 19:00", summary: "老二的运动鞋，鞋头磨损", tags: ["孩子"] }],
      deliveries: [
        {
          id: "p2-d-trip", moment: "p2-trip", domain: "出行", title: "秋假长沙 4 天：行李和孩子用品清单", depth: "full",
          body: "行李与孩子用品清单：长沙天气 18～26℃、周日有雨，每人 4 套换洗、两把折叠伞；老二（9 岁）带水杯、零食、晕车贴；老大（15 岁）带充电宝和学生证（景点半价）；常备药一小包。",
          because: "因为家里后勤是你在管，先按天气和孩子年龄列好行李",
          more: [{ label: "交通", body: "苏晴已订周六 08:05 深圳北—长沙南，四张二等座" }, { label: "预算", body: "四口人约 6200 元，零花另算" }],
          rules: ["R-出行-01", "R-出行-02", "R-帮什么-01"], push: true, pushReason: "出发前 3 天，缺的东西要趁现在下单",
        },
        {
          id: "p2-d-kids", moment: "p2-kids", domain: "孩子", title: "老二的运动鞋可能小了", depth: "skeleton",
          body: "照片里鞋头磨损明显。周末量一下脚长，比鞋短不到 1 厘米就该换了。",
          because: "因为你拍过老二的运动鞋",
          more: [{ label: "加入采购清单", body: "和秋假用品一起下单" }],
          rules: ["R-孩子-01"], push: false, pushReason: "",
        },
      ],
      feedback: [{ id: "fb-q1", deliveryId: "p2-d-shop", action: "adopt", at: "第 20 天 22:00", signal: "采购清单一键加购，记为偏好一次买齐" }],
      uiFactors: { age: "30-45", digital: "高", roles: ["家长"], focus: "秋假行李", timeDevice: "晚间 · 手机", infoPref: "清单", inputPref: "打字" },
      points: { balance: 200, monthly: 200, log: [] },
      consents: { child: true, face: false, health: false, finance: false, location: true },
      generalMode: false,
      savedHours: 3,
    },
  };

  // ---------- p3 周可 ----------
  P.p3 = {
    30: {
      persona: { id: "p3", name: "周可", age: 21, city: "武汉", job: "大三学生", summary: "大三，准备考研，社团活动多" },
      stage: 30,
      moments: [
        { id: "p3-exam", label: "考研倒计时 60 天", at: "周一 07:30" },
        { id: "p3-club", label: "社团活动报名", at: "周三 12:10" },
      ],
      profile: [
        pf("s1", 1, "学校", "武汉某大学，大三", "told", ["h1"], 0.95, "confirmed", "location", "第 1 天 22:30"),
        pf("s2", 2, "考研学生", "准备考研，目标计算机专业", "told", ["h1"], 0.9, "confirmed", null, "第 1 天 22:30"),
        pf("s3", 2, "社团负责人", "摄影社副社长，负责活动报名", "told", ["h2"], 0.85, "confirmed", null, "第 6 天 12:00"),
        pf("s4", 3, "社团报名", "社团活动的报名接龙由你发起", "todo", ["h2"], 0.8, "confirmed", null, "第 6 天 12:00"),
        pf("s5", 4, "信息偏好", "只要结论，不要长段落", "feedback", ["h3"], 0.75, "confirmed", null, "第 9 天 23:00"),
        pf("s6", 4, "输入方式", "走路时用语音", "feedback", ["h4"], 0.6, "guess", null, "第 12 天 12:20"),
        pf("s7", 5, "考研倒计时", "离初试还有 60 天", "todo", ["h5"], 0.95, "confirmed", null, "第 28 天 07:30"),
        pf("s8", 5, "薄弱科目", "数学可能是短板", "file", ["h6"], 0.4, "pending", null, "第 26 天 22:00"),
      ],
      evidence: [
        ev("h1", "told", "chat-s1", "大三了，准备考计算机的研", true, "第 1 天 22:30"),
        ev("h2", "todo", "t-club", "待办：发周六外拍的报名接龙", true, "第 6 天 12:00"),
        ev("h3", "feedback", "fb-s1", "把学习计划改成了一行一条", true, "第 9 天 23:00"),
        ev("h4", "feedback", "fb-s2", "连续三次用语音吩咐", true, "第 12 天 12:20"),
        ev("h5", "todo", "t-exam", "待办：考研初试，60 天后", true, "第 28 天 07:30"),
        ev("h6", "file", "f-mock", "上传的模拟卷成绩单：数学 92", true, "第 26 天 22:00"),
      ],
      watch: [
        { id: "w1", domain: "学习", title: "考研初试", todoId: "t-exam", doing: "每周一给本周学习计划", nextAt: "周一 07:30" },
        { id: "w2", domain: "学习", title: "周六摄影社外拍报名", todoId: "t-club", doing: "报名截止前提醒你看人数", nextAt: "周五 18:00" },
      ],
      ideas: [],
      files: [{ id: "f-mock", kind: "doc", name: "模拟卷成绩.pdf", at: "第 26 天 22:00", summary: "第二次模拟：政治 68、英语 71、数学 92、专业课 110", tags: ["学习", "考研"] }],
      deliveries: [
        {
          id: "p3-d-exam", moment: "p3-exam", domain: "学习", title: "考研倒计时 60 天：本周学习计划", depth: "full",
          body: "本周：数学每天 3 小时（高数错题二刷）；英语每天 1 篇阅读；专业课周三、周六各一套真题；政治周末刷选择题。",
          because: "因为离初试还有 60 天，模拟卷数学偏低",
          more: [{ label: "改成语音播报版", body: "每天早上 7:30 读给你听" }],
          rules: ["R-学习-01", "R-学习-02"], push: true, pushReason: "倒计时 60 天，本周计划要在周一开始前给到",
        },
        {
          id: "p3-d-club", moment: "p3-club", domain: "学习", title: "周六外拍报名接龙页做好了", depth: "full",
          body: "轻量成品：报名接龙页已生成，含时间、集合地点、人数上限 20、自带器材一栏；复制链接发到群里即可。",
          because: "因为你每次活动都要发报名接龙",
          more: [{ label: "报名满了提醒我", body: "满 20 人时推送一次" }],
          rules: ["R-做多深-01", "R-学习-03"], push: false, pushReason: "",
        },
      ],
      feedback: [
        { id: "fb-s1", deliveryId: "p3-d-plan", action: "edit", at: "第 9 天 23:00", signal: "改成一行一条，记为偏好简洁" },
        { id: "fb-s2", deliveryId: "p3-d-voice", action: "adopt", at: "第 12 天 12:20", signal: "连续用语音，记为语音优先" },
      ],
      uiFactors: { age: "18-24", digital: "高", roles: ["学生", "社团负责人"], focus: "考研", timeDevice: "白天 · 手机", infoPref: "简洁", inputPref: "语音优先" },
      points: { balance: 150, monthly: 150, log: [] },
      consents: { child: false, face: false, health: false, finance: false, location: true },
      generalMode: false,
      savedHours: 4,
    },
  };

  // ---------- p4 何姐 ----------
  P.p4 = {
    30: {
      persona: { id: "p4", name: "何姐", age: 45, city: "佛山", job: "花店老板", summary: "经营一家花店，接单靠微信接龙" },
      stage: 30,
      moments: [
        { id: "p4-qixi", label: "七夕前 7 天", at: "周二 09:00" },
        { id: "p4-revisit", label: "老客户回访", at: "周四 15:00" },
        { id: "p4-gift", label: "表姐乔迁前 3 天", at: "周五 19:00" },
      ],
      profile: [
        pf("t1", 1, "城市", "佛山", "told", ["k1"], 0.95, "confirmed", "location", "第 1 天 10:00"),
        pf("t2", 2, "花店老板", "经营一家社区花店", "told", ["k1"], 0.95, "confirmed", null, "第 1 天 10:00"),
        pf("t3", 3, "接单", "订单靠微信接龙收集", "file", ["k2"], 0.85, "confirmed", null, "第 5 天 18:00"),
        pf("t4", 3, "老客户维护", "节日前给老客户发问候", "feedback", ["k3"], 0.6, "guess", null, "第 14 天 16:00"),
        pf("t5", 4, "界面", "喜欢大字，少点按钮", "feedback", ["k4"], 0.8, "confirmed", null, "第 3 天 11:00"),
        pf("t6", 5, "临近的大事", "七夕在 7 天后", "todo", ["k5"], 0.95, "confirmed", null, "第 28 天 09:00"),
        pf("t7", 5, "亲戚往来", "表姐 3 天后乔迁", "told", ["k6"], 0.5, "pending", null, "第 27 天 20:00"),
      ],
      evidence: [
        ev("k1", "told", "chat-t1", "我在佛山开花店的", true, "第 1 天 10:00"),
        ev("k2", "file", "f-jielong", "上传的微信接龙截图：母亲节 32 单", true, "第 5 天 18:00"),
        ev("k3", "feedback", "fb-t1", "中秋问候卡片点了“发给老客户”", true, "第 14 天 16:00"),
        ev("k4", "feedback", "fb-t2", "把字号调到最大", true, "第 3 天 11:00"),
        ev("k5", "todo", "t-qixi", "待办：七夕备货", true, "第 28 天 09:00"),
        ev("k6", "told", "chat-t27", "表姐下周搬新家，要送个花篮", true, "第 27 天 20:00"),
      ],
      watch: [
        { id: "w1", domain: "小店", title: "七夕促销", todoId: "t-qixi", doing: "提前 7 天备好文案和海报", nextAt: "周二 09:00" },
        { id: "w2", domain: "小店", title: "老客户回访", doing: "每月找出 30 天没下单的老客户", nextAt: "周四 15:00" },
        { id: "w3", domain: "人情", title: "表姐乔迁花篮", doing: "提前 3 天提醒备花", nextAt: "周五 19:00" },
      ],
      ideas: [],
      files: [{ id: "f-jielong", kind: "photo", name: "母亲节接龙.jpg", at: "第 5 天 18:00", summary: "母亲节微信接龙 32 单，含客户名和花束款式", tags: ["小店", "订单"] }],
      deliveries: [
        {
          id: "p4-d-qixi", moment: "p4-qixi", domain: "小店", title: "七夕还有 7 天：促销文案和海报", depth: "full",
          body: "文案：七夕花束预订开始啦，11 枝红玫瑰 199 元，提前 3 天订送贺卡。海报先出生图草稿，确认后消耗 20 点出成片。",
          because: "因为去年七夕接龙单最多，今年提前一周开始",
          more: [{ label: "生成海报成片（20 点）", body: "先看草稿，确认后再出成片" }, { label: "发成接龙", body: "按文案生成微信接龙" }],
          rules: ["R-小店-01", "R-生成-01"], push: true, pushReason: "七夕前 7 天开始预订，晚了就错过备货",
        },
        {
          id: "p4-d-revisit", moment: "p4-revisit", domain: "小店", title: "6 位老客户 30 天没下单", depth: "full",
          body: "回访名单：陈姐、小梁、王老师等 6 位，30 天内没下单；每人附一句问候，可一键复制。",
          because: "因为接龙记录里这几位以前每月都订",
          more: [{ label: "附上七夕预订", body: "问候后加一句七夕预订" }],
          rules: ["R-小店-02"], push: false, pushReason: "",
        },
        {
          id: "p4-d-gift", moment: "p4-gift", domain: "人情", title: "表姐乔迁还有 3 天", depth: "skeleton",
          body: "花篮思路：发财树配红掌，寓意兴旺；卡片写“乔迁之喜，红红火火”。",
          because: "因为你说过表姐要搬新家",
          more: [{ label: "提醒我备花", body: "前一天 18:00 提醒" }],
          rules: ["R-人情-01"], push: false, pushReason: "",
        },
      ],
      feedback: [
        { id: "fb-t1", deliveryId: "p4-d-midautumn", action: "adopt", at: "第 14 天 16:00", signal: "发了老客户问候，记为维护老客户" },
        { id: "fb-t2", deliveryId: "p4-d-ui", action: "edit", at: "第 3 天 11:00", signal: "调大字号，记为大字" },
      ],
      uiFactors: { age: "45-60", digital: "低", roles: ["店主"], focus: "七夕促销", timeDevice: "白天 · 手机", infoPref: "大字", inputPref: "语音" },
      points: { balance: 120, monthly: 200, log: [{ at: "第 14 天 16:00", ability: "生图", cost: 20, note: "中秋问候卡" }] },
      consents: { child: false, face: false, health: false, finance: false, location: true },
      generalMode: false,
      savedHours: 5,
    },
  };
})();

// ---------- S09：按意思搜索的演示索引只给 p1 第 30 天；其他人物补空索引，保持快照字段一致 ----------
(function () {
  const P = window.PA_PERSONAS || {};
  ["p2", "p3", "p4"].forEach((id) => {
    const s = (P[id] || {})[30];
    if (s && !s.searchIndex) s.searchIndex = { places: {}, people: {}, trips: [], items: [] };
  });
})();

// ---------- S10：p4 七夕卡片带海报草稿（不扣点），首页点“生成正式海报”确认后按档位扣点 ----------
(function () {
  const s = ((window.PA_PERSONAS || {}).p4 || {})[30];
  const d = s && s.deliveries.find((x) => x.id === "p4-d-qixi");
  if (!d) return;
  d.poster = { ability: "生图", draft: "海报草稿：红玫瑰花束 + “七夕预订 199 元”大字标题", note: "七夕促销海报", done: null, failed: "", tweaksLeft: 0 };
  ["R-生成-03", "R-生成-04"].forEach((r) => { if (!d.rules.includes(r)) d.rules.push(r); });
})();

// ---------- S12：第 30 天卡片补规则编号（林舟按职责先拿行李清单；何姐海报只讲档位不讲模型） ----------
(function () {
  const P = window.PA_PERSONAS || {};
  const ADD = [
    { persona: "p2", stage: 30, id: "p2-d-trip", rules: ["R-画像-03", "R-帮什么-02"] },
    { persona: "p4", stage: 30, id: "p4-d-qixi", rules: ["R-模型-02"] },
  ];
  ADD.forEach((a) => {
    const d = (((P[a.persona] || {})[a.stage] || {}).deliveries || []).find((x) => x.id === a.id);
    if (d) a.rules.forEach((r) => { if (!d.rules.includes(r)) d.rules.push(r); });
  });
})();
