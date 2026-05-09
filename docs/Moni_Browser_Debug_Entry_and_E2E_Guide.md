# Moni 浏览器调试入口与 E2E 指南

## 0. 文档定位

本文档用于沉淀 Moni 在浏览器开发环境下的两类稳定信息：

1. 开发态浏览器调试入口的固定协议
2. 基于 Codex MCP + Playwright MCP 的当前验证口径与已通过链路

详细的历史页面验证记录、回归样本和阶段性取证，已拆分归档到 `docs/done/Moni_E2E_RECORD_INT1_history.md`。

本文档不是总规则文档。开发测试 MSOP 仍归 `AGENTS.md` 管理；这里仅保留当前能稳定复用的入口和验证摘要。

当前口径补充：

- 本项目语境中的 `E2E` 默认指 agent 通过 `Playwright MCP` 在浏览器开发态执行自动化页面验证
- Android 安装包验证属于真机人工验收，不与这里的浏览器 E2E 混称

## 0.1 当前默认测试画像

- 自动化工具：`Playwright MCP`
- 运行环境：浏览器开发态页面
- 默认移动端视口：以 `./.codex/playwright.mcp.json` 为准，当前为 `390 x 844`
- 默认浏览器来源：系统 Chromium，当前固定路径为 `/usr/bin/chromium-browser`
- 默认流程：先调 `window.__MONI_E2E__` 或 `window.__MONI_DEBUG__` 准备数据，再执行页面交互，再截图，再复核 console
- `e2e测试` 的最低交付要求：关键页面或关键状态至少保留一张截图，并与对应断言、检查项或结构化测试结果成对记录
- 若因专项问题需要切换视口，必须在记录中注明实际尺寸与切换原因

## 0.2 Playwright MCP 本地浏览器基线

当前仓库已把 Playwright MCP 的浏览器配置固定为：

- 单一信源：`./.codex/playwright.mcp.json`
- 浏览器二进制：`/usr/bin/chromium-browser`
- 启动入口：`./.codex/config.toml` 中的 `playwright` MCP server 只负责转发到上述配置文件

这样做的原因：

- 避免每次新 worktree / 新会话都依赖 `playwright install` 或 `chrome-for-testing` 下载浏览器
- 避免项目级 `.codex/config.toml` 和 `./.codex/playwright.mcp.json` 同时各写一套浏览器参数，导致口径漂移
- 让 `AGENTS.md` / `README.md` 中约定的默认移动端视口真正只维护在一处

当前固定约束：

- 若系统 Chromium 路径变更，优先修改 `./.codex/playwright.mcp.json` 的 `launchOptions.executablePath`
- 若本机只存在 `/snap/bin/chromium` 而不存在 `/usr/bin/chromium-browser`，必须显式更新配置后再继续使用
- 首次启动仍可能通过 `npx` 下载 `@playwright/mcp` npm 包本身，但不会再额外下载浏览器二进制

## 1. 当前稳定调试入口

### 1.1 `window.__MONI_DEBUG__`

该入口面向“精确操控系统”，用于在没有完整 UI 的情况下直接验证逻辑链路。

当前已落地的能力：

- `env.ping()`
- `env.getRuntimeInfo()`
- `ledger.list() / getActive() / switch() / create() / rename() / delete() / snapshot()`
- `manualEntry.add() / delete() / listRecent()`
- `budget.getConfig() / setMonthly() / clearMonthly() / setCategoryBudgets() / clearCategoryBudgets() / getSummary()`
- `classify.getQueue() / getIndex() / enqueueDate() / peek() / rebuild()`
- `prefs.get() / update()`
- `learning.getDeltaPayload() / getAutoTriggerState()`
- `home.getReadModel()`
- `billImport.probe() / import()`

### 1.2 `window.__MONI_E2E__`

该入口面向“标准测试编排”，返回结构化测试报告，方便 Playwright / MCP 自动读取结果，而不是只能读 console 文本。

当前已落地的能力：

- `tests.runLedgerCrudTest()`
- `tests.runManualEntryFlowTest()`
- `tests.runBudgetFlowTest()`
- `tests.runExampleStoreSpecTest()`
- `tests.runLearningPayloadSpecTest()`
- `tests.runLearningAutomationSpecTest()`
- `tests.runPreLearningBeforeProcessingTest()`
- `tests.runCompressionSpecTest()`
- `tests.runHomeReadModelSmokeTest()`
- `tests.runBillImportBackendTest()`
- `tests.runClassifyIndexIncrementalTest()`
- `tests.runClassifyLockBoundaryTest()`

### 1.3 当前已通过的稳定链路

已在浏览器开发态通过的稳定链路：

- 账本 CRUD
- 随手记增删 + ExampleStore 联动 + 首页读模型映射
- 预算配置读写 + 预算统计 + 首页预算卡读模型
- 实例库 v7 运行时注入字段 + 手记 D 类映射规格
- 学习阶段 delta / full_reconcile payload 最新 rich schema（含 `recent_examples` 与弱证据标记）
- 自动学习偏好配置与真实触发判定
- 用户开启分类时“存在未学习实例则先学习再分类”的前置编排
- 收编配置、上下文构造与结果上限校验
- 账单导入后端探测、密码判定、压缩包解压、微信 Excel 转 CSV 与真实账本导入

## 2. 当前验证顺序

标准顺序仍然是：

1. Playwright 打开页面
2. 通过 console 调 `window.__MONI_E2E__` 运行逻辑测试
3. 判断返回结构中的 `ok`
4. 再做页面截图
5. 再做点击、切换、过滤、滚动等交互验证
6. 最后复核 console

这套顺序的目的，是先把“后端逻辑链路”与“页面表现问题”拆开。

## 3. 当前已知限制

- 浏览器开发态可以稳定覆盖大部分逻辑和交互，但不能等价替代 Android 真机验收
- Android Capacitor 的文件权限、重启持久化、设备能力仍需单独验证
- 若后续新增新的结构化测试入口，需要同步更新这里的入口索引和 `README.md` 的稳定入口索引
