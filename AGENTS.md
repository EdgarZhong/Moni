# Moni 并行协作约束

## 本轮集成目标

本轮目标不是一次性做完全部业务，而是把主仓库整理成可安全并行派发 6 个子 agent 的状态，并在统一边界内推进以下方向：

- Agent 1：应用层门面与边界收口
- Agent 2：首页主舞台集成
- Agent 3：预算系统
- Agent 4：随手记系统
- Agent 5：v7 记忆系统核心升级
- Agent 6：Capacitor / System 层适配核验
- Agent 0：主协调、规则固化、文档维护、最终集成

## 并行开发总原则

- 主仓库是唯一运行时代码来源；`Moni-UI-Prototype/` 与 `pixel_bill_backend/` 仅作只读参考。
- 一个 agent 一个 worktree，一个 agent 一个明确任务边界。
- 本轮所有 agent worktree 统一创建在仓库根目录外侧父目录：`/home/edgar/code/moni-worktree`
- 所有实现必须优先复用主仓库现有目录语义：`bootstrap / logic / system / ui / shared`
- 若发现并行职责重叠，只记录并上报 Agent 0，不擅自扩边界。
- 先完成接口、读模型、状态口径，再做局部实现；禁止跨模块“顺手修一大片”。

## 禁止事项

- 禁止直接修改 `Moni-UI-Prototype/` 或 `pixel_bill_backend/`
- 禁止通过 import / require / link 把两个参考子仓库接入运行时
- 禁止未沟通即修改其他 agent 负责目录
- 禁止顺手重构无关模块、批量改名、迁移目录
- 禁止绕过 facade 让 UI 直接深入访问底层 service 细节
- 禁止把 Android Capacitor 目标环境退化成仅桌面浏览器方案

## 目标运行与测试环境

- 目标运行环境：Android Capacitor
- 人工测试环境：浏览器 F12 移动端模式
- Node 基线：22.x
- 当前既定包管理器：`npm`（仓库存在 `package-lock.json`，CI 也使用 `npm ci`）

## 文档职责分工

- `README.md` 只承载稳定事实，不写动态任务推进、阶段性测试记录或临时风险看板
- `AGENTS.md` 只承载协作规则、开发原则、测试流程、文档分工、写入边界与通用验收要求
- `CLAUDE.md` 只承载当前阶段的编排信息，例如任务看板、依赖关系、进度同步、阶段风险、完成定义
- 专项规格、专项 SOP、调试接口说明、测试用例说明统一写入 `docs/`
- 任何已经形成长期价值的测试入口、调试入口、验证文档入口，必须同步写入 `README.md` 作为稳定索引

## 开发测试总原则

- 开发完成后，不得只跑静态命令而不做页面验证
- 浏览器 MCP 与 Playwright 已是默认测试工具链，后续开发验收必须主动使用
- 后续涉及“尚无 UI 的能力”时，必须优先提供浏览器调试控制台入口，而不是依赖人工临时粘贴脚本
- 调试控制台入口应同时支持：
  - 数据准备
  - 逻辑链路验证
  - 页面态读取
  - smoke test 编排
- 所有调试控制台接口与测试用例，都必须在 `docs/` 留有专门说明文档
- 所有稳定可复用的测试入口名称、调试入口名称、测试文档入口，都必须写入 `README.md`

## 开发测试 MSOP 规则

- 每次开发完成后的标准验证顺序固定为：
  1. 静态校验：`typecheck`，必要时补 `lint` / `build`
  2. 控制台脚本验证：通过浏览器暴露的调试入口准备数据、验证逻辑链路
  3. 页面交互验证：使用 Playwright 驱动真实页面操作
  4. console 复核：检查 runtime error、Hook 错误、404 噪音、异常日志
  5. 视觉复核：截图关键页面状态，检查视觉、文案、层级与交互结果
  6. 结果归档：把通过项、失败项、未覆盖项、截图路径、日志路径写回相应文档
- 当前项目后续应补齐两类浏览器调试入口：
  - `window.__MONI_DEBUG__`：底层调试与数据准备入口
  - `window.__MONI_E2E__`：面向 smoke test 的标准测试入口
- 随手记、预算设置等尚未具备完整 UI 的能力，必须优先通过上述浏览器调试入口完成链路验收
- 若本轮新增了新的测试入口、fixture、调试命令或浏览器测试方法，提交时必须同步更新 `README.md` 和 `docs/` 中对应说明

## 文档优先级

1. `docs/Moni_Homepage_Integration_Spec.md`
2. `docs/Moni_Budget_System_Spec_v2.md`
3. `docs/Moni_Manual_Entry_Spec_v3.md`
4. `docs/AI_SELF_LEARNING_DESIGN_v7.md`
5. `README.md`
6. `CLAUDE.md`

