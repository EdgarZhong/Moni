# Revision 系统分析报告

**日期**：2026-05-05  
**议题**：ClassifyIndex 中的 revision 防护机制是否冗余  
**结论**：存在概念错误，已修复；系统防护粒度可优化

---

## 一、问题发现

### 症状
- BatchProcessor 运行时，每次只能处理一个 batch（约3天），然后停止
- 日志显示：`ClassifyIndex] Skip batch remove for 日常开销: revision changed 45 !== 16`
- 不是完全失败，而是重复处理，导致消费效率卡在单日

### 根本原因
批处理过程中的 revision 版本冲突：

```
T0: BatchProcessor.getConsumableTaskBatch() 
    └─ 记录 revision = 16

T1-100: 处理 29 个 AI proposal
    └─ 每个 arbiter patch → LedgerService.syncDirtyIndexForTouchedRecords()
    └─ → classifyIndex.syncDirtyIndexForTouchedRecords(..., { bumpRevision: true })
    └─ revision: 16 → 17 → 18 → ... → 45

T101: BatchProcessor.removeBatchIfRevisionMatch(batchDates, revision=16)
    └─ 检查：当前 revision = 45 ≠ 16
    └─ 返回 false，batch remove 失败
    └─ break，停止处理下一个 batch
```

---

## 二、Revision 系统的设计意图

### 设计定义（代码注释）

```typescript
/**
 * 队列快照。
 * 这里保留 revision，是为了让消费端能在多天批处理成功后做一次 CAS 移除，
 * 避免处理期间若有新的生产动作插入同日期任务，被当前批次误删。
 */
export interface QueueLedgerSnapshot {
  tasks: ClassifyTask[];
  revision: number;
}
```

### 核心概念：Compare-And-Swap (CAS)

Revision 是一个**递增计数器**（不是脏计数的和）：
- 初始值：0
- 每次调用 `saveLedger(..., { bumpRevision: true })` 时：+1
- 用途：**检测"状态是否在 batch 处理期间被修改过"**

### 防护的真实场景

```
场景：用户在 batch 处理期间执行全量重分类

T0: BatchProcessor 读取
    ├─ 待消费日期：[2026-04-30, 04-29, 04-28]
    ├─ 脏计数：2026-04-30: 5
    └─ revision: 16

T1-T100: 处理这 5 笔脏交易
    并发：用户执行全量重分类
    └─ 所有交易分类重置
    └─ 脏计数：2026-04-30: 5 → 50（新增 45 笔脏交易）
    └─ revision: 16 → 17 ✅ bumpRevision

T101: BatchProcessor 尝试移除 2026-04-30 的 5 笔任务
    └─ removeBatchIfRevisionMatch([2026-04-30], revision=16)
    └─ 检查：revision = 17 ≠ 16 ✅ 正确拒绝
    └─ 理由：脏计数已变（5→50），不能安全删除
```

---

## 三、问题症结：概念错误

### Arbiter Patch 不应该 bumpRevision

**错误的调用链**：
```
AI 处理一个 proposal
  ↓
arbiter.ingest() → arbiter.dispatchPersistence()
  ↓
LedgerService.onPatchGenerated() → LedgerService.applyPatch()
  ↓
LedgerService.syncDirtyIndexForTouchedRecords()
  ↓
classifyIndex.syncDirtyIndexForTouchedRecords(..., { bumpRevision: true }) ❌
  ↓
revision +1
```

**为什么错误**：
- Arbiter patch 是**同一个 batch 的一部分**，不是"新的生产动作"
- 它发生在 BatchProcessor 的控制下，不会产生"新脏日期被插入"
- 真正需要防护的是**外部修改**（用户编辑、全量重分类等）

### 修复

修改 `syncDirtyIndexForTouchedRecords` 签名，在处理 arbiter patch 时传入 `bumpRevision: false`：

```typescript
// LedgerService.ts
void this.syncDirtyIndexForTouchedRecords(
  prevMemory, newMemory, [patch.id], 
  'arbiter_patch', 
  false  ← 关键修复：arbiter patch 不 bump revision
)
```

结果：
- ✅ 修复前：revision 16 → 17 → ... → 45（无用防护，batch remove 失败）
- ✅ 修复后：revision 保持 16（arbiter patch 期间），仅用户操作时 bump

---

## 四、系统是否冗余？设计评估

### 防护机制的有效性分析

| 防护层 | 触发条件 | 现实概率 | 防护强度 |
|-------|--------|--------|--------|
| **Revision 检查** | BatchProcessor 运行期间，用户执行全量重分类 | 极低 | 中等 |
| **需要重建标记** | 脏计数更新失败（数据不一致） | 很低 | 强（阻断消费） |
| **日期局部重算** | 失败重建时的自动恢复 | 低 | 强（恢复正确性） |
| **整本重建** | 所有恢复失败的最终兜底 | 极低 | 强（重新初始化） |

