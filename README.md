# Moni

Moni 是一个 AI 原生记账软件，目标是成为“越用越聪明的 AI 记账助手”。

当前阶段聚焦移动端首轮集成，目标运行环境是 Android Capacitor；日常人工测试环境为浏览器 F12 移动端设备模式。

## 项目定位

- AI 是学生，用户是老师
- 记账是结果，不是操作
- 财务理解对象是具体的人，而不是抽象交易类型

## 当前仓库职责

本仓库是 Moni 的主仓库，负责承接：

- 新的主项目骨架
- 系统层 / 逻辑层 / 表现层的长期可维护结构
- 从两个参考子仓库抽取并重组后的正式实现

历史参考子仓库已迁入 `.archive/submodules_2026-04-24/`：

- `Moni-UI-Prototype/`：历史 UI 原型与设计参考
- `pixel_bill_backend/`：历史旧逻辑实现与架构参考

它们不再参与当前仓库日常开发；如需追溯历史，可从 `.archive/` 或 Git 历史查看。

## README / AGENTS / CLAUDE 分工

- `README.md`：只记录已经落实的稳定项目事实，例如项目定位、架构、目录、运行环境、开发命令、关键文档入口、稳定测试入口索引
- `AGENTS.md`：只记录协作规则、开发原则、测试流程要求、文档分工与通用验收要求
- `CLAUDE.md`：记录当前版本迭代的任务编排、任务看板、依赖关系、进度同步、风险与阶段性决策；历史信息仅保留按 release 归档的 feature change log

## 当前有效目录骨架

```text
src/
├── bootstrap/          # 应用入口与运行时装配
├── logic/
│   ├── domain/         # 纯领域规则与协议
│   └── application/    # 应用服务、AI 编排、读模型与用例
├── system/             # Capacitor / 文件系统 / 网络 / 设备能力适配
├── ui/                 # React 表现层
├── shared/             # 跨层共享类型与工具
└── devtools/           # 调试与开发脚本
```

说明：

- `src/bootstrap` 是新的入口层
- `src/logic/domain` 和 `src/logic/application` 共同构成逻辑层
- 旧 `src/app`、`src/core` 已退出主编译路径，作为迁移遗留参考保留

## 关键文档

- 协作规则与开发测试原则：[AGENTS.md](D:/Code/Moni/AGENTS.md)
- 项目执行约束与任务看板：[CLAUDE.md](D:/Code/Moni/CLAUDE.md)
- 首页集成规格：[docs/Moni_Homepage_Integration_Spec.md](D:/Code/Moni/docs/Moni_Homepage_Integration_Spec.md)
- 产品需求总表：[docs/Moni_Requirements_v3.md](D:/Code/Moni/docs/Moni_Requirements_v3.md)
- AI 自学习系统 v7：[docs/AI_SELF_LEARNING_DESIGN_v7.md](D:/Code/Moni/docs/AI_SELF_LEARNING_DESIGN_v7.md)
- 设计工作台总入口：[design/README.md](D:/Code/Moni/design/README.md)
- 品牌基线：[design/brand/README.md](D:/Code/Moni/design/brand/README.md)
- 组件基线：[design/components/README.md](D:/Code/Moni/design/components/README.md)
- 流程基线：[design/flows/README.md](D:/Code/Moni/design/flows/README.md)
- 跨端与手势标准：[design/standards/README.md](D:/Code/Moni/design/standards/README.md)
- 预算系统规格：[docs/Moni_Budget_System_Spec_v2.md](D:/Code/Moni/docs/Moni_Budget_System_Spec_v2.md)
- 随手记规格：[docs/Moni_Manual_Entry_Spec_v3.md](D:/Code/Moni/docs/Moni_Manual_Entry_Spec_v3.md)
- 浏览器调试入口与 MCP 验证记录：[docs/Moni_E2E_RECORD_INT1.md](D:/Code/Moni/docs/Moni_E2E_RECORD_INT1.md)

## 当前稳定状态

- 主仓库目标架构与目录语义已冻结
- 主仓库已迁移到 `bootstrap / logic / system / ui / shared`
- 首页主舞台读模型、随手记逻辑链路、预算逻辑链路、v7 记忆核心链路均已接入主线
- 浏览器调试入口、Playwright / MCP 验证链路已固定为稳定开发测试工具
- 当前项目语境中的 `E2E` 默认指 agent 通过 `Playwright MCP` 在浏览器开发态执行自动化页面验证
- Android 安装打包链路已建成，可随时产出安装包做后续验证或演示
- 默认账本初始名称固定为 `日常开销`，且支持后续重命名
- `design/` 已建立为主仓库唯一设计工作台，后续 UI/UX 改动需先经过 brief 与已拍板 design baseline

