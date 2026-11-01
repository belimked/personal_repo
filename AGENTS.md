<!-- stepwise:start docs/impl -->
## 实施计划（stepwise）
- 总览 `docs/impl/00-plan.md`，清单 `docs/impl/MANIFEST.md`；状态只存在 `docs/impl/plan.json`，只能通过 stepwise 脚本修改。
- 执行某个步骤：先运行 `node "/opt/pi-agent-skills/skills/stepwise-run/scripts/stepwise.mjs" brief <编号>` 获取任务说明（路径失效时按 stepwise-run skill 找脚本），只读其中列出的文件和设计行号范围，不要通读设计文档。
<!-- stepwise:end docs/impl -->
