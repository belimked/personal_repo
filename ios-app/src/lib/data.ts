export type ItemState = 'pending' | 'done' | 'later'

export interface Diff { k: string; text: string; strong?: string; after?: string }
export interface BriefItem {
  id: string; no: string; title: string; summary: string; due?: string
  heading: string; diffs: Diff[]; replyLabel: string; reply: string
  source: string; confirm: string; doneLabel: string
}

export const BRIEF_ITEMS: BriefItem[] = [
  {
    id: 'weekly-zhou', no: '01', title: '小周的周报', summary: '2 处和例会不一样，意见已写好',
    heading: '小周的周报有 2 处和例会不一样',
    diffs: [
      { k: '支付对接', text: '他写“本周完成”，例会定的是', strong: '下周三' },
      { k: '漏项', text: '没写“压测报告”' },
    ],
    replyLabel: '建议回复', reply: '支付对接按例会改成下周三完成；另外补上压测报告。',
    source: '出处：周三例会纪要', confirm: '确认并发给小周', doneLabel: '已发给小周',
  },
  {
    id: 'client-early', no: '02', title: '客户问能否提前上线', summary: '建议不整体提前，回复已拟好',
    heading: '客户想把上线从 20 号提前到 13 号',
    diffs: [
      { k: '卡点', text: '支付对接', strong: '下周三', after: '才完成，之后还要压测 3 天' },
      { k: '可提前', text: '账号和报表模块已测完，13 号可以先开' },
    ],
    replyLabel: '建议回复', reply: '整体按 20 号上线更稳；账号和报表可以 13 号先开给你们试用，您看可以吗？',
    source: '出处：项目排期表 v3', confirm: '确认并回复客户', doneLabel: '已回复客户',
  },
  {
    id: 'team-weekly', no: '03', title: '团队周报', summary: '已写好，确认就发', due: '18:00 前',
    heading: '团队周报已按本周进展写好',
    diffs: [
      { k: '完成', text: '账号、报表模块测试完成' },
      { k: '风险', text: '支付对接顺延到', strong: '下周三', after: '，上线日不变' },
    ],
    replyLabel: '周报草稿', reply: '本周完成账号、报表模块测试；支付对接顺延至下周三，不影响 20 号上线。下周重点：压测。',
    source: '出处：本周例会纪要、小周和小李的周报', confirm: '确认并发给王总', doneLabel: '已发给王总',
  },
]

export interface Fact { id: string; group: '工作' | '健康'; text: string; from: string }
export const FACTS: Fact[] = [
  { id: 'f1', group: '工作', text: '给王总的汇报：先说结论，一页以内', from: '来自：你发出的周报' },
  { id: 'f2', group: '工作', text: '每周五 18:00 前交团队周报', from: '来自：周三例会纪要' },
  { id: 'f3', group: '健康', text: '每年 11 月做一次体检', from: '来自：去年的体检预约截图' },
]

export const WATCHING = [
  { title: '机票降价提醒', note: '上海—成都 11/22，现价 ¥860，低于 ¥700 告诉你' },
  { title: '发票报销', note: '3 张已交财务，等审批' },
  { title: '体检预约', note: '11 月还有名额，周一帮你约' },
  { title: '合同续签', note: '供应商合同 12/1 到期，提前两周提醒' },
  { title: '孩子家长会', note: '周四 19:00，前一天提醒' },
  { title: '信用卡还款', note: '15 号自动还，余额充足' },
  { title: '快递', note: '显示器已发货，预计周日到' },
]
