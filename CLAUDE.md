# CLAUDE.md

本文件记录当前版本迭代的任务看板、风险、优先级、交接状态与阶段性决策。

其中任务看板相关历史的保留规则固定为：

1. 已发布版本的 feature 历史统一收口到 `Release Changelog`
2. “当前任务看板”只保留当前版本迭代中的进行中 / 待办 / 暂停任务

## 当前版本状态

- 当前已发布稳定版本：`0.2.1`
- 下一版本：暂未定号，当前按“账单导入增强”推进
- 当前会话目标：建立主仓库 `design/` 设计工作台与开发态 `__design` 入口，并同步核心文档口径
- 首页、记账页、设置页主要持久化链路以 `0.2.1` 为当前稳定基线

## 当前阶段基线

- 首页与记账页主流程已稳定，设置页主要持久化链路已稳定
- 当前账单导入增强只动后端逻辑层、Facade 与调试测试入口，不改记账页表现层
- 表现层后续应基于“先 probe，再 import”的接口决定是否展示密码输入
- 浏览器开发态已具备真实样本回归能力，但 Android 文件选择器真机闭环尚未完成
- 主仓库已建立 `design/` 作为唯一设计工作台；后续 UI/UX 任务需先从 `design/briefs/active/` 发起
- 开发态 `__design` 已作为局部原型预览入口落地，正式产物不暴露该入口
- 两个历史参考子仓库已迁入 `.archive/submodules_2026-04-24/`，主仓库后续不再保留 submodule 依赖

## Release Changelog

### `0.2.1`

- 固化 Android release 构建链路，统一快捷入口为 `npm run build:release`
- 同步 `package.json`、Android 工程与设置页中的版本口径到 `0.2.1`
- 移除设置页底部硬编码版本信息，统一 release 签名验证与文档口径

### `0.2.0`

- 完成首页、记账页、设置页主流程集成，建立当前浏览器侧 UI 基线
- 完成持久化目录迁移，收口预算、记忆、分类运行态与账本目录结构
- 建立 `window.__MONI_DEBUG__ / window.__MONI_E2E__` 浏览器调试入口与 Playwright / MCP 页面验证链路
- 收口 Android 关键修复，包括账本创建写盘、软键盘稳定画布与主要页面布局问题

## 当前任务看板

| 任务 | 状态 | 说明 |
|------|------|------|
| 账单导入后端逻辑增强 | Done | 已支持直传文本 / CSV、直传 Excel、加密压缩包探测；先 `probe` 再 `import`；微信 `xls/xlsx -> csv` 自动转换；调试入口与后端回归测试已接入 |
| design 工作台落地 | Done | 已新增 `design/` 目录、brief / baseline / DDR 模板、示例 prototype 与开发态 `__design` 入口，并同步核心文档入口规则 |
| 账单导入 UI / UX 对接 | Pending | 后续由表现层根据 `probe` 结果决定是否弹密码输入、如何展示文件识别结果 |
| Android 文件选择器真机验收 | Pending | 当前只完成浏览器开发态与真实样本回归，尚未完成真机文件选择器闭环 |

## 当前优先级

1. 账单导入 UI / UX 对接
2. Android 文件选择器真机验收
3. 真实 LLM 回归
4. 控制台 404 噪音收敛
5. 下一版本号与 release 范围定义

## 当前阶段风险

- Android 文件选择器与解压密码输入的真机交互尚未验收，浏览器开发态结论不能直接替代 Android 真机结论
- 当前仍存在一组“可选文件不存在”的 `POST /api/fs 404` 浏览器开发态噪音，尚未完全收敛
- 引入 `xlsx` 与 `zip.js` 后，`npm run build` 仍会出现 chunk size warning
- 真实 LLM 配置下的学习 / 收编回归仍未完成

## 当前验证状态

- `2026-04-24`：`npm run typecheck` 通过
- `2026-04-24`：`npm run build` 通过，存在既有 chunk size warning
- `2026-04-24`：浏览器开发态执行 `window.__MONI_E2E__.tests.runBillImportBackendTest()` 通过
- 本轮账单导入后端回归覆盖结果：
  - 微信加密压缩包：未输密码返回 `password_required`，错误密码返回 `invalid`，正确密码后成功导入 `73` 条
  - 微信非压缩直传文本样本：无需密码，成功导入 `1` 条
  - 支付宝加密压缩包：正确密码后成功导入 `37` 条
  - 测试全程使用独立临时账本；结束后已删除临时账本，并恢复激活账本为 `日常开销`

