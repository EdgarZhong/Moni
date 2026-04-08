# Moni 并行任务包

## 统一前置

- 必读文档：`CLAUDE.md`、`README.md`、`docs/Moni_Homepage_Integration_Spec.md`、`docs/Moni_Budget_System_Spec_v2.md`、`docs/Moni_Manual_Entry_Spec_v3.md`、`docs/AI_SELF_LEARNING_DESIGN_v7.md`
- 目标环境：Android Capacitor
- 人工测试环境：浏览器 F12 移动端模式
- worktree 根目录：`/home/edgar/code/moni-worktree`
- 参考子仓库只读，不得作为运行时代码依赖

## Agent 1

- 编号：Agent 1
- 目标：建立应用层 facade、首页聚合读模型与 UI 访问边界，收口 `ui -> logic/application` 的调用方式
- 写入范围：`src/bootstrap/**`、`src/logic/application/**`、`src/shared/**`、`src/ui/hooks/useAppLogic.ts`、`src/ui/hooks/useLedger.ts`
- 不可触碰范围：`src/ui/features/moni-home/**` 的具体舞台编排、预算系统主体实现、手记主体实现、记忆系统 Prompt 深改、`src/system/**`
- 依赖前置：无，优先启动
- 输入文档：首页规格、v7 记忆规格、README 中有效骨架说明
- 交付物：facade 初版、首页聚合读模型、清晰的公开接口边界、必要类型定义
- 验收标准：UI 不再直接散连多个底层 service；首页消费口径可被 Agent 2 直接接入；`npm run typecheck` 通过
- 风险点：过度抽象、把尚未稳定的业务细节封死、与 Agent 3/4/5 的 service 口径冲突
- 交接接口：向 Agent 2 输出 facade / read model；向 Agent 3/4/5 说明可扩展接口与保留字段

## Agent 2

- 编号：Agent 2
- 目标：按首页集成规格接入主舞台表现层，消费 Agent 1 的 facade 和读模型
- 写入范围：`src/ui/pages/MoniHome.tsx`、`src/ui/features/moni-home/**`、`src/ui/components/moni/**`、`src/ui/hooks/useMoniHomeData.ts`
- 不可触碰范围：application facade 内部实现、预算持久化、手记持久化、AI 记忆快照机制、`src/system/**`
- 依赖前置：等待 Agent 1 的 facade 初版
- 输入文档：`docs/Moni_Homepage_Integration_Spec.md`
- 交付物：首页主舞台联调版、组件状态与动作接线、缺失接口清单
- 验收标准：页面主要状态改由真实读模型驱动；未越权进入 service 内部；移动端模式下结构可用
- 风险点：为追 UI 效果擅自补业务逻辑、与 Agent 1 双方各自定义状态模型
- 交接接口：接收 Agent 1 facade；向 Agent 0 汇报仍需 Agent 3/4/5 补充的读模型字段

## Agent 3

- 编号：Agent 3
- 目标：实现预算系统的配置存储、月度计算、分类预算联动与首页可消费读模型
- 写入范围：`src/logic/application/services/BudgetManager.ts`、`src/logic/application/services/**` 下预算相关新文件、`src/shared/**` 中预算相关类型
- 不可触碰范围：首页主舞台 UI、手记主体实现、记忆系统主体、Capacitor 适配层
- 依赖前置：可并行启动；若需首页接入字段，与 Agent 1 对齐 facade 暴露口径
- 输入文档：`docs/Moni_Budget_System_Spec_v2.md`、首页规格中预算展示边界
- 交付物：预算配置读写、状态计算、标签联动、可供 facade 消费的预算读模型
- 验收标准：符合独立文件存储方案；标签新增/删除/重命名联动明确；`npm run typecheck` 通过
- 风险点：误把预算编辑逻辑塞回首页、与 LedgerService 生命周期连锁处理耦合过深
- 交接接口：向 Agent 1 提供预算读模型 / service 接口；向 Agent 2 提供首页消费字段说明

## Agent 4

- 编号：Agent 4
- 目标：实现随手记录入链路、删除链路、去重接口预留与实例库联动
- 写入范围：`src/logic/application/services/LedgerService.ts`、`src/logic/application/services/ExampleStore.ts`、`src/logic/application/services/**` 下手记相关新文件、`src/shared/types/metadata.ts`
- 不可触碰范围：首页主舞台 UI、预算系统主体、v7 记忆快照机制、`src/system/**`
- 依赖前置：可并行启动；若实例库结构被 Agent 5 升级，需要对齐 revision / change log 口径
- 输入文档：`docs/Moni_Manual_Entry_Spec_v3.md`、`docs/AI_SELF_LEARNING_DESIGN_v7.md`
- 交付物：`ManualEntryManager` 或等价能力、LedgerService 单条写入能力、实例库同步逻辑、去重接口占位
- 验收标准：手记条目以 `sourceType: 'manual'` 进入主记录；subject 非空时进入实例库；未侵入首页 UI
- 风险点：与 Agent 5 同改 `ExampleStore.ts`；错误处理和字段映射不一致
- 交接接口：向 Agent 5 说明实例库写入口；向 Agent 1 说明后续 facade 可暴露的手记动作

## Agent 5

- 编号：Agent 5
- 目标：升级 v7 记忆系统核心，实现实例库 revision / change log、学习基线指针与 Prompt 注入口径
- 写入范围：`src/logic/application/ai/**`、`src/logic/application/llm/**`、`src/logic/application/services/MemoryManager.ts`、`src/logic/application/services/ExampleStore.ts`、`src/logic/application/services/SnapshotManager.ts`、相关共享类型
- 不可触碰范围：首页舞台 UI、预算主体、手记页面主体、Capacitor 适配层
- 依赖前置：高优先级，可立即启动；需与 Agent 4 协调 `ExampleStore` 接口
- 输入文档：`docs/AI_SELF_LEARNING_DESIGN_v7.md`、`docs/Moni_Manual_Entry_Spec_v3.md`
- 交付物：v7 记忆存储升级、学习窗口变更集能力、PromptBuilder / SystemPrompt 对齐、回退策略说明
- 验收标准：revision 与 change log 语义清楚；学习失败不推进基线；B 类与 A/C/D 注入口径可区分
- 风险点：与 Agent 4 冲突在实例库存储层；过度改动现有分类链路
- 交接接口：向 Agent 1 输出可暴露的记忆状态接口；向 Agent 4 说明手记样本写入契约

## Agent 6

- 编号：Agent 6
- 目标：核验 Capacitor / System 层约束、文件系统适配、Android 目标环境差异并给出修补建议
- 写入范围：`capacitor.config.ts`、`src/system/**`、`src/bootstrap/**` 中系统装配相关代码、必要环境说明文档
- 不可触碰范围：首页业务编排、预算规则、手记业务规则、记忆系统业务策略
- 依赖前置：无，可从一开始全程并行
- 输入文档：README 环境说明、首页规格中的设备交互边界、现有 Capacitor 配置与 system 目录代码
- 交付物：系统适配核验结论、必要的适配补丁、Android / 浏览器差异清单
- 验收标准：不改变业务归属；能清楚说明哪些能力在浏览器模拟、哪些必须在 Capacitor 真机验证
- 风险点：把系统层改成业务层、与 Agent 1 在 bootstrap 装配点冲突
- 交接接口：向所有 agent 输出环境约束；向 Agent 0 输出统一联调注意事项
