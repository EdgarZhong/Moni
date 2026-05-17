# SPEC_Inquiry_Page

> 请教页（Inquiry Page）Layer 3 规格。本页承接 `自学习系统改进变更_v1.2.md` §2.3 冻结的审计队列接口语义，定义请教页的表现层结构、状态流转、动画时序与接口约定。
>
> **页面性质**：底部导航的一级页面，5 tab 结构中位于"首页"右侧、"记账"左侧。
>
> **承担产品职能**：AI 把它不确定（或系统检测出冲突信号）的分类主动推到用户面前，由用户作为"老师"快速确认或修正。这是 Moni "AI 是学生、用户是老师" 哲学唯一有正式仪式感的教学接口。

***

## 0. 边界说明

- 本规格只定义请教页这一页的表现层结构与交互。底部导航 5 tab 改造（视觉重排、中间 M 按钮缩放、tab badge 系统）不在本规格内，由 `BottomNav` 重构专项处理。
- 单条请教项的拖拽纠错流程**完全复用首页拖拽体系**（包括 `DragDetailPanel`、分类格、`ReasonDialog`）。这些组件的视觉与交互不在本规格内重新定义；本规格只描述请教页中的差异点。
- `ReasonDialog` 的外侧蒙版语义统一约束由 `SPEC_DragDetailPanel_纠错弹窗外侧蒙版语义统一_增补.md` 定义；本规格直接引用。
- 数据接口语义由 `自学习系统改进变更_v1.2.md` §2.3 冻结；本规格不重复定义接口字段，只规定如何消费它们。

***

## 1. 概念与定位

### 1.1 页面定位

请教页是 AI 主动暴露"自己不会"或"系统不放心"的条目集合，让用户以最低成本逐条教学。它不是交易列表的筛选视图，不是错误清单，不是分类管理工具——它是教学工作台。

**关键边界**：

- 请教页只承载"快速确认 / 快速修正"的核心动作。重操作（详细备注、`is_verified` 单独切换、查看更多原始字段）走交易详情页
- 请教页不替代首页流水查看，不替代分类管理
- 请教页不是 AI 的"输出列表"，是用户的"教学队列"

### 1.2 视图组织哲学

请教页采用**按天聚合 + 含上下文条目**的视图结构。理由：

- 用户审计某条不确定条目时，需要当天的其他交易作为消费上下文（同一天的其他商户、消费时段、金额分布共同构成判断依据）
- 仅显示待审计条目会让一天的视图碎片化，失去"一天消费"的语义价值
- 与首页日卡片采用一致的视觉语言，降低用户心智成本

### 1.3 页面所属 Chrome

请教页是底部导航一级页面，**自带 header**、**共享底部导航**。Chrome 归属遵循 `SURFACE_SYSTEM.md` §1.1 中已定义的一级页面规则。

***

## 2. 数据契约

### 2.1 接口返回结构

请教页的数据源由 `自学习系统改进变更_v1.2.md` §2.3-A 定义。TypeScript 接口形式：

```typescript
interface InquiryViewData {
  /** 按天聚合的天卡片数组，已按 §2.3-B 天级排序规则排好 */
  days: InquiryDayCard[]
  /** AI 引擎当前运行状态，决定空状态分支 */
  engineStatus: 'idle' | 'running' | 'never_ran'
  /** 当前账本是否有账单（用于 NO_BILLS 判定） */
  hasBills: boolean
}

interface InquiryDayCard {
  /** ISO date string, e.g. "2026-05-12" */
  date: string
  /** 当天的全部 is_verified = false 条目，按时间升序 */
  transactions: InquiryTransaction[]
}

interface InquiryTransaction {
  /** 沿用 transaction 读模型的全部字段 */
  id: string
  counterparty: string
  product: string
  amount: number
  direction: 'expense' | 'income'
  time: string
  paymentMethod: string
  sourceType: 'wechat' | 'alipay' | 'manual'
  /** 既有分类字段 */
  ai_category: string | null
  user_category: string | null
  is_verified: boolean
  /** v1.2 §2.1 新增字段 */
  ai_confidence: 'high' | 'medium' | 'low'
  ai_needs_review: boolean
  ai_uncertainty_reason: string
  ai_evidence_ids: string[]
  ai_reasoning: string
  /* 其余既有字段省略 */
}
```

