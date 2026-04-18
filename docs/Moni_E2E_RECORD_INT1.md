# Moni 浏览器调试入口与 MCP 验证记录

## 0. 文档定位

本文档用于沉淀 Moni 在浏览器开发环境下的两类信息：

1. 开发态浏览器调试入口的稳定协议
2. 基于 Codex MCP + Playwright MCP 的首轮验证记录

本文档不是总规则文档。  
开发测试 MSOP 作为全局规则，归 `AGENTS.md` 管理；本文档只负责记录当前浏览器调试入口长什么样、怎么用、首轮实际验证到了什么程度。

当前口径补充：

- 本项目语境中的 `E2E` 默认指 agent 通过 `Playwright MCP` 在浏览器开发态执行自动化页面验证
- Android 安装包验证属于真机人工验收，不与这里的浏览器 E2E 混称

## 0.1 当前默认测试画像

- 自动化工具：`Playwright MCP`
- 运行环境：浏览器开发态页面
- 默认移动端视口：以 `./.codex/playwright.mcp.json` 为准，当前为 `390 x 844`
- 默认流程：先调 `window.__MONI_E2E__` 或 `window.__MONI_DEBUG__` 准备数据，再执行页面交互，再截图，再复核 console
- “一图一测试”定义：每个关键页面或关键状态至少保留一张截图，并与对应断言、检查项或结构化测试结果成对记录
- 若因专项问题需要切换视口，必须在记录中注明实际尺寸与切换原因

## 1. 当前稳定调试入口

### 1.1 `window.__MONI_DEBUG__`

该入口面向“精确操控系统”，用于在没有完整 UI 的情况下直接验证逻辑后端链路。

当前已落地的能力：

- `env.ping()`
- `env.getRuntimeInfo()`
- `ledger.list() / getActive() / switch() / create() / rename() / delete() / snapshot()`
- `manualEntry.add() / delete() / listRecent()`
- `budget.getConfig() / setMonthly() / clearMonthly() / setCategoryBudgets() / clearCategoryBudgets() / getSummary()`
- `classify.getQueue() / enqueueDate() / peek()`
- `prefs.get() / update()`
- `learning.getDeltaPayload() / getAutoTriggerState()`
- `home.getReadModel()`

### 1.2 `window.__MONI_E2E__`

该入口面向“标准测试编排”，返回结构化测试报告，方便 Playwright / MCP 自动读取结果，而不是只能读 console 文本。

当前已落地的能力：

- `tests.runLedgerCrudTest()`
- `tests.runManualEntryFlowTest()`
- `tests.runBudgetFlowTest()`
- `tests.runExampleStoreSpecTest()`
- `tests.runLearningPayloadSpecTest()`
- `tests.runLearningAutomationSpecTest()`
- `tests.runCompressionSpecTest()`
- `tests.runHomeReadModelSmokeTest()`

### 1.3 当前已完成的首批逻辑链路验收

已通过浏览器调试入口 + Playwright MCP 实际跑通：

- 账本 CRUD 逻辑链路
- 随手记增删 + ExampleStore 联动 + 首页读模型映射
- 预算配置读写 + 预算统计 + 首页预算卡读模型
- 实例库 v7 运行时注入字段 + 手记 D 类映射规格
- 学习阶段 delta / full_reconcile payload v7 rich schema
- 自动学习偏好配置与真实触发判定
- 收编配置、上下文构造与结果上限校验

当前状态：

- 三条核心测试返回 `ok: true`
- 测试执行后 browser console 无新增 `error`
- 调试临时账本会自动清理，不污染当前人工测试账本

### 1.3 返回值约定

标准测试统一返回：

```ts
{
  ok: boolean,
  test: string,
  steps: Array<{
    name: string,
    ok: boolean,
    detail?: string,
    actual?: unknown
  }>,
  context?: Record<string, unknown>
}
```

这样 MCP 可以直接：

1. 在 console 调用测试
2. 读取结构化结果
3. 判断 `ok`
4. 再继续做页面截图和交互验证

## 2. 核心逻辑链路怎么测

### 2.1 账本 CRUD

使用：

```js
await window.__MONI_E2E__.tests.runLedgerCrudTest()
```

当前覆盖：

- 创建账本
- 创建后列表联动
- 创建后当前激活账本切换
- 生成一条真实样本，确保实例库主文件与变更日志文件落盘
- 账本重命名
- 重命名后快照目录、`classify_examples/{ledger}.json`、`classify_example_changes/{ledger}.json` 一起迁移
- 重命名后列表联动
- 删除账本
- 删除后快照目录、实例库主文件、实例库变更日志一起清理
- 删除后列表清理

### 2.2 随手记系统

使用：

```js
await window.__MONI_E2E__.tests.runManualEntryFlowTest()
```

当前覆盖：

