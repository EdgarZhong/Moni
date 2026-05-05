# AI 零记忆消费风险提示规格文档

**版本**: 1.0  
**日期**: 2026-05-05  
**状态**: 草案  

---

## 一、功能背景

当用户的 AI 记忆为空（从未进行过学习/修正，或记忆已被清空）时，启动消费引擎可能导致 AI 的分类结果完全随意，可能耗费大量 token 但获得无用输出。本功能旨在在零记忆场景下，提醒用户风险，并提供"先试 7 天"的安全选项，避免误操作。

---

## 二、功能定义

### 2.1 触发条件

在用户点击"开启"按钮触发 AI 消费时（即调用 `appFacade.startAiProcessing()` 时）：

1. 检查当前账本是否有激活的记忆快照
   - 通过 `MemoryManager.load(ledgerName)` 获取记忆条目
   - 如果返回空数组 `[]`，视为"无记忆"状态

2. 预估当前 data range 内的消费日期数
   - 从 `classifyIndex` 的待处理任务中，过滤出落在当前 data range 内的日期
   - 统计唯一的日期数（即需要消费的天数）

3. 判断是否需要显示弹窗
   - 如果 `无记忆` **且** `消费天数 > 7`，显示警告弹窗
   - 否则继续正常启动消费，无弹窗

### 2.2 弹窗交互

#### 2.2.1 弹窗结构

显示内容：
```
标题：
  "未检测到消费记忆"

副标题（可选）：
  "当前 AI 没有学习记录，直接启动消费可能导致分类结果不准确，且消耗大量 token。"

消息体：
  "当前设置的日期范围内，有 {daysCount} 天的交易待分类。建议："
  "
  1. 先让 AI 分类最近的 7 天（从 {startDate} 到 {endDate}）
  2. 根据结果手动修正，AI 会逐步学习
  3. 然后再启动全范围消费
  
  或者，你也可以信任 AI，直接对整个范围进行消费。"

按钮：
  [只分类 7 天]  [确认全范围消费]

交互：
  - 点击外侧空白处可关闭弹窗，不启动消费
```

#### 2.2.2 日期显示格式

- `{startDate}` 显示为 `YYYY-MM-DD` 或本地化格式（如 `5 月 14 日`）
- `{endDate}` 为待处理**最后一天**（即最晚的日期）

#### 2.2.3 按钮行为

| 按钮 | 行为 | 说明 |
|------|------|------|
| 只分类 7 天 | 自动调整 data range，启动消费 | 见 § 2.3 |
| 确认全范围消费 | 保持当前 data range，启动消费 | 标准启动流程 |

点击弹窗外侧关闭弹窗，不启动消费。

---

## 三、Data Range 自动调整逻辑

### 3.1 调整触发

用户在弹窗中选择"只分类 7 天"时触发。

### 3.2 日期计算

因为消费引擎是**倒序处理**（从最近的日期往前），所以 7 天窗口的计算如下：

1. **确定消费终点（最后一天）**
   - 从 `classifyIndex` 的待处理日期集合中，取 **最晚的日期** 作为 `consumptionEnd`
   - 示例：如果待处理日期为 `["2026-04-28", "2026-05-01", "2026-05-05", "2026-05-20"]`，则 `consumptionEnd = "2026-05-20"`

2. **计算往前 7 天的起点**
   - `consumptionStart = consumptionEnd - 6 days`（7 天窗口，从倒数第 7 天到最后一天）
   - 示例：`consumptionEnd = "2026-05-20"` → `consumptionStart = "2026-05-14"`

3. **调整 data range**
   - `start = consumptionStart`（转为 Date 对象，即倒数第 7 天）
   - `end = consumptionEnd`（转为 Date 对象，即待分类日期中的最晚日期）
   - 将 `DateRangePicker` 的 mode 改为 `custom`

### 3.3 调整后的行为

- 自动修改首页 `DateRangePicker` 的显示与内部状态（mode: custom, start, end）
- 立即启动消费引擎，消费受限于新的 data range
- 弹窗关闭，首页回到正常显示（高亮当前活跃的消费日期）

---

## 四、边界与例外

