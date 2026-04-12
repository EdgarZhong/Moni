# CLAUDE.md

本文件只记录 Moni 主仓库当前阶段的任务看板、剩余风险、优先级和交接状态。

## 当前阶段目标

当前主线目标是先完成持久化口径迁移与 AI 分类链路收口，再进入后续验收。

当前已完成主线能力：

- 首页主舞台读模型已接入真实账本数据
- 随手记逻辑链路、首页展示链路、实例库 D 类映射已接通
- 预算逻辑链路、首页预算卡和预算提示卡已接通
- v7 实例库、学习 payload、收编上下文、账本行为配置已落主线
- 浏览器调试入口 `window.__MONI_DEBUG__ / window.__MONI_E2E__` 已落地
- Playwright / MCP 浏览器验证链路已固定
- 记账页（MoniEntry）已集成：导入账单、随手记、分类拖放、记一笔表单
- 交易详情面板已集成：分类修改、锁定、备注、AI 判断理由展示、边缘滑动返回
- 设置页已集成：MoniSettings 三页路由、全局配置（AI/自述/账本管理/关于）、账本级配置（标签/记忆/预算/学习/重分类）
- 参赛文档已按代码现状收口：`docs/report/02_技术研究报告.md` 与 `docs/report/03_开发文档.md` 已修正字段、队列、快照与数据流口径

## 当前剩余缺口

- Android 真环境专项验收仍未完成
- 真实 LLM 配置下的学习 / 收编回归仍未完成
- 默认账本可重命名语义仍需继续收口
- 规格文档已移除“代码/规格差异”维护职责，差异清单需转由会话说明与任务看板承接
- 空沙箱初始化阶段仍会出现一组“可选文件不存在”的 `POST /api/fs 404` 控制台噪音，后续可再单独收敛为静默探测

## 当前任务看板

| 任务 | 状态 | 说明 |
|------|------|------|
| 首页主舞台集成 | Done | `homeDateRange`、`trendCard`、手记首页字段、AI backlog、无预算退化态均已落地 |
| 随手记逻辑链路 | Done | 录入、删除、实例库联动、首页手记展示链路已接通 |
| 预算逻辑链路 | Done | 预算配置读写、首页预算卡、预算提示卡、标签联动已接通 |
| v7 记忆系统核心链路 | Done | 实例库 rich schema、learning payload、收编上下文、账本级 AI 行为配置已落地 |
| 记账页集成 | Done | MoniEntry 页面、useMoniEntryData hook、AppFacade 记账读模型、导入/随手记/分类拖放/表单均已接通 |
| 交易详情面板 | Done | TransactionDetailPanel：分类修改、锁定、备注、AI 理由、边缘滑动返回手势 |
| 设置页集成 | Done | MoniSettings 页面、useMoniSettingsData hook、AppFacade 设置读模型 / actions、三页路由、账本管理 CRUD、AI 记忆/快照、预算设置均已接通 |
| 参赛技术文档修订 | Done | `docs/report/02_技术研究报告.md` 与 `docs/report/03_开发文档.md` 已按当前代码收口，移除旧的 `classification_source` / 三数组队列等过时口径 |
| 持久化规格重规划 | Done | 持久化目标结构已收口为“顶层全局文件 + `ledgers/{ledger}/` 单账本目录”；规格文档不再维护代码差异段落 |
| 浏览器调试入口与逻辑测试 | In Progress | 已补空沙箱验证、自述落盘、账本 CRUD、分类范围消费与理由截断链路，后续仍可继续扩覆盖面 |
| 预算设置页 UI | Done | 已在设置页集成中完成（BudgetPage 子页面） |
| 持久化目录迁移 | Done | 账本、自述、记忆、实例库、预算、行为配置、分类运行态已统一到 `Directory.Data` 与 `ledgers/{ledger}/` 新结构 |
| 自述落盘修复 | Done | 设置页保存自述已接通真实持久化链路，直接写入 `self_description.md` |
| 分类消费批次收口 | Done | 消费端已按当前 `data range` 过滤，只消费范围内最近日期倒序的最多 3 天；运行态统一写入 `classify_runtime.json` |
| AI 理由长度收口 | Done | Prompt 与运行时写回已双重限制 `reasoning / ai_reasoning` 不超过 20 字 |
| Android 真环境专项验收 | Ready | 需补文件系统权限、重启持久化、haptics、生命周期验证 |
| 真实 LLM 回归 | Ready | 需在可用模型配置下复核学习和收编真实回写 |
| 默认账本语义收口 | Ready | 需确认默认账本初始名称与"可重命名"语义最终一致 |