## 开发与验证

```bash
npm run typecheck
npm run build
npm run lint
```

当前已确认：

- `npm run typecheck` 通过
- `npm run build` 通过

## Release 快捷入口

```bash
npm run build:release
```

稳定约定：

- 该命令会自动刷新 `public/demo-seed-manifest.json`
- 该命令会自动执行前端构建、`npx cap sync android` 和 Android release 打包
- release APK 固定输出到 `release/moni-alpha-v{version}.apk`
- release 签名固定读取 `android/release-signing.properties`

签名验证口径：

- 统一使用 Android SDK 的 `apksigner verify --verbose --print-certs`
- 不使用 `jarsigner` 作为本项目 release APK 的签名验收工具
- 当前 release APK 采用 `APK Signature Scheme v2`
- 当前工程 `minSdkVersion = 24`，在项目支持范围内，V2 签名可正常安装到真机
- `jarsigner` 仅检查旧的 V1/JAR 签名；对当前 APK 报 `jar is unsigned` 不代表安装包不可用

换环境快速复现：

- 保留仓库内已追踪的 `package.json`、`android/app/build.gradle`、`android/release-signing.properties.example`
- 复制 `android/release-signing.properties.example` 为 `android/release-signing.properties`
- 准备自己的 `release/moni-release.p12`
- 运行 `npm run build:release`
- 验证签名时执行：`/opt/android-sdk/build-tools/36.0.0/apksigner verify --verbose --print-certs release/moni-alpha-v{version}.apk`

## 稳定测试入口

开发态浏览器启动后，会自动暴露以下稳定调试入口：

- `window.__MONI_DEBUG__`
  - 面向数据准备、逻辑链路调用、状态快照读取
- `window.__MONI_E2E__`
  - 面向标准 smoke test 与结构化测试报告输出

当前已落地的核心测试能力：

- 账单导入后端探测 / 导入调试接口：`window.__MONI_DEBUG__.billImport.probe() / import()`
- 账本 CRUD 逻辑链路测试：`window.__MONI_E2E__.tests.runLedgerCrudTest()`
- 随手记逻辑链路测试：`window.__MONI_E2E__.tests.runManualEntryFlowTest()`
- 预算逻辑链路测试：`window.__MONI_E2E__.tests.runBudgetFlowTest()`
- 实例库 v7 / 手记映射规格测试：`window.__MONI_E2E__.tests.runExampleStoreSpecTest()`
- 学习 payload v7 规格测试：`window.__MONI_E2E__.tests.runLearningPayloadSpecTest()`
- 自动学习偏好与触发判定测试：`window.__MONI_E2E__.tests.runLearningAutomationSpecTest()`
- 收编配置与上下文规格测试：`window.__MONI_E2E__.tests.runCompressionSpecTest()`
- 首页读模型 smoke test：`window.__MONI_E2E__.tests.runHomeReadModelSmokeTest()`
- 账单导入后端回归测试：`window.__MONI_E2E__.tests.runBillImportBackendTest()`

调试入口的字段说明、使用方式、MCP 联调用法与首轮验证记录见：

- [docs/Moni_E2E_RECORD_INT1.md](D:/Code/Moni/docs/Moni_E2E_RECORD_INT1.md)

当前默认 E2E 测试画像：

- 工具：`Playwright MCP`
- 环境：浏览器开发态
- 默认移动端视口：以 `./.codex/playwright.mcp.json` 为准，当前为 `390 x 844`
- “一图一测试”只适用于这套浏览器自动化链路，不等同于 Android 安装包人工验收

## 设计工作台

- 唯一设计入口：`design/`
- 根说明与完整工作流：`design/README.md`
- 新 UI/UX 任务起点：`design/briefs/active/`
- 开发态原型入口：`/__design`
- 正式实现只参考 accepted brief 与已拍板 design baseline，不直接参考历史 `DESIGN.md`

## 浏览器 F12 测试系统

仓库保留并继续使用 Pixel Bill 时代验证过的虚拟文件系统方案，用于在浏览器 F12 移动端模式下复刻 Android Capacitor 的主要文件读写路径。

### 设计目标

- 在浏览器中直接验证 `Documents` / `Data` 双目录读写
- 让业务代码继续走“Android / Capacitor”分支，而不是额外写一套浏览器分支
- 在开发态复用真实账本、索引、预算、队列等文件结构
- 保证正式构建时完全剥离 mock，不污染 Android 产物