- 创建独立测试账本
- 插入一条 `sourceType = manual` 的随手记记录
- 校验内存态字段：`user_category / user_note / sourceType`
- 校验 ExampleStore 联动写入
- 校验首页读模型中的 `sourceLabel / userNote`
- 删除随手记
- 校验 ExampleStore 联动删除

### 2.3 预算系统

使用：

```js
await window.__MONI_E2E__.tests.runBudgetFlowTest()
```

当前覆盖：

- 创建独立测试账本
- 通过随手记准备真实支出数据
- 写入月预算
- 写入分类预算
- 校验预算配置落盘结果
- 校验月预算 summary
- 校验分类预算 summary
- 校验首页 budget facade 读模型
- 清空预算配置

### 2.4 实例库 v7 / 手记映射规格

使用：

```js
await window.__MONI_E2E__.tests.runExampleStoreSpecTest()
```

当前覆盖：

- D 类手记样本写入实例库字段映射
- B 类错误案例写入实例库并参与运行时检索
- 运行时 `reference_corrections` 不再带 `created_at`
- B 区块保留并前缀化 `ai_category / ai_reasoning`
- A+C+D 区块去掉 `ai_category`
- A+C+D 区块保留 `ai_reasoning / rawClass / paymentMethod / transactionStatus / remark`

### 2.5 学习 payload v7 rich schema

使用：

```js
await window.__MONI_E2E__.tests.runLearningPayloadSpecTest()
```

当前覆盖：

- 学习阶段 payload 使用 `mode: "delta"` 与 `from_revision / to_revision`
- `upserts` 与 `deletions` 同时输出
- rich schema 包含 `rawClass / paymentMethod / transactionStatus / remark / ai_category / is_verified`
- 学习 payload 不带 `created_at`
- `full_reconcile` 使用 `current_examples`，不再使用旧的 `all_examples`

### 2.6 收编配置与上下文规格

使用：

```js
await window.__MONI_E2E__.tests.runCompressionSpecTest()
```

当前覆盖：

- `ledger_prefs/{ledger}.json` 可保存 `compression.threshold / compression.ratio`
- 收编上下文从统一账本行为配置读取阈值与比例
- `targetCount = floor(currentCount * 0.7)`
- 收编上下文必须注入当前实例库全量
- 结果校验会拒绝超过 `targetCount` 的输出，避免脏写 `ai_compress` 快照

### 2.7 首页读模型

使用：

```js
await window.__MONI_E2E__.tests.runHomeReadModelSmokeTest()
```

当前覆盖：

- 当前账本
- 按天流水
- 趋势窗口基础结构

## 3. MCP 联调用法

标准顺序：

1. Playwright 打开页面
2. 通过 console 调 `window.__MONI_E2E__` 运行逻辑测试
3. 判断返回结构中的 `ok`
4. 再做页面截图
5. 再做点击、切换、过滤、滚动等交互验证
6. 最后复核 console

这套顺序的目的，是先把“后端逻辑链路”与“页面表现问题”拆开。

## 4. 首轮页面验证记录
以下部分保留本次会话首轮 MCP 页面试跑记录，作为当前阶段样本。

## 4.1 前置条件

### 1.1 环境要求

- 本地已安装 `@playwright/test`
- 本地已执行 `npx playwright install chromium`
- Codex 已加载项目级 `.codex/config.toml`
- `playwright` MCP 当前使用 `chromium`

### 1.2 启动要求

- 在仓库根目录启动开发服务器：`npm run dev`
- 首页地址为：`http://127.0.0.1:5173/`
- 浏览器 MCP 可正常打开页面

### 1.3 当前已知限制

- 当前仓库已经暴露 `window.__MONI_DEBUG__ / window.__MONI_E2E__`
- 因此推荐先跑 console 侧结构化逻辑测试，再做页面操作、截图和交互验证
- Android Capacitor 的文件权限、重启持久化、设备能力仍需单独验收

## 4.2 页面验证目标

本轮首页 E2E 重点覆盖以下链路：

1. 首页可稳定打开
2. 账本切换可用
3. Date Range Picker 快捷项可驱动首页聚合数据联动
4. 统计栏、分类概览、按天流水能跟随时间范围变化
5. 分类过滤可驱动流水过滤，并在非“全部”视图下隐藏分类标签
6. 浏览器 console 无新的致命错误
7. 关键页面状态可通过截图沉淀为对照基线

## 4.3 页面验证步骤

### 3.1 基线采集

1. 使用 Playwright MCP 打开 `http://127.0.0.1:5173/`
2. 采集首页首屏截图
3. 读取当前导航后的 console 消息
4. 记录是否存在：
   - runtime error
   - React hook error
   - `/api/fs` 404 噪音
   - 未捕获 promise 异常

建议产物：

- 首页首屏截图
- 当前导航生成的 console 日志文件
- 当前页面 accessibility snapshot

