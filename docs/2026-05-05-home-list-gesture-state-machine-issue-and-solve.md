# 首页交易列表手势状态机 — Issue 分析与实现方案

> 2026-05-05 定稿
> 项目：Moni UI（移动端记账 Web App）
> 运行环境：Android WebView（Chromium 内核），Vite + React 18

---

## 1. 问题背景

首页交易列表需要同时支持两种互斥交互：

1. **手指滚动列表** — 上下滑动浏览，需要有系统级惯性
2. **长按条目拖拽** — 按住 420ms 后弹出分类蒙版，拖拽不被原生滚动中断

核心冲突是 W3C Pointer Events 规范中 `touch-action` 的**同序列不可变性**：在 `pointerdown` 那一刻，浏览器就已决定该触摸序列是交给 UA 处理 pan/zoom，还是交给 JS。后续对 `touch-action` CSS 的修改在同一次触摸中无效。

### 尝试过的方案及结论

| 方案 | 做法 | 结论 |
|------|------|------|
| A `touch-action: none` + 手动 `scrollTo` | JS 每帧写 `scrollTop` | 能滚动但无惯性、中间区域推不动、掉帧 |
| B `touch-action: pan-y` | 恢复原生滚动 | 滚动流畅但长按拖拽被原生滚动抢走 |
| C `pan-y` + 长按时动态改 CSS | 运行时改 `touch-action` | 无效，同序列不可变 |
| D `pan-y` + `preventDefault()` | pointermove 里阻止 | 无效，承诺在 pointerdown 已确定 |
| E 手势库（use-gesture 等） | 引入第三方库 | 同样无法绕过 touch-action 同序列不可变 |

**结论**：没有任何单一 `touch-action` 值能同时满足两种需求，也不能在触摸中途动态切换。

---

## 2. 最终方案：原生 JS 手写状态机 + 全量 `touch-action: none`

### 2.1 核心选择

```
touch-action: none（交易条目）
+
原生 JS 手势状态机
+
原生 JS 跟手滚动（直接写 scrollTop）
+
原生 JS 惯性滚动（rAF + velocity * dt + exponential decay）
```

不选择 `pan-y` 的原因是它不可逆——一旦 pointerdown 时 UA 承诺了 pan-y，本次触摸中无法再禁止原生滚动来支持拖拽。

### 2.2 状态机定义

```
idle → pressing → scrolling → inertia → idle
              ↘ dragging → idle
```

| 状态 | 含义 | 流转条件 |
|------|------|----------|
| `idle` | 无活跃手势 | pointerdown → pressing |
| `pressing` | **唯一决策点**：观察用户意图 | 420ms 内垂直移动 ≥ 8px → scrolling；420ms 到期仍静止 → dragging；420ms 内松手且静止 → tap；420ms 内水平移动为主 → cancel |
| `scrolling` | 本次手势只滚动 | pointerup → inertia 或 idle |
| `dragging` | 本次手势只拖拽 | pointerup/pointercancel → idle |
| `inertia` | JS 惯性滚动中 | 速度低于阈值 / 撞到边界 / 新 pointerdown 打断 → idle |

**关键原则**：`pressing` 是唯一做决策的状态。一旦进入 `scrolling` 就不能变成 `dragging`，反之亦然。

### 2.3 推荐参数

```
LONG_PRESS_MS    = 420      // 长按判定时间
MOVE_THRESHOLD   = 8        // 位移判定阈值（px）
AXIS_LOCK_RATIO  = 1.15     // 轴锁定比例（垂直/水平）
```

---

## 3. 跟手滚动

### 3.1 公式

```
scrollTop = startScrollTop - (currentY - startY)
```

只依赖三个值：`startScrollTop`、`startY`、`currentY`。不依赖当前 item 位置、可视区域元素数量等上下文，因此**天然不会出现区域差异**。

### 3.2 禁止的做法

- 累计 delta
- 滚动比例系数
- `scrollTo({ behavior: "smooth" })`
- 根据当前位置变化的修正系数

### 3.3 边界处理

```
scrollTop = clamp(scrollTop, 0, maxScrollTop)
```

---

## 4. 惯性滚动

### 4.1 释放速度计算

不使用最后两帧，而是使用最近约 **100ms** 的 pointer move 样本窗口：

```
VELOCITY_WINDOW_MS = 100

samples.push({ t: performance.now(), y: event.clientY })

// 只保留最近 100ms
while (samples.length > 2 && now - samples[0].t > VELOCITY_WINDOW_MS) {
  samples.shift()
}

fingerVelocity = (last.y - first.y) / (last.t - first.t)
scrollVelocity = -fingerVelocity  // 取负号：手指向下 → scrollTop 减小
```

