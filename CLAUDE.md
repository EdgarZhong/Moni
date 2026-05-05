# CLAUDE.md

本文件记录当前版本迭代的任务看板、风险、优先级、交接状态与阶段性决策。

其中任务看板相关历史的保留规则固定为：

1. 已发布版本的 feature 历史统一收口到 `Release Changelog`
2. “当前任务看板”只保留当前版本迭代中的进行中 / 待办 / 暂停任务

## 当前版本状态

- 当前已发布稳定版本：`0.3.4`
- 下一版本：暂未定号
- 首页、记账页、设置页主要持久化链路以 `0.3.0` 为当前稳定基线

## 当前阶段基线

- 首页与记账页主流程已稳定，设置页主要持久化链路已稳定
- 当前账单导入增强已进入记账页表现层对接；入口仍保持现有两个按钮，不重做记账页表面结构
- 表现层已基于“先 probe，再 import”的接口决定是否展示密码输入；微信 / 支付宝两个按钮只传入不同 `expectedSource` 与对应密码文案
- 浏览器开发态已具备真实样本回归能力，但 Android 文件选择器真机闭环尚未完成
- 现行设计规格体系已切换为 `DESIGN_SPEC_SYSTEM.md -> docs/design/Moni_Brand_Identity.md -> docs/design/SURFACE_SYSTEM.md -> tailwind.config.js -> docs/* Page Spec`
- 新体系下，表现层规则分层收口为 Brand Identity / Surface System / Design Tokens / Page Spec；旧 `DESIGN.md`、旧主仓库 `design/` 工作台、`/__design` 入口、独立原型仓库工作流均退出现行规则链
- 表现层变更继续保持与业务逻辑层解耦，不得越过当前 `ui -> facade/read model` 边界
- 表现层变更必须先更新对应 `docs/` 规格文档，经确认后再修改代码；若实现中发现需要波及当前 design scope 外的组件，必须先报告并获授权

## Release Changelog

### `0.3.4`

- 新增账单导入图文指南页（`ImportGuidePage`），从记账页"查看导入指南"入口推入
  - 微信 / 支付宝双 Tab，分步截图 + 文字说明，帮助用户完成账单导出
  - 全屏覆盖（`position: fixed`），不共享全局 header，底部导航栏 z-index 提升至 300 确保中央按钮始终可见
  - 底部补充邮箱导出说明：支持直接选择导出到邮箱的加密压缩包，无需手动解压
- 确认微信账单支持直接导入 `.xls/.xlsx` 文件，无需密码
- `BottomNav` z-index 提升以修复二级页面覆盖时导航中央按钮被裁切问题

### `0.3.3`

- 设置页账本区全量重分类三段式链路完整落地
  - 先展示锁定条目供用户决定是否解锁；再做破坏性提交确认（分类重置 + 实例库清理 + 按天入队）；最后单独确认是否立即启动 AI 消费
  - 锁定列表条目可点击进入对应交易详情页
  - AI 运行中全量重分类入口正确禁用（`disabled` 条件从 `running` 改为 `starting || submitting`）
- "收入"作为默认普通分类加入分类体系；分类会话不再按收支预先拆流，退款 / 撤销场景不机械归为"收入"
- 统一用户备注输入口径：用户编辑的"说明 / 理由"统一写入 `user_note`，仅"改分类"自动锁定，改说明不锁
- 修复首页交易总数统计逻辑，确保与日期范围筛选结果一致

### `0.3.2`

- 首页 DateRangePicker 重构为草稿态 + 确认提交语义，轨道边界固定为账本真实数据范围，无交集场景通过 `isEmpty` 显式传递
- 快捷按钮区改为稳定网格布局，彻底消除切换时换行抖动
- AI 工作态不再用骨架遮挡当天后续真实流水
- 账本名切页跳变修复：`LedgerHeaderControl` + 下拉提升到 AppRoot 层常驻（`useLedgerControl` hook），消除所有页面切换时的账本名闪烁
- 刷新 / 重进应用默认范围改为"本月"：移除 `inferRangeModeFromDates` 反推逻辑，直接硬编码默认；`useMoniHomeData` 初始 `homeDateRange` 改为本月，消除首屏全量数据闪现
- `DateRangePicker` 刷新后快速来回跳（死循环级高 CPU）修复：`setHomeDateRange` 改为函数式 setState，从依赖移除 `homeDateRange`
- 字体资源（Nunito）统一上提到 `index.html`，消除切页字体闪烁
- `BottomNav` 从首页组件集拆出到独立文件 `BottomNav.tsx`，降低全局导航与首页组件的误伤范围

### `0.3.1`

