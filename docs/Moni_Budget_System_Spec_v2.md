# Moni 预算系统规格文档（终版）

## 0. 文档定位与版本声明

本文件是 Moni 预算系统的**终版冻结规格**。在可见的开发计划内，预算系统的全部设计以本文件为准，不再迭代。

本文件替代原 `Moni_Budget_System_Spec.md`（v1），扩展了以下内容：

1. 分类预算的完整设计（v1 中标记为"本轮不做"，现纳入）
2. 分类预算与标签管理的联动规则
3. 分类概览卡中超预算分类的表现规格
4. 持久化层的完整数据结构定义（含分类预算）
5. 逻辑层的完整接口签名（TypeScript 类型）

本文件的适用对象是主仓库的编码实施者。所有规格以 TypeScript 类型为准。

---

## 1. 参考来源与权重

1. `DESIGN.md`：首页 UI / UX 唯一执行标准
2. `Moni_Homepage_Integration_Spec.md`：首页集成边界与读模型口径
3. `AI_SELF_LEARNING_DESIGN_v6.md`：存储位置总览、标签管理连锁处理、账本生命周期
4. `Moni_Requirements_v2.md`：功能需求参考
5. `Moni_Brand_Design_Spec.md`：品牌色值定义

---

## 2. 预算系统总览

### 2.1 系统范围

Moni 预算系统包含两个维度：

1. **月度总预算**：当前账本本自然月的支出上限
2. **分类预算**：按标签分配的月度预算额度（可选，不要求所有分类都设）

两个维度独立设置、独立计算、独立展示，互不阻塞。

### 2.2 设计原则

1. 预算设置入口在设置页账本区，不在首页
2. 首页只消费预算读模型，不负责预算编辑
3. 预算卡始终表达当前自然月，不跟随首页 `data range` 改变周期
4. 分类预算与标签管理强联动——标签变更时预算配置自动响应
5. 所有金额计算使用整数分（cent）或保留两位小数，避免浮点精度问题

---

## 3. 持久化层

### 3.1 存储位置

**已确认**：当前 `*.pixelbill.json`（`LedgerMemory` 接口）中不存在任何预算相关字段，设置页也无预算 UI。`ConfigManager` 仅管理全局配置（API key / 模型选择等），不管理按账本配置。

预算配置采用**独立文件**方案，新建 `BudgetManager` 服务与 `LedgerService` 平级：

- 存储路径：沙箱 `budget_config/{ledger}.json`（`Directory.Data`，按账本隔离）
- 不污染已有的 `LedgerMemory` 结构
- 账本删除/重命名时需在 `LedgerService` 连锁处理中同步清理/迁移预算文件（见 §3.4）

### 3.2 数据结构

```typescript
/**
 * 预算配置（per ledger，嵌入账本数据或独立文件）
 */
interface BudgetConfig {
  /** 月度总预算 */
  monthly: MonthlyBudget | null;

  /** 分类预算表（key = 标签键名） */
  categoryBudgets: Record<string, CategoryBudgetEntry> | null;

  /** 分类预算配置版本戳——标签结构变更时自动失效 */
  categoryBudgetSchemaVersion: number;

  /** 最后更新时间 */
  updatedAt: string;  // ISO 8601
}

interface MonthlyBudget {
  /** 月预算金额 */
  amount: number;

  /** 币种（本轮固定 CNY，预留字段） */
  currency: string;
}

interface CategoryBudgetEntry {
  /** 该分类的月预算额度 */
  amount: number;
}
```

**初始态**：新账本创建时，`BudgetConfig` 不需要立即生成。首次设置预算时按需创建。读取时若字段不存在，视为全部未设置。

**示例数据**：

```json
{
  "monthly": {
    "amount": 3000,
    "currency": "CNY"
  },
  "categoryBudgets": {
    "meal": { "amount": 800 },
    "transport": { "amount": 300 },
    "entertainment": { "amount": 200 }
  },
  "categoryBudgetSchemaVersion": 5,
  "updatedAt": "2026-04-07T21:30:00+08:00"
}
```

