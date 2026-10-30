# 收尾清单（proto-v5 · P1）

> 脚本生成，不要手工编辑。登记命令在项目根目录运行。
> 计划已归档（完成，2026-10-30）：原型 v5 已通过并冻结；后续修改进 v6

共 1 项：数据 0 项（预计 0 分钟）、核对 0 项、人工验收 1 项；已登记 1 项。按下面的顺序做。

## 三、人工验收

### ✅ A01 在浏览器里试用 v5（关联 S11 · 出处：§2）
- 前置：无
- 操作步骤：
  1. 打开 https://daily-assistant-proto.accrepo.com/ITER1/v5/ ，用 lily@demo.com / demo1234 登录
  2. 依次试：对助手说“想研究一下保险”并排时间、💡 想做的事页、待办页标签树、菜单收起按钮、home.html?review=week
- 判定：
  - [x] 评审第 11、12、13 项在页面上都能找到对应表现
  - [x] 视觉朴素、无明显错位或遮挡
- 不通过会影响：S03、S04、S05、S06、S07
- 登记：`post A01 ok docs/impl-archive/20261030-proto-v5 --reason "…"` / `post A01 fail docs/impl-archive/20261030-proto-v5 --reason "<原因>"` / `post A01 skip docs/impl-archive/20261030-proto-v5 --reason "<原因>"`
- 结果：✅ 通过 · 2026-10-30 09:38 · 用户确认原型 v5 通过（2026-10-30）