### 4.1 何时 **不** 显示弹窗

1. 用户已有记忆（任何快照存在）
2. 消费天数 ≤ 7 天，无论是否有记忆
3. data range 为空（即 `isEmpty: true`）

### 4.2 消费天数计算细节

- 只统计待处理任务中**落在当前 data range 内**的日期
- 同一天内有多个待处理任务，只算 1 天
- 如果当前 data range 内没有待处理任务，不显示弹窗（但此时启动消费也无影响）

### 4.3 Date Range 与消费范围的区分

- `data range`：首页用户选择的日期范围，用于过滤首页显示与 AI 消费范围
- `classifyIndex.getPending()`：当前待处理任务的日期集合，由导入/重分类等外部事件触发
- 弹窗逻辑仅考虑：`classifyIndex 中待处理日期` ∩ `当前 data range`

---

## 五、集成点

### 5.1 核心修改位置

**文件**: `src/logic/application/facades/AppFacade.ts`  
**方法**: `startAiProcessing()`

当前流程（简化）：
```typescript
public async startAiProcessing(): Promise<void> {
  const currentLedgerId = this.ledgerManager.getActiveLedgerName();
  // ... 检查待处理任务数 ...
  await this.batchProcessor.run();
}
```

修改后流程：
```typescript
public async startAiProcessing(): Promise<void> {
  const currentLedgerId = this.ledgerManager.getActiveLedgerName();
  
  // 1. 检查记忆状态与消费日期数
  const hasMemory = await this.checkHasMemory(currentLedgerId);
  const consumableDates = await this.getConsumableDates(currentLedgerId);
  
  // 2. 判断是否需要显示零记忆警告
  if (!hasMemory && consumableDates.length > 7) {
    // 3. 显示弹窗，等待用户选择
    // consumableDates 为升序排列，取最后一个为最晚日期
    const latestDate = consumableDates[consumableDates.length - 1];
    
    const userChoice = await this.showZeroMemoryWarningDialog(
      latestDate  // 传入最晚日期，由弹窗自己计算往前 7 天的起点用于展示
    );
    
    if (userChoice === 'classify7days') {
      // 用户选择只分类 7 天，自动调整 data range
      await this.adjustDateRangeFor7Days(latestDate);
    }
    // 如果选择 'consumeAll'，保持原 data range，继续
  }
  
  // 4. 启动消费
  await this.batchProcessor.run();
}
```

### 5.2 新增辅助方法

#### 5.2.1 `checkHasMemory(ledgerName: string): Promise<boolean>`

- 调用 `MemoryManager.load(ledgerName)`
- 返回 `memories.length > 0`

#### 5.2.2 `getConsumableDates(ledgerName: string): Promise<string[]>`

- 获取当前 data range：`this.ledgerService.getDateRange()`
- 获取待处理任务：`const pending = await classifyIndex.getPending(ledgerName)`
- 过滤落在 data range 内的日期
- 按升序排序返回唯一的日期数组

#### 5.2.3 `showZeroMemoryWarningDialog(latestDate: string): Promise<'classify7days' | 'consumeAll'>`

- 弹窗逻辑，返回用户选择
- 弹窗内部计算：`computedStart = latestDate - 6 days`
- 用显示用的 startDate 和 endDate（latestDate）展示给用户
- **仅 UI 层负责渲染和交互**
- 可能需要与前端沟通，通过 `EventEmitter` 或 React state 的方式协调
- 点击外侧空白处关闭弹窗，返回值为上述两个之一

#### 5.2.4 `adjustDateRangeFor7Days(latestDate: string): Promise<void>`

- 计算往前 7 天的起点：`computedStart = latestDate - 6 days`
- 调用 `this.ledgerService.setDateRange({ start: new Date(computedStart), end: new Date(latestDate), mode: 'custom' })`
- 触发首页 state 更新，UI 自动刷新 `DateRangePicker`（mode 设为 custom）

### 5.3 UI 层集成

**文件**: 待定（可能是 `MoniHome.tsx` 或 `useAiEngineControl.ts`）

