# Design Workspace Bootstrap Design Brief

## 状态
accepted

## 背景

Moni 需要从“单一 `DESIGN.md` + 聊天沉淀”切换到轻量、可维护、可预览的设计工作台，以便后续所有 UI/UX 工作在正式编码前先完成 brief、prototype 与设计基线沉淀。

## 目标

- 建立 `/design` 作为唯一设计工作台。
- 将已固化 UI/UX 资产按品牌、组件、流程、标准与决策拆分。
- 建立开发态 `__design` 局部原型预览机制。
- 在核心文档中留下精简工作流入口。

## 非目标

- 不在本 brief 中重做正式产品 UI。
- 不在本 brief 中引入 Storybook 等重型工具。
- 不要求把所有历史讨论逐条搬运进新文档。

## 用户场景

- 设计变更前先建 brief。
- 需要视觉判断时，在 `__design` 中审查 prototype。
- 拍板后再进入正式实现。

## 涉及页面

- `__design`
- 首页相关设计基线文档
- 设置页、记账页、详情页设计基线文档

## 涉及组件

- Header
- Bottom Nav
- Dashboard Card
- Date Range Picker
- Transaction Item
- Dialog
- Toast

## 状态覆盖
- 默认态
- 空目录态
- 原型展示态
- 开发态可访问 / 生产态不可访问

## 设计约束

- `design/README.md`
- `design/standards/prototype-gallery.md`
- `design/standards/capacitor-webview.md`

## 原型需求

需要一个最小可运行 prototype，证明 `__design` 机制可预览局部设计。

## 待拍板问题

- `__design` 是否引入路由库：否，维持轻量分流。
- prototype 是否接业务数据：否，仅 mock。

## 角色记录
- Proposer: 用户
- Reviewer: 用户
- Decision Maker: 用户
- Implementer: Codex
- Consulted: 主仓库现状与历史设计资产

## 拍板结论

采用轻量 `design/` 工作台 + 开发态 `__design` 入口。后续 UI/UX 改动必须先经过 brief，再进入正式实现。

## 相关材料
- Prototype: `design/prototypes/home-summary/`
- DDR: `design/decisions/DDR-0001-design-workspace-as-source-of-truth.md`
- Component docs: `design/components/`
- Flow docs: `design/flows/`
- Standards: `design/standards/prototype-gallery.md`
