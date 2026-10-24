// 原型演示数据：所有日期相对"今天"生成，保证提醒页始终有内容
(function () {
  const pad = (n) => String(n).padStart(2, "0");
  const dayStr = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const MB = 1024 * 1024;

  const svgImg = (label, c1, c2, sub) =>
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="800" height="560" fill="url(#g)"/><text x="400" y="270" font-size="40" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text><text x="400" y="320" font-size="20" text-anchor="middle" fill="#ffffffcc" font-family="sans-serif">${sub || "原型占位图"}</text></svg>`
    );

  const files = [
    {
      id: "f1", name: "季度报告草稿.md", ext: "md", cat: "text", size: 0.03 * MB, folder: "工作/报告",
      uploadedAt: dayStr(-6) + " 09:12", status: "indexed",
      content: "# 2026 Q3 季度报告（草稿）\n\n## 一、整体情况\n本季度销售额同比增长 **18%**，其中华东区贡献最大。\n\n## 二、重点项目\n- 客户管理系统二期上线，延期两周\n- 新签约客户 12 家\n\n## 三、下季度计划\n- 完成预算编制，提交给王经理审批\n- 推进华南区渠道合作\n",
    },
    {
      id: "f2", name: "读书笔记-原则.txt", ext: "txt", cat: "text", size: 0.01 * MB, folder: "学习/读书笔记",
      uploadedAt: dayStr(-12) + " 21:40", status: "indexed",
      content: "《原则》读书笔记\n\n第三章 拥抱现实，应对现实\n1. 把痛苦当成进步的信号。\n2. 极度求真、极度透明。\n3. 做决策时先看清现实，再想办法。\n\n个人感想：复盘时要记录错误原因，而不是只记录结果。",
    },
    {
      id: "f3", name: "销售数据截图.png", ext: "png", cat: "image", size: 1.2 * MB, folder: "工作/报告",
      uploadedAt: dayStr(-6) + " 09:15", status: "indexed",
      img: svgImg("销售数据截图", "#3867d6", "#8854d0", "OCR：华东区 Q3 销售额 1,280 万"),
      ocr: "2026 Q3 区域销售额：华东区 1,280 万，华南区 860 万，华北区 640 万。",
    },
    {
      id: "f4", name: "体检报告-2026.pdf", ext: "pdf", cat: "pdf", size: 3.4 * MB, folder: "生活/健康",
      uploadedAt: dayStr(-30) + " 14:02", status: "indexed",
      img: svgImg("体检报告 PDF", "#eb3b5a", "#fa8231", "PDF 预览（原型中以占位图代替）"),
      ocr: "体检日期：2026 年 9 月。血压 118/76，血脂偏高，建议三个月后复查，减少高脂饮食。",
    },
    {
      id: "f5", name: "家庭旅行-三亚.jpg", ext: "jpg", cat: "image", size: 4.8 * MB, folder: "生活/照片",
      uploadedAt: dayStr(-45) + " 20:30", status: "indexed",
      img: svgImg("三亚 · 海边日落", "#fd9644", "#fc5c65", "图片描述由多模态 LLM 生成"),
      ocr: "", desc: "海边日落，沙滩上一家三口的背影，远处有椰子树和帆船。",
    },
    {
      id: "f6", name: "项目周报模板.html", ext: "html", cat: "text", size: 0.02 * MB, folder: "工作/模板",
      uploadedAt: dayStr(-20) + " 10:05", status: "indexed",
      content: "<html><body style='font-family:sans-serif'><h2>项目周报</h2><table border='1' cellpadding='6' style='border-collapse:collapse'><tr><th>本周完成</th><th>下周计划</th><th>风险</th></tr><tr><td>需求评审</td><td>开发联调</td><td>接口延期</td></tr></table><p>填写人：______ 日期：______</p></body></html>",
    },
    {
      id: "f7", name: "产品评审会议-1020.m4a", ext: "m4a", cat: "audio", size: 38 * MB, folder: "工作/会议录音",
      uploadedAt: dayStr(-2) + " 18:20", status: "indexed", meeting: true,
      transcript: "主持人：今天评审客户管理系统二期需求……张三：报价方案我这周五前出。李四：技术评估我来安排……",
    },
    {
      id: "f8", name: "发布会录像.mp4", ext: "mp4", cat: "video", size: 92 * MB, folder: "资料/视频",
      uploadedAt: dayStr(-15) + " 16:44", status: "indexed", meeting: false,
      transcript: "欢迎各位来到 2026 秋季新品发布会……",
    },
    {
      id: "f9", name: "租房合同扫描件.jpg", ext: "jpg", cat: "image", size: 2.6 * MB, folder: "生活/合同",
      uploadedAt: dayStr(-60) + " 11:00", status: "indexed",
      img: svgImg("租房合同扫描件", "#4b6584", "#778ca3", "OCR：租期至 2027 年 3 月 31 日"),
      ocr: "房屋租赁合同。租期自 2026 年 4 月 1 日至 2027 年 3 月 31 日，月租金 6,500 元，每季度第一个月 5 日前支付。",
    },
    {
      id: "f10", name: "家庭开支.csv", ext: "csv", cat: "text", size: 0.005 * MB, folder: "生活/财务",
      uploadedAt: dayStr(-3) + " 22:10", status: "indexed",
      content: "日期,类别,金额,备注\n10-01,物业费,1200,第四季度\n10-05,房租,6500,十月\n10-12,餐饮,860,\n10-18,体检,1500,复查",
    },
    {
      id: "f11", name: "年会彩排.mov", ext: "mov", cat: "video", size: 71 * MB, folder: "资料/视频",
      uploadedAt: dayStr(-8) + " 19:02", status: "failed", failReason: "语音识别超时，可重试",
    },
    {
      id: "f12", name: "客户需求沟通-1023.mp3", ext: "mp3", cat: "audio", size: 44 * MB, folder: "工作/会议录音",
      uploadedAt: dayStr(0) + " 08:40", status: "indexed", meeting: true,
      transcript: "客户最关心的是移动端审批和数据导出，预算下周确认，下周二前确定上线时间。",
    },
  ];

  const todos = [
    { id: "t1", title: "提交季度报告给王经理", date: dayStr(0), time: "17:00", location: "公司", status: "open", source: "text", attachments: ["f1", "f3"], notes: "", createdAt: dayStr(-6) + " 09:20" },
    { id: "t2", title: "牙医复诊", date: dayStr(1), time: "10:30", location: "仁爱口腔诊所（南京西路店）", status: "open", source: "manual", attachments: [], notes: "带上次的病历本", createdAt: dayStr(-10) + " 12:00" },
    { id: "t3", title: "产品评审会议", date: dayStr(-2), time: "14:00", location: "3 楼会议室", status: "done", source: "meeting", sourceFile: "f7", attachments: ["f7"],
      notes: "会议摘要：评审客户管理系统二期需求，确认范围，上线时间待定。",
      actionItems: [
        { owner: "我", text: "整理需求清单发给客户", due: dayStr(3), converted: "t9" },
        { owner: "张三", text: "负责报价方案，周五前出" },
        { owner: "李四", text: "安排技术评估" },
        { owner: "未识别", text: "下周二前确认上线时间" },
      ],
      createdAt: dayStr(-2) + " 18:30" },
    { id: "t4", title: "给妈妈买生日礼物", date: dayStr(2), time: "", location: "万象城", status: "open", source: "text", attachments: [], notes: "", createdAt: dayStr(-4) + " 08:00" },
    { id: "t5", title: "续交物业费", date: dayStr(-1), time: "", location: "", status: "open", source: "manual", attachments: ["f10"], notes: "第四季度 1200 元", createdAt: dayStr(-9) + " 19:00" },
    { id: "t6", title: "准备客户演示材料", date: dayStr(5), time: "09:00", location: "", status: "open", source: "text", attachments: ["f1"], notes: "", createdAt: dayStr(-3) + " 15:00" },
    { id: "t7", title: "预约体检复查", date: dayStr(-20), time: "", location: "", status: "archived", source: "manual", attachments: ["f4"], notes: "改为年底统一体检", createdAt: dayStr(-40) + " 10:00" },
    { id: "t8", title: "读完《原则》第三章", date: dayStr(-12), time: "", location: "", status: "done", source: "text", attachments: ["f2"], notes: "", createdAt: dayStr(-15) + " 22:00" },
    { id: "t9", title: "整理需求清单发给客户", date: dayStr(3), time: "", location: "", status: "open", source: "meeting", sourceFile: "f7", attachments: [], notes: "来自会议：产品评审会议", createdAt: dayStr(-2) + " 18:31" },
  ];

  const inbox = [
    {
      id: "m1", fileId: "f12", fileName: "客户需求沟通-1023.mp3", duration: "48 分钟", size: 44 * MB, uploadedAt: dayStr(0) + " 08:40",
      summary: "与客户讨论 CRM 二期需求：客户希望增加移动端审批和数据导出；预算需在下周确认；双方约定下周二前确定上线时间。",
      dateFromAudio: dayStr(-2) + " 15:00", dateFromFile: dayStr(-2) + " 16:02",
      items: [
        { owner: "我", text: "整理移动端审批需求说明，周五前发给客户" },
        { owner: "张三", text: "负责更新报价方案" },
        { owner: "李四", text: "评估数据导出的技术方案" },
        { owner: "未识别", text: "下周二前确认上线时间" },
      ],
    },
  ];

  const users = [
    { id: "u1", email: "admin@demo.com", phone: "13800000001", name: "管理员", role: "admin", status: "active", quota: 500, used: 126, types: "global", tz: "UTC+8", createdAt: "2026-09-01" },
    { id: "u2", email: "lily@demo.com", phone: "", name: "Lily", role: "user", status: "active", quota: 500, used: 284, types: "global", tz: "UTC+8", createdAt: "2026-09-03" },
    { id: "u3", email: "zhang.wei@demo.com", phone: "13900000002", name: "张伟", role: "user", status: "active", quota: 1000, used: 612, types: "custom", tz: "UTC+8", createdAt: "2026-09-05" },
    { id: "u4", email: "chen@demo.com", phone: "", name: "陈晨", role: "user", status: "disabled", quota: 500, used: 45, types: "global", tz: "UTC+9", createdAt: "2026-09-10" },
    { id: "u5", email: "old.user@demo.com", phone: "", name: "老用户", role: "user", status: "pending_purge", purgeAt: dayStr(25), quota: 500, used: 210, types: "global", tz: "UTC+8", createdAt: "2026-09-12" },
  ];

  // 建议的常用文件类型；handler 表示处理方式
  const fileTypes = [
    ["txt", "text"], ["md", "text"], ["csv", "text"], ["json", "text"], ["html", "text"], ["htm", "text"], ["xml", "text"], ["log", "text"],
    ["pdf", "ocr"], ["jpg", "ocr"], ["jpeg", "ocr"], ["png", "ocr"], ["gif", "ocr"], ["webp", "ocr"], ["bmp", "ocr"], ["heic", "ocr"], ["tif", "ocr"], ["tiff", "ocr"],
    ["mp3", "asr"], ["wav", "asr"], ["m4a", "asr"], ["aac", "asr"], ["flac", "asr"], ["ogg", "asr"], ["amr", "asr"], ["wma", "asr"],
    ["mp4", "asr"], ["mov", "asr"], ["mkv", "asr"], ["avi", "asr"], ["webm", "asr"], ["flv", "asr"],
    ["doc", "pending"], ["docx", "pending"], ["xls", "pending"], ["xlsx", "pending"], ["ppt", "pending"], ["pptx", "pending"],
    ["zip", "store"], ["rar", "store"], ["7z", "store"],
  ].map(([ext, handler]) => ({ ext, handler }));

  const models = [
    { key: "llm", name: "LLM 主模型", desc: "意图识别（未单独配置时）、字段提取、会议总结、文件归类、图片描述", provider: "DeepSeek", model: "deepseek-flash", mode: "key", key1: "sk-3f8a••••••••9c21", key2: "sk-71bd••••••••0e5a", url1: "https://api.deepseek.com", url2: "", timeout: 30, required: true },
    { key: "intent", name: "意图识别模型（可选）", desc: "不配置时使用 LLM 主模型", provider: "", model: "", mode: "key", key1: "", key2: "", url1: "", url2: "", timeout: 10, optional: true },
    { key: "filemgr", name: "文件管理模型", desc: "为文件生成逻辑文件夹和标签（不移动物理文件）", provider: "DeepSeek", model: "deepseek-flash", mode: "key", key1: "（同 LLM 主模型）", key2: "", url1: "", url2: "", timeout: 30 },
    { key: "ocr", name: "OCR 模型", desc: "图片、PDF 文字识别（选型待定）", provider: "待选型", model: "", mode: "key", key1: "", key2: "", url1: "", url2: "", timeout: 60 },
    { key: "asr", name: "语音识别（ASR）", desc: "音频、视频转文字；支持说话人分离", provider: "阿里云百炼", model: "fun-asr", mode: "key", key1: "sk-ali••••••••3e7d", key2: "", url1: "https://dashscope.aliyuncs.com", url2: "", timeout: 600 },
    { key: "search", name: "内容检索服务", desc: "语义 + 关键字检索；必须按用户隔离", provider: "自建", model: "", mode: "url", key1: "tok-••••••••", key2: "", url1: "https://search-a.example.internal", url2: "https://search-b.example.internal", timeout: 10 },
    { key: "image", name: "生图模型", desc: "V1 不使用，预留", provider: "", model: "", mode: "key", key1: "", key2: "", url1: "", url2: "", timeout: 60, reserved: true },
  ];

  const logTypesUser = ["登录", "退出登录", "文字输入·新增待办", "文字输入·更新待办", "文字输入·完成待办", "文字输入·归档待办", "文字输入·知识库查询", "上传文件", "文件处理", "下载文件", "手动创建待办", "手动更新待办", "确认会议待办", "修改个人设置", "重置密码", "发送提醒邮件"];
  const logTypesAdmin = ["添加用户", "删除用户", "禁用用户", "设置用户密码", "修改用户配额", "修改用户文件类型", "修改系统变量", "添加文件类型", "删除文件类型", "切换存储", "修改上传限制", "修改邮件配置", "修改安全设置"];

  function genLogs() {
    const out = [];
    const names = ["admin@demo.com", "lily@demo.com", "zhang.wei@demo.com", "chen@demo.com"];
    const details = {
      "文字输入·新增待办": "“明天下午三点去银行办理转账” → 新增待办", "文字输入·知识库查询": "“去年的租房合同什么时候到期” → 命中 2 个文件",
      "上传文件": "上传 12 个文件，共 86.4MB", "文件处理": "会议录音.m4a 语音识别完成", "下载文件": "下载 季度报告草稿.md",
      "文字输入·更新待办": "牙医复诊 时间 10:30 → 15:00", "发送提醒邮件": "最近 3 天待办 4 条",
    };
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 60; i++) {
      const t = logTypesUser[Math.floor(rnd() * logTypesUser.length)];
      const ms = t.includes("查询") || t.includes("文字输入") ? 800 + Math.floor(rnd() * 4000) : t === "文件处理" ? 5000 + Math.floor(rnd() * 90000) : 20 + Math.floor(rnd() * 400);
      out.push({ time: `${dayStr(-Math.floor(rnd() * 20))} ${pad(8 + Math.floor(rnd() * 14))}:${pad(Math.floor(rnd() * 60))}:${pad(Math.floor(rnd() * 60))}`, user: t === "发送提醒邮件" ? "系统" : names[Math.floor(rnd() * names.length)], type: t, detail: details[t] || "—", ok: rnd() > 0.08, ms, ip: `10.0.${Math.floor(rnd() * 5)}.${Math.floor(rnd() * 250)}` });
    }
    const admin = [];
    for (let i = 0; i < 18; i++) {
      const t = logTypesAdmin[Math.floor(rnd() * logTypesAdmin.length)];
      const d = { "添加用户": "添加用户 lily@demo.com", "修改系统变量": "LLM 主模型 · 备用 API Key 已更新", "添加文件类型": "添加 .heic", "删除文件类型": "删除 .rar", "切换存储": "写入存储 R2-测试 → R2-UAT", "修改用户配额": "zhang.wei@demo.com 500MB → 1000MB", "设置用户密码": "为 chen@demo.com 设置新密码", "删除用户": "old.user@demo.com 标记为待清除" }[t] || "—";
      admin.push({ time: `${dayStr(-Math.floor(rnd() * 30))} ${pad(9 + Math.floor(rnd() * 9))}:${pad(Math.floor(rnd() * 60))}:${pad(Math.floor(rnd() * 60))}`, user: "admin@demo.com", type: t, detail: d, ok: true, ms: 30 + Math.floor(rnd() * 300), ip: "10.0.0.8" });
    }
    const byTime = (a, b) => (a.time < b.time ? 1 : -1);
    return { user: out.sort(byTime), admin: admin.sort(byTime) };
  }

  const config = {
    upload: { maxCount: 300, maxBatchMB: 300, maxFileMB: 100, defaultQuotaMB: 500 },
    security: { lockEnabled: false, lockAttempts: 5, lockMinutes: 15, purgeDays: 30 },
    mail: { provider: "邮件服务 API", from: "assistant@example.com", fromName: "个人日常助手", apiKey: "re_••••••••" },
    storages: [
      { id: "s1", name: "R2-测试", type: "Cloudflare R2", bucket: "pa-dev", files: 1240, sizeGB: 3.2 },
      { id: "s2", name: "R2-UAT", type: "Cloudflare R2", bucket: "pa-uat", files: 310, sizeGB: 0.9 },
      { id: "s3", name: "阿里云 OSS（备用）", type: "S3 兼容", bucket: "pa-backup", files: 0, sizeGB: 0 },
    ],
    activeStorage: "s2",
  };

  window.PA_SEED = { files, todos, inbox, users, fileTypes, models, logs: genLogs(), config, logTypesUser, logTypesAdmin, dayStr, MB, svgImg };
})();
