# Debugging Handoff: Moni 首页 DateRangePicker 状态恢复 Bug

> 生成时间: 2026-05-05
> 当前分支: master
> 最近提交: e8a6b39

## 1. 问题描述

**Bug 1（切账本）：** "测试_旅行"账本切换日期范围到"全部"后，切换页面再回来，范围回到"本月"且无数据显示。"日常开销"账本正常。

**Bug 2（同账本切页面）：** "日常开销"账本选择自定义范围 3月26日→4月16日，切换到设置页再切回首页，范围变成 4月16日→4月16日（`customStart` 被覆盖为 `customEnd` 的值）。

## 2. 已做修改

`src/ui/pages/MoniHome.tsx` line 340-370（restore effect）：

```diff
- const restoreSessionKey = `${currentLedger.id}::${rangeBounds.min}::${rangeBounds.max}`;
- if (!rangeBounds.min || !rangeBounds.max) return;
- if (restoredRangeSessionKeyRef.current === restoreSessionKey) return;
- restoredRangeSessionKeyRef.current = restoreSessionKey;
+ if (restoredRangeSessionKeyRef.current === currentLedger.id) return;
+ restoredRangeSessionKeyRef.current = currentLedger.id;
  // 依赖数组去掉 rangeBounds.max, rangeBounds.min
```

**这个修改不够，两个 bug 仍然存在。**

## 3. 代码架构

### 3.1 三个概念 & 对应变量的映射

| 概念 | 代码变量 | 说明 |
|------|----------|------|
| 账本数据边界 | `dataRange.min/max` (来自 `useMoniHomeData`) | 从 facade `computeLedgerBounds(records)` 计算 |
| 用户 UI 选择 | `rangeMode`, `customStart`, `customEnd` (MoniHome useState) | 快捷模式 + 自定义滑块位置 |
| 过滤交集 | `committedRangeSelection.applied` (useMemo) | 两者交集，提交给 facade 做实际过滤 |

### 3.2 缓存机制（`MoniHome.tsx` line 108-141, 365-392）

```typescript
// 模块级缓存，按账本 ID 索引
const homeRangeUiSessionStateByLedger = new Map<string, HomeRangeUiSessionState>();

// 缓存内容（line 374-381）
homeRangeUiSessionStateByLedger.set(currentLedger.id, {
  rangeMode, customStart, customEnd,
  draftRangeMode, draftCustomStart, draftCustomEnd,
});

// 恢复内容（line 126-141, 360-368）
function restoreHomeRangeUiSessionState(ledgerId) {
  const cached = homeRangeUiSessionStateByLedger.get(ledgerId);
  return cached ?? { rangeMode: "本月", customStart: today, customEnd: today, ... };
}
```

### 3.3 关键依赖链

```
MoniHome (UI 组件)
  └─ useMoniHomeData()
       └─ appFacade.getMoniHomeReadModel({ homeDateRange, ... })
            └─ 返回 dataRange (账本边界) → MoniHome 的 rangeBounds

MoniHome 提交范围:
  committedRangeSelection.applied → actions.setHomeDateRange()
    → useMoniHomeData 的 setHomeDateRange
      → appFacade.setDateRange() + setHomeDateRange(state)
```

## 4. 需要排查的怀疑方向

### 怀疑 A: `useMoniHomeData` 的 `homeDateRange` 初始值覆盖缓存

`useMoniHomeData.ts` line 177-184:
```typescript
const [homeDateRange, setHomeDateRange] = useState(() => {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };  // 硬编码"本月"
});
```

每次 `MoniHome` 切页重挂 → `useMoniHomeData` 重挂 → `homeDateRange` 重置为"本月"。

`loadReadModel` 在 mount 时立即执行（line 234-255），用"本月"范围调 facade。
同时 restore effect 也触发，恢复缓存的 `customStart`/`customEnd`，再调 `setHomeDateRange`。

**可能的竞态：** 初始的"本月"请求后返回，覆盖了缓存恢复后的正确数据？

检查 `requestIdRef` 机制（line 190, 197-198）是否能防住这个竞态：
```typescript
const requestId = ++requestIdRef.current;
// ... async ...
if (requestId !== requestIdRef.current) return;
```

