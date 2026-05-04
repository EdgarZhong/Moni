# Bug Fix Plan — 2026-05-04

## Context

用户在实际测试中发现多个 bug，涉及随手记面板弹出、首页滚动、账本切换、AI 状态跨页、日期范围选择器同步、学习刷新、密码页 safe area。本计划按 bug 逐条列出根因 + 修改方案，所有修改均在主仓库内完成。

---

## Bug 1 — EntryFormPanel 弹出后立刻缩回

**根因**：`phase === "dragging"` 时在 `window` 上注册了 `handlePointerCancel → closeOverlay()`。某些设备会在 `pointerup` 之后立即触发 `pointercancel`。此时 React effect cleanup 尚未运行（DOM 事件比 React 渲染周期快），旧监听器仍在，导致面板打开后立刻被 `closeOverlay()` 打回 `idle`。

**修改文件**：`src/ui/pages/MoniEntry.tsx`

**方案**：
1. 在 MoniEntry 函数组件顶部增加 `const entryFormOpenedRef = useRef(false)`
2. `openEntryForm` 里加 `entryFormOpenedRef.current = true`
3. `closeOverlay` 里加 `entryFormOpenedRef.current = false`
4. `handlePointerCancel` 里加 guard：`if (entryFormOpenedRef.current) { entryFormOpenedRef.current = false; return; }`

---

## Bug 2 — 面板侧边滚动条 + 高度自适应

**根因**：白色面板 div（`EntryFormPanel` ~654行）直接设 `overflowY: "auto"` 未隐藏 scrollbar；`maxHeight: "75dvh"` 偏低，内容容易触发滚动。

**修改文件**：`src/ui/pages/MoniEntry.tsx`

**方案**：
1. 为面板内容 div 加 CSS class（复用 `entry-scroll-container` 模式的 no-scrollbar）
2. `maxHeight` 改为 `calc(var(--app-root-height, 100dvh) - 60px)`，允许面板高度接近屏幕顶部 60px 处
3. 在已有 `<style>` 标签中确认 `.entry-form-panel-inner { scrollbar-width: none; -ms-overflow-style: none; }` 和 `::-webkit-scrollbar { display: none }` 覆盖到该 class

---

## Bug 3 — 首页列表惯性滚动不一致

**根因**：`handleItemPointerDown` 启动 400ms 长按计时器。若用户做滑动手势，浏览器接管触摸流（element 上触发 `pointercancel`），但定时器仍跑。400ms 后 `lockDragScroll()` 意外触发（`touchAction: "none"`），破坏正在进行中的惯性滚动或阻止下次惯性建立。

**修改文件**：`src/ui/pages/MoniHome.tsx`

**方案**：
1. 在 `handleItemPointerDown` 内，同时监听该 element 的 `pointermove`：若移动距离超过阈值（Y 轴 > 8px）或触发 `pointercancel`，立即 `clearLongPressTimer()`
2. 为 `scrollRef` 容器加 `WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"]`，确保跨浏览器惯性一致
3. 在 `handleItemPointerDown` 的 cleanup 中移除上述临时监听器

---

## Bug 4 — 记账页账本切换按钮是摆设

**根因**：`LedgerHeaderControl` 在 MoniEntry ~1304行调用时无 `onClick`，`useMoniEntryData()` 已有 `availableLedgers` 和 `actions.switchLedger` 但未接入。

**修改文件**：`src/ui/pages/MoniEntry.tsx`

**方案**（完全对齐 MoniHome 的账本切换实现）：
1. 增加 `const [ledgerDropdownOpen, setLedgerDropdownOpen] = useState(false)`
2. 从 `useMoniEntryData()` 解构 `availableLedgers`（已存在）
3. header 区域最外层 `div` 加 `position: "relative"`
4. 给 `LedgerHeaderControl` 加 `onClick={() => setLedgerDropdownOpen(v => !v)}`
5. 在 LedgerHeaderControl 同级加条件渲染的下拉菜单，JSX 结构与 MoniHome 第 830-876 行相同（账本列表、选中态、switchLedger 调用）

---

## Bug 5 — AI 引擎工作效果跨页面可见 + 可交互

**根因**：`EntryBottomNav`（MoniEntry.tsx）完全无 AI 状态；`SettingsBottomNav`（MoniSettings.tsx）有显示但无交互控制条；两者均是独立内联组件，未复用 `moni-home/components.tsx` 中功能完整的共享 `BottomNav`。

**修改文件**：
- `src/ui/hooks/useAiEngineControl.ts`（新建）
- `src/ui/pages/MoniEntry.tsx`
- `src/ui/pages/MoniSettings.tsx`

**方案**：
1. **新建 `useAiEngineControl` hook**：从 MoniHome 提取 AI 控制逻辑，返回 `{ aiOn, aiStop, controlOpen, controlHit, controlRef, handleStartControl, handleEndControl, handleCancelControl, updateControlHit }`。内部订阅 `appFacade`，读取 `aiEngineUiState`。
2. **MoniEntry**：删除 `EntryBottomNav` 组件，改用从 `@ui/features/moni-home/components` 导入的共享 `BottomNav`；使用 `useAiEngineControl()` 提供所有 AI props；`activePage="entry"` 以正确高亮。
3. **MoniSettings**：删除 `SettingsBottomNav` 组件，同上，`activePage="settings"`。
4. MoniHome 自身的 `BottomNav` 传入改为也使用 `useAiEngineControl()`（如 AI 控制逻辑尚未提取，则同时在 MoniHome 中替换）。