注意：`categoryBudgets` 的键直接使用账本当前分类键，与 `LedgerMemory.defined_categories` 完全一致；当前默认口径为中文键（如 `正餐`、`交通`），并在存在用户标签定义时由系统自动追加兜底键 `其他`。

### 3.3 持久化层接口

```typescript
interface BudgetStore {
  /** 读取指定账本的完整预算配置 */
  loadBudgetConfig(ledgerId: string): Promise<BudgetConfig | null>;

  /** 保存月度总预算（null = 清除） */
  saveMonthlyBudget(ledgerId: string, budget: MonthlyBudget | null): Promise<void>;

  /** 保存分类预算表（null = 清除全部分类预算） */
  saveCategoryBudgets(
    ledgerId: string,
    budgets: Record<string, CategoryBudgetEntry> | null,
    schemaVersion: number
  ): Promise<void>;

  /** 完整覆写预算配置（用于标签联动后的批量更新） */
  saveBudgetConfig(ledgerId: string, config: BudgetConfig): Promise<void>;
}
```

### 3.4 与账本生命周期的关系

预算配置为独立文件，需在 `LedgerService` 的账本生命周期连锁处理中增加：

```
删除账本 "{ledger}"
  → 删除 沙箱/budget_config/{ledger}.json（如存在）

重命名账本 "{old}" → "{new}"
  → 重命名 沙箱/budget_config/{old}.json → budget_config/{new}.json（如存在）
```

这与 v6 中已定义的 `classify_examples`、`classify_queue` 等文件的连锁处理模式一致。

---

## 4. 标签管理联动规则

分类预算与标签体系强绑定。标签变更时，预算配置必须自动响应。

### 4.1 联动矩阵

| 标签操作 | 对分类预算的影响 | 实现方式 |
|----------|-----------------|----------|
| **新增标签** | 所有分类预算配置**整体失效** | 将 `categoryBudgets` 置为 `null` |
| **删除标签** | 所有分类预算配置**整体失效** | 将 `categoryBudgets` 置为 `null` |
| **重命名标签键** | 对应预算条目**跟随迁移** | 删除旧键、写入新键，金额不变 |
| **修改标签描述** | **无影响** | 不做任何处理 |

### 4.2 设计理由

新增和删除标签导致整体失效，而不是只删除对应条目，原因是：

1. 用户设置分类预算时，各分类预算的分配通常是一个整体决策（"正餐 800 + 交通 300 + 娱乐 200，其余不管"）
2. 新增或删除标签改变了分类体系的结构，原有的预算分配方案在语义上可能已经不再合理
3. 保持简单：用户重新设置一次分类预算的成本极低，远低于系统猜测错误的修复成本

### 4.3 实现要求

**已确认**：当前 `LedgerService` 无事件机制或回调钩子，标签操作均为直接操作。

因此采用直接调用方式：`LedgerService` 在完成标签操作后，直接调用 `BudgetManager` 的写入方法。

```typescript
// 在 LedgerService.addCategory() / deleteCategory() 的末尾
await budgetManager.invalidateCategoryBudgets(ledgerId);

// 在 LedgerService.renameCategory() 的末尾
await budgetManager.migrateCategoryBudgetKey(ledgerId, oldKey, newKey);
```

注意：标签操作使用的方法名与回传报告一致（`addCategory` / `deleteCategory` / `renameCategory`），而非 v6 中建议的 `addTag` / `deleteTag`。如后续统一重命名为 tag，此处同步更改即可。

### 4.4 `categoryBudgetSchemaVersion` 的用途

该版本号在每次标签结构变更（新增/删除）时递增。它的作用是：

1. 让表现层快速判断"分类预算配置是否仍然有效"
2. 防止因异步竞态导致旧的分类预算数据被错误展示

规则：`categoryBudgets` 不为 `null` 且 `categoryBudgetSchemaVersion` 等于当前标签体系版本时，分类预算才有效。