- 完成首页拖拽细则面板与交易详情页重构，改进展开阈值、视觉对齐与交互流程
  - 拖拽细则面板展开阈值精准修复，消除动画污染与位移干扰
  - 交易详情页重构为新 Surface System 内容卡语法，优化信息布局与视觉层级
  - 详情页统一字体系统（Nunito / 系统无衬线 / Space Mono）与分类选择器样式
  - Header 简化移除重复副标题，状态指示改为锁 / 解锁 icon 切换
  - 拖拽面板与详情页统一标题、备注与分类来源文案口径
- Playwright MCP 固定复用系统 Chromium，移除浏览器下载依赖，完善开发态测试工具链

### `0.3.0`

- 完成账单导入完整链路（直传文本/CSV/Excel、加密压缩包探测与解压）
- 完成记账页 UI/UX 对接，微信/支付宝按钮统一走 `probeBillImportFiles()` 与 `importBillFiles()`
- 建立 `HomeAiEngineUiState.activeDates` 贯通链路（BatchProcessor → AppFacade → MoniHome）

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
| 账单导入 UI / UX 对接 | Done | 不重做记账页现有两个按钮入口；微信 / 支付宝按钮共用同一导入链路，仅区分 `expectedSource` 与压缩包密码文案；压缩包密码二级页与导入卡片底部提示条已接入正式页 |
| 账单导入指南页（ImportGuidePage）完成与接入 | Done | 收口到 `0.3.4`；微信 / 支付宝双 Tab 图文步骤，全屏覆盖不共享全局 header，BottomNav z-index 修复，底部邮箱导出补充说明 |
| Android 文件选择器真机验收 | Pending | 当前只完成浏览器开发态与真实样本回归，尚未完成真机文件选择器闭环 |
| 设计规格体系切换与核心文档收口 | Done | 新的四层设计规格体系已落地：`DESIGN_SPEC_SYSTEM.md` 为总入口，`docs/design/Moni_Brand_Identity.md` / `docs/design/SURFACE_SYSTEM.md` / `tailwind.config.js` 分别承接 Layer 0/1/2；核心文档中的旧设计系统残留口径已移除，现行规则入口已统一收口 |
| 首页拖拽细则面板与交易详情页规格收口 | Done | 拖拽面板展开阈值、详情页 Surface System 重构、字体收口、Header 简化、单一 `user_note` 编辑区、分类选择器圆角裁切等全部收口；`2026-05-04` 详情页视觉精修已由用户现场验证完成 |
| 首页现场 bug 修复收尾 | Done | 全部修复并收口到 `0.3.2`：DateRangePicker 草稿态、快捷按钮稳定网格、AI 骨架遮挡、data range 死循环、账本名切页跳变、刷新默认本月、首屏全量数据闪现 |
| 全量重分类链路对齐 | Done | 三段式链路、收入分类、user_note 口径、锁定列表详情跳转、AI 运行中禁用按钮均已收口到 `0.3.3` |
| 表现层稳定性收口（非性能向） | Pending | 字体上提与 `BottomNav` 拆分已完成（收口到 `0.3.2`）；剩余：`MoniHome` 按交互域拆分、根层 AI 控件独立状态链路 |

## 当前优先级

1. 表现层稳定性收口（剩余：`MoniHome` 按交互域拆分、根层 AI 控件独立状态链路）
2. Android 文件选择器真机验收

## 当前阶段风险

- Android 文件选择器与解压密码输入的真机交互尚未验收，浏览器开发态结论不能直接替代 Android 真机结论
- 引入 `xlsx` 与 `zip.js` 后，`npm run build` 仍会出现 chunk size warning

## 当前验证状态