### 2.2 派生字段（前端计算）

前端按当前 filter 状态实时派生：

```typescript
type FilterLevel = 'all' | 'medium' | 'low'

/** 该条目在当前 filter 下是否可操作 */
function isOperable(t: InquiryTransaction, filter: FilterLevel): boolean

/** 该天卡片在当前 filter 下是否可见 */
function isDayVisible(day: InquiryDayCard, filter: FilterLevel): boolean

/** 该天卡片头部计数：当前 filter 下可操作条目数 / 当天总条目数 */
function dayCounts(day: InquiryDayCard, filter: FilterLevel): {
  operable: number
  total: number
}
```

具体派生规则见 `自学习系统改进变更_v1.2.md` §2.3-D.3 / D.4。

### 2.3 会话视图快照

请教页维护一个会话级 state（React state / store），结构：

```typescript
interface InquirySessionState {
  /** 当前快照，按 §2.3 接口规则形成 */
  snapshot: InquiryViewData
  /** 当前 filter */
  filter: FilterLevel
  /** 是否已发生过任意"对条目的操作"（用于批量入口激活判定） */
  hasUserActed: boolean
  /** 上次进入时间戳（用于"久未访问触发重算"判定） */
  enteredAt: number
  /** 批量模式状态 */
  bulkMode: BulkModeState
}

interface BulkModeState {
  active: boolean
  selectedIds: Set<string>
}
```

快照重算触发条件见 `自学习系统改进变更_v1.2.md` §2.3-E.3；本规格补充的具体阈值见 §13。

***

## 3. 页面区域结构

请教页从上到下的固定阅读顺序：

1. **Header 区**
2. **Filter 控件**（属于 Header 右侧）
3. **天卡片列表**（主体内容，可滚动）
4. **新批次浮现提示**（条件出现，浮于天卡片列表上层或顶部）
5. **批量化入口 / 批量化操作栏**（条件切换，固定于天卡片列表上方）
6. **底部导航**（共享 Chrome）

### 3.1 Header 区

| 元素 | 内容 | 视觉规则 |
|---|---|---|
| 左侧 | 页面标题"请教" | 使用 `font-brand` 字体族；字号与首页标题层级一致 |
| 中部 | 留白 | —— |
| 右侧 | Filter 控件（详见 §6） | 紧凑下拉 chip，带漏斗 icon |

Header 不显示账本名（账本切换器仍归属全局账本控制层，按 `SURFACE_SYSTEM.md` 现有约束处理）。

### 3.2 天卡片列表

主体内容区。每个 `InquiryDayCard` 渲染为一张天卡片；天卡片按 §2.3-B 天级排序顺序垂直堆叠。

天卡片的视觉骨架采用 `SURFACE_SYSTEM.md` §2.2 的**内容卡（Content Card）**语法。具体细节见 §5。

### 3.3 新批次浮现提示

条件出现：AI 引擎在请教页打开期间产出新的 `ai_needs_review = true` 条目时。

形态：使用 `SURFACE_SYSTEM.md` §2.4 的**情景提示卡（Hint Card）**语法的轻量变体；浮于天卡片列表顶部或作为列表顶部的临时插入项。具体形态见 §11。

### 3.4 批量化入口

固定位置：天卡片列表上方，header 下方。

两态：

- **未激活态**（默认 / 用户尚未做过任何操作）：使用 `SURFACE_SYSTEM.md` §3.5 的**幽灵按钮（Ghost）**语法，附辅助色调说明文字"先处理一两条再使用批量"或同义口径
- **激活态**（用户已做过任意条目操作）：使用 `SURFACE_SYSTEM.md` §3.2 的**次级按钮（Secondary）**语法

具体交互见 §10。

***

## 4. 状态机

### 4.1 页面级状态