## 当前优先级

1. Android 真环境专项验收
2. 真实 LLM 回归
3. 默认账本语义收口
4. 控制台 404 噪音收敛

## 当前阶段风险

- 浏览器 F12 虚拟文件系统是高保真开发替身，但不等价于 Android 真机行为
- 学习与收编虽然已有浏览器规格测试，但真实模型回写尚未做最终确认
- 默认账本的旧语义若未完全收口，后续可能继续污染测试链路与产品判断

## 当前已固定口径

- `ledgers/{ledger}/ai_prefs.json` 只承接账本级 AI 行为配置
- `ledgers/{ledger}/budget.json` 只承接预算配置
- `defined_categories` 是账本标签主数据单一信源
- 全局模型 / 提供方 / 主题 / 自述不进入 `ai_prefs.json`
- 正式运行时持久化统一写入 `Directory.Data`；`Directory.Documents` 仅作为历史迁移来源，不再作为正式落盘目标
- 顶层只保留全局文件：`ledgers.json / secure_config.bin / self_description.md / logs`
- 所有账本级文件统一收口到 `Directory.Data/ledgers/{ledger}/`
- 分类运行态统一规划为 `ledgers/{ledger}/classify_runtime.json`，承载 `queue / enqueue_recovery / confirm_recovery`
- 分类消费顺序本轮收口为“最近日期优先”
- 单次分类会话当前默认最多消费 `3` 天；该值暂不暴露 UI，也不额外落盘到 `ai_prefs.json`
- `classify_runtime.json` 在工程行为上更接近“按天缓冲区”，但当前文档与代码命名继续沿用 queue 术语
- `data range` 只约束 AI 消费，不限制 dirtyDates 生产与日期入队
- 分类结果里的 `reasoning / ai_reasoning` 需限制在 `20` 个字以内，运行时仍做兜底截断
- 规格文档只维护目标口径，不再维护“代码/规格差异”与实现差距清单
- 浏览器调试入口和测试入口属于稳定工具链，索引写入 `README.md`，协议与记录写入 `docs/`
- `MemoryManager`、`ExampleStore`、`SelfDescriptionManager` 均为纯静态类，无 getInstance() 单例
- 参赛文档当前固定口径：
  - `FullTransactionRecord` 不含 `classification_source`
  - `Arbiter` 优先级为 `USER > RULE_ENGINE > AI_AGENT`
  - 分类队列规范结构为 `version / revision / metrics / tasks[]`
  - 快照索引规范字段为 `current_snapshot_id`

## 已知陷阱

- AppFacade 调用服务层时注意区分静态类与单例类：
  - 静态类（直接用类名调用）：`MemoryManager`、`ExampleStore`、`SnapshotManager`、`SelfDescriptionManager`
  - 单例类（需 `.getInstance()`）：`LedgerPreferencesManager`、`ConfigManager`、`LedgerManager`、`BudgetManager`

## 交接说明

- 若继续推进功能，优先从 Android 真环境验收开始
- 若继续做验收，优先用浏览器调试入口和 Playwright 复跑现有 smoke test，再转入 Android 真环境
- 旧的并行编排版 `CLAUDE.md` 已归档到 `.archive/CLAUDE_parallel_legacy_2026-04-09.md`