### 3.2 首页默认态检查

检查项：

1. Logo 正常显示
2. 账本选择器可见
3. 顶部看板可见
4. 提示卡可见或符合空态逻辑
5. 统计栏可见
6. 分类概览卡可见
7. 分类轨道可见
8. 按天流水区可见，若当前范围无数据则允许出现空提示

### 3.3 时间范围验证

步骤：

1. 点击分类概览卡右上角时间范围入口
2. 依次验证快捷项：
   - `今天`
   - `本周`
   - `本月`
   - `近三月`
   - `全部`
3. 每次切换后等待页面稳定，再检查：
   - 统计栏范围文案是否变化
   - 支出 / 收入 / 笔数是否联动
   - 分类概览是否联动
   - 按天流水是否联动

### 3.4 账本切换验证

步骤：

1. 打开 Header 账本选择器
2. 在至少两个账本间切换
3. 切换后检查：
   - 当前账本名已更新
   - 时间范围已按当前账本数据边界重新计算
   - 统计栏与列表发生切换
   - 不出现白屏或死循环

### 3.5 分类过滤验证

步骤：

1. 在存在数据的范围下，点击 `全部`
2. 点击 `未分类`
3. 点击任一具体分类，例如 `正餐` / `购物`
4. 检查：
   - 列表是否只保留对应分类结果
   - 非“全部”视图下，流水卡片是否隐藏分类标签
   - 按天汇总文案是否与过滤结果一致

### 3.6 手记展示验证

当前执行方式：

1. 在页面文本中搜索 `随手记`、`手动记录`
2. 若存在手记条目，则核对：
   - 主标题优先使用 `product`
   - 来源 badge 正确显示“随手记”
   - 说明槽位显示 `user_note`
   - 支付来源显示“手动记录”

若当前测试账本未出现手记条目，则记录为“本次样本未覆盖”，不直接判失败。

### 3.7 Console 复核

在关键步骤后重新抓取 console，重点看：

1. 是否出现新的 runtime error
2. 是否出现 React Hook 顺序错误
3. 是否出现大量重复日志，提示可能存在更新环
4. 是否有切换账本 / 切换范围后触发的异常

## 5. 本轮实测记录

实测时间：`2026-04-08`  
实测地址：`http://127.0.0.1:5173/`

### 4.1 本轮成功项

1. MCP 已可打开页面并完成截图
2. 可读取 browser console
3. 可直接操作账本切换
4. 可打开 Date Range Picker
5. `全部` 范围切换后，首页统计、分类概览、按天流水成功联动
6. `未分类` 过滤可用，且流水卡片中的分类 badge 在该视图下已隐藏

### 4.2 本轮观测到的页面事实

1. 默认打开 `日常开销` 账本时，`本月` 范围下首页为空态
2. 切换到 `全部` 后，首页出现完整真实数据
3. 切到 `测试` 账本后，`本月` 范围为空态，切到 `全部` 后可看到大量未分类流水
4. 当前页面未暴露 `window.__MONI_E2E__`
5. 当前视口样本中未命中 `随手记 / 手动记录` 条目，因此手记首页展示链路尚未通过浏览器样本直接验证

### 4.3 本轮取证文件

- `.codex/artifacts/playwright/console-2026-04-08T15-42-01-225Z.log`
- `.codex/artifacts/playwright/page-2026-04-08T15-42-01-504Z.yml`
- `moni-home-fresh.png`
- `moni-home-all-range.png`
- `moni-home-test-all-range.png`
- `moni-home-test-uncategorized.png`

## 5.4 本轮控制台逻辑测试结果补充

后续补充实测：

- `window.__MONI_E2E__.tests.runLedgerCrudTest()`：通过
- `window.__MONI_E2E__.tests.runManualEntryFlowTest()`：通过
- `window.__MONI_E2E__.tests.runBudgetFlowTest()`：通过

补充结论：

- 账本测试最初暴露了“测试账本名含连字符不合法”的测试脚本问题，已修正为下划线命名
- 测试过程进一步暴露了账本删除/重命名时的 404 / 500 清理噪音，已通过“删除前 stat 探测 + 快照目录手动递归清理”收敛
- 当前三条核心逻辑测试在浏览器中运行后，console 已可保持 `Errors: 0`

## 6. 当前缺口与下一步建议

1. 补更多逻辑测试场景，例如分类管理、队列恢复、记忆学习快照验证
2. 增加可稳定命中手记条目的测试账本样本，补齐首页手记展示验证
3. 为 console 检查补一份“仅当前导航”的过滤脚本，避免旧日志干扰判断
4. 在 Android Capacitor 真环境复跑同一套页面验证流程，补文件系统、权限、重启持久化验收

## 7. 2026-04-18 UI 修复回归记录