### 冗余判断

**Revision 检查是否冗余？**

| 角度 | 评估 |
|------|------|
| 设计的必要性 | 不冗余 - 逻辑上需要防护并发修改 |
| 实现的有效性 | 有问题 - 原本的 arbiter patch bumpRevision 导致失效 |
| 实际触发率 | 极低 - 用户在 batch 处理时执行全量重分类的概率 < 1% |
| 相比其他防护的价值 | 可优化 - 其他防护（rebuild、dirty recount）更强 |

**结论**：
- ❌ 不是冗余，但存在**设计粒度问题**
- ❌ 原实现有**概念错误**（arbiter patch 不应该 bump）
- ✅ 修复后恢复正确性（虽然现实触发率低）
- 🤔 可考虑简化：是否值得为极低概率的并发场景维护复杂防护

---

## 五、修复方案

### 已实施的修改

1. **ClassifyQueue.ts**：添加 `bumpRevision` 参数
```typescript
public async syncDirtyIndexForTouchedRecords(params: {
  ledger: string;
  prevRecords: LedgerMemory['records'];
  nextRecords: LedgerMemory['records'];
  touchedTxIds: string[];
  reason: string;
  bumpRevision?: boolean;  ← 新增参数，默认 true
}): Promise<void>
```

2. **LedgerService.ts**：调用时区分场景
```typescript
// arbiter patch - 不 bump
void this.syncDirtyIndexForTouchedRecords(
  prevMemory, newMemory, [patch.id], 
  'arbiter_patch', 
  false
)

// 用户操作、导入等 - bump（保持默认 true）
await this.syncDirtyIndexForTouchedRecords(
  prevMemory, nextMemory, importedTxIds, 
  'bill_import'
)
```

### 验证

- ✅ TypeScript 编译通过
- ✅ 浏览器开发态测试通过
- ✅ BatchProcessor 能连续处理多个 batch

---

## 六、讨论要点

### Q1：为什么 arbiter patch 不应该 bumpRevision？

**A**：因为 arbiter patch 是**同一个 batch 内的微操作**，不是"外部修改"。Revision 的目的是检测"是否有外部修改改变了脏计数"，而 arbiter patch 本身就是 batch 处理的预期内部变化。

### Q2：Revision 系统防护的现实价值有多大？

**A**：极低。需要满足：
1. BatchProcessor 正在运行
2. 同时用户执行全量重分类（或其他改分类操作）
3. 时间窗口刚好重叠

在现实使用中，BatchProcessor 通常后台异步运行（几秒到几分钟完成），用户很难在这个窗口同时做分类操作。

### Q3：能否删除 revision 系统，只依赖其他防护？

**A**：逻辑上可以，但不建议：
- 其他防护（rebuild、recount）是**事后纠错**
- revision 是**预防性防护**，能防止误删
- 虽然现实概率低，但删除它等于承受小概率风险
- 维护成本不高（就一个计数器）

### Q4：系统是否太脆弱？

**A**：不是脆弱，是**防护层级设计合理**：
1. 第一层：revision 检查（预防）
2. 第二层：脏计数验证（发现异常）
3. 第三层：日期局部重建（修复受影响日期）
4. 第四层：整本重建（最终兜底）

修复后每一层都工作正常，系统不脆弱。

---

## 七、后续优化方向（讨论用）

如果团队认为 revision 防护的现实价值不足以维护其复杂性，可考虑：

1. **简化方案**：只保留 revision，但改为"账本级戳"而非单调递增
   - 问题：需要考虑持久化和恢复

2. **强制串行化**：禁止 batch 处理期间的用户分类操作
   - 问题：需要 UI 层配合，影响用户体验

3. **弱化为日志**：保留 revision 用于审计，但不用来防护
   - 问题：失去预防能力

4. **后期复审**：重新评估 `BatchProcessor` 为并发保护引入 revision 的必要性、维护成本与替代模型
   - 重点看 CAS 粒度是否过细、是否可以改为更简单的账本级版本戳或显式串行化策略
   - 这条属于后期优化课题，不影响当前已修复的 `bumpRevision` 口径

**当前建议**：保持修复后的现状，继续使用 revision 防护。虽然现实触发率低，但防护成本也低，没必要删除。

---

## 参考资料

- 设计规范：`AI_SELF_LEARNING_DESIGN_v8.md`
- 实现代码：`src/logic/application/ai/ClassifyQueue.ts`
- 服务集成：`src/logic/application/services/LedgerService.ts`
- 运行时数据：`classify_runtime.json` (revision / dirty_count_by_date / queue)
