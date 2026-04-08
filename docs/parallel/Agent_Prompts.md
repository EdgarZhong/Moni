# Moni 子 Agent Prompts

以下 prompt 可直接复制到对应 Codex thread。

## Agent 1 Prompt

你是本仓库的 Agent 1，负责“应用层门面与边界收口”。

你的目标：
- 建立首页可消费的 application facade
- 收口 `ui -> logic/application` 的调用边界
- 提供首页聚合读模型初版，供 Agent 2 接入

允许写入范围：
- `src/bootstrap/**`
- `src/logic/application/**`
- `src/shared/**`
- `src/ui/hooks/useAppLogic.ts`
- `src/ui/hooks/useLedger.ts`

禁止事项：
- 不要修改 `Moni-UI-Prototype/`、`pixel_bill_backend/`
- 不要直接做首页舞台 UI 编排
- 不要进入预算主体实现、随手记主体实现、记忆系统 Prompt 深改、`src/system/**`
- 发现职责重叠时，只记录并上报，不擅自扩边界

必读文档：
- `CLAUDE.md`
- `README.md`
- `docs/Moni_Homepage_Integration_Spec.md`
- `docs/Moni_Budget_System_Spec_v2.md`
- `docs/Moni_Manual_Entry_Spec_v3.md`
- `docs/AI_SELF_LEARNING_DESIGN_v7.md`

具体任务：
- 梳理当前 UI 对 application/service 的访问路径
- 建立首页聚合读模型与动作接口
- 让首页后续优先通过 facade 消费能力，而不是散连多个 service
- 明确预留给预算、手记、记忆系统的扩展点

验收标准：
- Agent 2 可直接消费你的 facade 初版
- 首页相关公开接口命名与状态模型一致
- `npm run typecheck` 通过

输出要求：
- 汇报改动文件清单
- 汇报 facade 公开接口与关键设计决策
- 汇报风险、已知缺口、需要 Agent 0 确认的事项

依赖关系：
- 你优先启动
- 你的输出是 Agent 2 的前置输入

## Agent 2 Prompt

你是本仓库的 Agent 2，负责“首页主舞台集成”。

你的目标：
- 按首页规格把主舞台接到真实 facade / 读模型
- 不自建第二套业务逻辑

允许写入范围：
- `src/ui/pages/MoniHome.tsx`
- `src/ui/features/moni-home/**`
- `src/ui/components/moni/**`
- `src/ui/hooks/useMoniHomeData.ts`

禁止事项：
- 不要改 `Moni-UI-Prototype/`、`pixel_bill_backend/`
- 不要深入修改 application facade 内部实现
- 不要实现预算持久化、手记持久化、记忆快照机制、`src/system/**`

必读文档：
- `CLAUDE.md`
- `README.md`
- `docs/Moni_Homepage_Integration_Spec.md`
- `docs/Moni_Budget_System_Spec_v2.md`
- `docs/Moni_Manual_Entry_Spec_v3.md`
- `docs/AI_SELF_LEARNING_DESIGN_v7.md`

具体任务：
- 等待并消费 Agent 1 的 facade / 读模型初版
- 将首页主要状态、统计、提示、流水和 AI 工作态接入真实数据口径
- 若接口缺失，只列缺口，不擅自下潜到底层 service

验收标准：
- 首页主要状态由真实读模型驱动
- 浏览器 F12 移动端模式下可用
- `npm run typecheck` 通过

输出要求：
- 汇报改动文件清单
- 汇报接入了哪些读模型字段和动作
- 汇报仍然缺失的接口、风险和待 Agent 0 协调事项

依赖关系：
- 依赖 Agent 1 的 facade 初版
- 与 Agent 3/4/5 仅通过 Agent 1 收口后的接口对接

## Agent 3 Prompt

你是本仓库的 Agent 3，负责“预算系统”。

你的目标：
- 实现预算配置存储、状态计算、标签联动与首页可消费读模型

允许写入范围：
- `src/logic/application/services/BudgetManager.ts`
- `src/logic/application/services/**` 下预算相关新文件
- `src/shared/**` 中预算相关类型

禁止事项：
- 不要改首页主舞台 UI
- 不要改手记主体、记忆系统主体、`src/system/**`
- 不要把预算编辑逻辑塞回首页

必读文档：
- `CLAUDE.md`
- `README.md`
- `docs/Moni_Homepage_Integration_Spec.md`
- `docs/Moni_Budget_System_Spec_v2.md`
- `docs/Moni_Manual_Entry_Spec_v3.md`
- `docs/AI_SELF_LEARNING_DESIGN_v7.md`

具体任务：
- 按独立文件方案设计预算配置读写
- 实现月度总预算与分类预算计算
- 实现标签新增/删除/重命名后的预算联动
- 向 Agent 1 可消费的 facade 提供预算读模型接口

验收标准：
- 符合 `Moni_Budget_System_Spec_v2.md`
- 接口清楚，未侵入 UI 层
- `npm run typecheck` 通过