理论上 requestId 递增，restore 发出的请求 ID > 初始请求 ID，应该覆盖回去。
但 `startTransition`（line 202）可能改变调度优先级，需要确认。

### 怀疑 B: 缓存保存时 `customStart`/`customEnd` 仍然是初始值

缓存保存 effect（line 365-392）依赖 `[customStart, customEnd, dataRange, ...]`。

组件重挂时的渲染序列：
1. **Render 1:** `customStart = dataRange.min ?? today`，`customEnd = dataRange.max ?? today`
   - `dataRange` 初始为 null（来自 EMPTY_READ_MODEL）
   - 所以 `customStart = today`，`customEnd = today`
2. **Render 1 后 Effects:**
   - restore effect: `setCustomStart("2026-03-26")`, `setCustomEnd("2026-04-16")`
   - 触发 Render 2
3. **Render 2 后 Effects:**
   - save effect 依赖满足（dataRange 仍为 null → 跳过）
4. **Render N:** facade 返回，dataRange 加载
5. **Render N 后 Effects:**
   - save effect: `customStart`/`customEnd` 此时应该是恢复后的值 → 正确保存

理论上没问题。**但如果 React 并发特性导致 effects 的调度顺序不同，或者 `dataRange` 在某些情况下不为 null 而是有旧值**，save effect 可能在 restore 之前触发。

**验证方法：** 在 save effect 开头加 `console.log` 打印实际保存的值和触发时机。

### 怀疑 C: "测试_旅行"无缓存 → restore 用"本月" → 无数据 → 但切页前用户选的"全部"没有保存

用户第一次使用"测试_旅行"时：
1. 无缓存 → `restoreHomeRangeUiSessionState` 返回 "本月"
2. `dataRange` 加载 → save effect 保存 "本月" 到缓存
3. 用户切到"全部" → save effect 更新缓存为 "全部" ✓

但如果用户**还没等 `dataRange` 加载完就切换了账本**，save effect 可能保存了错误值。
或者 save effect 的依赖顺序导致在用户切到"全部"之前就已经保存了"本月"。

**验证方法：** 在"测试_旅行"上操作时，在浏览器 console 打印 `homeRangeUiSessionStateByLedger` 的内容。

### 怀疑 D: `dataRange` 在切页重挂时不是 null 而是旧账本的值

如果 `useMoniHomeData` 的 `EMPTY_READ_MODEL` 中 `dataRange` 不是 null（或者有某种缓存），切页后 `dataRange` 立刻有值，save effect 可能在 restore 之前触发。

检查 `EMPTY_READ_MODEL`（`useMoniHomeData.ts` line 25-87）:
```typescript
dataRange: { min: null, max: null },  // 确认是 null
```

所以这个怀疑不成立。

### 怀疑 E: `committedRangeSelection` 的 `customStart`/`customEnd` 使用了闭包旧值

`buildRangeSelection`（line 256-289）是 useCallback，依赖 `[rangeBounds.max, rangeBounds.min, toDateKey]`。
`committedRangeSelection`（line 291-294）是 useMemo，依赖 `[buildRangeSelection, customEnd, customStart, rangeMode]`。

当 restore effect 调用 `setCustomStart("2026-03-26")`，`committedRangeSelection` 的依赖中有 `customStart`，应该重新计算。

但 save effect（line 365）的依赖是 `committedRangeSelection`，不是 `customStart`/`customEnd` 直接。
如果 `committedRangeSelection` 的引用没有正确变化（对象引用相同但内容不同），save effect 可能不触发。

## 5. 建议的调试步骤

### Step 1: 确认竞态是否存在

在 `MoniHome.tsx` 的 save effect 开头加日志：
```typescript
useEffect(() => {
  if (!currentLedger.id || !dataRange.min || !dataRange.max) {
    console.log('[CACHE] Skip save: dataRange not loaded');
    return;
  }
  console.log('[CACHE] Saving:', {
    ledger: currentLedger.id,
    rangeMode, customStart, customEnd,
  });
  homeRangeUiSessionStateByLedger.set(currentLedger.id, { ... });
}, [...]);
```

