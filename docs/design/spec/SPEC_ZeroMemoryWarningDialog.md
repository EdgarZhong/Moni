# 零记忆消费风险提示对话框规格

**文档层级**: Layer 3 — Page Spec  
**范围**: 浮动对话框组件  
**状态**: 设计完成  

---

## 一、产品背景

当用户账本无激活记忆且待分类日期范围超过 7 天时，启动 AI 消费前弹出此对话框，提醒用户风险并提供两个选项。

---

## 二、视觉设计规范

### 2.1 卡片语法

使用**浮动弹层**语法（内容卡变体 + 阴影）：

```
底色:       white
描边:       border-secondary (1.5px solid #DDD)
圆角:       rounded-card-sm (12px)
阴影:       0 6px 20px rgba(0,0,0,0.15)  /* 浮动弹层标准阴影 */
内边距:     24px（顶端留 20px 为标题，内容段落间 16px）
最大宽度:   320px（移动端适配）
位置:       固定居中屏幕，距顶部约 40% 高度
```

### 2.2 栅栏背景

```
背景:       rgba(0, 0, 0, 0.3)  /* 半透明黑色遮罩，让用户聚焦弹窗 */
z-index:    1000  /* 高于其他 UI 元素，低于弹窗本体 1010 */
点击关闭:   点击外侧区域任何位置（包含背景）都能关闭弹窗
```

### 2.3 内容区布局

```
标题区:
  - 文字: "未检测到消费记忆"
  - 字号: font-brand, font-bold, text-lg (18px)
  - 颜色: text-ink (#222)
  - 底部间距: 12px

副标题区（可选，看内容长度决定是否显示）:
  - 文字: "当前 AI 没有学习记录，直接启动消费可能导致分类结果不准确，且消耗大量 token。"
  - 字号: 14px, 常规
  - 颜色: text-dim (#888)
  - 底部间距: 16px

消息体:
  - 文字: "你有 {daysCount} 天的交易待分类。建议先从最近的 7 天开始："
  - 字号: 14px, 常规
  - 颜色: text-ink (#222)
  - 底部间距: 12px

建议框（高亮区块）:
  - 底色: bg-warn-surface (#FFF8F0)
  - 描边: border-secondary border-warn-border
  - 圆角: rounded-card-xs (10px)
  - 内边距: 12px
  - 主文: "从 {endDate} 往前 7 天（{startDate} ~ {endDate}）"
    - 字号: 14px, 常规
    - 颜色: text-ink (#222)
  - 副文: "根据 AI 的分类结果手动修正几笔，它会逐步学习你的习惯。然后再开启全范围分类。"
    - 字号: 12px, 常规
    - 颜色: text-dim (#888)
    - 顶部间距: 8px
  - 整体底部间距: 20px（留给按钮容器的上边距）
```

### 2.4 按钮区布局

```
容器:
  - 显示: flex / column / gap: 12px
  - 宽度: 100%（继承弹窗宽度）

按钮 1 "先处理最近 7 天":
  - 样式: 薄荷按钮（Mint）- 推荐选项
  - 底色: bg-mint (#4ECDC4)
  - 文字: white, font-bold, font-brand
  - 描边: border-primary border-mint
  - 圆角: rounded-card-sm (12px)
  - 内边距: 12px （高度约 44-48px，适应触控）
  - 行为: 点击后关闭弹窗，自动调整 date range 为 7 天窗口，启动消费

按钮 2 "全部处理":
  - 样式: 次级按钮（Secondary）- 备选选项
  - 底色: white
  - 文字: text-ink (#222), font-bold
  - 描边: border-secondary border-muted
  - 圆角: rounded-card-sm (12px)
  - 内边距: 12px （高度约 44-48px，适应触控）
  - 行为: 点击后关闭弹窗，保持原 data range，直接启动消费
```

### 2.5 关键数据字段

| 字段 | 定义 | 计算方式 | 格式示例 |
|------|------|---------|---------|
| `daysCount` | 待分类日期总数 | `consumableDates.length` | "8" |
| `startDate` | 7 天窗口的起点 | 最晚日期 - 6 days | "2026-05-14" 或 "5 月 14 日" |
| `endDate` | 7 天窗口的终点（待分类最晚日期） | 最晚日期 | "2026-05-20" 或 "5 月 20 日" |

**日期格式选择**：
- 简洁方案：`MM-DD` 如 `05-14`
- 本地化方案：`M月D日` 如 `5 月 14 日`
- 推荐选择：本地化方案，更易阅读

**示例**（触发条件满足的情况）：
- 待分类日期：[2026-04-28, 2026-04-30, 2026-05-01, 2026-05-03, 2026-05-05, 2026-05-10, 2026-05-15, 2026-05-20]（共 8 天）
- daysCount：8（> 7，满足触发条件）
- 最晚日期：2026-05-20
- startDate：2026-05-14（最晚日期往前倒 6 天）
- endDate：2026-05-20（即这个 7 天窗口的最晚日期）