---

## 5. 逻辑层

### 5.1 核心职责

预算逻辑层承担：

1. 读取当前账本的预算配置
2. 计算当前自然月已支出（总额 + 分类维度）
3. 判定预算状态（总预算 + 各分类）
4. 生成首页预算读模型
5. 预留预算相关情景提示卡输出能力

### 5.2 状态模型

#### 总预算状态

```typescript
type BudgetStatus = 'none' | 'healthy' | 'warning' | 'exceeded';
```

| 状态 | 判定条件 | 色值 |
|------|----------|------|
| `none` | 未设置月度总预算，或预算金额无效（≤ 0） | — |
| `healthy` | `spent / budget < 0.7` | 薄荷绿 `#4ECDC4` |
| `warning` | `0.7 ≤ spent / budget ≤ 1.0` | 琥珀橙 `#E88B4D` |
| `exceeded` | `spent / budget > 1.0` | 珊瑚红 `#FF6B6B` |

阈值 0.7 / 1.0 为终版冻结值。

#### 分类预算状态

分类预算不使用三级状态模型，只区分两态：

```typescript
type CategoryBudgetStatus = 'within' | 'exceeded';
```

- `within`：该分类当月支出 ≤ 该分类预算
- `exceeded`：该分类当月支出 > 该分类预算

分类预算不设 `warning` 级别，原因是：分类预算的用户感知通道是情景提示卡，只需要告知"超了"还是"没超"，三级状态不增加信息价值。

### 5.3 计算口径

#### 周期

预算周期固定为自然月：当月 1 日 `00:00:00` 到当月最后一天 `23:59:59`。

#### 支出统计范围

1. 只统计支出型交易（`direction === 'out'`）
2. 只统计当前账本
3. 只统计当前自然月内的交易
4. 不统计收入
5. 不统计失败交易（`transactionStatus !== 'SUCCESS'` 的交易排除）
6. 退款处理沿用既有账本净值口径，本规格不改动

#### 分类支出统计

分类维度的支出统计使用交易的最终分类（`finalCategory`），即：

- 若 `user_category` 非空，使用 `user_category`
- 否则使用 `ai_category`
- 若均为空（未分类），该交易不计入任何分类预算，但计入总预算

#### 日均可用

```typescript
const dailyAvailable = Math.max(remaining, 0) / Math.max(remainingDays, 1);
```

`remainingDays` = 当月最后一天 - 今天 + 1（含今天）。

超支时 `dailyAvailable` 为 0。

#### 与 `data range` 的关系

**预算卡始终且只表达当前自然月预算**，不跟随 `data range` 改变。

- `data range` 影响：统计摘要栏、分类概览、流水列表
- `data range` 不影响：预算卡、预算状态、预算计算

### 5.4 逻辑层接口

```typescript
/** 总预算读模型 */
interface MonthlyBudgetSummary {
  enabled: false;
} | {
  enabled: true;
  status: 'healthy' | 'warning' | 'exceeded';
  period: string;              // "2026-04"
  amount: number;              // 预算金额
  spent: number;               // 当月已支出
  remaining: number;           // 剩余（可负）
  usageRatio: number;          // spent / amount
  remainingDays: number;       // 含今天
  dailyAvailable: number;      // 日均可用（超支时为 0）
}

/** 分类预算读模型 */
interface CategoryBudgetSummary {
  enabled: false;
} | {
  enabled: true;
  /** 各分类的预算状态（只包含设了预算的分类） */
  items: CategoryBudgetItem[];
}

interface CategoryBudgetItem {
  categoryKey: string;         // 标签键名
  budgetAmount: number;        // 该分类的月预算
  spent: number;               // 该分类当月已支出
  remaining: number;           // 剩余（可负）
  status: CategoryBudgetStatus;
  overageAmount: number;       // 超出金额（未超时为 0）
}

/** 逻辑层服务接口 */
interface BudgetService {
  /** 计算当月总预算摘要 */
  computeMonthlyBudgetSummary(
    ledgerId: string,
    now?: Date
  ): Promise<MonthlyBudgetSummary>;

  /** 计算当月分类预算摘要 */
  computeCategoryBudgetSummary(
    ledgerId: string,
    now?: Date
  ): Promise<CategoryBudgetSummary>;

  /** 获取预算相关的候选提示卡（见 §5.5） */
  getBudgetHints(
    ledgerId: string,
    prevMonthlyStatus: BudgetStatus | null,
    currentMonthlyStatus: BudgetStatus
  ): BudgetHintCard[];
}
```