### 4.2 惯性积分公式

必须使用基于真实时间积分的公式，而非固定衰减：

```
scrollTop += velocity * dt
velocity *= Math.exp(-dt / tau)
```

不用 `velocity *= 0.92` 的原因是 rAF 调用频率匹配屏幕刷新率（可能是 60/75/120/144Hz），不基于 `dt` 会导致动画速度依赖设备。

### 4.3 惯性参数

```
INERTIA_TAU    = 325      // ms，衰减时间常数
MIN_VELOCITY   = 0.025    // px/ms，停止阈值
MAX_VELOCITY   = 3.0      // px/ms，防止异常样本
MAX_DT         = 32       // ms，防止主线程长帧导致跳帧
```

---

## 5. 性能设计

### 5.1 热路径禁止项

滚动热路径（pointermove + rAF 惯性帧）中禁止：

- React setState
- `getBoundingClientRect` 扫列表
- 大量读取 offsetHeight / offsetTop
- 分类命中检测
- DOM 写入后立刻读取布局

### 5.2 handleScroll rAF 节流

```
scrollTicking ref → 如果正在 ticking 则跳过
requestAnimationFrame → 在下一帧做轻量同步逻辑
```

### 5.3 状态存储

手势状态机的所有运行时状态统一放在 `useRef` 中，不使用 React state，避免 setState 带来的异步批处理延迟。

---

## 6. 文件结构

| 文件 | 职责 |
|------|------|
| `src/ui/hooks/useHomeListGestureController.ts` | 手势状态机 hook（抽离为独立 TS 模块） |
| `src/ui/pages/MoniHome.tsx` | 首页主组件，装配 hook + 业务回调 |
| `src/ui/features/moni-home/components.tsx` | `DayCard` 组件，接收 gesture handlers |

### Hook API

```ts
const gesture = useHomeListGestureController({
  scrollRef,
  longPressMs: 420,
  moveThreshold: 8,
  axisLockRatio: 1.15,
  onTapItem,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  lockHomeScroll,
  unlockHomeScroll,
  onScroll,          // rAF 节流后的滚动回调
});
```

交易条目只接收：

```tsx
onPointerDown={(event) => gesture.onItemPointerDown(item, event)}
onPointerMove={gesture.onItemPointerMove}
onPointerUp={gesture.onItemPointerUp}
onPointerCancel={gesture.onItemPointerCancel}
```

---

## 7. 完整手势流程图

```
pointerdown on item
  ├─ 打断正在进行的惯性滚动
  ├─ 进入 pressing 状态
  ├─ 启动 420ms 长按定时器
  │
  ├── pointermove（pressing 期间）
  │     ├─ 垂直移动 ≥ 8px 且 absY > absX * 1.15
  │     │     → 取消长按 → 进入 scrolling
  │     │     → 后续 move：直接写 scrollTop 跟手
  │     │
  │     ├─ 水平移动 ≥ 8px 且 absX > absY * 1.15
  │     │     → 取消一切 → idle
  │     │
  │     └─ 未达阈值
  │           → 继续观察
  │
  ├── 420ms 到期（仍在 pressing）
  │     ├─ 位移 < 8px
  │     │     → 进入 dragging → lockHomeScroll → onDragStart
  │     │     → window pointermove 更新拖拽位置
  │     │     → pointerup → onDragEnd → unlockHomeScroll
  │     │     → pointercancel → onDragCancel → unlockHomeScroll
  │     │
  │     └─ 位移 ≥ 8px
  │           → 已移动过 → idle（不触发拖拽）
  │
  └── pointerup（pressing 期间）
        ├─ 位移 < 8px → tap → onTapItem（打开详情）
        └─ 位移 ≥ 8px → 不可能（已进入 scrolling 或 cancel）
```

---

## 8. 验收标准

| 维度 | 标准 |
|------|------|
| 手势分流 | 短按→打开详情；420ms 内滑动→首页滚动；长按 420ms→拖拽面板；进入滚动后不会再进入拖拽；进入拖拽后不会再滚动首页 |
| 跟手滚动 | 低速按住时列表跟随手指移动；同样的手指位移在顶部、中部、底部产生同样的 scrollTop 变化 |
| 惯性滚动 | 快速滑动松手后有惯性；惯性距离由释放速度决定；顶部/中部/底部同样速度触发的惯性力度一致；不同刷新率设备上速度不变形 |
| 性能 | pointermove 热路径不 setState / 不扫 DOM / 不 getBoundingClientRect；惯性 rAF 中只写 scrollTop；handleScroll 至少 rAF 节流；unmount 后无遗留 timer/raf/listener |
