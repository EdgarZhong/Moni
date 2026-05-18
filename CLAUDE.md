# CLAUDE.md

本文件记录当前版本迭代的任务看板、风险、优先级、交接状态与阶段性决策。

其中任务看板相关历史的保留规则固定为：

1. 已发布版本的 feature 历史统一收口到 `Release Changelog`
2. “当前任务看板”只保留当前版本迭代中的进行中 / 待办 / 暂停任务

## 当前版本状态

- 当前已发布稳定版本：`0.4.3`
- 下一版本：版本号待定；当前阶段主题为”第二轮自学习系统改进 + 表现层扩展”
- 本轮实施文档：`docs/自学习系统改进变更_v1.2.md`
- 首页、记账页、设置页主要持久化链路以 `0.4.3` 为当前稳定基线

## 阶段基线

- `0.4.1` release 已完成，本轮阶段已结束；当前只保留 release 后的稳定状态与后续待办
- 首页、记账页、设置页的主流程与二级层口径收口，已归并进 `Release Changelog`
下一个阶段开始重新维护。

## 阶段决策

- 本轮阶段按 `0.4.0 -> 0.4.1` 两个 release 里程碑收口：`0.4.0` 完成自学习系统第一轮低成本精度优化，`0.4.1` 收口顶部提示与首页情景提示系统
- 现有设计规格体系与页面规格路径统一收口到 `docs/design/spec/`
- 当前任务优先级列表允许跨阶段并存；凡未完成事项，即使已推后或不属于本轮主线，也不得从优先级追踪中移除
- AI 自学习系统第一轮优化中的“推理 / 思考模式基础设施”按供应商分别实现：`DeepSeek` 走 `thinking / reasoning_effort`，`SiliconFlow` 继续保留 `thinking_budget / enable_thinking`；前端页面骨架继续复用现有设置页，只接读模型和内容，不重做页面
下一个阶段开始重新维护。

## 进度同步

- 本轮阶段内已确认的页面语义、真机反馈与字体口径，全部已迁移到 `Release Changelog` 或当前任务看板，不再保留阶段流水
- 自学习相关文档当前分工固定为：`docs/AI_SELF_LEARNING_DESIGN_v8.md` 负责长期目标规格，`docs/自学习系统改进变更_v0.3.md` 负责本轮低成本精度优化实施项
- 当前只维护尚未结束的修复项与后续排查项
下一个阶段开始重新维护。
- 2026-05-10 口径收敛：本轮首页 UI 表现层收口改以“新用户无首次引导直达空首页”的上手路径为主线；中部情景提示卡优先承接 onboarding 顺序，自学习过程态反馈统一走顶部提示，不混入中部卡片。
- 2026-05-10 口径收敛：设置页推理参数面板的前端提示文案统一为开发者向单句，不再按 DeepSeek / SiliconFlow 分别展示说明；页面骨架继续复用现有设置页，只按 provider 填充各自标签页内容和默认值。
- 2026-05-10 口径收敛：special release 的随包数据回到第一版 `demo-seed-manifest.json` 写盘路径，但 manifest 白名单进一步收窄为仅保留 `secure_config.bin`；不再走 ZIP 解包，也不再走原始 `secure_config.bin` 裸文件直拷贝入口。
- 2026-05-10 修复进展：已撤回本轮 special release 里新增的首启单飞保护、重试 fetch 与默认补写增强；`AppFacade.init()`、`ConfigManager`、`SelfDescriptionManager` 已回到历史稳定启动链路，仅保留“manifest 中只携带 `secure_config.bin`”这一项 special release 差异。
- 2026-05-10 构建结果：本地 `npm run build:release` 已通过，`release/moni-alpha-v0.4.1.apk` 已产出；APK 内确认仅携带 `assets/public/demo-seed-manifest.json`，且 manifest 中只包含 `secure_config.bin`，签名验证通过 `APK Signature Scheme v2`；仍待用户在真机复核”首启不黑屏且 API Key 成功落盘”。
- 2026-05-11 构建结果：`release/moni-alpha-v0.4.2.apk` 已产出，已在两台真机验收通过：冷启动黑屏问题不再复现，Splash 背景与 icon 深色统一，App icon 裁切问题修复（右上角装饰色块完整显示）。

