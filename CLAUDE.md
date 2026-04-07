# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目基本信息

### 项目概述

**Moni** 是一个越用越聪明的 AI 记账助手，采用 Core-UI 分离架构。

> **🎯 当前阶段：仓库整合与重构**
> - 目标：整合 UI 原型与后端逻辑，重构为统一项目
> - UI 设计权威：`Moni-UI-Prototype` 子仓库的 `DESIGN.md`
> - 后端逻辑参考：`pixel_bill_backend` 子仓库（feat/frontend-separation 分支）

### 架构设计

```
Moni/
├── Moni-UI-Prototype/     # UI/UX 原型（参考子仓库，只读）
│   ├── DESIGN.md          # UI/UX 唯一执行标准
│   └── src/               # React + TypeScript + Vite
├── pixel_bill_backend/    # 后端逻辑参考（参考子仓库，只读）
│   └── src/core/          # 核心业务逻辑（仲裁系统、AI引擎、持久化）
└── [主仓库将整合两者]      # 尚未构建
```

**核心架构（来自 pixel_bill_backend）**：

```
CSV 导入 → Parser → LedgerService → Arbiter → Plugins → 最终分类决策
                                    ↓
                            PersistenceManager
                                    ↓
                         *.moni.json (JSON 存储)
```

**仲裁系统优先级链**：
1. **USER** - 用户手动分类（最高优先级）
2. **RULE_ENGINE** - 规则引擎匹配
3. **AI_AGENT** - AI 智能分类（异步）

### 技术栈

- **前端**：React + TypeScript + Vite + Tailwind CSS + Framer Motion + Capacitor
- **后端**：Core-UI 分离架构（来自 pixel_bill_backend）
- **存储**：Capacitor Filesystem API → JSON 文件
- **AI**：LLM 服务（PromptBuilder + SystemPrompt）

---

## 子仓库管理策略（重要）

### 子仓库性质：信息参考 + 可复制源码

本仓库包含两个 **只读参考子仓库**。

**核心原则**：
- 子仓库是**信息参考来源**，包含设计文档和架构参考
- **允许复制**子仓库的代码到主仓库（复制后代码属于主仓库）
- **禁止直接依赖**子仓库的代码（禁止 import/require/npm link 等方式引用子仓库代码）

| 子仓库 | 用途 | 分支 | 参考内容 |
|--------|------|------|----------|
| `Moni-UI-Prototype` | UI/UX 设计原型与实现参考 | main | DESIGN.md、交互逻辑、组件结构 |
| `pixel_bill_backend` | 后端逻辑与架构参考 | feat/frontend-separation | Core 业务逻辑、数据流设计 |

**为什么使用 Submodule**：
- 保持参考源的唯一事实来源
- 可以追踪参考仓库的历史版本
- 方便开发者在同一仓库中查阅设计文档和架构参考

**Submodule 机制说明**：

Submodule 本质是主仓库存储子仓库的特定 **commit SHA**（指针），而非分支引用。

```
# 主仓库 .git/modules/ 存储 submodule 的 git 元数据
# 主仓库 working directory 存储 submodule 的文件快照
```

**更新子仓库的正确方式**：

```bash
# 1. 进入子仓库
cd Moni-UI-Prototype

# 2. 获取最新代码（在子仓库中操作）
git fetch origin
git checkout origin/main  # 或指定分支

# 3. 返回主仓库，更新指针
cd ..
git add Moni-UI-Prototype
git commit -m "chore: update Moni-UI-Prototype to latest"
```

### 避免源码管理层面的版本控制问题

**核心原则**：禁止通过 import/require/npm 等方式直接依赖子仓库代码，但允许复制代码。

#### 子仓库工作区必须保持干净

主仓库内的子仓库工作区**必须是干净的代码快照**：
- 必须指向远程分支的最新 commit
- 不能存在本地修改、未跟踪文件等脏状态
- 如果需要开发子仓库，**必须将工作区迁移到主仓库外部**

#### 为什么要禁止直接依赖

如果主仓库通过 Submodule/npm 直接依赖子仓库代码：
- 子仓库更新可能破坏主仓库
- 构建流程强耦合
- 主仓库失去独立演进能力

#### 正确做法：可复制代码，禁止直接依赖