```text
进入页面
  └─→ 计算 InquiryViewData
      └─→ 判定空状态分类（见 §2.3-F）
          ├─→ NO_BILLS / NO_REVIEW_YET / ALL_REVIEWED → 进入对应空状态视图（§12）
          ├─→ FILTER_EMPTY → 进入 FILTER_EMPTY 空状态视图（§12）
          └─→ RUNNING_NON_EMPTY 或 队列非空 → 进入主视图

主视图（snapshot 非空）
  ├─→ 普通模式（bulkMode.active = false）
  │   ├─→ 单条左滑确认 → §8
  │   ├─→ 单条拖拽纠错 → §9
  │   ├─→ 单条单击 → 进入交易详情页（§10）
  │   └─→ 点击批量化入口（激活态）→ 进入批量模式
  │
  └─→ 批量模式（bulkMode.active = true）
      ├─→ 单条勾选 / 取消勾选 → 更新 selectedIds
      ├─→ 日卡片全选 → §10.4
      ├─→ 点击批量确认按钮 → §10.5
      └─→ 点击批量退出 → 回到普通模式
```

### 4.2 任意条目状态变化的影响

| 条目状态变化 | 视图响应 |
|---|---|
| `is_verified` 由 false 变为 true（任何路径） | 播放左滑退场动画（§14），从所在天卡片中移除 |
| 该天卡片移除后，当前 filter 下无可操作条目 | 天卡片整体 collapse + 淡出（§14） |
| 同时所有天卡片消失 | 切换为 `ALL_REVIEWED` 空状态（§12） |

### 4.3 离开页面行为

```text
用户从底部导航切走 / 跳转到详情页 / App 进入后台
  └─→ 销毁会话视图快照（snapshot / bulkMode 全部清空）
      └─→ 下次进入重新计算

用户从详情页返回（在请教页生命周期内）
  └─→ 详情页是请教页的子页面，请教页保留 session 不销毁
      └─→ 检查刚才点击的条目状态变化（§10.2）
          └─→ 有变化 → 播放左滑退场动画后移除
          └─→ 无变化 → 视图不变
```

***

## 5. 单条请教项规格

### 5.1 条目可操作性分类

请教页内的每个 `InquiryTransaction` 在当前 filter 下属于以下两类之一：

- **可操作条目**（`isOperable(t, filter) === true`）：可左滑确认、可拖拽纠错、可单击进详情、批量模式下可勾选
- **只读条目**（`isOperable(t, filter) === false`）：仅可单击进详情；不响应左滑 / 拖拽 / 勾选

### 5.2 可操作条目视觉规格

| 元素 | 规则 |
|---|---|
| 背景色 | 按 `ai_confidence` 取**分类色板（§10）**的浅色变体——`low` → 珊瑚红浅色变体；`medium` → 黄色浅色变体；`high` → 青色浅色变体。具体色值由 `SURFACE_SYSTEM.md` 在分类色板章节扩展定义"confidence 背景色板"段落定义；本规格只规定色相对应关系 |
| 边框 | 使用 `SURFACE_SYSTEM.md` §2.2 内容卡内的子条目边框语法（细边框） |
| 字体 | `font-brand`（标题与说明）；金额使用 `font-mono` |

### 5.3 只读条目视觉规格

| 元素 | 规则 |
|---|---|
| 背景色 | 与首页流水列表已锁定 / 不可拖拽条目的"灰显蒙版"视觉一致；具体语法引用首页流水列表既有规则（与首页保持完全一致的语言） |
| 整体不透明度 | 降一档（与首页锁定条目对齐） |
| 手势响应 | 不响应左滑 / 拖拽；仅响应单击 |
| 批量模式下 | 不显示勾选框 |

### 5.4 条目内容布局

每个条目（可操作 / 只读共用同一布局，仅视觉权重不同）：

**第一行**：

- 左侧：`displayTitle`（计算口径与首页流水条目一致；引用首页规则）
- 右侧：`direction` + `amount`（"支出 ¥X.XX" / "收入 ¥X.XX"）

**第二行**：

- 左侧：当前分类标签 + 来源标签（`SURFACE_SYSTEM.md` §3.8 来源标签）
- 右侧：时间（"HH:mm"）

**第三行**（仅可操作条目显示；只读条目不显示）：

- Confidence 标签：纯文字 `证据不足` / `证据有限` / `证据充分`；视觉权重低于第一二行
- `ai_uncertainty_reason`：紧跟 confidence 标签后；最多两行，超出截断

