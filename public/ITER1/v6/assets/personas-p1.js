// 原型 v6 演示快照：主角 p1 苏晴（第 1 / 7 / 30 天）。字段约定见 docs/design/原型v6-设计.md §5。
// 结构：PA_PERSONAS[persona][stage] = { persona, stage, moments, profile, evidence, watch, ideas, files, deliveries, feedback, uiFactors, points, consents, generalMode, savedHours }
// 领域 id（与 §3.6 领域名、规则编号前缀一致）：出行 孩子 家务 健康 工作 学习 人情 小店
(function () {
  const P = (window.PA_PERSONAS = window.PA_PERSONAS || {});

  const person = {
    id: "p1",
    name: "苏晴",
    age: 38,
    city: "深圳",
    job: "产品经理",
    summary: "双职工家长，两个孩子（15 岁、9 岁），家里出行由她张罗",
  };

  // 画像条目工厂：layer 1 基本事实 / 2 角色 / 3 职责 / 4 偏好和风格 / 5 当前状态
  const pf = (id, layer, key, value, source, evidenceIds, confidence, status, sensitive, updatedAt) => ({ id, layer, key, value, source, evidenceIds, confidence, status, sensitive: sensitive || null, updatedAt });
  const ev = (id, kind, refId, text, aboutSelf, at) => ({ id, kind, refId, text, aboutSelf, at });

  // ---------- 第 1 天 ----------
  const day1 = {
    persona: person,
    stage: 1,
    moments: [{ id: "d1-first", label: "第一次打开", at: "周三 21:00" }],
    profile: [
      pf("pr1", 1, "城市", "深圳", "told", ["e1"], 0.9, "confirmed", "location", "第 1 天 21:05"),
      pf("pr2", 2, "家长", "有孩子，准备秋假带孩子出去玩", "told", ["e1"], 0.6, "guess", "child", "第 1 天 21:05"),
    ],
    evidence: [ev("e1", "told", "chat-d1-1", "这周想把秋假带孩子去哪玩定下来，我们在深圳", true, "第 1 天 21:03")],
    watch: [{ id: "w1", domain: "出行", title: "秋假带孩子出去玩", doing: "先按深圳出发、三四天的短途给几个去处", nextAt: "明天 20:00" }],
    ideas: [],
    files: [],
    deliveries: [
      {
        id: "d1-trip", moment: "d1-first", domain: "出行", title: "秋假去哪：三个短途去处", depth: "skeleton",
        body: "从深圳出发 3～4 天：长沙（高铁 3 小时，历史博物馆）、潮汕（美食、古城）、桂林阳朔（山水、骑行）。",
        because: "因为你说想秋假带孩子出去玩、在深圳出发",
        more: [{ label: "孩子多大了？我按年龄挑一下", body: "回答后按年龄重新排序去处" }],
        rules: ["R-冷启动-01", "R-冷启动-02", "R-收集-01"], push: false, pushReason: "",
      },
    ],
    feedback: [],
    uiFactors: { age: "30-45", digital: "高", roles: [], focus: "未知", timeDevice: "晚间 · 手机", infoPref: "未知", inputPref: "打字" },
    points: { balance: 200, monthly: 200, log: [] },
    consents: { child: false, face: false, health: false, finance: false, location: true },
    generalMode: false,
    savedHours: 0,
  };

  // ---------- 第 7 天 ----------
  const day7 = {
    persona: person,
    stage: 7,
    moments: [
      { id: "d7-sun", label: "周日 20:00", at: "周日 20:00" },
      { id: "d7-ptm", label: "家长会前一晚", at: "周三 20:30" },
    ],
    profile: [
      pf("pr1", 1, "城市", "深圳", "told", ["e1"], 0.95, "confirmed", "location", "第 1 天 21:05"),
      pf("pr3", 1, "孩子", "两个孩子：15 岁、9 岁", "told", ["e2"], 0.95, "confirmed", "child", "第 1 天 21:08"),
      pf("pr4", 1, "职业", "产品经理", "todo", ["e3"], 0.6, "guess", null, "第 4 天 09:10"),
      pf("pr2", 2, "家长", "两个孩子的家长", "told", ["e2"], 0.9, "confirmed", "child", "第 1 天 21:08"),
      pf("pr5", 3, "家里出行", "家里出行可能由你张罗", "feedback", ["e4"], 0.55, "guess", null, "第 3 天 22:00"),
      pf("pr6", 3, "孩子学校事务", "小的孩子的学校通知由你处理", "file", ["e5"], 0.5, "guess", "child", "第 6 天 19:40"),
      pf("pr7", 4, "信息偏好", "喜欢简洁的要点", "feedback", ["e6"], 0.5, "guess", null, "第 5 天 21:30"),
      pf("pr8", 5, "临近的事", "周四下午家长会", "file", ["e5"], 0.9, "confirmed", "child", "第 6 天 19:40"),
    ],
    evidence: [
      ev("e1", "told", "chat-d1-1", "这周想把秋假带孩子去哪玩定下来，我们在深圳", true, "第 1 天 21:03"),
      ev("e2", "told", "chat-d1-2", "老大 15，老二 9 岁", true, "第 1 天 21:08"),
      ev("e3", "todo", "t-prd", "待办：周五前改完需求评审的 PRD", true, "第 4 天 09:10"),
      ev("e4", "feedback", "fb1", "秋假卡片里选了“交通怎么走”", true, "第 3 天 22:00"),
      ev("e5", "file", "f-notice", "拍照上传的家长会通知：周四 15:00 四年级 2 班", true, "第 6 天 19:40"),
      ev("e6", "feedback", "fb2", "把长版行程改成了只看要点", true, "第 5 天 21:30"),
    ],
    watch: [
      { id: "w1", domain: "出行", title: "秋假带孩子出去玩（倾向长沙）", doing: "盯高铁余票和长沙天气", nextAt: "周五 12:00" },
      { id: "w2", domain: "孩子", title: "周四下午家长会", todoId: "t-ptm", doing: "前一晚列好要带的和要问的", nextAt: "周三 20:30" },
      { id: "w3", domain: "工作", title: "周五前改完 PRD", todoId: "t-prd", doing: "周五上午提醒一次", nextAt: "周五 09:00" },
    ],
    ideas: [],
    files: [
      { id: "f-notice", kind: "photo", name: "家长会通知.jpg", at: "第 6 天 19:38", summary: "四年级 2 班家长会：周四 15:00，带成绩单签字页", tags: ["孩子", "学校"], firstUpload: true },
    ],
    deliveries: [
      {
        id: "d7-trip", moment: "d7-sun", domain: "出行", title: "长沙 4 天：交通先排好了", depth: "skeleton",
        body: "高铁深圳北—长沙南 3 小时，周六早班还有票；4 天行程初稿：博物馆、橘子洲、岳麓山。",
        because: "因为你上次在秋假卡片里先看了交通",
        more: [{ label: "按孩子年龄挑景点", body: "15 岁和 9 岁各有兴趣点的安排" }, { label: "预算估算", body: "四口人交通加住宿约 6000 元" }],
        rules: ["R-帮什么-01", "R-出行-01"], push: false, pushReason: "",
      },
      {
        id: "d7-ptm", moment: "d7-ptm", domain: "孩子", title: "明天家长会：要带的、要问的", depth: "full",
        body: "要带：成绩单签字页、笔。要问：数学错题多的原因、课后托管时间、秋假作业量。",
        because: "因为你拍过家长会通知，明天 15:00 开",
        more: [{ label: "设个提醒", body: "明天 14:20 提醒出发" }],
        rules: ["R-孩子-01", "R-孩子-02"], push: true, pushReason: "家长会就在明天，错过今晚就来不及准备",
      },
    ],
    feedback: [
      { id: "fb1", deliveryId: "d1-trip", action: "more", at: "第 3 天 22:00", signal: "选了第二项“交通怎么走”，记为出行职责信号" },
      { id: "fb2", deliveryId: "d1-trip", action: "edit", at: "第 5 天 21:30", signal: "改成只看要点，记为偏好简洁" },
      { id: "fb3", deliveryId: "d7-trip", action: "adopt", at: "第 7 天 20:10" },
    ],
    uiFactors: { age: "30-45", digital: "高", roles: ["家长"], focus: "孩子 · 秋假", timeDevice: "晚间 · 手机", infoPref: "简洁", inputPref: "打字" },
    points: { balance: 200, monthly: 200, log: [] },
    consents: { child: true, face: false, health: false, finance: false, location: true },
    generalMode: false,
    savedHours: 2,
  };

  // ---------- 第 30 天 ----------
  const d30Profile = [
    // 1 基本事实
    pf("pr1", 1, "城市", "深圳", "told", ["e1"], 0.98, "confirmed", "location", "第 1 天 21:05"),
    pf("pr3", 1, "孩子", "两个孩子：15 岁（初三）、9 岁（四年级）", "told", ["e2", "e5"], 0.98, "confirmed", "child", "第 12 天 20:00"),
    pf("pr4", 1, "职业", "产品经理", "told", ["e3", "e10"], 0.95, "confirmed", null, "第 9 天 10:00"),
    pf("pr9", 1, "年龄", "38 岁", "told", ["e11"], 0.95, "confirmed", null, "第 10 天 21:00"),
    pf("pr10", 1, "家人", "爱人林舟；妈妈住在老家", "told", ["e12"], 0.9, "confirmed", null, "第 15 天 21:30"),
    pf("pr11", 1, "证件", "全家护照，你的护照 60 天后到期", "file", ["e13"], 0.9, "confirmed", null, "第 20 天 19:00"),
    // 2 角色
    pf("pr2", 2, "家长", "两个孩子的家长", "told", ["e2"], 0.98, "confirmed", "child", "第 1 天 21:08"),
    pf("pr12", 2, "产品经理", "负责客户管理系统，每周五交周报", "todo", ["e3", "e10"], 0.9, "confirmed", null, "第 14 天 16:00"),
    pf("pr13", 2, "篮球爱好者", "周末打球，看 CBA", "told", ["e14"], 0.85, "confirmed", null, "第 11 天 22:00"),
    pf("pr14", 2, "历史爱好者", "喜欢博物馆和历史读物", "feedback", ["e15"], 0.7, "guess", null, "第 8 天 21:00"),
    pf("pr15", 2, "A 股股民", "只用于兴趣资讯和记账", "told", ["e16"], 0.8, "confirmed", "finance", "第 18 天 20:00"),
    // 3 职责
    pf("pr5", 3, "家里出行", "家里出行由你张罗：订票、排行程", "feedback", ["e4", "e17"], 0.92, "confirmed", null, "第 16 天 21:00"),
    pf("pr6", 3, "孩子学校事务", "老二的学校通知和家长会由你处理", "file", ["e5"], 0.85, "confirmed", "child", "第 10 天 19:40"),
    pf("pr16", 3, "家里后勤", "收拾行李、孩子用品由爱人负责", "told", ["e17"], 0.85, "confirmed", null, "第 16 天 21:00"),
    pf("pr17", 3, "家里证件", "全家证件由你保管", "file", ["e13"], 0.6, "guess", null, "第 20 天 19:00"),
    pf("pr18", 3, "妈妈的健康", "可能由你帮妈妈约挂号", "todo", ["e18"], 0.4, "guess", "health", "第 22 天 20:00"),
    pf("pr19", 3, "家庭记账", "家里开销你在记", "todo", ["e19"], 0.5, "guess", "finance", "第 23 天 22:00"),
    // 4 偏好和风格
    pf("pr7", 4, "信息偏好", "喜欢简洁的要点，需要时再展开", "feedback", ["e6"], 0.88, "confirmed", null, "第 13 天 21:30"),
    pf("pr20", 4, "预算", "出行预算中等，偏好高铁", "feedback", ["e17"], 0.75, "confirmed", null, "第 16 天 21:00"),
    pf("pr21", 4, "决策习惯", "先看两三个方案再定", "feedback", ["e4"], 0.6, "guess", null, "第 9 天 22:00"),
    pf("pr22", 4, "输入方式", "通勤时用语音", "feedback", ["e20"], 0.55, "guess", null, "第 19 天 08:40"),
    pf("pr23", 4, "推送", "推送每天不超过 2 条", "feedback", ["e21"], 0.8, "confirmed", null, "第 21 天 22:00"),
    // 5 当前状态
    pf("pr24", 5, "临近的大事", "秋假出游 3 天后出发（长沙）", "todo", ["e17"], 0.95, "confirmed", null, "第 27 天 20:00"),
    pf("pr25", 5, "这周忙不忙", "本周版本上线，比较忙", "meeting", ["e10"], 0.7, "confirmed", null, "第 28 天 18:00"),
    pf("pr26", 5, "体检", "年度体检预约在明天上午", "todo", ["e22"], 0.9, "confirmed", "health", "第 29 天 09:00"),
    pf("pr27", 5, "工作变动", "录音里提到“新部门”，岗位可能有变化", "meeting", ["e23"], 0.4, "pending", null, "第 29 天 17:30"),
    pf("pr28", 5, "老大的学校", "老大升学后学校信息可能已变", "file", ["e5"], 0.5, "pending", "child", "第 26 天 20:00"),
    pf("pr29", 5, "妈妈生日", "妈妈生日在 5 天后", "told", ["e12"], 0.9, "confirmed", null, "第 15 天 21:30"),
  ];

  const d30Evidence = [
    ev("e1", "told", "chat-d1-1", "这周想把秋假带孩子去哪玩定下来，我们在深圳", true, "第 1 天 21:03"),
    ev("e2", "told", "chat-d1-2", "老大 15，老二 9 岁", true, "第 1 天 21:08"),
    ev("e3", "todo", "t-prd", "待办：周五前改完需求评审的 PRD", true, "第 4 天 09:10"),
    ev("e4", "feedback", "fb1", "秋假卡片里选了“交通怎么走”", true, "第 3 天 22:00"),
    ev("e5", "file", "f-notice", "拍照上传的家长会通知：周四 15:00 四年级 2 班", true, "第 6 天 19:40"),
    ev("e6", "feedback", "fb2", "把长版行程改成了只看要点", true, "第 5 天 21:30"),
    ev("e10", "meeting", "f-meeting", "周会录音：客户管理系统二期本周上线", true, "第 28 天 18:00"),
    ev("e11", "told", "chat-d10", "我 38 了，体检要加项吗", true, "第 10 天 21:00"),
    ev("e12", "told", "chat-d15", "我妈下个月过生日，想送点东西", true, "第 15 天 21:30"),
    ev("e13", "file", "f-passport", "上传的护照首页照片，有效期至 60 天后", true, "第 20 天 19:00"),
    ev("e14", "told", "chat-d11", "周末打球扭了一下", true, "第 11 天 22:00"),
    ev("e15", "file", "f-article", "转发的文章《马王堆汉墓的十个细节》", false, "第 8 天 21:00"),
    ev("e16", "told", "chat-d18", "记一下今天股票亏了 300，别给建议", true, "第 18 天 20:00"),
    ev("e17", "told", "chat-d16", "票我来订，行李老林收拾；还是坐高铁吧", true, "第 16 天 21:00"),
    ev("e18", "todo", "t-mom-dr", "待办：帮妈妈挂下周的骨科号", true, "第 22 天 20:00"),
    ev("e19", "idea", "i-ledger", "想做的事：做个家庭记账的小程序", true, "第 23 天 22:00"),
    ev("e20", "feedback", "fb-voice", "早上 8:40 用语音吩咐了两次", true, "第 19 天 08:40"),
    ev("e21", "feedback", "fb-push", "连续两天忽略了第三条推送", true, "第 21 天 22:00"),
    ev("e22", "todo", "t-checkup", "待办：年度体检，周二上午 8:00", true, "第 29 天 09:00"),
    ev("e23", "meeting", "f-meeting", "录音里同事说“你去了新部门以后……”", true, "第 29 天 17:30"),
  ];

  const day30 = {
    persona: person,
    stage: 30,
    moments: [
      { id: "d30-mon", label: "周一 8:30", at: "周一 08:30" },
      { id: "d30-fri", label: "周五 16:00", at: "周五 16:00" },
      { id: "d30-trip", label: "出发前 3 天", at: "周三 20:00" },
      { id: "d30-checkup", label: "体检预约前一天", at: "周一 20:00" },
      { id: "d30-passport", label: "护照到期前 60 天", at: "周二 09:00" },
      { id: "d30-mombday", label: "妈妈生日前 5 天", at: "周四 19:00" },
    ],
    profile: d30Profile,
    evidence: d30Evidence,
    watch: [
      { id: "w1", domain: "出行", title: "秋假长沙 4 天", doing: "盯天气和高铁改签", nextAt: "出发前 1 天 20:00" },
      { id: "w2", domain: "孩子", title: "老二秋假作业", todoId: "t-hw", doing: "每周日晚汇总作业", nextAt: "周日 20:00" },
      { id: "w3", domain: "工作", title: "每周五周报", todoId: "t-weekly", doing: "周五 16:00 备好初稿", nextAt: "周五 16:00" },
      { id: "w4", domain: "健康", title: "年度体检", todoId: "t-checkup", doing: "前一天提醒空腹和带证件", nextAt: "周一 20:00" },
      { id: "w5", domain: "家务", title: "护照续办", todoId: "t-passport", doing: "到期前 60 天提醒，列好材料", nextAt: "周二 09:00" },
      { id: "w6", domain: "人情", title: "妈妈生日", doing: "生日前 5 天给礼物思路和祝福卡草稿", nextAt: "周四 19:00" },
      { id: "w7", domain: "想做的事", title: "做个家庭记账的小程序", ideaId: "i-ledger", doing: "47 天前记下，这周一重提并做个轻量成品", nextAt: "周一 08:30" },
    ],
    ideas: [{ id: "i-ledger", title: "做个家庭记账的小程序", createdDaysAgo: 47 }],
    files: [
      { id: "f-notice", kind: "photo", name: "家长会通知.jpg", at: "第 6 天 19:38", summary: "四年级 2 班家长会：周四 15:00，带成绩单签字页", tags: ["孩子", "学校"] },
      { id: "f-passport", kind: "photo", name: "护照首页.jpg", at: "第 20 天 19:00", summary: "苏晴护照，有效期剩 60 天", tags: ["证件"] },
      { id: "f-meeting", kind: "audio", name: "周会录音.m4a", at: "第 28 天 17:30", summary: "客户管理系统二期上线安排，42 分钟", tags: ["工作", "会议"] },
      { id: "f-trip-video", kind: "video", name: "去年长沙.mp4", at: "第 24 天 21:00", summary: "去年在长沙博物馆拍的视频，3 分 20 秒", tags: ["出行", "长沙"] },
      { id: "f-article", kind: "doc", name: "马王堆汉墓的十个细节.pdf", at: "第 8 天 21:00", summary: "转发的历史文章（不是在说你本人）", tags: ["历史"] },
    ],
    deliveries: [
      {
        id: "d30-greet", moment: "d30-mon", domain: "想做的事", title: "47 天前你想做的家庭记账，我先做了个轻量版", depth: "full",
        body: "早上好。你 47 天前记下“做个家庭记账的小程序”，我先做了一个轻量记账页：按月汇总，股票记账单独一栏，只记不给建议。",
        because: "因为你最近几次都在对话里记开销",
        more: [{ label: "导入上个月的记录", body: "从对话里找到 12 条开销" }, { label: "先放着", body: "30 天内不再提" }],
        rules: ["R-帮什么-01", "R-做多深-01"], push: false, pushReason: "",
      },
      {
        id: "d30-weekly", moment: "d30-fri", domain: "工作", title: "本周周报初稿", depth: "full",
        body: "1. 客户管理系统二期已上线。2. 数据导出模块性能提升。3. 下周：收集上线反馈。每句可点回出处。",
        because: "因为你每周五都要交周报",
        more: [{ label: "改成给老板看的简版", body: "三行版本" }],
        rules: ["R-工作-01", "R-工作-02"], push: true, pushReason: "周五下班前要交，错过就晚了",
      },
      {
        id: "d30-trip", moment: "d30-trip", domain: "出行", title: "秋假长沙 4 天：交通和行程已排好", depth: "full",
        body: "交通行程：周六 08:05 深圳北—长沙南 G6012，四张二等座已锁位；第 1 天湖南博物院，第 2 天岳麓山和书院，第 3 天橘子洲，第 4 天下午返程。预算约 6200 元。",
        because: "因为家里出行一直是你订票，这次先把交通排好了",
        more: [{ label: "行李清单", body: "按长沙天气和孩子年龄列，可转给林舟" }, { label: "天气", body: "周日有雨，第 2 天和第 3 天可对调" }],
        rules: ["R-出行-01", "R-出行-02", "R-做多深-01", "R-帮什么-01"], push: true, pushReason: "出发前 3 天，票价和余票变化快",
      },
      {
        id: "d30-checkup", moment: "d30-checkup", domain: "健康", title: "明天体检：先给你一个准备清单", depth: "skeleton",
        body: "明早 8:00 体检：今晚 22:00 后禁食，带身份证。只做安排和提醒，不做诊断。",
        because: "因为你待办里有明天上午的体检",
        more: [{ label: "设个出门提醒", body: "明早 7:20 提醒" }],
        rules: ["R-健康-01", "R-健康-02", "R-做多深-02"], push: false, pushReason: "",
      },
      {
        id: "d30-passport", moment: "d30-passport", domain: "家务", title: "你的护照 60 天后到期", depth: "skeleton",
        body: "续办要：身份证、旧护照、近期照片；可以在线预约出入境窗口。",
        because: "因为你上传过护照首页",
        more: [{ label: "预约窗口", body: "列出最近的 3 个时段" }],
        rules: ["R-家务-01"], push: false, pushReason: "",
      },
      {
        id: "d30-mombday", moment: "d30-mombday", domain: "人情", title: "妈妈生日还有 5 天", depth: "skeleton",
        body: "礼物思路：按摩靠垫、相册、一起视频吃蛋糕；祝福卡生图草稿已备好，正式生成需你确认。",
        because: "因为你说过想给妈妈送点东西",
        more: [{ label: "生成祝福卡（10 点）", body: "先出草稿，确认后再出成片" }],
        rules: ["R-人情-01", "R-生成-01"], push: false, pushReason: "",
      },
    ],
    feedback: [
      { id: "fb1", deliveryId: "d1-trip", action: "more", at: "第 3 天 22:00", signal: "选了第二项“交通怎么走”，记为出行职责信号" },
      { id: "fb2", deliveryId: "d1-trip", action: "edit", at: "第 5 天 21:30", signal: "改成只看要点，记为偏好简洁" },
      { id: "fb3", deliveryId: "d7-trip", action: "adopt", at: "第 7 天 20:10" },
      { id: "fb4", deliveryId: "d7-ptm", action: "adopt", at: "第 7 天 20:40" },
      { id: "fb5", deliveryId: "d-push-3", action: "ignore", at: "第 21 天 22:00", signal: "连续忽略第三条推送，推送上限降到 2" },
      { id: "fb6", deliveryId: "d-stock", action: "reject", at: "第 18 天 20:05", signal: "不要股票建议" },
    ],
    uiFactors: { age: "30-45", digital: "高", roles: ["家长", "产品经理"], focus: "秋假出游", timeDevice: "通勤 · 手机；晚间 · 电脑", infoPref: "简洁", inputPref: "通勤语音、晚间打字" },
    points: { balance: 180, monthly: 200, log: [{ at: "第 25 天 21:00", ability: "生图", cost: 20, note: "老二的手抄报插图" }] },
    consents: { child: true, face: false, health: true, finance: true, location: true },
    generalMode: false,
    savedHours: 6.5,
  };

  P.p1 = { 1: day1, 7: day7, 30: day30 };
})();