实测时间：`2026-04-18`  
实测地址：`http://127.0.0.1:4173/`  
实测视口：`390 x 844`  
对应版本：`0.2.0`

### 7.1 本轮页面验证结论

1. 首页首屏已铺满画布，截图中未再出现顶部或底部黑边
2. 首页 Header 与记账页 Header 已统一为同一套安全区上边距、标题行高度与账本胶囊样式
3. 设置页底部导航已去除蓝色选中遮罩，视觉语言与首页、记账页一致
4. 记账页首屏已可直接看到“记一笔”按钮，无需下滚
5. 长按“记一笔”按钮后，分类蒙层可正常出现；拖到分类后松手，记账表单可正常弹出
6. 页面浏览与交互阶段 console 未出现新的 runtime error 或 Hook 错误

### 7.2 本轮截图取证

- `moni-home-0.2.0.png`
- `moni-entry-0.2.0.png`
- `moni-settings-0.2.0.png`

### 7.3 本轮逻辑回归结果

通过 `window.__MONI_E2E__` 执行：

1. `runHomeReadModelSmokeTest()`：通过
2. `runManualEntryFlowTest()`：通过
3. `runBudgetFlowTest()`：通过

### 7.4 本轮控制台补充说明

1. 页面浏览阶段 console 为 `Errors: 0 / Warnings: 0`
2. 调用 `runManualEntryFlowTest()` 与 `runBudgetFlowTest()` 清理临时账本时，仍会出现一组已知 `POST /api/fs 404` 与 `[MockFS] API Call Failed (delete)` 噪音
3. 这组噪音来自“删除可选分类运行态文件时文件本就不存在”的清理路径，不影响本轮测试结果；它与 `CLAUDE.md` 中仍未关闭的“可选文件不存在 404 噪音”是同一已知问题

### 7.5 本轮未覆盖项

1. Android 真机安全区、原生 WebView 容器与触摸语义仍未在安装包中复核
2. `pointercancel` 修复已通过代码审查和浏览器交互链路验证，但尚未在 Android 原生触摸环境下再次确认
3. 真实 LLM 配置下的学习 / 收编回写未纳入本轮范围

### 7.6 本轮补充口径收敛

1. 首页与记账页右上角账本选择器已收口为同一共享组件，浏览器实测矩形一致：
   - 首页：`left=242 / width=132 / height=34`
   - 记账页：`left=242 / width=132 / height=34`
2. 设置页右上角“设置”已恢复为普通标题文本，实测 `background=transparent / border=0 / boxShadow=none`
3. 趋势看板不再是“无论划多远都只跳 1 天”：
   - 在首页趋势图上横向左拖约 `120px` 后，窗口从 `04-12 ~ 04-18` 变为 `04-09 ~ 04-15`
   - 当前交互口径是“按拖拽距离折算日期偏移”，属于连续跨天滑动
4. 首页 AI 高亮口径已补正式接口：
   - 引擎层通过 `AIProgress.currentDates`
   - facade 读模型通过 `HomeAiEngineUiState.activeDates`
   - 显示层只消费 `activeDates` 决定哪些日期卡片亮起
5. 本轮浏览器样本下首页读模型处于 `paused`，因此 `activeDates=[]`；字段形状已在调试入口返回结果中确认，但仍需等 Android 真机或真实运行态再补一次“运行中多日高亮”实测

### 7.7 Android 真机问题本轮代码修复补记

1. 针对“Android 真机无法新建账本”，本轮已在 native 持久化链路补上递归写盘：
   - `writeMemoryFile()` 现在对 `ledgers/{ledger}/ledger.json` 使用 `recursive: true`
   - 这意味着首次创建账本时，会一并创建缺失的账本目录，而不再依赖目录预先存在
2. 针对“输入框唤起虚拟键盘后底部导航被顶起”，本轮已同时从原生层和 Web 层收口：
   - Android `Activity` 已固定 `windowSoftInputMode="stateHidden|adjustNothing"`
   - Web 根层新增 `--app-root-height`，在原生环境下锁定键盘弹出前的稳定画布高度
   - 页面级手机画布高度口径已统一改为 `var(--app-root-height)`
3. 浏览器开发态补充回归：
   - `window.__MONI_E2E__.tests.runLedgerCrudTest()`：通过
   - 账本创建、改名、删除、实例库迁移、账本行为配置迁移均通过
4. 本轮 console 复核结果：
   - 未出现新增 runtime/hook 异常
   - 仍有已知 `POST /api/fs 404` 与 `[MockFS] API Call Failed (delete)` 清理噪音，属于旧问题
5. 本轮仍未覆盖项：
   - 尚未在 Android 真机重新执行“新建账本 + 弹起键盘 + 输入表单 + 关闭键盘”完整回归
   - 因此当前结论是“代码修复已落地，浏览器链路回归通过，真机待复测”
