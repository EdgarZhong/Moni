# Moni 手动录入系统规格文档

**版本**：v3（终版）
**状态**：已定稿，可交编码 agent 实施

## 0. 文档定位

本文件是 Moni **随手记（手动录入）功能**的完整规格文档，涵盖持久化层、逻辑层与表现层三个层级。

表现层仅覆盖手记条目在系统内的**呈现与处理方式**，不包含随手记页面本身的 UI/UX 设计（该页面的原型规格另行输出）。

注入逻辑（分类会话、学习会话、收编会话中如何差异化处理手记条目与 CSV 条目）属于 `AI_SELF_LEARNING_DESIGN_v7.md` 的职责范围，本文档不展开，只在第 3.3 节标注边界。

### 与既有文档的关系

| 文档 | 涉及手记的内容 | 本文件态度 |
|------|--------------|-----------|
| `Moni_Requirements_v2.md` A2～A5 | 需求定义 | 继承并细化 |
| `AI_SELF_LEARNING_DESIGN_v7.md` §2.1.2 | 实例库字段与注入规则 | 本文确认共用实例库；注入差异化逻辑属 v7 |
| `DESIGN.md` §18.1 | 随手记页面结构边界 | 本文不重复，表现层仅讨论条目渲染 |
| `Moni_Budget_System_Spec_v2.md` | 预算计算 | 手记条目与导入条目无差异，自然参与 |

---

## 1. 设计背景与约束

### 1.1 核心场景

随手记满足两类场景：

1. **现金支付**：无法从账单导入，只能手动录入
2. **补记漏记**：导入账单不完整，用户发现某笔消费未被捕捉

### 1.2 A3 需求修订说明

需求文档 A3 原文为"手记条目独立存储，与 CSV 导入数据分离"。

**本文确认修订**：A3 指的是**逻辑身份独立**，而非物理文件独立。手记条目通过 `sourceType: 'manual'` 字段与导入条目区分，**物理存储在同一 `*.pixelbill.json` 文件的 `records` 映射中**，不新建独立持久化文件。

---

## 2. 持久化层

### 2.1 `SourceType` 枚举扩展

```typescript
// src/types/metadata.ts
// 原有：'wechat' | 'alipay'
type SourceType = 'wechat' | 'alipay' | 'manual';
```

实施时需检查所有 `SourceType` 的 switch/exhaustive 覆盖，确保新值不被遗漏。

### 2.2 主 JSON Schema 变更

`TransactionBase` **不新增任何字段**。手记条目与 CSV 条目共用完全相同的 `FullTransactionRecord` 类型。

去重相关字段（`dedup_status`、`linked_tx_id`）**不写入常规记录**，只在用户完成去重裁决后作为可选字段追加到对应记录上，详见第 2.5 节。

### 2.3 用户输入字段

```typescript
interface ManualEntryInput {
  amount: number;           // 必填，正数
  direction: 'in' | 'out'; // 必填，默认 'out'
  category: CategoryType;   // 必填，用户选择的分类
  subject?: string;         // 可选，一句话主题（"火锅聚餐"）
  description?: string;     // 可选，补充说明（"周年纪念，比较贵的餐厅"）
  date?: string;            // 可选，默认当前时刻，格式 YYYY-MM-DD HH:mm:ss
}
```

### 2.4 持久化字段映射表

**用户输入 → JSON 字段映射**：

| UI 表单字段 | 必填 | 映射 JSON 字段 | 实例库语义角色 | 说明 |
|------------|------|--------------|--------------|------|
| 金额 | ✅ | `amount` | 辅助参考信号 | 正数，`number` 类型，持久化不做格式化 |
| 收支方向 | ✅ | `direction` | 辅助参考信号 | 默认 `'out'` |
| 分类 | ✅ | `user_category` + `category` | 最终分类（`category` 字段） | 两字段同时写入相同值 |
| 主题（subject） | 选填 | `product` | 主文本信号（类比商户名） | 为空时条目不进实例库 |
| 描述（description） | 选填 | `user_note` | 分类原因说明 | 可为空，陪同 subject 进实例库 |
| 日期 | 选填 | `time` | 时间上下文 | 默认当前时刻 |

**手记条目的其余字段默认值**：

| 字段 | 默认值 | 说明 |
|------|-------|------|
| `sourceType` | `'manual'` | 身份标识 |
| `originalId` | `undefined` | 手记无原始单号 |
| `rawClass` | `''` | 手记无原始分类字符串 |
| `counterparty` | `''` | 手记无交易对方 |
| `remark` | `''` | 保持 schema 一致 |
| `paymentMethod` | `''` | 手记不要求填写 |
| `transactionStatus` | `'SUCCESS'` | 手记视为已发生交易 |
| `ai_category` | `''` | 手记不经 AI 分类 |
| `ai_reasoning` | `''` | 同上 |
| `is_verified` | `true` | 用户主动录入视为自动确认 |