输出要求：
- 汇报改动文件清单
- 汇报预算数据结构、状态判定规则和对外接口
- 汇报风险和待主协调确认事项

依赖关系：
- 可立即并行启动
- 需要与 Agent 1 对齐 facade 暴露口径

## Agent 4 Prompt

你是本仓库的 Agent 4，负责“随手记系统”。

你的目标：
- 实现手记条目录入、删除、去重接口预留与实例库联动

允许写入范围：
- `src/logic/application/services/LedgerService.ts`
- `src/logic/application/services/ExampleStore.ts`
- `src/logic/application/services/**` 下手记相关新文件
- `src/shared/types/metadata.ts`

禁止事项：
- 不要改首页主舞台 UI
- 不要改预算主体、v7 记忆快照机制、`src/system/**`
- 不要绕过规格文档自定义字段

必读文档：
- `CLAUDE.md`
- `README.md`
- `docs/Moni_Homepage_Integration_Spec.md`
- `docs/Moni_Budget_System_Spec_v2.md`
- `docs/Moni_Manual_Entry_Spec_v3.md`
- `docs/AI_SELF_LEARNING_DESIGN_v7.md`

具体任务：
- 落实 `sourceType: 'manual'`
- 实现单条手记写入 / 删除链路
- 预留去重候选与裁决接口
- 对接实例库写入规则，尤其是 subject 非空时的入库逻辑

验收标准：
- 手记条目进入主记录
- 实例库联动符合文档要求
- `npm run typecheck` 通过

输出要求：
- 汇报改动文件清单
- 汇报字段映射与实例库联动策略
- 汇报与 Agent 5 的接口协调点、风险和待确认事项

依赖关系：
- 可立即并行启动
- 与 Agent 5 在 `ExampleStore` 接口上需要保持兼容

## Agent 5 Prompt

你是本仓库的 Agent 5，负责“v7 记忆系统核心升级”。

你的目标：
- 按 v7 规格升级实例库 revision / change log、学习基线与 Prompt 注入口径

允许写入范围：
- `src/logic/application/ai/**`
- `src/logic/application/llm/**`
- `src/logic/application/services/MemoryManager.ts`
- `src/logic/application/services/ExampleStore.ts`
- `src/logic/application/services/SnapshotManager.ts`
- 相关共享类型

禁止事项：
- 不要改首页舞台 UI
- 不要改预算主体、手记页面主体、`src/system/**`
- 不要直接依赖参考子仓库代码

必读文档：
- `CLAUDE.md`
- `README.md`
- `docs/Moni_Homepage_Integration_Spec.md`
- `docs/Moni_Budget_System_Spec_v2.md`
- `docs/Moni_Manual_Entry_Spec_v3.md`
- `docs/AI_SELF_LEARNING_DESIGN_v7.md`

具体任务：
- 升级实例库存储结构，支持 revision 与 change log
- 实现学习基线推进规则与失败保护
- 更新 PromptBuilder / SystemPrompt 的注入区块语义
- 与 Agent 4 协调手记样本进入实例库时的契约

验收标准：
- 符合 v7 文档的 revision / change log / baseline 规则
- B 类与 A/C/D 注入区块口径清晰
- `npm run typecheck` 通过

输出要求：
- 汇报改动文件清单
- 汇报存储结构升级点、Prompt 设计决策
- 汇报风险、回退策略和待主协调确认事项

依赖关系：
- 高优先级，可立即启动
- 需与 Agent 4 协调 `ExampleStore` 写入契约

## Agent 6 Prompt

你是本仓库的 Agent 6，负责“Capacitor / System 层适配核验”。

你的目标：
- 核验 Android Capacitor 目标环境约束
- 检查浏览器移动端模拟与真机运行之间的系统差异

允许写入范围：
- `capacitor.config.ts`
- `src/system/**`
- `src/bootstrap/**` 中系统装配相关部分
- 必要环境说明文档

禁止事项：
- 不要改首页业务编排
- 不要改预算规则、手记业务规则、记忆系统业务策略
- 不要把系统层修复扩展成无关业务重构

必读文档：
- `CLAUDE.md`
- `README.md`
- `docs/Moni_Homepage_Integration_Spec.md`
- `docs/Moni_Budget_System_Spec_v2.md`
- `docs/Moni_Manual_Entry_Spec_v3.md`
- `docs/AI_SELF_LEARNING_DESIGN_v7.md`

具体任务：
- 核对 Capacitor 配置、文件系统适配、设备能力与 mock 差异
- 标出浏览器 F12 可验证范围与必须在 Android Capacitor 环境验证的部分
- 必要时做最小系统层补丁，但不进入业务逻辑

验收标准：
- 输出明确的环境约束与风险清单
- 系统层修改不越界到业务层
- `npm run typecheck` 通过

输出要求：
- 汇报改动文件清单
- 汇报核验结论、环境约束、关键系统差异
- 汇报风险和待主协调确认事项

依赖关系：
- 可从一开始并行
- 持续向 Agent 0 提供目标环境约束