## 当前已固定口径

- `ledgers/{ledger}/ai_prefs.json` 只承接账本级 AI 行为配置
- `ledgers/{ledger}/budget.json` 只承接预算配置
- `defined_categories` 是账本标签主数据单一信源
- 全局模型 / 提供方 / 主题 / 自述不进入 `ai_prefs.json`
- 正式运行时持久化统一写入 `Directory.Data`；`Directory.Documents` 仅作为历史迁移来源，不再作为正式落盘目标
- 顶层只保留全局文件：`ledgers.json / secure_config.bin / self_description.md / logs`
- 所有账本级文件统一收口到 `Directory.Data/ledgers/{ledger}/`
- 评委演示包当前固定口径：APK 随包携带由 `virtual_android_filesys/sandbox_path` 生成的 demo seed，原生首启仅在正式沙盒为空时自动导入，避免覆盖已有用户数据
- Android 安装打包链路已建成，可按当前工程状态随时产出安装包
- Release 快捷入口当前固定为 `npm run build:release`；标准流程为“编码完成 -> 改版本号 -> 构建 -> 提交代码与文档”
- Android App Icon 当前固定口径：以 `public/icon.svg` 为唯一信源，生成 launcher icon 时必须保持原图构图与装饰位置，不允许使用会导致错位/裁切的渲染链
- 分类运行态统一规划为 `ledgers/{ledger}/classify_runtime.json`，承载 `queue / enqueue_recovery / confirm_recovery`
- 分类消费顺序本轮收口为“最近日期优先”
- 单次分类会话当前默认最多消费 `3` 天；该值暂不暴露 UI，也不额外落盘到 `ai_prefs.json`
- `classify_runtime.json` 在工程行为上更接近“按天缓冲区”，但当前文档与代码命名继续沿用 queue 术语
- `data range` 只约束 AI 消费，不限制 dirtyDates 生产与日期入队
- 分类结果里的 `reasoning / ai_reasoning` 需限制在 `20` 个字以内，运行时仍做兜底截断
- 首页 AI 工作态对外接口当前固定为 `HomeAiEngineUiState.activeDates`，由 `BatchProcessor -> AppFacade -> MoniHome` 贯通，显示层只消费该字段决定哪些日期高亮
- Android 软键盘阶段当前固定口径：原生层不允许通过 `windowSoftInputMode` 改写 Activity 尺寸，Web 层再用 `--app-root-height` 锁定稳定画布高度
- 规格文档只维护目标口径，不再维护“代码/规格差异”与实现差距清单
- 浏览器调试入口和测试入口属于稳定工具链，索引写入 `README.md`，协议与记录写入 `docs/`
- UI/UX 设计源头当前固定为主仓库 `design/`；核心文档只保留入口，完整工作流与基线维护在 `design/`
- 开发态设计原型统一经由 `__design` 入口预览；prototype 只服务设计审查，不作为生产组件
- 浏览器开发态文件系统 mock 当前只保留 `Directory.Data -> virtual_android_filesys/sandbox_path`；旧的独立 `Documents_path` 已退出运行时路径
- 本项目语境中的端到端测试默认指 agent 通过 `Playwright MCP` 在浏览器开发态做自动化页面验证
- Playwright MCP 默认移动端测试视口以 `./.codex/playwright.mcp.json` 为准，当前为 `390 x 844`
- “一图一测试”只适用于浏览器侧 Playwright 页面验证，不等同于 Android 安装包人工验收
- 端到端测试仅在用户明确指令下开启
- 默认账本初始名称固定为 `日常开销`，且允许用户后续重命名
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

- 本轮已完成账单导入后端链路与浏览器开发态真实样本回归，记账页 UI / UX 尚未接入新接口
- 表现层后续应优先调用 `AppFacade.probeBillImportFiles()`，仅在返回 `password_required` 时再展示密码输入
- 后续若进入 release 收口，先明确下一版本号与 release 范围，再清理当前任务看板
- 每次 release 完成后，必须把已交付 feature 归并到 `Release Changelog`，并清理当前任务看板中的已完成项
- 旧的并行编排版 `CLAUDE.md` 已归档到 `.archive/CLAUDE_parallel_legacy_2026-04-09.md`
