# CLAUDE.md

本文件是 Moni 主仓库当前阶段的任务看板、执行约束与并行编排中心。

## 本轮目标摘要

当前阶段目标不是直接把全部业务一次做完，而是先把主仓库整理成“可安全并行派发 6 个子 agent”的状态，并据此推进：

- Agent 1：应用层门面与边界收口
- Agent 2：首页主舞台集成
- Agent 3：预算系统
- Agent 4：随手记系统
- Agent 5：v7 记忆系统核心升级
- Agent 6：Capacitor / System 层适配核验
- Agent 0：主协调、规则固化、脚手架准备、最终集成准备

## README 与 CLAUDE 分工

- `README.md`：沉淀稳定项目事实，不承担动态任务管理
- `CLAUDE.md`：维护任务看板、并行关系、风险、启动条件、完成定义

## 现状审计摘要

### 已有文件

- 已有：`CLAUDE.md`
- 已有：`README.md`
- 已有：`docs/`
- 已有：`docs/Moni_Homepage_Integration_Spec.md`
- 已有：`docs/Moni_Budget_System_Spec_v2.md`
- 已有：`docs/Moni_Manual_Entry_Spec_v3.md`
- 已有：`docs/AI_SELF_LEARNING_DESIGN_v7.md`
- 已有：`package.json`
- 已有：`package-lock.json`
- 已有：`capacitor.config.ts`

### 原先缺失或异常

- 缺失：`AGENTS.md`
- 异常：根目录 `.codex` 原先是空文件，不是可用配置目录

### 当前已补齐

- 已补：`AGENTS.md`
- 已补：`.codex/config.json`
- 已补：`.codex/scripts/worktree-init.sh`
- 已补：`.codex/README.md`
- 已补：`docs/parallel/Agent_Task_Packets.md`
- 已补：`docs/parallel/Agent_Prompts.md`
- 已补：`docs/parallel/Parallel_Runbook.md`

### 仍需由业务 agent 填补的空白

- 应用层 facade 尚未形成统一公开口径
- 首页主舞台仍需接真实读模型
- 预算系统、随手记系统、v7 记忆系统仍需按规格实施
- Capacitor / Android 真环境约束仍需持续核验

## 仓库与环境基线

- 主仓库是唯一运行时代码来源
- `Moni-UI-Prototype/` 与 `pixel_bill_backend/` 仅作只读参考
- 目标运行环境：Android Capacitor
- 人工测试环境：浏览器 F12 移动端模式
- worktree 统一父目录：`/home/edgar/code/moni-worktree`
- Node 基线：22.x
- 当前既定包管理器：`npm`
- CI 基线：`npm ci` -> `npm run typecheck` -> `npm run build` -> `npm run lint`

## 文档优先级

1. `docs/Moni_Homepage_Integration_Spec.md`
2. `docs/Moni_Budget_System_Spec_v2.md`
3. `docs/Moni_Manual_Entry_Spec_v3.md`
4. `docs/AI_SELF_LEARNING_DESIGN_v7.md`
5. `README.md`
6. 本文件

补充：

- 视觉与交互定稿仍以 `Moni-UI-Prototype/DESIGN.md` 为准
- 两个参考子仓库禁止作为运行时代码依赖

## 并行模型

- Agent 1 先启动，产出 facade 初版
- Agent 2 依赖 Agent 1 的 facade
- Agent 3、Agent 4、Agent 5 可以并行
- Agent 6 全程并行，持续提供目标环境约束
- Agent 0 最后统一合并

## Agent 状态看板

| Agent | 任务 | 状态 | 说明 |
|------|------|------|------|
| Agent 0 | 编排、规则固化、脚手架、看板维护 | In Progress | 当前正在执行 |
| Agent 1 | 应用层门面与边界收口 | Done | 已合并到主线 |
| Agent 2 | 首页主舞台集成 | Done | 已合并到主线 |
| Agent 3 | 预算系统 | Done | 已合并到主线 |
| Agent 4 | 随手记系统 | Done | 已合并到主线 |
| Agent 5 | v7 记忆系统核心升级 | Done | 已合并到主线 |
| Agent 6 | Capacitor / System 层适配核验 | Done | 已合并到主线 |

## 并行依赖关系

- Agent 1 -> Agent 2
- Agent 1 -> Agent 0 最终合并
- Agent 5 <-> Agent 4：在 `ExampleStore` 接口上需要协同，但不互相吞并职责
- Agent 3 -> Agent 1：预算读模型应通过 Agent 1 facade 对外暴露
- Agent 6 -> 全体：输出环境约束，不直接替代业务实现
- Agent 2 必须消费 `AppFacade`，不得再扩出第二套首页聚合逻辑