## Release Changelog

### `0.4.3`

**首页消费趋势看板**

- 支出计算修复：改为只统计 `direction === 'out'`，不再把收入叠加进支出金额
- 时间轴扩展至账本完整历史：从账本最早有数据的日期动态计算天数，不再固定截取最近 30 天
- 数据点与日期标签对齐：X 轴数据点改为居中于每日格段 `(i+0.5)*pointWidth`，消除错位
- 横向滚动稳定性修复：移除 ResizeObserver，改为一次性静态宽度推算，彻底消除滚动中"一天一天跳变"
- Y 轴标注布局调整：文字左对齐，标注列宽固定 40px 覆盖五位数金额安全空间，与 SVG 容器宽度联动
- 轮播 race condition 修复：手动操作后暂停期间自动翻页问题修复，改为两个独立 effect + ref 双重守卫
- 对角线手势保护：斜向滑动不再误触发轮播翻页
- 轮播节奏调整：自动轮播间隔从 30 秒缩短为 15 秒，手动操作后暂停时长从 5 分钟缩短为 2 分钟

**预算设置页**

- 输入月度总预算金额时，自动平滑滚动到页面底部，让「保存预算」按钮进入视野，减少用户未保存就退出的情况

**首页情景提示引擎**

- 新增账单导入提醒卡（`import_reminder`）：仅在用户已有过至少一次导入记录的前提下触发，onboarding 全部完成后若距上次导入超过 3 天则显示
  - 3–7 天：显示具体天数，"距上次导入已 X 天"
  - 8–30 天：显示周数，"X 周没有导入了"
  - 31 天以上：显示月数，"X 个月没有导入了"
- `HomeHintStateManager` 新增 `lastBillImportAt` 字段，导入成功后由 `AppFacade` 写入时间戳并持久化到 `home_hint_state.json`

### `0.4.2`

- 修复 Android 冷启动黑屏：窗口背景从 `@null`（透明）改为应用主色 `#F5F0EB`，消除 Splash 消失到 WebView 首帧之间的黑色窗口
- 接入 `@capacitor/splash-screen`，关闭自动隐藏，改由 React 首帧 mount 后通过 double-RAF 主动 hide，补充 1200ms / 2500ms 双重兜底
- 新增启动 repaint workaround：冷启动 double-RAF + 延迟兜底，以及 `appStateChange` / `visibilitychange` / `focus` 事件触发的 resume repaint
- `index.html` 加入 inline 背景色与 `#root:empty` 占位，CSS 加载前 WebView 即有内容可绘制
- Android 12+ 新增 `values-v31/styles.xml`，补齐 `windowSplashScreenBackground` 与 `postSplashScreenTheme`
- Splash 背景色统一为 icon 深色 `#222222`，与 App icon 视觉一致
- 修复 App icon 裁切：正确拆分 Adaptive Icon 背景 / 前景层；前景 vector 将 icon 内容居中缩放到 108dp 画布的 72dp 安全区内，右上角三个装饰色块不再被启动器遮罩截断
- 从 `public/icon.svg` 重新生成各密度传统 PNG（mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi）

### `0.4.1`

- 顶部提示扩充为两段式学习反馈：分类前若存在未学习实例，先提示“AI 正在自动学习”；只有后续确实继续进入分类时，才提示“已学习完成，开始进行分类”
- 首页情景提示系统拆出独立专项规格与模块，按 onboarding 顺序优先引导新用户：自述、月预算、导入账单、开启 AI 分类、学习后的交互方式
- 现有预算提示卡并入统一提示结构，提示卡按钮区开始接真实跳转，不再只有单一静态提示