1. **阅读 DESIGN.md** - 理解 UI/UX 规范后，在主仓库独立实现
2. **阅读 pixel_bill_backend/src/core/** - 理解架构后，复制需要的代码到主仓库
3. **允许复制** - 可以将子仓库的代码复制到主仓库，但必须独立实现而非建立引用依赖
4. **独立构建** - 主仓库必须能够独立构建，不依赖子仓库的构建产物
5. **保持工作区干净** - 主仓库的 submodule 目录永远是只读的代码快照，不进行任何开发工作

#### Submodule 在本项目中的作用

Submodule 用于：
- 保持参考源的可追溯性
- 方便开发者在同一仓库中查阅设计文档和架构参考
- **仅作版本化的快照参考，不用于运行时依赖**

### 子仓库使用规范（绝对禁止项）

1. **纯信息参考** - 子仓库作为设计文档和架构参考来源
2. **允许复制代码** - 可以将子仓库的代码复制到主仓库，复制后代码属于主仓库
3. **禁止直接依赖** - 禁止通过 `import`、`require`、`npm link` 等方式直接引用子仓库代码
4. **禁止直接修改** - 不要在主仓库的子仓库目录中做任何修改
5. **独立演进** - 主仓库必须能够独立构建、独立部署
6. **工作区必须干净** - 主仓库内的子仓库工作区**必须是干净的代码快照**，指向远程分支的最新提交，**不能存在任何本地脏状态**（修改、未跟踪文件等）

**正确认知**：子仓库是"快照参考"。允许从其中复制代码，但禁止让主仓库通过 submodule 或包管理工具直接依赖子仓库。

**Submodule 工作区的要求**：

主仓库内的子仓库工作区必须满足：
- ✅ 指向远程分支的最新 commit（干净状态）
- ✅ 无本地修改
- ✅ 无未跟踪文件
- ❌ 不能有正在进行的开发工作

如果需要进行子仓库的开发工作，**必须将工作区迁移到主仓库外部**，不得在主仓库的 submodule 目录内进行开发。

---

## 项目目录结构

```
moni/                            # 主仓库（待构建）
├── Moni-UI-Prototype/          # 子仓库：UI 原型参考（只读）
│   ├── docs/
│   │   └── DESIGN.md           # UI/UX 设计标准（核心权威）
│   ├── src/
│   │   └── features/moni-home/ # UI 组件实现
│   └── package.json
├── pixel_bill_backend/         # 子仓库：后端逻辑参考（只读）
│   ├── src/
│   │   └── core/               # 核心业务逻辑
│   │       ├── arbiter/        # 仲裁系统
│   │       ├── plugin/         # 分类插件
│   │       ├── services/       # LedgerService, PersistenceManager
│   │       └── ai_engine/      # AI 分类引擎
│   └── docs/
├── docs/                       # 主仓库文档（待创建）
├── CLAUDE.md                   # 本文件
└── .gitmodules                 # Submodule 配置
```

---

## 重要文档索引表

| 文档名称 | 内容描述 | 文件路径 |
|----------|----------|----------|
| UI/UX 设计标准 | 唯一执行标准，含首页全部交互规则、手势实现规范 | `Moni-UI-Prototype/DESIGN.md` |
| 品牌视觉规范 | 品牌色、字体、SVG 资产、Memphis 装饰规则 | `Moni-UI-Prototype/Moni_Brand_Design_Spec.md` |
| 功能需求参考 | 产品功能需求文档 | `Moni-UI-Prototype/Moni_Requirements_v2.md` |
| AI 自学习设计 | P0/P1/P2/P3 完整 AI 学习功能设计 | `pixel_bill_backend/AI_SELF_LEARNING_DESIGN_v6.md` |
| 后端架构文档 | Core-UI 分离架构、仲裁系统、持久化规范 | `pixel_bill_backend/docs/` |

---

## 开发测试闭环 SOP（待完善）

### 初始化项目

```bash
# 克隆主仓库（含 submodule）
git clone --recurse-submodules git@github.com:EdgarZhong/Moni.git

# 进入目录
cd Moni

# 初始化 submodule（如克隆时未自动执行）
git submodule update --init --recursive
```

### 参考子仓库

```bash
# 查看 UI 原型设计
cat Moni-UI-Prototype/DESIGN.md

# 查看后端逻辑结构
ls pixel_bill_backend/src/core/

# 在浏览器中启动 UI 原型（独立运行）
cd Moni-UI-Prototype
npm install
npm run dev
```

---

## 项目当前进展

### 已完成 ✅

| 任务 | 说明 |
|------|------|
| 仓库结构设计 | 确定 Core-UI 分离架构 |
| Submodule 整合 | UI 原型 + 后端逻辑作为参考子仓库 |
| 技术栈确定 | React + TypeScript + Vite + Tailwind + Capacitor |

### 进行中 🚧

| 任务 | 说明 |
|------|------|
| 主仓库初始化 | 尚未创建主仓库代码结构 |
| 架构迁移 | 将后端逻辑从 pixel_bill_backend 迁移到主仓库 |
| UI 集成 | 将 UI 原型的交互实现集成到主仓库 |

---

## 用户规则

- **永远用中文回答用户问题，中文撰写项目 CLAUDE.md 文件**
- **所有代码必须包含详细中文注释**
- 当用户要求查看项目，总览项目，扫描项目目录时：**必须递归的查看项目目录结构**
- 用户要求读取/查看任何图片/文档时，**必须真正阅读图片/文档内容**
- **行动偏好更改**：如果用户的指令略显模糊，**不要**基于经验做出假设并直接执行，**必须先询问用户具体需求**
- **绝对禁止先干活，后汇报**：在执行代码修改和命令运行前，必须先**描述清楚意图**，然后再执行
- **交互设计红线**：涉及前端交互逻辑变更，必须先汇报计划的设计细则并获得用户明确"确认"指令授权后方可实施代码
- DESIGN.md 是唯一理念/视觉/功能设计指导（来自 UI 原型仓库）

---

## Mermaid 绘图规范

- 文本中的特殊字符（如括号、空格、中文字符）会与 Mermaid 解析器发生冲突。必须使用双引号将包含特殊字符的文本包裹起来