### 5.5 预算提示卡出口

预算系统可产出的候选情景提示卡：

| 触发条件 | 提示卡 ID | 标题 | 描述 |
|----------|-----------|------|------|
| 总预算从 `healthy` → `warning` | `budget_warning` | "本月预算已使用超过 70%" | "接下来几天可以稍微收一收" |
| 总预算从 `warning` → `exceeded` | `budget_exceeded` | "本月预算已超出 ¥X" | "主要来自正餐和购物" |
| 无预算 + 已有一定量流水 | `budget_setup_nudge` | "要不要设一个月预算？" | "你已经有一段时间的流水了" |
| 存在分类预算超支 | `category_budget_exceeded` | "当月以下类别已超支" | "正餐超支 ¥20，娱乐超支 ¥150"（逐条列出） |
| 标签变更导致分类预算被重置 | `category_budget_invalidated` | "分类预算已重置" | "标签结构发生变更，分类预算需要重新配置" |

**分类超支提示卡的特殊规格**：

`category_budget_exceeded` 是分类预算超支在首页的**唯一表达出口**（概览卡不承接预算信息）。其描述字段包含所有超支分类的逐条列表，格式为 `"{分类名}超支 ¥{金额}"` 以中文逗号或换行分隔。

```typescript
interface BudgetHintCard {
  id: string;
  type: 'budget_alert' | 'budget_nudge';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  dismissible: boolean;
}
```

说明：情景提示引擎本体的完整定义不在本文件范围内。本节只要求预算逻辑层能够返回候选提示卡结构，由提示引擎决定是否展示。后续搭建情景提示引擎时，上述场景需纳入引擎的优先级排序与展示策略设计。

---

## 6. 表现层

### 6.1 首页看板预算卡

#### 有预算时

看板显示两张卡（预算卡 + 折线图卡），支持上下轮播。

预算卡展示字段（来自 `MonthlyBudgetSummary`）：

- 月份标签（如"4月预算"）
- 预算金额
- 剩余金额（或超出金额）
- 剩余天数
- 日均可用金额

#### 无预算时

看板只显示折线图卡，不显示预算卡，不显示轮播圆点。不为"无预算"补空卡或"去设置预算"按钮。

#### 三态视觉规格

**`healthy`（薄荷绿 `#4ECDC4`）**

| 元素 | 表现 |
|------|------|
| 顶部进度条 | 薄荷绿，宽度 = `usageRatio * 100%` |
| 剩余金额文字 | 薄荷绿色 |
| 剩余文案格式 | "剩余 ¥{remaining} · 还有 {remainingDays} 天" |
| 日均可用标签 | 默认深色（`#222`），不强调 |
| 日均可用金额 | 默认深色 |
| 整卡气质 | 轻松、正常 |

**`warning`（琥珀橙 `#E88B4D`）**

| 元素 | 表现 |
|------|------|
| 顶部进度条 | 琥珀橙，宽度 = `usageRatio * 100%` |
| 剩余金额文字 | 琥珀橙色 |
| 剩余文案格式 | "剩余 ¥{remaining} · 还有 {remainingDays} 天" |
| 日均可用标签 | 琥珀橙色（允许强调） |
| 日均可用金额 | 琥珀橙色 |
| 整卡气质 | 微紧、但不报警 |

**`exceeded`（珊瑚红 `#FF6B6B`）**