// ---------- S07：第 30 天场景补充（47 天前想法“开始做”、健康 / 人情说明） ----------
(function () {
  const d30 = ((window.PA_PERSONAS || {}).p1 || {})[30];
  if (!d30) return;
  const byId = (id) => d30.deliveries.find((d) => d.id === id);
  const greet = byId("d30-greet");
  if (greet) Object.assign(greet, {
    title: "47 天前你想做的家庭记账，要不要现在开始？",
    body: "早上好。你 47 天前记下“做个家庭记账的小程序”。点“开始做”，我先做个轻量版：按月汇总，股票记账单独一栏，只记不给建议。",
    ideaId: "i-ledger",
    start: {
      label: "开始做",
      product: {
        id: "d30-ledger-page", domain: "想做的事", title: "家庭记账小程序：说明页（轻量成品）", depth: "full",
        body: "轻量成品已生成——说明页：1. 在对话里说“午饭 35”就记一笔；2. 每月 1 日自动出上月汇总；3. 股票盈亏单独一栏，只记不给建议；4. 复制链接发给林舟就能一起记。",
        because: "因为你点了“开始做”，47 天前的想法先落成一个能用的版本",
        more: [{ label: "导入上个月的记录", body: "从对话里找到 12 条开销，已按类别排好" }],
        rules: ["R-做多深-01", "R-帮什么-01"], push: false, pushReason: "",
      },
    },
  });
  const checkup = byId("d30-checkup");
  if (checkup) checkup.notice = { text: "只做安排和提醒，不做诊断；身体不适或看报告请找专业医生。", rules: ["R-健康-01", "R-健康-04"] };
  const mom = byId("d30-mombday");
  if (mom) {
    mom.more = [{ label: "看祝福卡草稿（不扣点）", body: "草稿：一张暖黄底的卡片，写着“妈妈，生日快乐，愿你天天开心”；正式生成成片需你确认，确认后才扣 10 点" }];
    mom.notice = { text: "祝福卡只出草稿，不扣点；正式生成要你确认。送礼只给思路，不做导购。", rules: ["R-人情-02", "R-人情-03"] };
  }
})();
