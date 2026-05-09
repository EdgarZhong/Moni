# Moni 设计规格体系

## 体系概述

Moni 的设计规格分为四个层次。每一层解决一个不同的问题，有各自的载体和维护节奏。

```
Layer 0 — 品牌身份（Brand Identity）
  ↓ 提供气质方向和品牌资产
Layer 1 — 表面系统（Surface System）
  ↓ 定义组件视觉语法规则
Layer 2 — Design Tokens
  ↓ 提供可直接引用的代码值
Layer 3 — Page Spec
    定义具体页面的结构、交互、数据契约
```

## Layer 0 — 品牌身份

**解决的问题**：Moni 是谁？它看起来应该给人什么感觉？

**内容**：品牌色的语义说明（为什么选珊瑚红而不是正红）、品牌字体选型理由、Logo 和品牌标识的定稿 SVG、Memphis 装饰的气质方向、AI 流光效果的品牌语义、吉祥物定义。

**载体**：`docs/design/Moni_Brand_Identity.md`

**消费者**：产品决策者（你）。编码 agent 不直接消费这份文档——它消费的是从这里推导出的 token 和 surface system。

**维护节奏**：几乎不变。只在品牌重塑时修改。

**产出方式**：由你和设计能力最强的 AI（当前是 Claude）在品牌定调阶段一次性完成。后续只做小幅修订。

---

## Layer 1 — 表面系统

**解决的问题**：什么场景用什么视觉组合？

**内容**：组件视觉语法规则。定义卡片家族（主卡、内容卡、各自的描边/圆角/底色/阴影规则）、按钮家族（主按钮、次级按钮、危险按钮、pill 按钮的样式规范）、输入框家族、页面类型与视觉语法的对应关系（一级页面用什么卡片语法、二级页面用什么、overlay 页面跟随哪一套）、全局禁止项（什么时候不允许渐变、阴影上限）。

**载体**：`docs/design/SURFACE_SYSTEM.md`

**消费者**：编码 agent。这是它在做一个新组件时回答"这个东西应该长什么样"的第一参照物。

**维护节奏**：低频。只在出现新的组件类型或页面类型时追加规则。日常增量开发中只查阅不修改。

**产出方式**：由你审查现有页面的视觉现状，确认哪些是你接受的、哪些需要修正，然后由 Claude 整理成文档。后续出现新场景时，由你判断它跟随哪套现有语法或需要新增一条规则，追加即可。

---

## Layer 2 — Design Tokens

**解决的问题**：每个具体的视觉值是什么？

**内容**：所有视觉值的代码化注册——颜色、字体、字重、圆角、间距、描边粗细、阴影。以 Tailwind 自定义 token 的形式存在于 `tailwind.config.js` 中。

**载体**：`tailwind.config.js`

**消费者**：编码 agent 和代码本身。agent 写代码时直接引用 token name（如 `bg-surface`、`border-ink`、`rounded-card`），不允许硬编码字面值。

**维护节奏**：极低。只在品牌色调整或发现缺少某个语义 token 时修改。

**产出方式**：由 Claude 基于 Brand Identity 和 Surface System 中已确认的值一次性产出。编码 agent 负责将现有硬编码值逐步迁移到 token 引用。

**强制约束（写入 AGENTS.md）**：所有新代码禁止硬编码色值、字号、圆角值，必须使用 tailwind config 中定义的 semantic token。

---

## Layer 3 — Page Spec

**解决的问题**：这个具体页面/功能由哪些区域组成、每个区域展示哪些字段、用户可以做什么操作、操作触发什么副作用？

**内容**：页面区域结构、字段展示规则（含空值处理）、状态流转（用伪代码或状态机表示）、动画时序、与其他系统的接口约定（TypeScript interface + 函数签名）。

**载体**：每个 design scope 一份独立的 spec 文档，统一放在 `docs/design/spec/` 下，如 `docs/design/spec/SPEC_DragDetailPanel_and_TransactionDetailPage.md`。

**消费者**：编码 agent。这是它的"施工图"。

**维护节奏**：随功能开发产出，随需求变更修订。

**产出方式**：由你定义产品体验和交互意图，由编码 agent（GPT）基于仓库上下文撰写完整规格，你审查确认后生效。Page Spec 引用 Surface System 的语法名（如"使用内容卡语法"），不直接硬编码视觉值。

---

## 层间引用规则

- Page Spec 引用 Surface System 的规则名，不直接定义视觉样式
- Surface System 引用 Design Tokens 的 token name，不直接写色值或尺寸
- Design Tokens 是唯一包含具体数值的层
- Brand Identity 不被代码层直接引用，它是 Surface System 和 Tokens 的设计依据

## 变更流向

- 品牌调整 → 先改 Brand Identity → 推导出 Token 变更 → 检查 Surface System 是否需要调整
- 新增页面类型 → 在 Surface System 中判断跟随已有语法还是新增规则 → 写 Page Spec 引用该语法
- 新增组件类型 → 在 Surface System 中新增该组件的视觉语法 → 如需新 token 则追加到 tailwind config

## 约束

- 编码 agent 在实现任何表现层变更前，必须先查阅 Surface System 和 Design Tokens
- 先改文档，再改代码——任何对 Surface System 或 Tokens 的修改必须先更新文档，经产品确认后再反映到代码
- Page Spec 中不允许出现具体色值、字号、圆角数值——这些必须以 token name 或 surface system 规则名的形式引用