第三行的 confidence 标签与 `ai_uncertainty_reason` 的语义关系：标签说明"AI 整体把握"，`ai_uncertainty_reason` 说明"具体哪里不确定"。

### 5.5 evidenceIds 的展示

evidenceIds 反查出的参考实例**默认不展示**，避免单条卡片信息过载。

通过**第三行末尾的"查看 AI 参考"小型 ghost 按钮**触发展开（仅可操作条目可用；evidenceIds 为空数组时该按钮不显示）。

展开后在条目下方以子卡片形式展示参考实例列表（最多 3 条），每条包含：商户名、用户当时打的分类、用户备注（若有）。这是一种次级信息查看入口，不强制用户使用。

***

## 6. Filter 控件

### 6.1 位置与形态

位置：Header 右侧。

形态：紧凑下拉 chip，引用 `SURFACE_SYSTEM.md` §3.6 **Pill 按钮**语法的下拉变体；左侧附漏斗 icon。Chip 上显示当前选中档位的简短文案。

### 6.2 三档语义与文案

| 档位 ID | 显示文案 | 语义 |
|---|---|---|
| `all` | 全部 | 显示所有 ai_needs_review = true 的天；可操作所有 is_verified = false 条目 |
| `medium` | 证据有限及以下 | 显示含 medium 或 low 待审计条目的天；medium / low 可操作，high 只读（needs_review 例外）|
| `low` | 仅证据不足 | 显示含 low 待审计条目的天；仅 low 可操作，medium / high 只读（needs_review 例外）|

### 6.3 默认值

页面首次进入默认 `filter = 'medium'`。

filter 状态属于会话视图快照的一部分（见 §2.3），不在请教页 session 间持久化——下次进入仍为默认 `medium`。

### 6.4 切换交互

点击 chip 展开三选项弹层（使用 `SURFACE_SYSTEM.md` §六 已声明的"浮动弹层"规则；允许使用阴影）。三档单选互斥。

选择新档位后：

1. 弹层关闭
2. 触发快照重算（§2.3-E.3）
3. 视图按新 filter 重新组装，可见天集合与可操作集合按 §2.3-D 重新派生
4. 视觉过渡使用淡入淡出（§14）而非天卡片重新排序的剧烈位移动画

***

## 7. 天卡片规格

### 7.1 天卡片视觉骨架

引用 `SURFACE_SYSTEM.md` §2.2 **内容卡（Content Card）**语法。

天卡片始终展开，**不支持折叠**，不播放展开 / 折叠动画。这一点与首页日卡片不同（首页支持折叠以节省空间），原因：请教页就是任务页面，用户进来就是要看条目，不应该有"先点开"的额外阻力。

### 7.2 天卡片头部

| 元素 | 内容 |
|---|---|
| 左侧 | 日期，格式"M月D日"，紧凑形式（与首页日卡片一致） |
| 右侧 | 计数标签：`X 条不确定 / Y 条共计` |

**计数规则**：

- `X`：当前 filter 下该天的**可操作条目数**（即 `dayCounts(day, filter).operable`）
- `Y`：当天**全部 `is_verified = false` 条目数**（即 `dayCounts(day, filter).total`）

`X` 随 filter 切换而变化；`Y` 仅随条目出列变化。

`X` 与 `Y` 之间的视觉分隔使用斜杠或类似轻量分隔符；具体形态由表现层实现决定，但不允许采用进度条等强视觉元素（避免误导为预算进度）。

### 7.3 天卡片内条目顺序

天内条目按时间升序排列（与首页日卡片顺序一致），不按 confidence 优先级重新排序。

可操作条目与只读条目混排在同一时间序列中，仅视觉权重不同。

### 7.4 天卡片整体退场动画

当天卡片内的所有可操作条目均退场（出列），且当前 filter 下该天卡片变为不可见时，天卡片整体执行**collapse + 淡出**动画：

- 卡片连同剩余的只读条目一起执行
- **只读条目不单独播放左滑动画**——它们随天卡片整体塌缩
- 动画曲线与时序见 §14

***

## 8. 单条左滑确认

