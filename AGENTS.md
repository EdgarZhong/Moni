# Moni 协作规则

## 文档职责

- `README.md`：只记录稳定项目事实、运行方式、目录骨架、关键文档入口、稳定测试入口索引
- `AGENTS.md`：只记录协作规则、开发原则、文档分工、测试流程和通用验收要求
- `CLAUDE.md`：只记录当前版本迭代任务看板、剩余风险、优先级、交接状态、阶段性决策，以及按 release 归档的 feature change log
- 专项规格、专项说明、浏览器调试入口与测试记录统一写入 `docs/`

## 基本边界

- 主仓库是正式产品的唯一运行时代码来源
- 历史参考子仓库已迁入 `.archive/submodules_2026-04-24/`，仅供追溯，不得接入运行时
- `Moni-UI-Prototype` 即日起退出当前工作流，仅作为历史参考目录；所有表现层探索与正式实现统一在主仓库内完成
- 表现层探索默认在主仓库 `feature` 分支完成；未合入 `main` 的变更视为探索中，合入 `main` 即视为已确认口径
- 目标运行环境是 Android Capacitor，浏览器 F12 仅作高保真开发替身，不可等价替代真机验收
- 稳定事实进 `README.md`，动态编排进 `CLAUDE.md`，禁止混写

## 开发原则

- 优先复用现有目录语义：`bootstrap / logic / system / ui / shared / devtools`
- 先收口接口、读模型、状态口径，再做局部实现
- 禁止顺手重构无关模块、批量改名、跨层随意下潜
- UI 不得绕过 facade 深入访问底层 service 细节
- 预算配置、账本行为配置、账本主数据必须继续分层，禁止混塞到同一文件
- 表现层 design scope 的探索与实现统一在主仓库内完成，不再经过独立原型仓库中转
- 表现层变更不得触碰业务逻辑层；已完成的表现层 / 业务逻辑解耦边界必须保持稳定
- 任何表现层变更必须先更新对应 `docs/` 规格文档，经确认后再修改代码；代码变更必须可回溯到规格条目
- 未经明确授权，不得修改当前 design scope 之外的组件；若实现中发现必须波及其他组件，必须先报告影响范围并获得授权

## 文件操作

- 不直接删除仓库文件
- 需要移除的文件统一移动到 `.archive/`
- 测试数据优先保留可迁移的软件夹具状态；仅纯运行态痕迹可排除或回退

## 浏览器测试闭环

- 开发完成后，不能只跑静态命令而不做页面验证
- 浏览器 MCP 与 Playwright 已是默认测试工具链
- 本项目语境中的 `E2E` 默认指 agent 通过 `Playwright MCP` 在浏览器开发态执行自动化页面验证，不指 Android 安装包人工验收
- 尚无完整 UI 的能力，优先补浏览器调试入口，不依赖人工临时粘贴脚本
- 稳定调试入口和测试入口必须在 `README.md` 留索引
- 调试入口协议和验证记录必须在 `docs/` 留文档
- 浏览器调试入口、脚本化读取与验证属于长期基础设施，不作为一次性阶段任务关闭
- 需要开启端到端测试时，以用户明确指令为准
- Playwright MCP 的默认移动端测试视口以 `./.codex/playwright.mcp.json` 为准，当前固定为 `390 x 844`
- 若因专项问题需要临时切换视口，必须在验收说明中写明实际视口尺寸与切换原因
- “一图一测试”口径只适用于 Playwright 页面验证：关键页面或关键状态至少保留一张截图，并与对应断言或检查结果成对记录

## 开发测试 MSOP

每次开发完成后的标准验证顺序固定为：

1. 静态校验：至少跑 `npm run typecheck`
2. 条件允许时补 `npm run build`、`npm run lint`
3. 通过浏览器调试入口准备数据并验证逻辑链路
4. 使用 Playwright / MCP 在 `./.codex/playwright.mcp.json` 当前定义的默认移动端视口下做页面交互验证
5. 复核 browser console，检查 runtime error、Hook 错误、404 噪音和异常日志
6. 复核视觉结果，必要时截图留档
7. 把通过项、未覆盖项、剩余风险写回相应文档

## 通用验收要求