## 合并顺序建议

1. Agent 5
2. Agent 1
3. Agent 2
4. Agent 3
5. Agent 4
6. Agent 6
7. Agent 0 做最终统一集成

## 风险清单

- `ExampleStore.ts` 同时被 Agent 4 与 Agent 5 关注，存在冲突风险
- Agent 2 容易因联调便利直接下潜到底层 service，必须受 Agent 1 facade 约束
- 预算系统与 Ledger 生命周期连锁处理可能影响现有 service 边界
- 预算侧的 `categoryBudgetSchemaVersion` 目前仍缺少统一的账本标签 schema version 来源
- Capacitor 真实环境与浏览器模拟环境的文件系统、设备能力存在差异
- 浏览器开发态必须保持真实 web 语义，禁止继续伪装成 native Android
- 当前仓库使用 `npm` 与 `package-lock.json`，并行期不适合同时切换到 `pnpm`
- 纯浏览器 runtime 还没有独立的 browser filesystem adapter
- 最终集成前仍需 Android 真机或模拟器专项验证，覆盖存储权限、重启持久化和 haptics
- 手记侧已接入 v7 主文件结构，但 `classify_example_changes/{ledger}.json` 变更日志仍以 Agent 5 版本为准

## 启动条件

### Agent 1

- 已阅读统一输入文档
- 明确自己的写入范围
- 确认不会直接改首页舞台 UI

### Agent 2

- 已拿到 Agent 1 facade 初版
- 已理解首页规格中的状态模型与组件边界

### Agent 3

- 已阅读预算规格
- 已确认独立文件存储方案和标签联动规则

### Agent 4

- 已阅读手记规格
- 已确认 `sourceType: 'manual'`、实例库写入条件、去重预留接口

### Agent 5

- 已阅读 v7 规格
- 已确认 revision / change log / baseline 机制

### Agent 6

- 已审阅 `capacitor.config.ts`、`src/system/**`、README 环境说明

## 完成定义

### Agent 1 Done

- 提供 facade 初版
- 首页聚合读模型可以被 Agent 2 消费
- `npm run typecheck` 通过
- 输出改动文件、设计决策、风险与待确认事项

### Agent 2 Done

- 首页主舞台主要状态已接入真实读模型
- 未越权进入 service 内部
- `npm run typecheck` 通过
- 输出改动文件、缺失接口、风险与待确认事项

### Agent 3 Done

- 预算配置读写、状态计算、标签联动落地
- 预算读模型可被 facade 暴露
- `npm run typecheck` 通过
- 输出改动文件、设计决策、风险与待确认事项

### Agent 4 Done

- 手记条目录入 / 删除链路与实例库联动落地
- 去重接口已预留
- `npm run typecheck` 通过
- 输出改动文件、设计决策、风险与待确认事项

### Agent 5 Done

- v7 revision / change log / baseline 机制落地
- Prompt 注入口径与文档一致
- `npm run typecheck` 通过
- 输出改动文件、设计决策、风险与待确认事项

### Agent 6 Done

- 输出系统层核验结论与环境约束
- 必要系统层补丁已落地
- `npm run typecheck` 通过
- 输出改动文件、设计决策、风险与待确认事项

## 通用工程要求

- 每个 agent 一个 worktree，一个明确任务边界
- 所有 worktree 放在 `/home/edgar/code/moni-worktree`
- 所有实现必须优先复用主仓库现有目录语义，不得大规模重构目录
- 提交前至少运行：`npm run typecheck`
- 条件允许时运行：`npm run lint`
- 完整验收命令：`npm run verify`
- 如果无法安全跑重型命令，必须在交付说明中明确写出阻塞原因

## 冲突处理原则

- 发现职责重叠时，只记录并上报，不擅自扩边界
- 若接口尚未稳定，优先提交最小占位与 TODO 约定
- 严禁因为联调方便而越权进入他人目录

## 相关文档

- `AGENTS.md`
- `docs/parallel/Agent_Task_Packets.md`
- `docs/parallel/Agent_Prompts.md`
- `docs/parallel/Parallel_Runbook.md`

## 备注

- 当前仓库结构与并行分工基本匹配，仅需在 `src/logic/application/` 下收口 facade，而不是重组整棵目录树
- 本文件必须随集成推进持续更新