### 8.1 触发条件

- 条目必须是**可操作条目**（只读条目无响应）
- 用户手指在条目区域内向左滑动，超过触发阈值（具体阈值见 §14）

### 8.2 视觉反馈

- 拖拽过程中：条目向左位移，右侧逐渐显露绿色（薄荷色，引用 `SURFACE_SYSTEM.md` 已有的薄荷色规则）的"确认"语义指示
- 超过触发阈值后松手：条目继续左滑至屏幕外，完成出列
- 未超过阈值松手：条目回弹至原位（无副作用）

### 8.3 副作用

左滑确认触发后：

1. 调用接口：`is_verified = true`（不修改 `user_category`、不写 `user_note`）
2. 触发会话状态更新：`hasUserActed = true`（用于激活批量化入口）
3. 从快照中移除该条目

### 8.4 与首页拖拽手势的区分

请教页**不**支持向右滑动手势。用户的所有"我对这条没意见"的反馈必须通过左滑表达。这与首页流水列表的双向滑动手势行为可能不一致；请教页采取单向手势降低误操作风险。

***

## 9. 拖拽纠错（修改分类）

### 9.1 触发与流程

完全复用首页拖拽体系：长按可操作条目 → 进入拖拽模式 → 拖拽到目标分类格 → 投放完成 → 弹出 `ReasonDialog`。

请教页中不修改任何首页拖拽组件的视觉与交互；唯一差异在 `ReasonDialog` 的外侧蒙版语义（由 `SPEC_DragDetailPanel_纠错弹窗外侧蒙版语义统一_增补.md` 统一定义）。

### 9.2 ReasonDialog 三态在请教页中的具体行为

| 动作 | 接口副作用 | 请教页视觉响应 |
|---|---|---|
| **完成**（带 user_note） | `user_category` 更新；`user_note` 写入；`is_verified = true` | 关闭弹窗 → 条目播放左滑退场动画（与左滑确认动画完全一致）→ 出列 |
| **跳过**（不带 user_note） | `user_category` 更新；`user_note` 不变；`is_verified = true` | 同上 |
| **取消**（外侧蒙版） | 无任何写入 | 关闭弹窗 → 条目回到原位置，无视觉变化；条目保持原状态留在视图中 |

### 9.3 hasUserActed 触发

"完成"与"跳过"动作触发 `hasUserActed = true`；"取消"动作**不**触发。

***

## 10. 单击进交易详情页

### 10.1 触发

可操作条目与只读条目均支持单击。请教页内的条目单击行为统一为：**进入交易详情页**。

详情页的所有交互与规格沿用 `SPEC_DragDetailPanel_and_TransactionDetailPage.md` 第三章。请教页不修改详情页内部任何交互。

### 10.2 从详情页返回的退场判定

用户在详情页修改了条目状态（任意一项变化），返回请教页时，请教页检查该条目的状态变化：

```typescript
function shouldPlayDismissAnimation(beforeState: InquiryTransaction, currentState: InquiryTransaction): boolean {
  return (
    beforeState.is_verified !== currentState.is_verified ||
    beforeState.user_category !== currentState.user_category ||
    beforeState.user_note !== currentState.user_note
  )
}
```

返回 `true` 时：

- 该条目播放左滑退场动画
- 从快照中移除
- 触发 `hasUserActed = true`

返回 `false` 时：

- 视图无变化
- 不触发 `hasUserActed`

### 10.3 仅 is_verified 单独切换的情况

详情页支持单独切换 `is_verified`（不修改分类）。该单独切换在请教页中也视为"用户已确认"，触发退场动画。

***

## 11. 批量化

### 11.1 入口两态

**未激活态**（`hasUserActed === false`）：

- 按钮使用 `SURFACE_SYSTEM.md` §3.5 **幽灵按钮**语法
- 不响应点击
- 附辅助说明文字：`先处理一两条再使用批量`（或同口径精简文案，由表现层最终敲定）
- 视觉权重低，不抢主视图

**激活态**（`hasUserActed === true`）：

- 按钮使用 `SURFACE_SYSTEM.md` §3.2 **次级按钮**语法
- 响应点击 → 进入批量模式
- 文案："批量确认"