### `0.4.0`

- 自学习系统第一轮低成本精度优化完成收口：分类前强制学习、学习 Prompt 约束、实例库上下文增强、SiliconFlow 推理模式链路与行为验证同步落地
- 前置学习工作态与分类工作态分离，学习阶段只亮 AI 工作态，不误导为某天已进入正式分类
- 相关 Prompt 约束与上下文工程已接入真实运行链路，并通过浏览器开发态验证

### `0.3.7`

- release 构建链路改为 `demo seed` 打包为 zip 文件，安装流程同步优化，减少首装导入和落盘链路的不确定性
- `demo seed` 测试基准已刷新到最新数据，保证 release 包携带的样本与当前回归口径一致
- Android 返回手势已完成真机链路收口，设置页二级页面不再落回 Root 双击退出逻辑

### `0.3.6`

- 规格与真机链路继续收口：首页收入展示对齐、AI 零记忆消费风险提示、空记忆快照回退修复，均已完成并通过 `typecheck` / `build`
- 分类生产侧改为增量维护脏索引，修复 revision 冲突导致 batch 停止的问题，`BatchProcessor` 可连续处理多个 batch
- 分类视觉自动分配系统完成重构，首页、记账页与详情页统一消费共享分类视觉注册表
- 浏览器侧 native back 调试桥与返回栈自动化脚本已接通，设置页二级页面返回消费口径完成收口
- 首页、记账页、设置页及覆盖层的 UI / UX 继续补齐，包括导入指南页、密码输入页、拖拽细则面板与字体回退问题修复

### `0.3.5`

- 修复首页/记账页拖拽蒙版被底部导航栏遮挡问题：两个覆盖层 z-index 从 50 提升至 400
- 修复拖拽蒙版字体污染（portal 根 div 显式设置 Nunito，消除 :root Space Mono 继承）
- 修复首页拖拽触发时"大餐"分类被误选：移除分类格子的 onPointerEnter/onPointerLeave
- 记账页分类格子高度改为 gridAutoRows: max-content，与首页样式对齐
- AppRoot 重构为三段架构（State Host / Chrome Controller / Overlay Host），页面级 header 下放各页面
- 顶部安全区统一常量已接入首页/记账页/设置页/部分二级层；真机顶部留白仍待继续收口，当前不能视为完全完成
- `backHandler` 栈与 `useBackHandler` hook 已接入主要覆盖层；Android 真机系统返回手势仍未完成闭环，当前不能视为已修复
- 修复 DateRangePicker 状态恢复逻辑，避免初始值污染缓存
- Demo seed manifest 排除 llm_logs，体积从 56 个文件缩减至 16 个文件，消除低内存设备偶发加载失败风险
- 首页交易列表手势状态机重构：抽离 `useHomeListGestureController` 独立 hook；状态机 `idle→pressing→scrolling/dragging→inertia`；跟手滚动改为 `startScrollTop - deltaY`（位置无关）；惯性滚动改为 `rAF + velocity * dt + exponential decay`（刷新率无关）；释放速度用 100ms 样本窗口；`handleScroll` rAF 节流

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

## 当前进度同步