- `2026-04-26`：`npm run typecheck` 通过
- `2026-04-26`：`npm run build` 通过，存在既有 chunk size warning
- `2026-04-26`：`Moni-UI-Prototype` 执行 `npm run typecheck`、`npm run build` 通过
- `2026-04-26`：Playwright 隔离 Chromium 以 `390 x 844` 视口打开 `http://127.0.0.1:5173/`，确认原型首页可渲染、console error 为 0，截图 `/tmp/moni-ui-prototype-smoke.png`
- `2026-04-26`：修正原型仓库表现层对齐问题；旧 JSX 手机边框版源码移入原型仓库 `.archive/legacy-js-prototype-2026-04-26/`；首页 fixture 改为主仓库 `window.__MONI_DEBUG__.home.getReadModel()` 导出快照；Playwright 对比主仓库与原型仓库首页、设置页、记账页、真实支付宝 zip 密码页，console error 为 0
- `2026-04-26`：主仓库旧 `design/` 工作台目录与 `src/ui/devtools/DesignWorkbench.tsx` 已移入 `.archive/design_workbench_2026-04-26/`；运行源码树仅保留正式应用入口与独立原型仓库文档索引
- `2026-04-26`：Playwright 打开 `http://127.0.0.1:5174/` 并进入记账页，确认“微信账单 / 支付宝账单”入口存在且 console error 为 0；未用 UI 真实上传样本，避免污染当前账本
- `2026-04-26`：Playwright 通过支付宝 zip 样本触发正式密码页，确认密码页覆盖层定位为整页、截图输出 `/tmp/moni-password-page-v3.png`；console 中仍有既有文件系统 404 噪音
- `2026-04-29`：`npm run typecheck` 通过
- `2026-04-29`：`npm run build` 通过，存在既有 chunk size warning
- `2026-04-29`：Playwright 以 `390 x 844` 视口打开 `http://127.0.0.1:4173/`，长按首页首条交易并下拖进入 `DragDetailPanel` 展开态；确认完整时间显示为“4月16日 17:23”，展开态仅展示交易细则，且手指位置 `y=770` 落在虚线驻留区 `y=702..842` 内；console 未出现新的 runtime error；截图 `drag-detail-expanded-main-v2.png`
- `2026-04-30`：`npm run typecheck` 通过
- `2026-04-30`：`npm run build` 通过，存在既有 chunk size warning
- `2026-05-03`：`npm run typecheck` 通过
- `2026-05-03`：`npm run build` 通过，存在既有 chunk size warning
- `2026-05-03`：本机已验证 `timeout 5s npx -y @playwright/mcp@latest --browser chrome --executable-path /usr/bin/chromium-browser --headless --port 39001` 可正常监听；随后以统一配置链 `timeout 5s npx -y @playwright/mcp@latest --config .codex/playwright.mcp.json --caps vision --port 39002` 复验通过，确认当前可免下载复用系统 Chromium 启动 Playwright MCP
- `2026-05-03`：Playwright 以 `390 x 844` 视口打开 `http://127.0.0.1:5173/`，切到“全部”时间范围后进入 `4月24日` 首条交易详情；确认 Header 已简化为单行“交易详情”，分类选择器圆角裁切完整、字体跟随 `font-brand`，详情页只保留单一 `user_note` 输入区；截图 `test-img/transaction-detail-page-v3.png`、`test-img/transaction-detail-category-modal-v3.png`；console error 为 0
- `2026-05-04`：`npm run typecheck` 通过
- `2026-05-04`：`npm run build` 通过，存在既有 chunk size warning
- `2026-05-04`：针对首页近期修复再次执行 `npm run typecheck` 通过；已静态确认三项修复生效：1）底部导航 AI 流光改为跨页复用旧版视觉参数；2）`DateRangePicker` 会话态恢复后不再出现刷新即快速跳变的死循环级高占用；3）AI 工作态高亮日卡不再用骨架遮挡当天后续真实流水
- `2026-05-04`：用户现场确认三项已修复：data range 死循环快速跳、AI 工作态骨架遮挡真实流水、全量重分类按钮灰掉；账本名跳变与默认本月两项在本轮重新实现：共享 header 提到 `AppRoot`（`useLedgerControl` + 新共享 header 块），默认本月修复（`dataRange` 未加载前不提交范围至 facade）；交集过滤经代码 review 确认已正确实现
- `2026-04-30`：Playwright 以 `390 x 844` 视口打开 `http://127.0.0.1:4175/`，执行新增浏览器调试测试 `window.__MONI_E2E__.tests.runClassifyLockBoundaryTest()`；测试在独立临时账本 `分类锁定测试账本_*` 中通过，确认三件事：已入队日期的 `days[]` 会注入完整消费交易上下文（包含锁定条目）、System Prompt 已包含 exact-ID 强锚点与同一消费事件联动提示、运行中锁定条目可挡住 AI 自动写回且被用户勾选后可解锁并成功入队重分类
- `2026-04-30`：Playwright 以 `390 x 844` 视口打开 `http://127.0.0.1:5173/`，直接使用首页现成数据中的“西北工业大学云餐便利店”条目做长按拖拽；确认长按停在原位时仍保持 Collapsed、未提前出现“停留看细则”，向下拖到 `y=792` 后进入 Expanded，驻留区虚线框为主题青色 `rgb(78, 205, 196)`，分类区与详情面板仅共享同一位移量，且 `其他` 分类卡宽度回到与其他卡一致的半宽两列布局；console 未出现新的 runtime error；截图 `test-img/drag-panel-collapsed-stable.png`、`test-img/drag-panel-expanded-cyan-zone.png`
- `2026-04-30`：拖拽细则面板展开阈值已切换为父层固定分界线，按 `viewportHeight - collapsedVisibleHeight` 计算；Playwright 在 `390 x 844` 视口下复验首页首条条目，确认长按原位仍保持 Collapsed，边界点 `y=743` 不展开、`y=744` 开始展开，判定线不再受子组件进场动画与 Expanded 位移污染
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
- 首页 `DateRangePicker` 的快捷范围继续按系统当前时间计算；但滑块轨道 `MIN/MAX` 必须始终固定为账本真实数据范围；滑块 thumb 的显示位置取“快捷范围与账本范围的交集”，无交集时仅在边界贴边显示；真正提交给首页过滤与 AI 消费的是该交集，若无交集则显式传递空区间，不能再折叠成账本边界日
- 分类结果里的 `reasoning / ai_reasoning` 需限制在 `20` 个字以内，运行时仍做兜底截断
- `is_verified` 当前固定语义为“自动化链路级冻结”：生产端默认不以锁定条目生成 dirtyDates，但消费端对已入队日期仍向 AI 注入完整消费交易上下文；锁定保护独立于 `USER > RULE_ENGINE > AI_AGENT` 提案优先级，并要求最终写回前基于最新记录再次校验
- 分类 System Prompt 当前固定增强两条启发：`reference_corrections` 与 `days[]` 的 exact-ID 命中视为强锚点；同一时间段、同场景的多笔交易应先按同一消费事件联合判断，再决定是否同类
- 分类会话当前固定不按 `direction` 预先拆成“仅支出”或“仅收入”两路；收入条目也必须进入同一分类会话，否则退款、撤销、逆向冲回等场景会被错误预过滤。若用户没有额外要求，真实入账可优先归为“收入”；但退款不默认算“收入”，仍需结合原消费语义判断
- `收入` 当前固定作为默认普通标签加入分类体系，但与其他普通标签完全一致：允许用户改名、细分、删除；只有 `其他` 继续是系统兜底项，`uncategorized` 继续只属于显示 / 运行态，不进入 `defined_categories`
- 交易原始 `remark` 当前固定只读展示；用户可编辑的只有“说明 / 理由”，统一写入 `user_note`。仅“改分类”自动锁定，改说明 / 理由不自动锁
- 设置页账本区“全量重分类”当前固定为三段式渐进式确认：先展示锁定条目列表供用户决定是否解锁；真正执行解锁、分类字段重置、实例库清理与 dirtyDates 入队前，必须再做一次显式破坏性提交确认；数据提交完成后，是否正式通知引擎开始消费，必须由用户再次明确确认；提交前用户可随时取消，系统不得提前动数据
- 首页 AI 工作态对外接口当前固定为 `HomeAiEngineUiState.activeDates`，由 `BatchProcessor -> AppFacade -> MoniHome` 贯通，显示层只消费该字段决定哪些日期高亮
- Android 软键盘阶段当前固定口径：原生层不允许通过 `windowSoftInputMode` 改写 Activity 尺寸，Web 层再用 `--app-root-height` 锁定稳定画布高度
- 规格文档只维护目标口径，不再维护“代码/规格差异”与实现差距清单
- 浏览器调试入口和测试入口属于稳定工具链，索引写入 `README.md`，协议与记录写入 `docs/`
- UI/UX 设计与实现当前统一在主仓库内完成；现行规则入口固定为 `DESIGN_SPEC_SYSTEM.md` 及其指向的 Layer 0/1/2/3 文档
- 账单导入入口当前固定为记账页现有“微信账单 / 支付宝账单”两个按钮，不新增导入舱或重做表面结构
- 账单导入两个按钮的实现差异仅为 `expectedSource` 与平台化密码提示文案，后续统一走 `probeBillImportFiles()` 与 `importBillFiles()`
- 记账一级页中的账单解析中、导入中、导入成功提示统一复用导入卡片底部提示条；这些提示出现时，默认“查看导入指南”提示需要让位
- 浏览器开发态文件系统 mock 当前只保留 `Directory.Data -> virtual_android_filesys/sandbox_path`；旧的独立 `Documents_path` 已退出运行时路径
- 本项目语境中的端到端测试默认指 agent 通过 `Playwright MCP` 在浏览器开发态做自动化页面验证
- Playwright MCP 默认移动端测试视口以 `./.codex/playwright.mcp.json` 为准，当前为 `390 x 844`
- “e2e测试”只适用于浏览器侧 Playwright 页面验证，不等同于 Android 安装包人工验收
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

- 本轮已完成账单导入后端链路与浏览器开发态真实样本回归，记账页 UI / UX 已开始接入新接口
- 表现层当前已调用 `AppFacade.probeBillImportFiles()`，仅在返回 `password_required` 时展示对应平台密码输入
- 后续若进入 release 收口，先明确下一版本号与 release 范围，再清理当前任务看板
- 每次 release 完成后，必须把已交付 feature 归并到 `Release Changelog`，并清理当前任务看板中的已完成项
- 旧的并行编排版 `CLAUDE.md` 已归档到 `.archive/CLAUDE_parallel_legacy_2026-04-09.md`
