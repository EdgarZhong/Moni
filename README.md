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

两个子仓库仅作为参考源：

- `Moni-UI-Prototype/`：UI 原型与设计参考
- `pixel_bill_backend/`：旧逻辑实现与架构参考

它们不能被主仓库直接依赖，不能通过 `import` / `require` / link 方式接入运行时。

## README 与 CLAUDE 分工

- `README.md`：记录已经落实的稳定项目事实，例如定位、架构、目录、环境、文档入口
- `CLAUDE.md`：记录任务看板、当前阶段目标、执行约束、迁移与集成进展

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

- 项目执行约束与任务看板：[CLAUDE.md](D:/Code/Moni/CLAUDE.md)
- 首页集成规格：[docs/Moni_Homepage_Integration_Spec.md](D:/Code/Moni/docs/Moni_Homepage_Integration_Spec.md)
- 产品需求总表：[docs/Moni_Requirements_v3.md](D:/Code/Moni/docs/Moni_Requirements_v3.md)
- AI 自学习系统 v7：[docs/AI_SELF_LEARNING_DESIGN_v7.md](D:/Code/Moni/docs/AI_SELF_LEARNING_DESIGN_v7.md)
- 预算系统规格：[docs/Moni_Budget_System_Spec_v2.md](D:/Code/Moni/docs/Moni_Budget_System_Spec_v2.md)
- 随手记规格：[docs/Moni_Manual_Entry_Spec_v3.md](D:/Code/Moni/docs/Moni_Manual_Entry_Spec_v3.md)

## 当前里程碑状态

- 里程碑 1：主仓库目标架构与目录语义已冻结
- 里程碑 2：主仓库骨架已迁移到 `bootstrap / logic / system / ui / shared`
- 下一步：开始为并行子 agent 输出正式迭代计划，并进入首页、预算、随手记、v7 记忆系统的集成迭代

## 开发与验证

```bash
npm run typecheck
npm run build
npm run lint
```

当前已确认：

- `npm run typecheck` 通过
- `npm run build` 通过

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

- `Directory.Documents -> virtual_android_filesys/Documents_path`
- `Directory.Data -> virtual_android_filesys/sandbox_path`

当前首页真实账本使用：

- `virtual_android_filesys/Documents_path/Moni/*.moni.json`
- `virtual_android_filesys/sandbox_path/ledgers.json`

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
  - 再确认 `virtual_android_filesys/Documents_path/Moni` 与 `virtual_android_filesys/sandbox_path` 是否存在目标文件

### 当前剩余集成风险

- 首页无预算时的看板退化仍需继续对齐规格：当前代码可能还会显示预算卡零值态
- 顶部折线图仍未完全按首页规格中的 `trendCard` 读模型实现
- 手记系统首页表现层字段尚未完全接通，主标题 / 来源 badge / 说明槽位仍存在规格差距
- 浏览器 F12 虚拟文件系统是高保真开发替身，但不是 Android 真机行为的完全等价物

## 测试账本分类迁移脚本

首页原型当前使用中文分类键；分类键既是账本内存储值，也是 UI 直接显示值。为保持测试数据与原型一致，提供一次性迁移脚本把旧英文测试分类键改写为中文。

当前口径：

- 默认手动预置类别为 10 类：`正餐/零食/交通/娱乐/大餐/健康/购物/教育/居住/旅行`
- `其他` 不是手动预置默认标签，而是在存在用户标签定义时由系统自动追加的兜底类别

脚本：

- `scripts/migrate-test-ledger-categories.mjs`

作用：

- 扫描 `virtual_android_filesys/Documents_path/Moni/*.moni.json`
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