`hasUserActed` 一旦置 true，在请教页 session 生命周期内**不再回退到 false**——即便用户清空所有已操作的视觉结果，批量入口仍保持激活。

### 11.2 进入批量模式

点击激活态批量入口 → 进入批量模式：

- 所有可操作条目左侧出现勾选框（使用 `SURFACE_SYSTEM.md` 已有的勾选框样式；若无现成规则，则在 surface system 中新增勾选框语法）
- 只读条目**不出现勾选框**，仍可单击进详情，但不参与批量
- 天卡片头部增加"全选当天"按钮（仅勾选当天的可操作条目，不勾选只读条目）
- 页面顶部切换为批量操作栏：左侧"已选 N 条"，右侧"批量确认"主按钮 + "退出批量"次级按钮

### 11.3 勾选与全选行为

- 单条勾选 / 取消勾选：更新 `bulkMode.selectedIds`
- 天卡片全选：将该天**所有可操作条目** ID 加入 `selectedIds`（不影响只读条目；不影响其他天）
- 天卡片"取消全选"：该天可操作条目从 `selectedIds` 移除

### 11.4 批量确认执行

点击批量操作栏的"批量确认"按钮：

1. 调用接口：对 `selectedIds` 中所有 transaction 批量设置 `is_verified = true`（不修改 user_category、不写 user_note）
2. 进入批量退场动画序列（§14）
3. 动画完成后，自动退出批量模式回到普通模式
4. 若退场后所有天卡片消失 → 切换为 `ALL_REVIEWED` 空状态

### 11.5 批量退场动画核心规则

- 每个被勾选的条目（**仅可操作条目**）依次（或并发，时序由 §14 定）执行左滑退场动画
- 同一天卡片内的只读条目**不参与左滑动画**
- 当某天的所有可操作条目左滑完成后，该天卡片如不再满足"当前 filter 下可见"条件，**整张天卡片连同剩余只读条目一起执行 collapse + 淡出**（不让只读条目跟着左滑）

### 11.6 退出批量模式

任意时刻点击"退出批量"按钮 → 立即退出批量模式：

- 清空 `selectedIds`
- 关闭批量操作栏
- 移除所有勾选框
- 不执行任何接口副作用
- 视图回到普通模式（已勾选过的条目仍在原位置，状态不变）

***

## 12. 空状态规格

### 12.1 五种空状态的接口判定

判定逻辑（按优先级从上到下，第一个匹配的状态生效）：

```typescript
function getEmptyStateCode(data: InquiryViewData, filter: FilterLevel): EmptyStateCode {
  if (!data.hasBills) return 'NO_BILLS'

  const everHadReview = /* 当前账本曾产出过 ai_needs_review = true 的条目 */
  if (!everHadReview && data.engineStatus !== 'running') return 'NO_REVIEW_YET'

  const allOperableCleared = /* snapshot 中无任何 isOperable === true 的条目 */
  if (allOperableCleared) {
    const wouldHaveResultsWithLessStrictFilter =
      filter !== 'all' && /* 放宽 filter 后存在可操作条目 */
    if (wouldHaveResultsWithLessStrictFilter) return 'FILTER_EMPTY'
    return 'ALL_REVIEWED'
  }

  // 还有可操作条目，但 AI 仍在跑
  if (data.engineStatus === 'running') return 'RUNNING_NON_EMPTY' // 不是空状态
  return null // 正常队列
}
```

注意 `RUNNING_NON_EMPTY` 不是空状态，列出仅为表现层在该状态下决定是否显示"AI 正在运行"提示。

### 12.2 各空状态的视觉与文案

各空状态使用 `SURFACE_SYSTEM.md` §2.4 **情景提示卡**或同等语法的居中展示形态。具体文案与视觉：