### 2.5 去重基础设施

去重不侵入 `TransactionBase` 的常规字段定义。

**候选对独立文件**（P2 实现，可选落盘）：

```typescript
// dedup_candidates/{ledger}.json
interface DedupCandidatePair {
  pair_id: string;
  tx_ids: [string, string];
  confidence: number;       // 0.0 ~ 1.0，≥ 0.5 才展示给用户
  match_reasons: string[];  // 例：["同日", "金额相差 0.5 元", "同类别"]
  discovered_at: string;
  status: 'pending' | 'resolved';
}
```

**候选查找逻辑**（`findDedupCandidates`）：按 `time.slice(0,10)`（同日）+ `direction`（同方向）过滤 records，对候选集动态计算置信度：

| 维度 | 条件 | 分值 |
|------|------|------|
| 金额 | 精确相等 | +0.40 |
| 金额 | 差值 ≤ 1 元（覆盖未打小数点场景） | +0.25 |
| 金额 | 差值 ≤ 5 元 | +0.08 |
| 时间 | 同一小时内 | +0.25 |
| 时间 | 2 小时以内 | +0.15 |
| 时间 | 同半天（上/下午/晚） | +0.08 |
| 分类 | `user_category` 或 `category` 相同 | +0.20 |
| 文本 | subject 与 `counterparty`/`product` 有关键词交集 | +0.10 |

**裁决落盘**：用户完成裁决后，才在对应两条 record 上追加可选字段：

```typescript
// 仅在裁决后写入，平时不存在于记录中
interface DedupResolution {
  dedup_status: 'merged' | 'superseded' | 'confirmed_unique';
  linked_tx_id: string;
  // merged：去重后保留的主记录，正常参与统计
  // superseded：被合并的从记录，软删除，不参与统计但保留数据
  // confirmed_unique：用户确认与候选无重叠
}
```

---

## 3. 逻辑层

### 3.1 新增接口：`ManualEntryManager`

```typescript
class ManualEntryManager {
  /**
   * 录入一条手记条目
   *
   * 业务链路：
   * 1. 校验输入（amount > 0，category 有效，账本已就绪）
   * 2. 构建 FullTransactionRecord（按 §2.4 字段映射）
   * 3. 调用 LedgerService.ingestSingleRecord() 写入 records
   * 4. 若 subject（product 字段）非空，调用 ExampleStore 写入实例库
   * 5. 返回新记录的 id
   */
  async addEntry(
    ledgerName: string,
    input: ManualEntryInput
  ): Promise<string>;

  /**
   * 删除一条手记条目
   *
   * 联动处理：
   * 1. 从 records 中移除
   * 2. 若该条目在实例库中存在（sourceType === 'manual'），同步删除
   * 3. 若记录上存在 dedup_status === 'merged'，清理对端记录的关联字段
   * 4. 持久化
   */
  async deleteEntry(ledgerName: string, id: string): Promise<void>;

  // ── P2 去重接口（预留，P2 填充实现）─────────────────────────

  /**
   * 查找与目标记录存在重叠可能的候选记录
   * 按同日同方向过滤，对候选集计算置信度，返回 confidence ≥ 0.5 的结果
   */
  async findDedupCandidates(
    ledgerName: string,
    targetRecord: FullTransactionRecord
  ): Promise<DedupCandidatePair[]>;

  /**
   * 执行去重裁决，更新双方记录的 dedup_status / linked_tx_id
   * 并将候选对文件中对应 pair 的 status 置为 'resolved'
   */
  async resolveDedupPair(
    ledgerName: string,
    primaryId: string,
    secondaryId: string,
    resolution: 'merged' | 'confirmed_unique'
  ): Promise<void>;
}
```

### 3.2 `LedgerService` 新增接口

```typescript
/**
 * 向当前账本写入单条记录（手记专用入口）
 * 直接操作 state.ledgerMemory.records[record.id]，随后触发持久化
 */
async ingestSingleRecord(record: FullTransactionRecord): Promise<void>;
```

### 3.3 实例库联动

**共用实例库**：手记条目与 CSV 条目使用同一个 `classify_examples/{ledger}.json`，以 `sourceType: 'manual'` 字段区分身份。不新建独立实例库文件。

**触发条件**：`product` 字段（subject）非空。

**实例库写入字段映射**（字段名与主 JSON 保持一致，不重命名）：

```typescript
{
  id:                record.id,
  created_at:        now(),            // 实例库专有，记录入库时刻
  time:              record.time,
  sourceType:        'manual',
  rawClass:          '',
  counterparty:      '',
  product:           record.product,   // subject → 主文本信号
  amount:            record.amount,    // 辅助参考，保留
  direction:         record.direction,
  paymentMethod:     '',
  transactionStatus: 'SUCCESS',
  remark:            '',
  category:          record.user_category,
  ai_category:       '',               // 手记不经 AI 分类
  ai_reasoning:      '',
  user_note:         record.user_note, // description → 分类原因说明
  is_verified:       true,
}
```