- 2026-05-18 新一轮迭代启动，主题为”第二轮自学习系统改进 + 表现层扩展”，实施文档为 `docs/自学习系统改进变更_v1.2.md`
- 2026-05-18 洞察页前端骨架完成，使用 recharts 实现收支柱状图与分类趋势综合表，已接入 AppFacade（mock 回退）；底部导航 5 Tab 改造完成，顺序固定为 `设置→洞察→首页(M)→请教→记账`，请教页占位符已创建；所有结构性色值已从 `IC`/`C` config 中引用，无硬编码色
- 本轮非 NLP 核心工作：分类输出 schema 扩展（§2.1）、审计队列接口语义（§2.3）、底部导航 5 tab 改造、请教页（Inquiry Page）与洞察页（Insights Page）两个新一级页面、ReasonDialog 蒙版语义统一
- 本轮 NLP 核心工作：实例检索/评分注入升级（§2.2），序列号预处理 + counterparty 质量分层 + bigram 相似度 + 非语义字段加权
- 第一轮自学习优化核心上下文工程已随 `0.4.0` / `0.4.1` 收口；残留 DeepSeek 供应商参数链路尾项、Prompt 约束行为级验证、前置学习提示文案专项验收 3 类尾项
- 真机反馈 8 个修复点中 7 项已修复完成（详情页分类入口、微信 badge、返回手势、键盘顶起、导入指南全屏、理由弹窗键盘、误触遮罩），仅压缩包密码输入页字体回退归入全局字体治理 Deferred

## 当前任务看板

| 任务 | 状态 | 说明 |
|------|------|------|
| 分类输出 schema 扩展（v1.2 §2.1） | **Done** | Transaction 新增 `ai_confidence` / `ai_uncertainty_reason` / `ai_used_weak_evidence` / `ai_evidence_ids` 四字段；派生 `ai_needs_review`；分类 System Prompt 新增 confidence 三级语义与禁止 high 硬约束；后处理校验 evidenceIds 防幻觉 |
| 实例检索/评分注入升级（v1.2 §2.2） | Pending | 序列号/占位污染预处理 11 条规则、counterparty 质量分层、实体键提取、bigram Dice 相似度、非语义字段加权评分、综合评分 top-5 检索、实例库新增 4 个派生字段 |
| 审计队列接口语义（v1.2 §2.3） | **Done** | `getInquiryViewData(filter)` / `confirmInquiryItem()` / `batchConfirmInquiryItems()` 实现完毕；类型 `InquiryFilter / InquiryViewData / InquiryDayGroup / InquiryViewStateCode` 已导出；`InquiryFilter` / `buildInquiryRawDays` / `filterInquiryDays` 模块级辅助函数就绪 |
| 底部导航 5 Tab 改造 | **Done** | 从 3 tab 扩展为 `设置 → 洞察 → 首页(M) → 请教 → 记账`；中央 M 按钮语义不变（短按首页，长按 AI）；请教页占位符已创建 |
| 请教页前端实现 | **Done** | `src/ui/pages/MoniInquiry.tsx` + `src/ui/features/moni-inquiry/config.ts`；左滑确认手势（pointer event 状态机）、批量模式（勾选/全选/批量确认/退出）、Filter 三档芯片、5 种空状态、AI 运行常驻提示、TransactionDetailPage 叠加层；色值全引用 C 常量无硬编码；拖拽纠错（long-press → DragDetailPanel）留给 AppRoot 层接入 |
| 洞察页前端实现 | **Done** | 规格：`docs/design/spec/SPEC_Insights_Page.md`；recharts 图表库；顶部摘要带 + 收支柱状图（月/周切换）+ 分类趋势综合表（环状图+列表+二级展开柱线融合图）；`AppFacade.getInsightsViewData()` 数据聚合；浏览器验证通过 |
| 洞察页收支图交互修复（问题 A-1） | Pending | 规格 §5.5 已更新：去除所有图表元素的浏览器默认 focus ring（蓝色边框）；点击触发目标收窄为柱体本体 + 净值线数据点圆点，移除”列区域空白触发”逻辑 |
| 洞察页收支图左滑历史（问题 A-2） | Pending | 规格 §5.4 已更新：数据覆盖全账本；图表容器横向可滑动，默认视口停在最右侧（最新）；左滑查看更早数据；粒度切换后重置到最右侧 |
| 洞察页月视图分割卡 + 月份切换（问题 B） | Pending | 在收支柱状图（非月视图）与分类趋势综合表（月视图）之间插入一张**月视图分割卡**：高度克制、不喧宾夺主；卡片内容两行——第一行"以下为月视图"，第二行"当前月份"+ 切换按钮；月份切换后分类趋势综合表的环状图、列表、进度条均随之联动；具体切换交互形式（箭头/Pill/下拉）待后续确认；规格补写在实施前进行 |
| 洞察页分类颜色统一接入视觉注册表 | Pending | 当前分类趋势综合表的标签颜色自行生成，未消费 `buildCategoryVisualRegistry(categoryDefs)` 的既有色板；需改为从 `categoryVisuals.ts` 的视觉注册表取色，与首页/记账页/请教页保持颜色一致 |
| ReasonDialog 蒙版语义统一 | Pending | 规格：`docs/design/spec/SPEC_DragDetailPanel_纠错弹窗外侧蒙版语义统一_增补.md`；外侧蒙版从”无作用”改为”取消纠错”三态 + 提示文案 |
| AI 自学习第一轮 DeepSeek 参数链路收口 | In Progress | `DeepSeek` 需按官方 `thinking / reasoning_effort` 口径单独验证；SiliconFlow 已验证通过 |
| Demo seed 首启解压刷新问题 | Pending | `0.3.7` zip 化 demo seed 后首启无法立即刷新，需定位解压完成通知链路 |
| BatchProcessor revision 系统复审 | Deferred | 后期重新审视 revision 机制是否仍然划算 |
| 标签管理重分类流程全链路落实 | Deferred | `ReclassifyConfirmDialog` 的 `add` 模式尚未在 `MoniSettings.tsx` 接入 |
| 全局字体统一治理 | Deferred | 含压缩包密码输入页字体回退；完整治理推后单独收口 |