- 提交前至少运行：`npm run typecheck`
- 若环境允许，继续运行：`npm run build`
- 若无法运行更重命令，必须在交付说明里写明阻塞原因
- 验收说明至少包含：
  - 改动文件范围
  - 关键设计决策
  - 剩余风险
  - 未覆盖项

## UI/UX 工作流

- 现行设计规格体系以根目录 `DESIGN_SPEC_SYSTEM.md` 为总入口，按四层划分：
  - Layer 0：`docs/design/Moni_Brand_Identity.md`
  - Layer 1：`docs/design/SURFACE_SYSTEM.md`
  - Layer 2：`tailwind.config.js`
  - Layer 3：`docs/` 下对应页面 / 功能 spec 文档
- 后续不再使用 `DESIGN.md`、旧主仓库 `design/` 工作台、`/__design` 开发态入口、独立原型仓库工作流作为现行设计规则入口
- 表现层实现前必须先判断本次变更落在哪一层；组件与页面实现至少先查阅 Layer 1 / Layer 2，以及对应 Layer 3 页面规格
- Page Spec 只定义结构、字段、交互、状态流转与接口约定；不直接承担品牌层和 token 层的职责
- Layer 1 / Layer 2 变更必须先更新对应文档，再改代码；未经确认不得擅自新增新的表面语法或 token
- 所有新增表现层代码、以及本次顺手修改到的表现层代码，禁止继续新增硬编码色值、字号、圆角、描边粗细；必须优先复用 `tailwind.config.js` 中已定义的 semantic token
- 现有内联样式与历史硬编码值属于存量，不要求一次性全量迁移；但修改到对应组件时应优先向 token 收口
- 表现层实验代码必须继续使用主仓库当前的 TypeScript / React / Vite / 样式与依赖约束

## 当前长期有效约束

- `ledgers/{ledger}/ai_prefs.json` 只承接账本级 AI 行为配置
- `ledgers/{ledger}/budget.json` 只承接预算配置
- `defined_categories` 继续作为账本标签主数据单一信源
- API Key / 模型 / 提供方 / 主题 / 自述等全局设置不进入 `ai_prefs.json`

## 版本管理规范

遵循语义化版本 `MAJOR.MINOR.PATCH`。

任务看板与版本历史固定策略：

- `CLAUDE.md` 仍可记录当前版本状态、风险、优先级、交接说明与阶段性决策
- `CLAUDE.md` 里“任务看板部分”唯一允许长期保留的历史信息是 `Release Changelog`
- `Release Changelog` 只记录“每个已发布版本最终实现了哪些 feature / 能力”，不记录会话流水、临时拆分、验收过程和中途状态
- `CLAUDE.md` 的“当前任务看板”只保留当前版本迭代中的进行中 / 待办 / 暂停任务
- 某个版本一旦 release，当前任务看板中的已完成事项必须从看板移除，并归并到该版本的 `Release Changelog`
- 禁止把跨版本旧待办、过期 bug 列表、长段已完成历史继续滞留在当前任务看板
- 若下一版本尚未启动或范围未确认，当前任务看板可以为空，或只保留“待定义版本范围”这类当前态任务

Release 构建固定流程：

0. 迭代编码：通常要求构建前已经完成本轮开发
1. 改版本号：同步更新所有版本号，包括但不限于：
   - `package.json` 的 `version` 字段
   - `android/app/build.gradle` 的 `versionName` 和 `versionCode`
   - UI 硬编码版本：`src/ui/pages/MoniSettings.tsx` 里关于页和关于入口的版本文案
2. 构建：执行 `npm run build:release`
3. 提交：提交代码与文档变动

Release 固定约定：

- 快捷入口：`npm run build:release`
- APK 命名：`moni-alpha-v{versionName}.apk`
- APK 输出目录：`release/`
- Android 签名配置：`android/release-signing.properties`
- release 构建自动携带 `public/demo-seed-manifest.json`
- 签名验收统一使用 `apksigner verify --verbose --print-certs`
- 不使用 `jarsigner` 作为 release APK 验签依据

当前版本：

- `version`：`0.3.0`
- `versionCode`：`3`
- 当前 APK：`release/moni-alpha-v0.3.0.apk`