| 元素 | 表现 |
|------|------|
| 顶部进度条 | 珊瑚红，宽度 = 100%（满条） |
| 剩余文字区域 | 改为 "已超 ¥{Math.abs(remaining)}"，珊瑚红色 |
| 剩余文案格式 | "已超 ¥{overageAmount} · 还有 {remainingDays} 天" |
| 日均可用标签 | 改为 "建议日均"，珊瑚红色 |
| 日均可用金额 | 显示 "¥0"，珊瑚红色 |
| 整卡气质 | 明确警示，但保持金融信息清晰，不做夸张报警动画 |

#### 预算卡读模型接口

表现层从首页聚合读模型中消费以下结构：

```typescript
interface DisplayBoardBudgetCard {
  periodLabel: string;           // "4月预算"
  budgetAmount: number;
  spentAmount: number;
  remainingAmount: number;       // 可负
  remainingDays: number;
  dailyAvailableAmount: number;  // 超支时为 0
  status: 'healthy' | 'warning' | 'exceeded';
  usageRatio: number;            // 供进度条宽度使用
}

// 首页聚合读模型中的看板部分
interface DisplayBoard {
  hasBudget: boolean;
  budgetCard: DisplayBoardBudgetCard | null;  // hasBudget=false 时为 null
  trendCard: TrendCardModel;  // 不变
}
```

### 6.2 统计摘要栏

**不改动**。统计摘要仍然只显示支出 / 收入 / 笔数，不在该区域插入预算字段。

### 6.3 分类概览卡

**不改动**。分类概览卡与预算系统无关联逻辑，不承接任何预算状态表达。

概览卡继续只服务于"钱花到哪里了"的支出分布信息，横条和图例保持原样。

分类预算超支的用户感知改由**情景提示卡**承接（见 §5.5 `category_budget_exceeded`）。

### 6.4 日卡片

**不改动**。日卡片不受预算状态影响，不做预算相关染色。日卡片只继续承接 AI 工作态染色。

### 6.5 情景提示卡

预算系统为情景提示卡提供候选内容（见 §5.5），但情景提示引擎本体不在本文件范围内。

表现层只需确保：当首页聚合读模型的 `hintCards` 数组中包含预算相关提示卡时，能正常渲染。提示卡的视觉规格沿用现有 `HintCard` 组件定义。

---

## 7. 设置页预算配置 UI 规格

### 7.1 入口位置

设置页 → 账本区 → 预算设置

### 7.2 月度总预算配置

- 单一数字输入框
- 允许清空（= 取消月度总预算）
- 保存后立即生效，首页下次聚合刷新时更新预算卡

### 7.3 分类预算配置

- 展示当前账本所有有效标签的列表，每个标签可设置月预算额度
- 不要求所有分类都设预算（输入框可留空）
- **总额约束**：所有分类预算之和不得超过月度总预算。若超出，保存时应提示用户调整
- 未设月度总预算时，仍允许设分类预算（此时无总额上限校验）
- 保存后立即生效

具体 UI 布局与交互细节留待设置页原型设计时定义。

### 7.4 分类预算失效提示

当分类预算因标签变更而被自动清除后，用户下次进入预算设置页时：

- 分类预算区域显示为空白状态
- 可选：展示一行轻提示"标签结构已变更，分类预算已重置，请重新配置"

---

## 8. 初始化引导中的预算步骤

引导第 3 步为"预算设置"，规则如下：

1. 只设月度总预算，不设分类预算
2. 允许跳过（跳过后 `BudgetConfig` 不创建）
3. 输入一个数字即可完成
4. 分类预算在首次使用一段时间后，可通过设置页补设

---

## 9. 完整首页预算读模型

以下是预算系统在首页聚合读模型中的完整输出结构：

```typescript
interface HomeBudgetReadModel {
  /** 总预算读模型——供看板预算卡使用 */
  monthlyBudget: MonthlyBudgetSummary;

  /** 分类预算读模型——供情景提示卡生成使用（概览卡不消费） */
  categoryBudget: CategoryBudgetSummary;

  /** 候选预算提示卡——供情景提示区使用 */
  budgetHints: BudgetHintCard[];
}
```