**反例**（不应触发）：
- 待分类日期：[2026-04-28, 2026-05-01, 2026-05-05, 2026-05-20]（共 4 天）
- daysCount：4（≤ 7，不满足触发条件，不显示弹窗）

---

## 三、交互规范

### 3.1 打开弹窗

触发条件：
- 用户点击底部导航"开启"按钮
- 逻辑层检测到"无记忆 && 待分类日期 > 7"
- UI 层调用 `appFacade.startAiProcessing(onShowDialog)` callback

弹出效果：
```
动画: fade-in 0.3s (从 opacity: 0, transform: translateY(10px) → 完全显示)
栅栏也同时出现，同一时间线
```

### 3.2 按钮交互

**"只分类 7 天" 按钮**：
```
交互流程:
  1. 用户点击 → 按钮按下效果（opacity/scale 变化，20ms）
  2. 300ms 内弹窗 fade-out
  3. 逻辑层收到 'classify7days' 回调
  4. 首页 DateRangePicker 自动调整
  5. 消费引擎启动
```

**"确认全范围消费" 按钮**：
```
交互流程:
  1. 用户点击 → 按钮按下效果
  2. 300ms 内弹窗 fade-out
  3. 逻辑层收到 'consumeAll' 回调
  4. 消费引擎直接启动（不调整 data range）
```

### 3.3 关闭交互

点击背景或外侧区域关闭：
```
交互流程:
  1. 用户在栅栏区域点击（或轻扫）→ 弹窗 fade-out
  2. 逻辑层不收到任何回调（或收到 undefined/cancel）
  3. UI 层恢复空闲态，不启动消费
```

### 3.4 禁用状态

- 弹窗打开期间，底部导航应禁用（opacity: 0.5）
- 用户无法在弹窗打开时点击其他按钮或执行其他操作

---

## 四、代码约定

### 4.1 组件命名

```typescript
// 弹窗组件
export function ZeroMemoryWarningDialog({
  daysCount: number;
  startDate: Date;
  endDate: Date;
  onClassify7Days: () => void;
  onConsumeAll: () => void;
  onClose: () => void;
  isOpen: boolean;
}: ZeroMemoryWarningDialogProps)

// 使用位置：AppRoot 的 Overlay Host 中
// 或 MoniHome 顶层
```

### 4.2 样式来源

所有样式使用 tailwind tokens，禁止硬编码：

```
bg-white              ✓
border-secondary      ✓
border-muted          ✓
rounded-card-sm       ✓
text-ink              ✓
text-dim              ✓
bg-mint               ✓
border-primary        ✓
```

禁止：
```
bg-#FFFFFF            ✗
rounded-12px          ✗
shadow-lg             ✗（使用具体数值的内联 style）
```

### 4.3 回调约定

```typescript
// 逻辑层
onShowZeroMemoryWarningDialog?: (latestDate: Date, daysCount: number) => Promise<'classify7days' | 'consumeAll'>

// UI 层实现该 callback，返回 Promise<用户选择>
// - 用户点击"先处理最近 7 天" → resolve('classify7days')
// - 用户点击"全部处理" → resolve('consumeAll')
// - 用户点击外侧关闭 → 不 resolve，逻辑层可选处理或忽略
```

---

## 五、响应式设计

### 桌面浏览器（作为参考，非主目标）

```
最大宽度: 380px（接近手机宽度）
位置: 固定居中
栅栏: 存在，opacity 0.3
```

### 移动端（主目标）

```
宽度: 100% - 32px（左右各 16px margin）
最大宽度: 320px
高度: auto（内容自适应）
位置: fixed, top: 40% (可调，确保不与导航重叠)
```

---

## 六、无障碍规范

```
焦点管理:
  - 弹窗打开时，焦点移到第一个按钮
  - Tab 键在两个按钮间循环
  - Escape 键关闭弹窗

ARIA 标签:
  - role="alertdialog"
  - aria-labelledby="warning-title"
  - aria-describedby="warning-message"
```

---

## 七、动画时序

```
弹窗出现: 300ms fade-in (ease-out)
按钮按下反馈: 20ms scale(0.98)
弹窗关闭: 200ms fade-out (ease-in)
```

---

## 八、测试覆盖

- [ ] 弹窗在满足条件时正确显示
- [ ] 两个按钮都能点击，触发正确的回调
- [ ] 点击外侧关闭，不启动消费
- [ ] 日期显示正确（待分类天数、7 天窗口日期范围）
- [ ] 移动端触控响应无延迟
- [ ] Escape 键关闭弹窗（可选增强）

