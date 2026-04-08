# Moni 并行执行 Runbook

## 启动顺序

1. Agent 0 先完成规则固化、任务包、prompt、初始化脚手架和看板更新
2. Agent 1 与 Agent 5 先启动
3. Agent 6 从一开始并行启动，持续输出环境约束
4. Agent 3 与 Agent 4 可在 Agent 1 启动后立即并行
5. Agent 2 等待 Agent 1 交付 facade 初版后启动
6. Agent 0 最后统一做合并准备与集成校验

## 依赖规则

- Agent 1 是首页接入的前置，Agent 2 必须等 Agent 1 的 facade 初版
- Agent 3、Agent 4、Agent 5 可并行，但 Agent 4 与 Agent 5 需要协调 `ExampleStore` 口径
- Agent 6 不阻塞其他 agent 开工，但它输出的系统层约束应尽早同步给所有人
- Agent 0 不替代业务 agent 实现，只做编排、冲突仲裁、文档维护和最终合并

## 哪些角色可立即并行

- 可立即启动：Agent 1、Agent 3、Agent 4、Agent 5、Agent 6
- 必须等待初版输出：Agent 2 等 Agent 1 facade 初版
- 最终统一集成：Agent 0

## 推荐优先级

1. Agent 5
2. Agent 1
3. Agent 2
4. Agent 3
5. Agent 4
6. Agent 6

## 主协调检查点

### 阶段 0：派发前

- 检查 `AGENTS.md`、`CLAUDE.md`、`.codex/`、任务包、prompt、runbook 是否齐全
- 确认 worktree 统一创建于 `/home/edgar/code/moni-worktree`
- 确认各 agent 写入范围无明显重叠

### 阶段 1：Agent 1 / 5 初版后

- 检查 Agent 1 是否已提供 facade 与首页读模型口径
- 检查 Agent 5 是否明确实例库 revision / change log / baseline 方案
- 若 Agent 4 将改 `ExampleStore`，先协调 Agent 4 与 Agent 5 的接口归属

### 阶段 2：Agent 2 / 3 / 4 并行中

- 检查 Agent 2 是否严格消费 facade，而不是直接连底层 service
- 检查 Agent 3 是否把预算逻辑局限在 application / shared 层
- 检查 Agent 4 是否遵守手记字段映射与实例库联动规则
- 同步 Agent 6 输出的系统环境限制

### 阶段 3：合并前

- 汇总每个 agent 的改动文件清单、设计决策、风险和待确认事项
- 检查冲突文件，优先按职责归属回退到对应 agent 修正
- 在可运行环境下执行最小检查 `npm run typecheck`
- 有条件时执行 `npm run verify`

### 阶段 4：统一集成

- 按依赖顺序审阅与合并：5 -> 1 -> 2 -> 3 -> 4 -> 6
- 再次检查首页是否仍走 facade 边界
- 再次检查预算 / 手记 / 记忆系统是否未把逻辑塞进 UI 或 system
- 更新 `CLAUDE.md` 看板状态与风险清单

## 阻塞升级规则

- 若发现职责重叠：记录冲突文件、归属建议、阻塞原因，上报 Agent 0
- 若发现系统层限制影响业务实现：由 Agent 6 输出约束，Agent 0 重新编排
- 若发现规格文档之间存在冲突：优先按首页规格、预算规格、手记规格、v7 规格顺序裁决，并记录在 `CLAUDE.md`