| 状态码 | 主标题 | 副说明 | 主行动按钮 | 视觉氛围 |
|---|---|---|---|---|
| `NO_BILLS` | 还没有账单可以请教 | AI 需要至少一笔账单数据才能开始学习 | "去导入账单"→ 跳记账页 | 中性引导色 |
| `NO_REVIEW_YET` | AI 暂时没有想问的 | 还没开始分类，或对已有的都很有把握 | 无（或提供"启动 AI 分类"快捷入口）| 中性安心色 |
| `ALL_REVIEWED` | 教得不错 | AI 现在对所有交易都有把握了 | 无 | 正向反馈色（薄荷色调）|
| `FILTER_EMPTY` | 当前筛选下没有需要请教的 | 试试放宽到"证据有限及以下"或"全部" | "切换 filter"快捷按钮 | 中性引导色 |

### 12.3 RUNNING_NON_EMPTY 状态的视觉提示

该状态不是空状态，队列正常显示。但需要在天卡片列表顶部显示一个轻量提示：

- 文案：`AI 正在分类，可能还会有新条目进来`
- 形态：使用 §3.3 定义的新批次浮现提示同款视觉，但作为常驻提示而非临时浮现
- 不阻断用户操作；不抢主视图焦点

***

## 13. 新批次浮现

### 13.1 触发

AI 引擎在请教页打开期间产出新批次，新增 `ai_needs_review = true` 条目时。

### 13.2 视觉形态

新条目以**淡入 + 轻微下方滑入**的方式追加到对应位置（已存在的天卡片末尾，或作为新天卡片整体追加到列表末尾）。

不允许：

- 整体视图重排
- 已有天卡片位置变化
- 已有条目位置变化

### 13.3 顶部小提示

在新批次首次追加后，页面顶部显示一个临时小提示：

- 文案：`AI 新增 N 条待请教，向下查看`
- 形态：使用 `SURFACE_SYSTEM.md` §2.4 情景提示卡语法的轻量变体；可包含一个小型"跳到底部"快捷按钮
- 自动消失条件：用户滚动到列表末尾 OR 经过 N 秒（建议 5 秒）OR 用户主动关闭

如果 RUNNING_NON_EMPTY 常驻提示已存在，临时小提示不重复显示——直接更新常驻提示的计数即可。

### 13.4 用户在请教页停留期间的多次追加

多次追加遵循同一规则：累计加到对应位置，不打断当前位置。临时小提示在每次新增后刷新计数与计时。

***

## 14. 动画时序

本节定义所有动画的时序与曲线。所有具体时长、ease 曲线值在表现层实现时引用既有动画 token；如 token 缺失则在实现时新增到 surface system。

### 14.1 单条左滑确认（含拖拽纠错后的退场）

```text
1. 触发：用户左滑超过阈值 OR ReasonDialog 完成/跳过 OR 详情页返回检测到状态变化
2. 阶段 A：条目向左位移至屏幕外
   - 位移幅度：100vw 或同等表达
   - duration：~250ms
   - easing：ease-out
3. 阶段 B：条目从 DOM 中移除，其下方条目以高度坍塌动画上移补位
   - duration：~200ms
   - easing：ease-in-out
4. 总时长：~450ms
```

未超过左滑阈值松手时，条目回弹至原位：

```text
duration：~180ms
easing：ease-out（带轻量过冲，确认视觉手感）
```

### 14.2 天卡片整体 collapse + 淡出

```text
1. 触发：天卡片内最后一个可操作条目完成左滑退场后，当前 filter 下该天不可见
2. 阶段 A：天卡片高度坍塌 + 透明度从 1 → 0
   - duration：~280ms
   - easing：ease-in-out
3. 阶段 B：其下方天卡片上移补位
   - duration：~200ms
   - easing：ease-in-out
4. 总时长：~480ms
```

### 14.3 批量退场动画时序

```text
1. 触发：用户点击批量确认按钮
2. 阶段 A：所有被勾选的可操作条目并发执行左滑动画（不是逐条等待）
   - 单条 duration：~250ms（同 §14.1 阶段 A）
   - 所有条目同时启动
3. 阶段 B：每个条目左滑完成后，立即触发其所在天卡片的可见性重判定
   - 该天剩余可操作条目数变为 0 → 触发天卡片整体 collapse + 淡出（§14.2）
4. 阶段 C：所有动画完成后，退出批量模式
5. 总时长：~450ms（单条左滑）+ ~480ms（天卡片塌缩）≈ ~930ms（最坏情况）
```

### 14.4 新批次浮现

