# DDR-0001: Design Workspace As Source Of Truth

## 状态
accepted

## 日期
2026-04-24

## 背景

Moni 之前主要依赖单一 `DESIGN.md`、聊天沉淀与子仓库原型作为 UI/UX 输入，导致设计入口分散、稳定结论与进行中讨论混杂、正式实现引用边界不清晰。

## 决策

建立主仓库 `/design` 作为唯一设计工作台，并采用：

- `briefs -> prototypes -> accepted baseline -> implementation` 的前置流程
- 开发态 `__design` 作为局部原型审查入口
- `brand / components / flows / standards / decisions` 作为稳定设计基线

## 放弃方案

- 继续维护单一 `DESIGN.md`
- 直接使用子仓库原型目录作为设计源头
- 引入 Storybook 等重型设计展示工具

## 决策理由

- 需要把“讨论材料”和“稳定规范”拆开。
- 需要让编码实现只引用已拍板设计资产。
- 需要用最轻代价建立原型预览能力，不增加额外重型依赖。

## 角色记录
- Proposer: 用户
- Reviewer: 用户
- Decision Maker: 用户
- Implementer: Codex
- Consulted: 主仓库代码现状、历史 `DESIGN.md`

## 影响范围

- `design/`
- 核心文档中的 UI/UX 工作流入口说明
- 开发态原型预览机制

## 后续约束

- 后续 UI/UX 改动必须先有 brief。
- 正式实现只能引用 accepted brief 与已拍板 design baseline。
- 若实现无法落地，必须先回到 `design/` 修改设计资产。

## 相关材料
- Brief: `design/briefs/accepted/design-workbench-bootstrap.md`
- Prototype: `design/prototypes/home-summary/`
- Component docs: `design/components/`
- Flow docs: `design/flows/`
- Standards: `design/standards/prototype-gallery.md`