在 `onEndControl` 中，当用户选择"开启"时：
1. 调用修改后的 `appFacade.startAiProcessing()`
2. 如果返回 `Promise<void>` 但内部处理了弹窗，UI 层无需额外变更
3. 或通过 `EventEmitter` 从逻辑层订阅弹窗事件，UI 层单独维护弹窗状态

---

## 六、实现建议

### 6.1 弹窗的实现方式

**选项 A**：逻辑层暴露 async hook，UI 层通过 `Promise<UserChoice>` 等待（推荐）

```typescript
// 逻辑层
public async startAiProcessing(
  onShowZeroMemoryDialog?: (latestDate: string) => Promise<'classify7days' | 'consumeAll'>
): Promise<void> {
  // ... 检查条件 ...
  if (需要显示弹窗) {
    const choice = await onShowZeroMemoryDialog?.(latestDate);
    if (choice === 'classify7days') {
      await this.adjustDateRangeFor7Days(latestDate);
    }
  }
  // ... 启动消费 ...
}

// UI 层（useAiEngineControl）
const onEndControl = useCallback(async () => {
  // ...
  if (controlHit === '开启') {
    await appFacade.startAiProcessing(
      async (latestDate) => {
        // 显示弹窗，等待用户选择
        const choice = await showZeroMemoryWarning(latestDate);
        return choice;
      }
    );
  }
}, [/* deps */]);
```

**选项 B**：UI 层主动检查，逻辑层提供判断接口

```typescript
// 逻辑层
public async checkZeroMemoryWarning(): Promise<{
  shouldWarn: boolean;
  latestDate: string;
}> {
  // ...
}

// UI 层
const onEndControl = useCallback(async () => {
  if (controlHit === '开启') {
    const warning = await appFacade.checkZeroMemoryWarning();
    if (warning.shouldWarn) {
      const choice = await showZeroMemoryWarning(warning.latestDate);
      if (choice === 'classify7days') {
        await appFacade.adjustDateRangeFor7Days(warning.latestDate);
      }
    }
    await appFacade.startAiProcessing();
  }
}, []);
```

### 6.2 建议方案

推荐 **选项 A**，理由：
- 逻辑层保持完整的业务流程控制，弹窗只是执行中间的可选交互
- UI 层职责清晰：负责弹窗渲染和交互，不负责业务决策
- 避免 UI 层多次调用逻辑层，导致状态同步困难
- 用户点击外侧关闭弹窗时，自动返回 undefined 或 error，逻辑层可捕获并不启动消费

### 6.3 测试点

1. 有记忆 + 消费日期 > 7：**不显示弹窗**
2. 无记忆 + 消费日期 ≤ 7：**不显示弹窗**
3. 无记忆 + 消费日期 > 7：**显示弹窗**，两个按钮都可点击
4. 点击弹窗外侧空白处：弹窗关闭，消费未启动
5. 点击"只分类 7 天"：
   - data range start 自动调整为（最晚日期 - 6days）
   - data range end 调整为最晚日期
   - DateRangePicker mode 改为 custom
   - 首页 DateRangePicker 刷新
   - 消费启动，仅处理新范围内的任务
6. 点击"确认全范围消费"：消费正常启动，保持原 data range

---

## 七、后续演进

本轮仅实现核心流程。以下内容可在后续迭代补充：

1. 记忆建议：弹窗中补充"AI 学习提示"（如"手动修正 3 笔交易即可激活学习"）
2. 频率控制：同一账本在单日内重复启动时，是否仍显示弹窗
3. 记忆迁移：账本更换时的记忆继承策略
4. 自动停止：7 天消费完成后，是否自动停止引擎或弹出下一步建议

---

## 附录：关键术语

| 术语 | 定义 |
|------|------|
| 零记忆 | MemoryManager.load() 返回空数组的状态 |
| 消费范围 | BatchProcessor.run() 中，受 data range 限制的实际处理日期范围 |
| 消费日期数 | 消费范围内的唯一日期数（不重复计算） |
| Data Range | 首页 DateRangePicker 选择的 start/end，用于过滤显示和消费 |
| 待处理任务 | classifyIndex 中记录的、尚未被 AI 分类的日期 |

