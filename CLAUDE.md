# CLAUDE.md

本文件是 Moni 主仓库当前阶段的任务看板、并行编排、进度同步与阶段风险记录中心。

## 本轮目标摘要

当前阶段目标不是直接把全部业务一次做完，而是先把主仓库整理成“可安全并行派发 6 个子 agent”的状态，并据此推进：

- Agent 1：应用层门面与边界收口
- Agent 2：首页主舞台集成
- Agent 3：预算系统
- Agent 4：随手记系统
- Agent 5：v7 记忆系统核心升级
- Agent 6：Capacitor / System 层适配核验
- Agent 0：主协调、规则固化、脚手架准备、最终集成准备

## README / AGENTS / CLAUDE 分工

- `README.md`：沉淀稳定项目事实与稳定入口索引
- `AGENTS.md`：维护协作规则、开发原则、测试流程与通用验收要求
- `CLAUDE.md`：维护任务编排、任务看板、依赖关系、进度同步、阶段风险与完成定义

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

### 当前已补齐

- 已补：`AGENTS.md`
- 已补：`.codex/config.json`
- 已补：`.codex/scripts/worktree-init.sh`
- 已补：`.codex/README.md`
- 已补：`docs/parallel/Agent_Task_Packets.md`
- 已补：`docs/parallel/Agent_Prompts.md`
- 已补：`docs/parallel/Parallel_Runbook.md`

### 当前集成后仍待收口的空白

- 默认账本产品名已确定为“日常开销”，但该名称只是初始名称，不是不可重命名保留字；默认账本仍必须允许重命名
- 默认账本命名迁移仍需继续完成索引 / 调试链路 / 默认参数的统一收口
- 首页聚合读模型已补齐 `homeDateRange / trendCard / 手记展示字段 / AI backlog`，但 Android 真环境专项验收仍未完成
- 测试数据迁移策略、调试时钟策略、全链路验收清单仍未补齐
- Capacitor / Android 真环境约束仍需持续核验
- 浏览器 MCP 已可驱动首页 E2E，开发态浏览器调试入口 `window.__MONI_DEBUG__ / window.__MONI_E2E__` 已接入；实例库 v7 运行时注入、手记 D 类映射、学习 payload rich schema 测试也已纳入测试入口，后续仍需扩大覆盖面
- 账本重命名 / 删除现在开始联动迁移与清理 `classify_example_changes/{ledger}.json`，避免实例库增量日志因临时账本残留而持续堆积
- 收编实现口径已收敛：账本级行为配置统一落到 `ledger_prefs/{ledger}.json`；默认收编阈值 `30`，压缩比例固定 `0.7`
- `ledger_prefs` 当前明确只承接账本级 AI 行为配置；预算仍走 `budget_config/{ledger}.json`，标签仍走 `defined_categories`，全局模型/主题/自述不进入 `ledger_prefs`
- `learning.threshold / autoLearn` 已不再是空壳字段：设置页阈值滑杆改为持久化到账本偏好，自动学习判定改为统一走 `LearningAutomationService`

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
- 当前 LedgerManager 仍保留“默认账本不可重命名/删除”的旧语义，这与产品要求冲突，需单列收口而不是顺手硬改
- 预算侧的 `categoryBudgetSchemaVersion` 目前仍缺少统一的账本标签 schema version 来源
- Capacitor 真实环境与浏览器模拟环境的文件系统、设备能力存在差异
- 浏览器开发态必须保持真实 web 语义，禁止继续伪装成 native Android
- 当前仓库使用 `npm` 与 `package-lock.json`，并行期不适合同时切换到 `pnpm`
- 纯浏览器 runtime 还没有独立的 browser filesystem adapter
- 最终集成前仍需 Android 真机或模拟器专项验证，覆盖存储权限、重启持久化和 haptics
- 手记侧已接入 v7 主文件结构，但 `classify_example_changes/{ledger}.json` 变更日志仍以 Agent 5 版本为准

## 首轮集成最终任务目标

首轮集成的最终目标不是“页面能打开”或“边界已接上”就算完成，而是：

- 首页在真实测试账本上稳定显示数据，而不是空态 mock
- 首页主舞台的核心信息结构与原型一致：账本、预算卡、提示卡、统计栏、分类概览、分类轨道、按天流水、AI 工作态
- 默认账本初始名称为“日常开销”，但默认账本仍允许重命名，不保留旧的不可改语义
- 测试数据、调试链路、Data Range Picker、首页读模型在同一套真实账本事实上闭环
- 在浏览器 F12 与 Android Capacitor 目标环境下都能完成首轮验收

## 下一阶段任务看板

| 任务 | 状态 | 说明 |
|------|------|------|
| 默认账本命名统一收口 | In Progress | 将 `default` 统一迁移为“日常开销”初始名称，但不引入“默认账本不可重命名”新限制 |
| 默认账本可重命名语义收口 | Ready | 当前旧逻辑仍把默认账本视为不可重命名/删除，需要单独设计收口方案 |
| 首页读模型收口 | Done | `homeDateRange`、`trendCard`、手记首页字段、AI backlog、无预算退化态已接入 |
| 账本加载链路排查 | Done | Date Range Picker 边界改为直接由账本全量记录推导 |
| 首页真实测试数据显示 | Done | 浏览器内首页读模型 smoke test 已跑通，剩余只留 Android 目标环境人工验收 |
| 浏览器调试入口与逻辑链路测试 | In Progress | 已接入 `window.__MONI_DEBUG__ / window.__MONI_E2E__`，账本 CRUD / 随手记 / 预算 / 实例库 v7 规格 / 学习 payload v7 规格 / 自动学习偏好与触发判定 / 收编配置与上下文规格 / 首页读模型测试入口已落地并在浏览器跑通，后续仍需扩展更多场景 |
| 预算设置页 UI | Ready | 预算逻辑与首页预算卡已接通，剩余缺口集中在设置页预算配置入口与交互 |
| 测试数据迁移方案 | Ready | 明确是迁移现有测试数据到当前月，还是引入 debug clock |
| 原型对齐缺陷修复 | Ready | 基于截图差异修首页 UI bug，而不是在空态上修视觉 |
| 全链路验收与 Android 专项验证 | Ready | 覆盖存储权限、重启持久化、haptics、首页真实数据显示 |

## 当前优先级判断

1. 预算设置页 UI
2. 全链路验收与 Android 专项验证
3. 测试数据迁移方案
4. 默认账本可重命名语义收口
5. 原型对齐缺陷修复
6. Android 专项验证

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