---

## Bug 6 — 不应被选中的文字可以选中

**规则**（已与用户确认）：
- **全局禁止选中**（一刀切）：首页、记账页、底部导航、header 等所有非输入区域
- **两类例外**：① 设置页的 `input`/`textarea` 输入框；② `TransactionDetailPage` 交易详情页内容文字区（金额、商户名、时间、分类等信息，用户可能需要复制）

**修改文件**：`src/bootstrap/AppRoot.tsx` 或全局根容器（加全局 CSS）

**方案**（最简洁）：
1. 在全局 `<style>` 或根容器 style 中加 `* { user-select: none; -webkit-user-select: none; }`
2. 补充恢复规则：`input, textarea { user-select: text; -webkit-user-select: text; }`
3. 在 `TransactionDetailPage` 的内容展示区 div 加 `style={{ userSelect: "text", WebkitUserSelect: "text" }}`

---

## Bug 7 — DateRangePicker 滑块不与快捷键同步 / 无过渡动画

**根因**：
1. `DateRangeDialog` 内部 `draftStartDay`/`draftEndDay` 用 `useState(() => ...)` 懒初始化，之后不再自动同步 props
2. `onQuickSelect(mode)` 只改 `rangeMode`，不更新 `customStart`/`customEnd`，下次打开 dialog 时 draft 仍是旧值
3. 滑块 thumb 的 `left` 变化没有 CSS transition

**修改文件**：
- `src/ui/pages/MoniHome.tsx`（`onQuickSelect` 回调）
- `src/ui/features/moni-home/components.tsx`（`DateRangeDialog`）

**方案**：
1. **MoniHome**：在 `onQuickSelect(mode)` 中，调用已有的 range 计算函数（与 `dataRange` 和 `rangeBounds` 联动），得到对应 `start`/`end` 日期，同时调 `setCustomStart(start)` 和 `setCustomEnd(end)`，使 dialog 下次打开时 draft 从正确值初始化
2. **DateRangeDialog**：增加 `useEffect([visible])` — 当 `visible` 变为 `true` 时，重新从 `customStart`/`customEnd` props 同步 `draftStartDay`/`draftEndDay`（处理 dialog 未卸载但重新打开的情况）
3. **滑块 thumb**：为 thumb 的 `style` 加 `transition: "left 0.2s ease"`

---

## Bug 8 — 学习完成后设置页不刷新

**根因**：`appFacade.triggerImmediateLearning()` 内调用了 `this.notify()`，但 `notify()` 时机可能早于快照完全落盘，subscribe 回调触发的 `load()` 读到的仍是旧数据。用户需切换页面（触发 MoniSettings unmount → remount → `load()`）才能看到更新。

**修改文件**：`src/ui/hooks/useMoniSettingsData.ts`

**方案**：在 `triggerImmediateLearning` 的实现里，在 `appFacade.triggerImmediateLearning()` resolve 之后，显式再调一次 `load()`：
```typescript
const triggerImmediateLearning = useCallback(async (): Promise<boolean> => {
  const result = await appFacade.triggerImmediateLearning();
  await load(); // 确保拿到落盘后的最新快照
  return result;
}, [load]);
```

---

## Bug 9 — 密码输入页 Header 被摄像头挖孔遮住

**根因**：`ImportPasswordPage` 的 header `padding: "18px 16px 12px"` 固定，无 `env(safe-area-inset-top)` 处理。

**修改文件**：`src/ui/pages/MoniEntry.tsx`（`ImportPasswordPage` 约284行）

**方案**：header 的 padding 改为：
```typescript
padding: "max(18px, env(safe-area-inset-top, 0px)) 16px 12px"
```
同时确认项目 HTML 模板中 `<meta name="viewport">` 已包含 `viewport-fit=cover`（如无则需补充）。

---

## 实施顺序建议

| 优先级 | Bug | 改动规模 |
|-------|-----|---------|
| 1 | Bug 9：密码页 safe area | 1行 |
| 2 | Bug 1：面板缩回 | 4处微改 |
| 3 | Bug 2：面板滚动条 + 高度 | ~5行 |
| 4 | Bug 4：记账页账本切换 | ~40行 |
| 5 | Bug 8：学习完成不刷新 | ~3行 |
| 6 | Bug 7：DateRangePicker 同步 | ~20行 |
| 7 | Bug 3：惯性滚动 | ~20行 |
| 8 | Bug 6：文字不可选 | 分散多处 |
| 9 | Bug 5：AI 跨页面 | 最大，新建 hook + 重构两个页面 nav |

---

## 验证方案

1. `npm run typecheck` 全量通过
2. `npm run build` 通过（允许既有 chunk size warning）
3. Playwright MCP `390×844` 视口验证：
   - 记账页拖拽到分类后面板稳定弹出，无立刻关闭
   - 面板高度自适应，无侧边滚动条
   - 密码输入页 header 顶部间距正常
   - 记账页账本切换下拉菜单可用
   - 切换到记账页/设置页后底部导航首页 tab 显示 AI 状态（如 AI 在运行）
   - DateRangePicker 快捷键切换后滑块同步更新
   - 学习触发后停留设置页可看到快照更新