补充说明：

- 视觉与交互定稿仍以 `Moni-UI-Prototype/DESIGN.md` 为准
- 参考子仓库只提供设计与架构信息，不得作为运行时代码依赖

## Agent 职责边界

### Agent 0

- 负责：任务编排、规则固化、文档补全、初始化脚手架、最终合并准备
- 不负责：重做各业务模块的主体实现

### Agent 1

- 负责：应用层 facade、聚合读模型、UI 到 application 的边界收口
- 允许写入：`src/bootstrap/**`、`src/logic/application/**`、`src/shared/**`、`src/ui/hooks/useAppLogic.ts`、`src/ui/hooks/useLedger.ts`
- 禁止修改：`src/ui/features/moni-home/**` 的舞台 UI 细节、预算实现细节、随手记主体、记忆系统 Prompt 细则、`src/system/**`

### Agent 2

- 负责：首页主舞台集成，消费 Agent 1 提供的 facade / 读模型
- 允许写入：`src/ui/pages/MoniHome.tsx`、`src/ui/features/moni-home/**`、`src/ui/components/moni/**`、`src/ui/hooks/useMoniHomeData.ts`
- 禁止修改：application facade 内部实现、预算持久化、手记持久化、AI 记忆内核、`src/system/**`

### Agent 3

- 负责：预算系统存储、计算、读模型接口
- 允许写入：`src/logic/application/services/BudgetManager.ts`、`src/logic/application/services/**` 下预算相关新文件、`src/shared/**` 中预算相关类型
- 禁止修改：首页主舞台 UI、手记系统主体、AI 记忆快照机制、Capacitor 适配层

### Agent 4

- 负责：随手记录入、删除、去重预留、实例库联动
- 允许写入：`src/logic/application/services/LedgerService.ts`、`src/logic/application/services/ExampleStore.ts`、`src/logic/application/services/**` 下手记相关新文件、`src/shared/types/metadata.ts`
- 禁止修改：首页主舞台 UI、预算系统主体、AI 记忆快照机制、`src/system/**`

### Agent 5

- 负责：v7 记忆系统升级、实例库 revision / change log、学习基线、Prompt 注入口径
- 允许写入：`src/logic/application/ai/**`、`src/logic/application/llm/**`、`src/logic/application/services/MemoryManager.ts`、`src/logic/application/services/ExampleStore.ts`、`src/logic/application/services/SnapshotManager.ts`、相关共享类型
- 禁止修改：首页主舞台 UI、预算主体 UI、手记页面主体、Capacitor 适配层

### Agent 6

- 负责：Capacitor / System 层适配核验、Android 环境约束、文件系统适配校验
- 允许写入：`capacitor.config.ts`、`src/system/**`、`src/bootstrap/**` 中系统装配相关部分、必要的环境说明文档
- 禁止修改：首页业务编排、预算规则、手记规则、记忆系统业务策略

## 冲突处理原则

- 发现职责重叠时，只记录冲突文件、原因、建议归属，不直接扩大实现范围
- 若某任务必须依赖他人尚未交付的接口，先提交最小占位类型或 TODO 约定，再回报 Agent 0
- 不得因为“方便联调”擅自进入其他 agent 的写入范围

## 通用工程要求

- 开发前阅读统一输入文档：`CLAUDE.md`、`README.md` 与四份规格文档
- 提交前至少运行：`npm run typecheck`
- 可运行环境允许时继续运行：`npm run lint`
- 完整验收命令：`npm run verify`
- 若本地环境受限导致 `build` 或 `lint` 无法运行，必须在交付说明中写明阻塞原因
- 验收输出必须包含：
  - 改动文件清单
  - 关键设计决策
  - 未解决风险
  - 需要 Agent 0 确认的事项

## Git / Worktree 协作约定

- 每个 agent 独立 worktree，统一放在 `/home/edgar/code/moni-worktree`
- worktree 命名建议：`moni-agent1`、`moni-agent2`、`moni-agent3`、`moni-agent4`、`moni-agent5`、`moni-agent6`
- 每个 agent 只在自己的 worktree 内开发，不在主协调 worktree 中混写
- 合并顺序先按依赖，再按风险：5 -> 1 -> 2 -> 3 -> 4 -> 6，最终由 Agent 0 统合

## 最小结构调整方案

当前仓库结构与并行分工基本匹配，仅需做以下最小约定，不需要大规模重组目录：

- Agent 1 如需新增 facade，优先放入 `src/logic/application/` 下的新子目录，而不是重构整个目录树
- Agent 2 只消费 Agent 1 的公开接口，不自行定义第二套首页聚合逻辑
- Agent 3 / 4 / 5 通过共享类型与 application service 对齐，不直接把跨模块逻辑塞进 UI 层