```text
1. 新条目从对应位置（天卡片底部 / 新天卡片顶部）以淡入 + 轻微下方滑入呈现
2. 入场偏移：~12px 或同等表达
3. duration：~320ms
4. easing：ease-out
```

### 14.5 Filter 切换

```text
1. 用户选定新 filter 档位
2. 阶段 A：当前视图整体淡出
   - duration：~180ms
3. 阶段 B：快照按新 filter 重算
4. 阶段 C：新视图整体淡入
   - duration：~220ms
5. 总时长：~400ms
```

不允许：filter 切换时让天卡片重新排序产生剧烈位移；统一用淡入淡出过渡。

### 14.6 批量入口激活态切换

```text
当 hasUserActed 由 false 变为 true 时：
- 入口按钮颜色与样式从幽灵态过渡到次级按钮态
- duration：~240ms
- easing：ease-in-out
```

### 14.7 进入 / 退出批量模式

```text
进入批量模式：
- 勾选框从 opacity 0 / scale 0.8 → opacity 1 / scale 1
- 顶部批量操作栏从顶部滑入
- duration：~280ms

退出批量模式：
- 反向动画
- duration：~220ms
```

### 14.8 空状态切换

```text
从主视图切换到空状态（或反向）：
- 整体淡出 → 淡入
- duration：~280ms（每段）
```

***

## 15. 与其他模块的接口约定

### 15.1 数据消费

请教页消费由 `LedgerService` 提供的请教视图数据 API。函数签名（建议名，最终以编码 agent 实现为准）：

```typescript
/** 获取当前账本的请教视图数据 */
function getInquiryViewData(): Promise<InquiryViewData>

/** 监听 needs_review 条目变化（AI 引擎产出新批次时触发） */
function subscribeNeedsReviewChanges(callback: (newTransactions: InquiryTransaction[]) => void): Unsubscribe
```

请教页前端基于以上 API 维护本地快照 state。

### 15.2 出列写入

请教页的所有"出列"动作通过既有 `LedgerService` 接口完成。函数签名建议：

```typescript
/** 单条左滑确认；语义等同于"用户再次选择同一分类" */
function verifyTransaction(id: string): Promise<void>

/** 批量确认 */
function verifyTransactionsBatch(ids: string[]): Promise<void>
```

实现层应保证 `verifyTransaction` 与首页拖拽中"再次选择同一分类"调用的是同一底层逻辑，不引入第二份实现。

### 15.3 引擎状态查询

请教页需要消费 AI 引擎运行状态以判定空状态分支。复用 `HomeAiEngineUiState`（或同等口径的引擎状态 store），不引入新的状态通道。

### 15.4 详情页跳转

请教页单击条目时跳详情页，使用既有详情页路由 API。从详情页返回时，请教页恢复 session，按 §10.2 检查条目状态变化。

***

## 16. 不在本规格内的事项

以下显式声明不在本规格内，留给后续 release 或专项处理：

- 底部导航 5 tab 改造（间距、中间 M 按钮缩放、tab badge 系统）
- tab badge 上的待请教数量显示（涉及账本切换与跨 session 状态管理，需独立设计）
- 老用户升级到 5 tab 版本时的首次提示
- 请教页内的 AI 学习状态可视化（v1.2 §2.1 新字段的进一步利用）
- 拖拽纠错时的 "category 推荐" 智能提示（基于 evidenceIds 推荐目标分类）
- 多账本下的合并审计视图（当前所有审计仅限当前账本）

***

## 17. 更新历史

### v1（2026-05-15）

- 初版规格落地，承接 `自学习系统改进变更_v1.2.md` §2.3 全部接口语义
- 引用 `SPEC_DragDetailPanel_纠错弹窗外侧蒙版语义统一_增补.md` 的 ReasonDialog 外侧蒙版统一约束
- 引用 `SURFACE_SYSTEM.md` §1.1（页面 Chrome）、§2.2（内容卡）、§2.4（情景提示卡）、§3.2 / §3.5 / §3.6（按钮家族）、§3.8（来源标签）等既有视觉语法
- 表现层视觉色值、字号、圆角均通过 surface system 规则名引用，不硬编码
