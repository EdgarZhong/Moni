# Moni Design Workspace

`/design` 是 Moni 主仓库唯一的设计工作台，用于承接所有 UI/UX 变更在正式编码前的讨论、原型、审查、拍板与稳定基线沉淀。

## 设计定位

- `/design` 是所有 UI/UX 改动的唯一设计入口。
- `/design` 是正式实现前的讨论区、原型区、审查区与拍板区。
- `/design` 是编码实现时的单向参考源，不直接承载运行时代码。
- `/design` 是设计与代码保持一致的前置约束来源；正式代码必须对齐已拍板 design 资产。

## 根目录组织

```text
design/
├── README.md
├── briefs/
├── brand/
├── components/
├── flows/
├── standards/
├── prototypes/
└── decisions/
```

各目录职责：

- `briefs/`：设计讨论区。所有 UI/UX 任务必须先从 `briefs/active/` 开始。
- `brand/`：品牌级稳定规则，如颜色、字体、Logo、Memphis 风格。
- `components/`：组件级稳定规则，一个组件一个文件，只记录已确认规范。
- `flows/`：流程级稳定规则，一个流程一个文件，描述任务路径、状态变化、异常边界。
- `standards/`：跨组件、跨流程的执行标准，如移动端触控、Pointer Events、WebView、安全区、原型展示协议。
- `prototypes/`：局部 React + TypeScript 原型代码区，只服务设计审查。
- `decisions/`：Design Decision Record，记录重要设计取舍。

## 工作流

### 阶段 1：Design Brief

1. 在 `design/briefs/active/{feature}.md` 创建 brief。
2. brief 必须写清：
   - 背景
   - 目标
   - 非目标
   - 用户场景
   - 涉及页面
   - 涉及组件
   - 状态覆盖
   - 设计约束
   - 是否需要 prototype
   - 待拍板问题
3. 该阶段允许不稳定、允许讨论、允许多方案并存。

### 阶段 2：设计探索

1. 围绕 active brief 讨论收口。
2. 若只是文案、小规则、小边界调整，可只修改 brief。
3. 若需要视觉判断、交互判断、布局判断，进入 prototype 阶段。
4. 在结论未稳定前，不得提前污染 `components/`、`flows/`、`brand/`、`standards/`。

### 阶段 3：局部可视化原型

1. 在 `design/prototypes/{feature}/` 建立局部原型。
2. 原型统一使用 React + TypeScript。
3. 原型只覆盖本次改动区域，不重建全 App。
4. 原型只使用 mock 数据，不接真实业务逻辑。
5. 原型必须能通过开发态 `__design` 入口预览。
6. 若有多个方案，可在同一 feature 下保留 variant。

### 阶段 4：可视化审查与拍板

1. 启动开发服务器，进入 `http://localhost:{port}/__design`。给用户提供直达本次审查需要的url。
2. 按 brief 对应入口审查 prototype。
3. 用户拍板后，在 brief 中记录最终采用方案与放弃方案。
4. 通过审查的 brief 从 `briefs/active/` 移入 `briefs/accepted/`。
5. 用户提出修改/微调，在当前活跃brief与prototype上重新执行阶段2 3 4。
6. 用户要求推倒重做，放弃方案移入 `briefs/rejected/`。
7. 禁止存在未分类 brief。

### 阶段 5：固化设计基线

**只有在可视化审查通过后，才把稳定结论写入设计基线：**

- 新增或改变组件规则：更新 `design/components/{component}.md`
- 新增或改变用户流程：更新 `design/flows/{flow}.md`
- 新增或改变全局视觉规则：更新 `design/brand/*`
- 新增或改变跨端 / 手势 / 技术约束：更新 `design/standards/*`
- 存在重要取舍：新增 `design/decisions/DDR-xxxx-{title}.md`

### 阶段 6：正式实现

1. 编码实现只能基于以下已拍板设计资产：
   - accepted brief
   - prototype
   - brand
   - components
   - flows
   - standards
   - DDR
2. 若实现过程中发现 design 无法落地，不能直接在代码里变通。
3. 必须先回到 `design/` 修改 brief / prototype / component / flow / DDR，再继续实现。

### 阶段 7：一致性检查

1. 实现完成后，检查正式 UI 是否与已拍板 design 对齐。
2. 不要求每次都机械反写 design。
3. 但任何实际偏离都必须通过新的 brief / DDR / component / flow 修改显式确认。

## 使用规则

- 每一次 UI/UX 改动必须先从 `design/briefs/active` 开始。
- 没有 accepted brief 或明确 design baseline 引用的 UI 改动，不应直接进入正式代码。
- 只有在可视化审查通过或用户拍板微型修补后，才能把稳定结论写入基线文档。
- 正式实现只能参考已拍板的 design 资产。
- 代码是实现事实，`/design` 是设计源头；两者通过“设计先行 + 实现对齐检查”保持一致。

## 已迁入的稳定资产

- 产品定位、首页主舞台定义、首页浏览主流程已经迁入 `flows/home-browsing.md` 与本 README。
- 视觉基调、品牌三色、字体、Logo、Memphis 风格已经迁入 `brand/`。
- Header、底部导航、看板卡、情景提示卡、统计栏、分类概览、Data Range Picker、分类轨道、日卡片、交易条目、拖拽蒙版、详情页、AI 状态、AI 控制、随手记、设置列表、弹窗、Toast 已迁入 `components/`。
- 首页浏览、Data Range 联动、拖拽纠错、AI 控制、导入账单、随手记、AI 记忆、预算设置、设置页、引导、重分类已迁入 `flows/`。
- 移动端触控、Pointer 事件、WebView、安全区、触觉反馈、F12 移动模拟与原型展示要求已迁入 `standards/`。

## 开发态预览

- `__design` 仅开发态启用。
- `__design` 只用于浏览 `design/prototypes/` 下的局部原型。
- `__design` 不进入正式移动端产物。
- prototype 只服务设计拍板，不作为生产组件。

## 维护约束

- 原 `DESIGN.md` 不再作为维护入口；历史通过 Git 追溯。
- 若主仓库代码现状与历史设计资产冲突，以主仓库代码现状为唯一基准，重新沉淀到本目录。
- 核心文档只保留本工作流的简短入口说明，不复制这里的完整内容。