**关于过拟合风险**：`product`（subject）为空的手记条目绝对不进实例库。无 subject 时记录只有金额和分类，AI 若学习此类条目会尝试从金额推断分类，导致过拟合。有 subject 时，`product` 成为主文本信号（类比 CSV 条目的 `counterparty`），`amount` 退居辅助位，不存在过拟合风险。

**注入差异化处理**：分类会话、学习会话、收编会话中如何区别对待 `sourceType: 'manual'` 与 `sourceType: 'wechat'/'alipay'` 的条目（包括 B 类单独区块、`[错误判断]` 前缀、A+C+D 合并区块等规则），属于 `AI_SELF_LEARNING_DESIGN_v7.md` 的 Prompt 设计职责，本文档不展开。

### 3.4 实例库来源完整分类（供 v6 参考）

| 情况 | sourceType | ai_category | user_category | is_verified | 语义 |
|------|-----------|------------|--------------|-------------|------|
| A | wechat/alipay | 有值 | 空或同 ai_category | true | AI 分对，用户确认锁定 |
| B | wechat/alipay | 有值 | ≠ ai_category | — | AI 分错，用户纠正（最强学习信号） |
| C | wechat/alipay | 空 | 有值 | true | AI 未处理，用户直接分类锁定 |
| D | manual | `''` | 有值 | true | 随手记主动声明，product 非空 |

B 是最强学习信号（含错误-纠正对照），A 次之（正向确认），C 和 D 性质相近（无 AI 上下文的用户声明）。D 因无 `counterparty` 而主文本信号仅依赖 `product`（subject），学习权重低于 C。

---

## 4. 表现层

### 4.1 首页条目显示映射表

新版 Moni 首页每条条目只有一个主标题，无副标题。

| 渲染位置 | CSV 导入条目 | 手记条目 |
|---------|------------|---------|
| **主标题** | `product`（若为 `'/'` 或 `'Unknown'` 则 fallback 到 `counterparty`） | `product`（subject）；为空则显示"来自随手记" |
| **来源 badge** | 微信 / 支付宝（按 `sourceType`） | 随手记 |
| **左侧图标** | 分类图标（按 `user_category` 或 `ai_category`） | 分类图标（按 `user_category`，始终有值） |
| **分类标签**（仅"全部"视图） | 有 `user_category` 时显示；否则显示 `ai_category`（含"AI 暂定"样式） | 显示 `user_category`（始终确定，无"AI 暂定"状态） |
| **AI reasoning 槽位** | 无 `user_category` 时显示 `ai_reasoning`；有则隐藏 | 显示 `user_note`（description）；为空则整行隐藏 |

**AI reasoning 槽位的视觉区分**：CSV 条目在此位置的内容带有"AI 暂定"语义的视觉处理（DESIGN.md §14.4）；手记条目在同一位置显示 `user_note` 时，去掉 AI 图标，改用中性说明样式，避免误认为是 AI 写的。具体视觉待随手记页面原型阶段确认。

### 4.2 条目详情页

手记条目详情页与 CSV 条目基本一致，差异点：

- 主标题显示 `product`（subject），为空则显示"来自随手记"
- `user_note`（description）显示在说明区
- 不显示 AI reasoning 区域
- 支持**删除操作**（CSV 导入条目不暴露此入口）
- 支持修改分类（与 CSV 条目相同的分类选择器）

### 4.3 统计与概览

手记条目与 CSV 导入条目在所有统计维度无差异，包括统计摘要栏、分类概览横条、折线图日支出、预算已用金额。

---

## 5. 需求条目对照

| 需求 ID | 需求描述 | 覆盖章节 |
|--------|---------|---------|
| A2 | 手动记账：必填=分类+金额，可选=主题/描述 | §2.3、§2.4 |
| A3 | 手记条目独立存储（修订：逻辑身份独立，物理共存） | §1.2、§2.1 |
| A4 | 手记条目学习信号：主题非空时进实例库 | §3.3 |

---

## 6. 实施建议

**实施顺序**：

1. 扩展 `SourceType` 枚举，检查所有 switch 覆盖
2. 在 `LedgerService` 新增 `ingestSingleRecord()`
3. 实现 `ManualEntryManager.addEntry()`（含实例库联动）
4. 实现 `ManualEntryManager.deleteEntry()`
5. 预留 `findDedupCandidates()` / `resolveDedupPair()` 空实现（P2 填充）

**注意**：`is_verified: true` 使手记条目绕过 AI 分类队列。`LedgerService` 中凡是基于 `is_verified` 判断是否入队的逻辑，需确认手记条目不会被错误加入分类队列。