## 当前优先级

1. ~~分类输出 schema 扩展（§2.1）~~ — **已完成**（commit a0c2ca3）
2. ~~审计队列接口语义（§2.3）~~ — **已完成**
3. ~~底部导航 5 Tab 改造~~ — **已完成**（设置→洞察→首页M→请教→记账）
4. ~~请教页前端实现~~ — **已完成**（MoniInquiry.tsx + moni-inquiry/config.ts）
5. ~~洞察页前端实现~~ — **已完成**
6. 洞察页收支图交互修复（问题 A-1）— 去除蓝色 focus ring，点击区域精确化
7. 洞察页收支图左滑历史（问题 A-2）— 横向滚动查看全账本历史
8. 洞察页月视图分割卡 + 月份切换（问题 B）— 分割卡设计已定，切换交互细节待后续确认
9. 洞察页分类颜色统一接入视觉注册表 — 改用 `buildCategoryVisualRegistry` 取色
10. ReasonDialog 蒙版语义统一
10. 实例检索/评分注入升级（§2.2）— NLP 系统，可与表现层并行
11. AI 自学习第一轮 DeepSeek 参数链路收口（尾项）
12. 标签管理重分类 / 全局字体治理 / Demo seed 首启（推后但持续追踪）

## 当前阶段决策

- 底部导航 5 Tab 正确顺序（已收口）：`设置 → 洞察 → 首页(M) → 请教 → 记账`；中央 M 按钮语义不变（短按首页，长按 AI）
- 洞察页图表（环状图、柱状图、折线图、柱线融合图）确认引入轻量图表库，不再手写 SVG
- 实施顺序固定为"先落实后端链路（§2.1 schema + §2.3 接口），再做前端改造（5Tab + 请教页 + 洞察页）"
- `SURFACE_SYSTEM.md` 当前只在渐变规则（§七）中提及"预算进度条"允许使用渐变，但**没有独立的进度条语法定义**；洞察页实现前需先在 SURFACE_SYSTEM.md 补充"分类预算进度条"语法规则段

## 当前阶段风险

- ~~§2.1 schema 扩展~~ 已完成，持久化/导入链路/实例库均已适配
- 两个新页面 + 底部导航改造是大规模表现层新增，需控制与现有首页/记账页/设置页的耦合
- Surface System 需扩展：confidence 背景色板、勾选框语法、分类预算进度条语法等 token 尚不存在