同样在 restore effect 加日志：
```typescript
useEffect(() => {
  console.log('[RESTORE] ledger:', currentLedger.id, 'cached:',
    homeRangeUiSessionStateByLedger.get(currentLedger.id));
  // ...
}, [currentLedger.id]);
```

复现步骤后看 console 的时间顺序。

### Step 2: 验证 `useMoniHomeData` 初始 `homeDateRange` 是否发出错误请求

在 `loadReadModel` 开头加日志：
```typescript
const loadReadModel = useCallback(async () => {
  const requestId = ++requestIdRef.current;
  console.log('[loadReadModel] requestId:', requestId, 'homeDateRange:', homeDateRange);
  // ...
});
```

看 mount 时发出的请求是否用了"本月"范围，以及 restore 后是否重新发出正确请求。

### Step 3: 如果确认竞态，修复方向

**方向 1：** 让 `useMoniHomeData` 的 `homeDateRange` 初始化也读取缓存：
```typescript
const [homeDateRange, setHomeDateRange] = useState(() => {
  // 从模块级缓存读取，而不是硬编码"本月"
});
```
但 `useMoniHomeData` 不应该知道 MoniHome 的 UI 状态，违背关注点分离。

**方向 2：** 在 `MoniHome` 中，restore 后立即同步触发 `setHomeDateRange`，不等 `dataRange` 变化：
```typescript
// restore effect 内，恢复 UI 状态后直接提交：
useEffect(() => {
  // ... restore ...
  // 不等 dataRange 变化，直接提交恢复后的范围
  const selection = buildRangeSelection(restored.rangeMode, restored.customStart, restored.customEnd);
  actions.setHomeDateRange(selection.applied);
}, [currentLedger.id]);
```

**方向 3：** 最彻底方案 — 在 `MoniHome` 挂载时，先用缓存的 UI 状态渲染，再等 facade 数据：
- 用 `useState(() => restoreHomeRangeUiSessionState(currentLedger.id))` 初始化
- 避免先渲染默认值再恢复的两次渲染

### Step 4: 验证 Bug 2（customStart 变 customEnd）

这个 bug 更可疑 — `customStart` 变成了 `customEnd` 的值。可能的原因：
- 某个地方错误地写了 `setCustomStart(customEnd)`
- `clampDateString` 逻辑有问题
- 在"自定义"模式下，`customStart` 被 clamp effect 覆盖

检查 `MoniHome.tsx` line 312-338 的 clamp effect：
```typescript
if (rangeMode !== "自定义") return;
const nextStart = clampDateString(customStart, rangeBounds.min, rangeBounds.max);
if (nextStart !== customStart) setCustomStart(nextStart);
```

如果 `rangeBounds.min` 大于缓存的 `customStart`，`customStart` 会被 clamp 到 `rangeBounds.min`。
**如果 `rangeBounds.min` 正好等于 `customEnd`（4月16日），就会出现这个症状！**

检查"日常开销"账本的 `dataRange.min` 是否恰好是 4月16日。

## 6. 相关文件

- `src/ui/pages/MoniHome.tsx` — 主要文件，restore/save effects 所在
- `src/ui/hooks/useMoniHomeData.ts` — facade wrapper，homeDateRange 状态管理
- `src/logic/application/facades/AppFacade.ts` — `getMoniHomeReadModel`, `setDateRange`
- `src/ui/features/moni-home/helpers.ts` — `getRange()` 快捷范围计算

## 7. 开发命令

```bash
# 启动 dev server
npm run dev

# Playwright MCP 测试（移动端视口 390x844）
# 浏览器打开 localhost:5173
```

## 8. 口径确认（来自用户）

1. 只缓存用户意图：`rangeMode` + `customStart`/`customEnd`（按账本缓存）
2. 账本边界：从读模型 records 计算，不缓存
3. 过滤交集：每次用 (1) + (2) 重算，不缓存
4. restore 触发条件：只看 `currentLedger.id`（账本切换），不与 bounds 耦合
