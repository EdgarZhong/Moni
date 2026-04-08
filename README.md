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
- `npm run build` 在当前会话环境受 `esbuild spawn EPERM` 影响，需在本机正常开发环境继续验证