## 当前已固定口径

- `ledgers/{ledger}/ai_prefs.json` 只承接账本级 AI 行为配置
- `ledgers/{ledger}/budget.json` 只承接预算配置
- `defined_categories` 是账本标签主数据单一信源
- 全局模型 / 提供方 / 主题 / 自述不进入 `ai_prefs.json`
- 正式运行时持久化统一写入 `Directory.Data`；`Directory.Documents` 仅作为历史迁移来源，不再作为正式落盘目标
- 顶层只保留全局文件：`ledgers.json / secure_config.bin / self_description.md / logs`
- 所有账本级文件统一收口到 `Directory.Data/ledgers/{ledger}/`
- 评委演示包当前固定口径：构建脚本从 `virtual_android_filesys/sandbox_path/secure_config.bin` 生成 `public/demo-seed-manifest.json`，APK 随包只携带该 manifest；原生首启仅在正式沙盒缺失 `secure_config.bin` 时按 manifest 写回配置，不携带账本、自述、记忆和其他运行态数据
- Android 安装打包链路已建成，可按当前工程状态随时产出安装包
- Release 快捷入口当前固定为 `npm run build:release`；标准流程为“编码完成 -> 改版本号 -> 构建 -> 提交代码与文档”
- Android App Icon 当前固定口径：以 `public/icon.svg` 为唯一信源；Adaptive Icon（API 26+）必须拆分背景/前景两层：背景层用纯色 `#222222`（`drawable/ic_launcher_bg.xml`），前景层（`drawable-v24/ic_launcher_foreground.xml`）将 icon 内容缩放居中到 108dp 画布的 72dp 安全区内；传统 PNG 用 `rsvg-convert` 从 SVG 重新生成，不允许使用会导致错位/裁切的渲染链
- 分类运行态统一规划为 `ledgers/{ledger}/classify_runtime.json`，承载 classify index 主状态、`enqueue_recovery` 与 `confirm_recovery`
- 分类消费顺序本轮收口为“最近日期优先”
- 单次分类会话当前默认最多消费 `3` 天；该值暂不暴露 UI，也不额外落盘到 `ai_prefs.json`
- `classify_runtime.json` 在工程行为上以 classify index 为主语义；兼容层仍允许存量代码继续沿用 queue 命名，但不得再引入新的 queue 业务语义
- `data range` 只约束 AI 消费，不限制 classify index 的 dirtyDates 生产与日期入索引
- 首页 `DateRangePicker` 的快捷范围继续按系统当前时间计算；但滑块轨道 `MIN/MAX` 必须始终固定为账本真实数据范围；滑块 thumb 的显示位置取“快捷范围与账本范围的交集”，无交集时仅在边界贴边显示；真正提交给首页过滤与 AI 消费的是该交集，若无交集则显式传递空区间，不能再折叠成账本边界日
- 分类结果里的 `reasoning / ai_reasoning` 需限制在 `20` 个字以内，运行时仍做兜底截断
- `is_verified` 当前固定语义为“自动化链路级冻结”：生产端默认不以锁定条目生成 dirtyDates，但消费端对已入队日期仍向 AI 注入完整消费交易上下文；锁定保护独立于 `USER > RULE_ENGINE > AI_AGENT` 提案优先级，并要求最终写回前基于最新记录再次校验
- 分类 System Prompt 当前固定增强两条启发：`reference_corrections` 与 `days[]` 的 exact-ID 命中视为强锚点；同一时间段、同场景的多笔交易应先按同一消费事件联合判断，再决定是否同类
- 分类会话当前固定不按 `direction` 预先拆成“仅支出”或“仅收入”两路；收入条目也必须进入同一分类会话，否则退款、撤销、逆向冲回等场景会被错误预过滤。若用户没有额外要求，真实入账可优先归为“收入”；但退款不默认算“收入”，仍需结合原消费语义判断
- `收入` 当前固定作为默认普通标签加入分类体系，但与其他普通标签完全一致：允许用户改名、细分、删除；只有 `其他` 继续是系统兜底项，`uncategorized` 继续只属于显示 / 运行态，不进入 `defined_categories`
- 交易原始 `remark` 当前固定只读展示；用户可编辑的只有“说明 / 理由”，统一写入 `user_note`。用户显式提交新的分类意图时默认自动锁定：从未分类改到某个分类、从仅有 `ai_category` 状态显式确认同类结果、或把既有 `user_category` 改成另一分类，都要写入 `is_verified = true`；仅再次提交同一 `user_category`，不自动锁定。`user_note` 也是学习信号：只要用户修改了 `user_note`，实例库都要按 `id` 同步更新；若本次是 `user_note` 从空到非空，且当前尚未锁定，则应自动锁定后再写入实例库
- 设置页账本区“全量重分类”当前固定为三段式渐进式确认：先展示锁定条目列表供用户决定是否解锁；真正执行解锁、分类字段重置、实例库清理与 dirtyDates 入队前，必须再做一次显式破坏性提交确认；数据提交完成后，是否正式通知引擎开始消费，必须由用户再次明确确认；提交前用户可随时取消，系统不得提前动数据
- 首页 AI 工作态对外接口当前固定为 `HomeAiEngineUiState.activeDates`，由 `BatchProcessor -> AppFacade -> MoniHome` 贯通，显示层只消费该字段决定哪些日期高亮
- 用户手动开启分类且存在未学习实例时，顶部提示固定分两段：先提示“有尚未学习的实例，AI 正在自动学习”，学习成功并即将进入分类时再提示“已学习完成，开始进行分类”；学习阶段允许 AI 总工作态亮起，但 `activeDates` 必须保持空数组
- 首页中部情景提示卡当前固定优先服务无首次引导的新用户上手链路，按 `设置自述 -> 设置月预算 -> 导入账单 -> 开启 AI 分类 -> 学习分类后交互方式` 的顺序，只展示第一张尚未完成的卡片；关闭只影响当前会话，不改变步骤完成态
- onboarding 的自述完成判定当前固定为“用户已改写默认 demo 自述并保存”，不能用“自述非空”代替
- Android 软键盘阶段当前固定口径：原生层不允许通过 `windowSoftInputMode` 改写 Activity 尺寸，Web 层再用 `--app-root-height` 锁定稳定画布高度
- 规格文档只维护目标口径，不再维护“代码/规格差异”与实现差距清单
- 浏览器调试入口和测试入口属于稳定工具链，索引写入 `README.md`，协议与记录写入 `docs/`
- UI/UX 设计与实现当前统一在主仓库内完成；现行规则入口固定为 `DESIGN_SPEC_SYSTEM.md` 及其指向的 Layer 0/1/2/3 文档
- 账单导入入口当前固定为记账页现有“微信账单 / 支付宝账单”两个按钮，不新增导入舱或重做表面结构
- 账单导入两个按钮的实现差异仅为 `expectedSource` 与平台化密码提示文案，后续统一走 `probeBillImportFiles()` 与 `importBillFiles()`
- 记账一级页中的账单解析中、导入中、导入成功提示统一复用导入卡片底部提示条；这些提示出现时，默认“查看导入指南”提示需要让位
- 顶部安全区当前固定口径：浏览器里可见的基础 header padding 不变；仅 Android 原生环境额外的 `safe area` 统一回收约 `15%`
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
- `npm run build` 偶发出现 `chunk size warning` 属于长期构建噪音，当前不作为阶段风险单独跟踪；仅在 release 验收或打包链路变更时复核

## 交接说明

- 每次 release 完成后，必须把已交付 feature 归并到 `Release Changelog`，并清理当前任务看板中的已完成项