### 工作方式

- Vite 开发态 alias：
  - `@capacitor/core -> src/system/mocks/capacitor-core.ts`
  - `@capacitor/filesystem -> src/system/mocks/capacitor-filesystem.ts`
- mock core 在开发态强制 `isNativePlatform() === true`，把业务代码稳定压到 Capacitor / native 路径
- mock filesystem 将读写请求转发到 `POST /api/fs`
- `mock-fs-middleware.ts` 在 Node 侧把请求映射到本地虚拟文件系统

### 目录映射

- `Directory.Data -> virtual_android_filesys/sandbox_path`
- 浏览器开发态 mock 不再保留独立 `Documents_path`；即便上层传入 `Directory.Documents`，也统一兼容映射到 `sandbox_path`

当前首页真实账本使用：

- `virtual_android_filesys/sandbox_path/ledgers.json`
- `virtual_android_filesys/sandbox_path/ledgers/{ledger}/ledger.json`
- `virtual_android_filesys/sandbox_path/self_description.md`

### 使用要求

1. 必须通过当前仓库自己的 `npm run dev` 启动开发服务器
2. 浏览器必须打开当前这次 dev server 对应的端口，不能挂在旧进程
3. 浏览器 F12 移动端模式只用于开发态验真，不替代 Android 真机权限与插件验收

### 审计结论

这套测试系统设计是合理的，适合继续使用。

优点：

- 业务代码无需写 `if (DEV)` 的测试分支
- 浏览器开发态与 Capacitor 目标环境共享主要文件系统逻辑
- 能直接复用真实测试账本、索引、预算和 AI 相关文件
- 正式构建时由 Vite 开发态 alias 自动剥离，不进入生产包

边界：

- 权限模型是 mock，默认自动授权，不等于真机权限行为
- 错误码与异常语义接近 Node / HTTP，不完全等于 Android / Capacitor
- 浏览器 `fetch('/api/fs')` 的时序与原生 I/O 时序不同
- haptics、app lifecycle、后台挂起、重启恢复仍需 Android 真环境验收

因此：

- 这套系统适合做首页、账本、索引、预算、队列、读模型联调
- 不应把它当成真机行为的完全替代

### 常见排查

- 如果控制台出现 `POST /api/fs 404`
  - 通常不是业务代码本身坏了，而是页面连接到了错误的 dev server 端口，或旧进程没有挂载 `mock-fs-middleware`
  - 即便 dev server 正常，也可能只是预算配置、分类队列等可选文件不存在时的探测读；这类 404 会污染浏览器控制台，但不一定表示账本主文件加载失败
- 如果首页初始化报文件系统错误
  - 先确认开发态 alias 已生效
  - 再确认 `virtual_android_filesys/sandbox_path/ledgers` 与 `virtual_android_filesys/sandbox_path/ledgers.json` 是否存在目标文件

### 当前剩余集成风险

- 浏览器 F12 虚拟文件系统是高保真开发替身，但不是 Android 真机行为的完全等价物
- 首页读模型虽然已收口 `homeDateRange / trendCard / 手记展示字段 / AI backlog`，仍需继续做浏览器人工回归和 Android 真环境验收

## 测试账本分类迁移脚本

首页原型当前使用中文分类键；分类键既是账本内存储值，也是 UI 直接显示值。为保持测试数据与原型一致，提供一次性迁移脚本把旧英文测试分类键改写为中文。

当前口径：

- 默认手动预置类别为 10 类：`正餐/零食/交通/娱乐/大餐/健康/购物/教育/居住/旅行`
- `其他` 不是手动预置默认标签，而是在存在用户标签定义时由系统自动追加的兜底类别

脚本：

- `scripts/migrate-test-ledger-categories.mjs`

作用：

- 扫描 `virtual_android_filesys/sandbox_path/ledgers/*/ledger.json`
- 将英文分类键改写为中文：
  - `meal -> 正餐`
  - `snack -> 零食`
  - `transport -> 交通`
  - `entertainment -> 娱乐`
  - `feast -> 大餐`
  - `health -> 健康`
  - `shopping -> 购物`
  - `education -> 教育`
  - `housing -> 居住`
  - `travel -> 旅行`
- 仅做英文分类键到中文分类键的等价替换，不改动其他业务数据
- 若源数据里存在自动追加的兜底类别 `others`，则仅替换为中文键 `其他`

运行：

```bash
node scripts/migrate-test-ledger-categories.mjs
```