此结构嵌入首页聚合读模型，与 `displayBoard` / `statsBar` / `overviewCard` / `dayGroups` / `aiEngine` 等平级。

---

## 10. 明确不做的内容

以下内容在可见的开发计划中不实施：

1. 周预算 / 年预算 / 自定义周期预算
2. 多币种预算
3. 预算历史版本 / 趋势对比
4. 跨月自动结转（carry-over）
5. 预算预测 / 智能预算建议
6. 日卡片预算染色（某天支出导致状态跳变时的卡片染色）
7. 分类预算的 `warning` 级别（分类只区分 within / exceeded）
8. 分类概览卡中的预算信息展示（概览卡与预算系统无关联逻辑）

---

## 10.1 P2 长期特性规划：预算详情面板

**优先级**：P2（赛后迭代），不影响当前实施。

**概念**：看板预算卡在显示预算状态时，支持单击打开一个二级详情面板，展示更丰富的预算数据，包括但不限于：

- 各分类预算的使用情况与超支明细
- 本月预算消耗趋势
- 日均消耗曲线 vs 理想均匀消耗线

该面板的具体设计留待后续原型阶段定义，本规格不展开。

---

## 11. 实施检查清单

### 持久化层

- [ ] 创建 `budget_config/{ledger}.json` 独立文件存储
- [ ] 实现 `BudgetManager` 服务（与 `LedgerService` 平级）
- [ ] 实现 `BudgetStore` 接口的 4 个方法
- [ ] 在 `LedgerService` 账本删除/重命名连锁处理中同步清理/迁移预算文件

### 逻辑层

- [ ] 实现 `computeMonthlyBudgetSummary`
- [ ] 实现 `computeCategoryBudgetSummary`
- [ ] 实现 `getBudgetHints`（含分类超支提示卡生成）
- [ ] 验证支出统计口径（只统计支出、只统计当月、只统计当前账本、排除失败交易）
- [ ] 验证预算状态判定阈值（0.7 / 1.0）

### 标签联动

- [ ] 在 `LedgerService.addCategory()` / `deleteCategory()` 末尾调用 `budgetManager.invalidateCategoryBudgets()`
- [ ] 在 `LedgerService.renameCategory()` 末尾调用 `budgetManager.migrateCategoryBudgetKey()`
- [ ] 验证标签变更后首页刷新能正确反映分类预算状态

### 表现层——看板预算卡

- [ ] `DisplayBoard` 组件接收 `budgetCard` 读模型
- [ ] 实现三态视觉（healthy / warning / exceeded）
- [ ] 无预算时预算卡消失、轮播圆点消失
- [ ] 预算卡不跟随 `data range` 改变周期

### 表现层——情景提示卡

- [ ] 确保 `HintCard` 组件能正常渲染预算相关提示卡
- [ ] 分类超支提示卡格式：标题 "当月以下类别已超支"，描述逐条列出超支分类与金额

### 设置页

- [ ] 月度总预算配置 UI
- [ ] 分类预算配置 UI（含总额不超过总预算的约束校验）
- [ ] 分类预算失效后的提示

### 初始化引导

- [ ] 预算步骤只设月度总预算
- [ ] 允许跳过

---

## 12. 术语表

| 术语 | 定义 |
|------|------|
| 月度总预算 | 当前账本本自然月的支出上限，是一个单一数值 |
| 分类预算 | 按标签分配的月度预算额度，每个标签可独立设置 |
| 预算状态 | 基于 usageRatio 的三级判定：healthy / warning / exceeded |
| 分类预算状态 | 基于分类支出与分类预算的二级判定：within / exceeded |
| 最终分类 | 交易的最终落盘分类，优先 user_category，其次 ai_category |
| 自然月 | 当月 1 日 00:00:00 到当月最后一天 23:59:59 |
| schemaVersion | 分类预算的标签体系版本戳，标签新增/删除时递增 |
