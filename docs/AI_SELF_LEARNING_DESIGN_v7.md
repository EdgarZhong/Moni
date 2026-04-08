# PixelBill AI 自学习系统设计文档

**版本**: v7
**日期**: 2026-04-08
**状态**: 目标规格已升版至 v7；当前代码与规格差距见第十章

***

## 一、设计目标

让 AI 越用越懂用户，无需反复调教。用户的唯一"教学"动作是修正分类。系统自动从修正行为中学习，下次遇到相似交易时做出更准确的判断。

**核心原则**：

- 用户操作越少越好——修正分类应该是唯一的必要动作
- AI 自由度越高越好——记忆内容由 AI 自主决定，不强制结构
- 一切用户交互都是学习信号——用户无感知地"教"AI

***

## 二、存储架构

每个账本独立维护以下数据，互不干扰。

### 2.1 结构化存储

#### 2.1.0 账本行为配置（`ledger_prefs/{ledger}.json`）

为避免学习阈值、收编阈值、压缩比例等账本级行为参数继续散落在 `LedgerMemory`、预算配置或各服务本地常量中，v7 追加一层**账本行为配置文件**。

该文件只承载“账本行为设置”，不承载交易数据、实例库数据或预算数据。

**边界冻结**：

- `ledger_prefs/{ledger}.json` **只承接账本级 AI 行为配置**
- 预算配置继续独立存放于 `budget_config/{ledger}.json`
- 标签定义继续以账本主数据 `defined_categories` 为单一信源
- API Key / 模型 / 提供方 / 主题 / 自述等全局设置不进入 `ledger_prefs`
- 尚未形成明确规格的内部实现常量（如快照 GC 上限）暂不提前塞入 `ledger_prefs`

**存储位置**：`Directory.Data / ledger_prefs/{ledger}.json`

**目标格式**：

```json
{
  "learning": {
    "threshold": 5,
    "autoLearn": true
  },
  "compression": {
    "threshold": 30,
    "ratio": 0.7
  }
}
```

**字段语义**：

- `learning.threshold`：触发学习所需的累计修正阈值
- `learning.autoLearn`：是否允许自动学习
- `compression.threshold`：当前记忆条目数超过该值时，允许触发收编
- `compression.ratio`：收编的目标压缩比例。用于计算 `targetCount = floor(currentCount * ratio)`；它是 Prompt 与结果校验使用的**上限**，不要求 AI 精确压到该条数

**默认值（当前冻结口径）**：

- `learning.threshold = 5`
- `learning.autoLearn = true`
- `compression.threshold = 30`
- `compression.ratio = 0.7`

**账本生命周期联动**：

- 账本创建时可不主动落空文件，读取时按默认值兜底
- 账本重命名时同步迁移 `ledger_prefs/{old}.json -> ledger_prefs/{new}.json`
- 账本删除时同步清理 `ledger_prefs/{ledger}.json`

#### 2.1.1 标签定义（`defined_categories`）

升级原有的数组为映射，每个标签强制附带一句自然语言描述：

```json
{
  "defined_categories": {
    "正餐": "日常正餐支出（早午晚），仅限双人用餐，不含大餐和零食",
    "其他": "所有未落入用户显式标签的兜底支出"
  }
}
```

补充口径：

- 分类键直接使用账本内存储键，UI 与 AI 都忠实消费该键，不额外维护英文显示映射
- 默认手动预置标签为十类中文键；`其他` 不是手动预置项，而是在存在用户标签定义时由系统自动追加的兜底类别

**三重作用**：

1. **冷启动锚点**：当前记忆快照为空时，AI 仅凭这句话也能做出基本合理的分类
2. **学习锚点**：学习 AI 以此为基准归纳规则，不会偏离用户定义的标签含义
3. **新增标签门槛**：用户新增标签时必须写至少一句描述，这是唯一的强制交互

#### 2.1.2 实例库（`classify_examples/{ledger}.json`）

存储用户修正过的或锁定确认的分类案例，作为 few-shot examples 注入分类 Prompt。

**字段命名原则**：实例库存储字段与账本 `records`（`FullTransactionRecord`）保持一致命名，不重命名。额外新增 `created_at` 记录入库时间。

**存储格式（目标规格）**：

```json
{
  "revision": 42,
  "entries": [
    {
      "id": "abc124",
      "created_at": "2026-01-15T19:45:12",
      "time": "2026-01-15 19:40:00",
      "sourceType": "wechat",
      "rawClass": "商户消费",
      "counterparty": "面包码头",
      "product": "芝士面包",
      "amount": 16.80,
      "direction": "out",
      "paymentMethod": "零钱",
      "transactionStatus": "SUCCESS",
      "remark": "/",
      "category": "others",
      "ai_category": "meal",
      "ai_reasoning": "餐饮商户，正餐时段，金额合理",
      "user_note": "同时段已吃过杨国福，这是零食",
      "is_verified": false
    }
  ]
}
```

**不进入实例库的字段**：`originalId`、`updated_at`、`user_category`（已被 `category` 字段承接）。

**数据来源（四类）**：

| 类型 | 条件 | 语义 | 学习权重 |
|------|------|------|---------|
| A | `sourceType` 为 wechat/alipay，`ai_category` 有值，`user_category` 空或 == `ai_category`，`is_verified === true` | AI 分对，用户确认锁定 | 高 |
| B | `sourceType` 为 wechat/alipay，`user_category` 有值且 ≠ `ai_category` | AI 分错，用户纠正 | **最高** |
| C | `sourceType` 为 wechat/alipay，`ai_category` 为空，`user_category` 有值，`is_verified === true` | AI 未处理，用户直接分类锁定 | 中 |
| D | `sourceType === 'manual'`，`product` 非空 | 随手记主动声明（见 `Moni_Manual_Entry_Spec_v3.md`） | 中（低于 C，因无 counterparty） |

**存储层字段填充规则**：

| 实例库字段 | A 类 | B 类 | C 类 | D 类（手记） |
|-----------|------|------|------|------------|
| `id` | 原值 | 原值 | 原值 | 原值 |
| `created_at` | 入库时刻 | 入库时刻 | 入库时刻 | 入库时刻 |
| `time` | 原值 | 原值 | 原值 | 原值 |
| `sourceType` | 原值 | 原值 | 原值 | `'manual'` |
| `rawClass` | 原值 | 原值 | 原值 | `''` |
| `counterparty` | 原值 | 原值 | 原值 | `''` |
| `product` | 原值 | 原值 | 原值 | subject（用户填写） |
| `amount` | 原值 | 原值 | 原值 | 原值 |
| `direction` | 原值 | 原值 | 原值 | 原值 |
| `paymentMethod` | 原值 | 原值 | 原值 | `''` |
| `transactionStatus` | 原值 | 原值 | 原值 | `'SUCCESS'` |
| `remark` | 原值 | 原值 | 原值 | `''` |
| `category` | `user_category` | `user_category`（纠正后） | `user_category` | `user_category` |
| `ai_category` | 原值（= category） | 原值（≠ category，保留错误记录） | `''` | `''` |
| `ai_reasoning` | 原值 | 原值（**保留**，不置空） | `''` | `''` |
| `user_note` | 有则原值，无则 `''` | 有则原值，无则 `''` | 有则原值，无则 `''` | description（用户填写） |
| `is_verified` | `true` | 原值（可能为 `false`） | `true` | `true` |

> **B 类 `ai_reasoning` 保留说明**：原 v6 设计对 B 类置空 `ai_reasoning` 以"避免错误理由污染"，v7 改为保留原值。错误理由的语义区分通过注入层的 `[错误判断]` 前缀 + B 类单独区块来实现，存储层不做修改。

**存储层不执行任何字段合并或丢弃操作**，所有合并逻辑移至注入层运行时处理。

**固定注入字段**（存储层与注入层字段名一致）：

`id` / `time` / `sourceType` / `rawClass` / `counterparty` / `product` / `amount` / `direction` / `paymentMethod` / `transactionStatus` / `remark` / `category` / `ai_category` / `ai_reasoning` / `user_note` / `is_verified`

**注入区块规则（运行时）**：

实例库注入分两个独立区块，由 Prompt 结构承担主要语义区分，字段前缀作为双重保险。

**区块一：B 类（单独注入）**

```
# 用户修正记录（AI 分类错误案例）
以下条目的 ai_category 是 AI 的错误判断，category 是用户纠正后的正确分类。
ai_reasoning 描述了 AI 犯错时的推理逻辑，理解它有助于避免重蹈同类错误。
[B 类条目列表，注入时 ai_category 和 ai_reasoning 字段值前加 "[错误判断] " 前缀]
```

**区块二：A + C + D 类（合并注入，运行时精简）**

```
# 用户确认的分类参考
以下条目的 category 是用户认可的正确分类，直接作为分类依据参考。
[A+C+D 类条目列表，运行时去掉 ai_category 字段（A 类与 category 相同无新信息，C/D 类为空）]
```

> **D 类（手记）在检索中的行为**：`counterparty` 为空，商户名匹配不参与；靠 `product`（subject）和金额参与检索，天然权重低于有 `counterparty` 的 CSV 条目，无需修改检索算法。

**检索逻辑**（批量级检索 + 去重合并）：

分类是按天（或多天）批量进行的，为每条交易单独附带案例会极大浪费 token。因此采用批量检索策略：

1. **逐条检索**：对批次中每条待分类交易，按以下优先级从实例库中检索最多 **3 条**相关案例：
   - **商户名匹配**（最高权重）：counterparty 关键词包含/被包含
   - **品类相似**：description / counterparty 的关键词交集
   - **金额区间**：实例金额在当前交易 ±50% 范围内优先
   - **时段相近**：同一餐点时段（早/午/晚/非餐点）优先
2. **去重合并**：将所有交易检索到的案例按 `id` 去重，合并为一个统一的案例列表
3. **统一注入**：合并后的案例列表作为顶层 `reference_corrections` 字段注入 User Message（与 `days` 同级），而非跟随每条交易
4. **排序约束**：注入前按 `time` 升序排序（完整日期时间），确保跨日与日内时间上下文都稳定

> **设计考量**：实例库通常不会太大，且不同交易的检索结果重叠率较高（同一商户多次出现），去重后的总量可控。

**与交易记录的同步规则**：

一条交易被重新分类时（无论 AI 重分还是用户再次手改），先按 `id` 查实例库，有则删除旧记录。如果用户对新结果又做了修正，自然产生新的实例记录。实例库永远与交易当前状态一致。

**为学习会话服务的变更基线机制（新增规格）**：

为了让学习 AI 看到“相对上次学习的完整实例变更”，实例库不能只维护当前态，还必须维护**revision + 变更日志**。

**当前态文件**：即 `classify_examples/{ledger}.json` 主文件本身（含 `revision` 和 `entries`），不再单独维护。格式见 §2.1.2 存储格式。变更日志在同步更新中追加，不影响主文件结构。


**变更日志文件（目标规格）**：`classify_example_changes/{ledger}.json`

```json
[
  {
    "revision": 41,
    "type": "upsert",
    "id": "abc124",
    "before": null,
    "after": {
      "id": "abc124",
      "created_at": "2026-01-15T19:45:12",
      "time": "2026-01-15 19:40:00",
      "sourceType": "wechat",
      "rawClass": "商户消费",
      "counterparty": "面包码头",
      "product": "芝士面包",
      "amount": 16.8,
      "direction": "out",
      "paymentMethod": "零钱",
      "transactionStatus": "SUCCESS",
      "remark": "/",
      "category": "others",
      "ai_category": "meal",
      "ai_reasoning": "餐饮商户，正餐时段，金额合理",
      "user_note": "同时段已吃过杨国福，这是零食",
      "is_verified": false
    }
  },
  {
    "revision": 42,
    "type": "delete",
    "id": "old_001",
    "before": {
      "id": "old_001",
      "created_at": "2026-01-03T12:25:00",
      "time": "2026-01-03 12:20:00",
      "sourceType": "alipay",
      "rawClass": "餐饮美食",
      "counterparty": "旧商户",
      "product": "旧样本",
      "amount": 32,
      "direction": "out",
      "paymentMethod": "花呗",
      "transactionStatus": "SUCCESS",
      "remark": "",
      "category": "meal",
      "ai_category": "meal",
      "ai_reasoning": "午餐餐饮",
      "user_note": "",
      "is_verified": true
    },
    "after": null
  }
]
```

```

**学习基线指针（目标规格）**：

- `classify_memory/{ledger}/index.json` 中维护 `last_learned_example_revision`
- 学习成功后将其推进到当前实例库 `revision`
- 学习失败时不推进，保证下次仍能拿到同一批变更

**变更集计算规则**：

- **upserts**：相对上次学习后新增或更新后仍存在的样本，取最终 `after`
- **deletions**：相对上次学习后从实例库移除的样本，保留删除前 `before`
- **中间抖动折叠**：同一 `id` 在学习窗口内发生多次改写时，学习 Prompt 看到的是相对上次学习的**净变更结果**，而不是所有中间抖动步骤
- **失败保护**：若变更日志丢失、revision 回退或区间不可重建，则退化为 `full_reconcile` 模式，直接给学习 AI 注入当前全量实例库，避免静默错学

### 2.2 非结构化存储

#### 记忆快照目录（`classify_memory/{ledger}/`）

AI 从用户修正行为中归纳出的模式认知。形式仍为**有序列表**，每条是一个独立信息点；但存储上不再维护“当前记忆文件”单独落盘，而是统一维护为**快照集合 + 当前指针**。

**目录结构**：

```
Documents/PixelBill/classify_memory/{ledger}/
├── index.json
├── 2026-03-17_14-30-00-000.md
├── 2026-03-17_15-10-00-000.md
└── ...
```

- `index.json`：快照索引 + 当前指针
- `*.md`：单个记忆快照文件
- **当前记忆内容**：始终通过 `index.json.current_snapshot_id` 指向某个快照文件获得
- **创建账本时**：立即生成一个空快照，作为该账本的初始当前版本

**单个快照文件格式约定**：文件中的**每一行视为一条有序列表项**。代码读取时按换行符 split，忽略空行，为每一行自动分配序号。写入时遍历加序号。无论用户把文件编辑成什么样子（删掉序号、打乱格式、插入空行），代码总能为每一行赋予一个稳定的序号。

**快照内容示例**：

```markdown
1. 我是西工大学生，和女朋友一起生活，meal只统计双人用餐
2. 单笔餐饮 > 70元视为大餐/聚餐，归 others
3. 同一餐点时段已有正餐，后续小吃/面包归 others
4. 大餐的补差价（即使金额很小）也归 others
5. 杨国福麻辣烫：正餐，通常 40-60 元
6. 益禾堂：奶茶饮品，归 others
7. 云上南山咖啡：虽是咖啡店但卖简餐，正餐时段+合理金额 → meal
```

**代码维护方式**：内存中为 `string[]`，读取时按行 split、去除序号前缀和空行，写入新快照时遍历加序号。用户编辑后保存时，代码无条件地按行 split + 重编号，不尝试解析任何 Markdown 结构。

#### 自述文件（`PixelBill/self_description/user_profile.md`，全局）

用户手动维护的静态偏好描述，全局共享，不按账本隔离。存储于 `Documents/PixelBill/self_description/user_profile.md`，独立目录，不与账本 JSON 混放。

与记忆快照形成分层：**自述是全局人设，记忆快照是账本专属认知**。用户想告诉 AI 的通用信息（"我是西工大学生，和女朋友一起生活"）写在自述里；账本特定的分类规则由 AI 在记忆快照中自动归纳。

**与记忆文件的关系**：

| 维度           | 记忆快照             | 自述                         |
| ------------ | ---------------- | -------------------------- |
| 作用域          | 按账本隔离            | 全局共享                       |
| 维护者          | AI 生成，用户可编辑      | 用户手动编写                     |
| 内容           | AI 从修正行为中归纳的分类模式 | 用户想告诉 AI 的任何个人信息           |
| 设置页位置        | 账本设置区            | 全局设置区                      |
| Prompt 注入优先级 | 正常               | **最高**——用户亲手写的描述优先于 AI 的归纳 |

**UI 展示**：设置页已有全局/账本两个分区，自述和 AI 记忆分别归入对应区域：

- **全局设置区**："自述 —— 让 AI 了解你"，自由文本框，标注"对所有账本生效，AI 会优先参考"
- **账本设置区**："AI 记忆"，有序列表编辑器，展示当前账本的 AI 归纳偏好。附带：
  - 当前累计修正数 / 学习阈值的显示
  - "立即学习"按钮
  - "历史版本"入口（快照浏览与回退）

**与旧字段的关系**：

| 旧字段/文件                  | 处理方式                     | 原因                                       |
| ---------------------------- | ---------------------------- | ------------------------------------------ |
| `userContext`                | **迁移**至 `user_profile.md` | 从加密配置中拆出，改为可直接编辑的独立文件 |
| `classify_rules/{ledger}.md` | **废弃**                     | 记忆快照同时承担规则和认知职责             |

**用户编辑**：记忆区域展示当前快照内容的有序列表，用户可直接增删改任意行；保存时创建一个新的 `user_edit` 快照，并将 `current_snapshot_id` 指向它。即使用户完全破坏了格式，代码也能正确恢复为有序列表。自述区域为自由文本，无格式约束。

***

## 三、记忆快照维护机制

### 3.1 增量更新（常态操作）

学习 AI 输出结构化的操作指令：

```json
{
  "operations": [
    { "type": "ADD", "content": "便利店消费 > 20元 + 晚间无其他正餐 → meal" },
    { "type": "MODIFY", "index": 2, "content": "单笔餐饮 > 80元视为大餐（用户近期多次在70-80区间标记为meal）" },
    { "type": "DELETE", "index": 6 }
  ]
}
```

**代码执行**：

| 操作     | 实现                          | 风险       |
| ------ | --------------------------- | -------- |
| ADD    | `list.push(content)`        | 无——纯追加   |
| MODIFY | `list[index - 1] = content` | 极低——索引精确 |
| DELETE | `list.splice(index - 1, 1)` | 极低——索引精确 |

**注意**：当一次操作中同时包含 DELETE 和 MODIFY 时，必须**从高索引到低索引**倒序执行 DELETE，避免删除操作导致后续索引偏移。ADD 始终最后执行。

**变动前后对比**：

更新前的当前记忆列表：

```markdown
1. 我是西工大学生，和女朋友一起生活，meal只统计双人用餐
2. 单笔餐饮 > 70元视为大餐/聚餐，归 others
3. 同一餐点时段已有正餐，后续小吃/面包归 others
4. 大餐的补差价（即使金额很小）也归 others
5. 杨国福麻辣烫：正餐，通常 40-60 元
6. 益禾堂：奶茶饮品，归 others
7. 云上南山咖啡：虽是咖啡店但卖简餐，正餐时段+合理金额 → meal
```

执行上述操作后（MODIFY #2, DELETE #6, ADD 1条）：

```markdown
1. 我是西工大学生，和女朋友一起生活，meal只统计双人用餐
2. 单笔餐饮 > 80元视为大餐（用户近期多次在70-80区间标记为meal）  ← MODIFY
3. 同一餐点时段已有正餐，后续小吃/面包归 others
4. 大餐的补差价（即使金额很小）也归 others
5. 杨国福麻辣烫：正餐，通常 40-60 元
6. 云上南山咖啡：虽是咖啡店但卖简餐，正餐时段+合理金额 → meal  ← 原 #7，因 #6 被删除而上移
7. 便利店消费 > 20元 + 晚间无其他正餐 → meal                    ← ADD
```

执行完毕后自动重编号，并生成一个新的当前快照。

**对学习 AI 的约束（写入其 System Prompt）**：

- **Schema 约束**：操作类型固定三种——ADD / MODIFY / DELETE，输出必须是合法 JSON
- **语义约束**：每条记忆是一个独立的信息点，用自然语言描述，无格式要求；一条只说一件事

### 3.2 版本快照机制

AI 拥有 MODIFY 和 DELETE 权限，用户也能任意编辑，任何一次改动都可能导致信息丢失。因此记忆系统统一采用：**快照集合 + 当前指针 + 写后快照**。

**快照存储**：正式存储目录（`Directory.Documents`），与账本记忆同目录，不再拆出单独的沙箱快照目录。

```
Documents/PixelBill/classify_memory/{ledger}/
├── index.json
├── 2026-03-17_14-30-00-000.md
├── 2026-03-17_15-10-00-000.md
└── ...
```

**命名规则**：

- 快照文件名与 UI 展示名统一使用日期时间字符串
- 推荐格式：`YYYY-MM-DD_HH-mm-ss-SSS`
- `id`、文件名 basename、UI 列表展示名三者保持一致
- Windows 文件名中不使用冒号

**`index.json` 结构**：

```json
{
  "current_snapshot_id": "2026-03-17_15-10-00-000",
  "snapshots": [
    {
      "id": "2026-03-17_14-30-00-000",
      "timestamp": "2026-03-17T14:30:00",
      "trigger": "ledger_init",
      "summary": "账本初始化：空记忆"
    },
    {
      "id": "2026-03-17_15-10-00-000",
      "timestamp": "2026-03-17T15:10:00",
      "trigger": "user_edit",
      "summary": "用户手动编辑"
    }
  ]
}
```

**`trigger` 设计**：

| 触发场景 | `trigger` 值 | `summary` |
| -------- | ------------ | --------- |
| 创建账本 | `ledger_init` | "账本初始化：空记忆" |
| 学习会话完成 | `ai_learn` | 自动生成：本次操作摘要 |
| 收编完成 | `ai_compress` | "收编：N条 → M条" |
| 用户在编辑器点保存 | `user_edit` | "用户手动编辑" |
| 标签删除导致追加 | `tag_delete` | "标签 xxx 删除，追加失效标记" |
| 手动创建测试快照 | `manual` | 用户传入摘要 |

**关键语义**：

- **当前版本唯一来源**：`current_snapshot_id`
- **不再单独维护当前记忆文件**：当前记忆内容始终通过读取 `current_snapshot_id` 指向的快照获得
- **创建账本即生成空快照**：因此不存在“账本已存在但当前指针为空”的常规状态
- **当前快照不可删除**
- **GC 规则**：保留最近 30 个快照；超出时删除“最旧且非当前”的快照，绝不删除当前快照

**写后快照执行流程**：

```
某条代码路径完成一次记忆变更
  → 产出新的完整记忆列表 string[]
  → 生成新快照文件 {timestamp}.md
  → 将快照元数据追加到 index.json
  → 更新 current_snapshot_id 指向该新快照
  → 如超上限，删除“最旧且非当前”的旧快照
```

> 说明：这里的“创建”本身也算一次写入，因此同样创建新快照并更新当前指针，不再区分“当前文件写入”和“快照备份”两套路径。

**回退操作**：回退不再额外创建 `rollback` 快照。执行回退时，仅将 `current_snapshot_id` 指向目标历史快照。由于当前版本本身已经是一个快照，时间线天然保留，用户永远可以再次切回回退前版本。

**UI**：设置页 "AI 记忆" 页面中，提供"历史版本"入口。点进去是快照列表，展示时间、触发类型、摘要。用户点击某条可预览内容，确认后将其设为当前快照。

### 3.3 收编（上下文压缩，低频操作）

当列表长度超过阈值时，触发收编。

**当前冻结口径**：

- 默认收编阈值：`30`
- 默认压缩比例：`0.7`
- 目标上限计算：`targetCount = floor(currentCount * 0.7)`
- `targetCount` 是 Prompt 与结果校验使用的**不超过上限**，不要求 AI 精确输出到该条数
- 这些参数属于账本级行为配置，统一从 `ledger_prefs/{ledger}.json` 读取；无配置文件时按默认值兜底

**收编 Prompt**：

> *"以下是当前的分类记忆，共 N 条。请压缩到不超过 M 条，合并语义相近的条目，保留所有关键信息。输出新的完整有序列表，每条包含一个信息点。收编时允许合并多个信息点为一条。"*

**与标签删除的联动**：删除标签时会向当前记忆快照追加一条失效标记（如 `标签 "transport" 已从分类体系中移除，涉及该标签的规则不再适用`）。收编时需要特殊处理：

- 收编 Prompt 中额外注入当前的 `defined_categories`，让 AI 知道哪些标签现在存在
- 收编 AI 应当清理涉及已删除标签的规则条目，并移除失效标记本身
- **但如果被删除的标签后来又被重新添加了**，收编时该标签已经重新出现在 `defined_categories` 中，收编 AI 应当**保留**涉及该标签的规则内容，不做清理。这通过注入当前 `defined_categories` 自然实现——AI 看到标签存在，就不会丢弃相关规则

**执行流程**：

1. 读取当前快照内容 + 当前 `defined_categories`
2. 读取当前实例库**全量**内容（rich schema）
3. 将完整列表 + 当前标签体系 + 全量实例库一并交给 AI 压缩
4. AI 输出新列表，创建一个 `ai_compress` 快照并更新 `current_snapshot_id`

**失败策略**：

- LLM 调用失败：不改当前快照
- 输出为空、格式非法或超出 `targetCount` 上限：不改当前快照
- 只有压缩结果通过基础校验后，才创建 `ai_compress` 快照

这是**唯一做全量重写的时机**。如收编后分类效果变差，可通过快照回退。

***

## 四、完整工作流

### 4.1 用户修正分类（实时）

```
用户改分类
  → Arbiter 写入 USER 提案（已有逻辑）
  → 按 `id` 查实例库，有旧记录则删除
  → 写入新的实例库记录
  → 累计修正数 +1
  → 检查：累计修正数 ≥ N？
      → 是：标记"待学习"（静默，不打扰用户）
      → 否：继续积累
```

**不弹窗、不打断用户**。用户修正分类时，系统只在后台默默积累。学习触发阈值 N（默认 5）的配置和"立即学习"按钮都收在设置页的账本设置区中。

**实现补充约束**：

- `learning.threshold` 不是仅供 UI 展示的占位值，必须作为自动学习判定的真实输入
- `learning.autoLearn = false` 时，即便待学习量达到阈值，也只能停留在“可学习但不自动触发”的状态
- 自动学习待处理量统一按“相对 `last_learned_example_revision` 的当前学习窗口”计算：
  - `delta` 模式：`upserts + deletions`
  - `full_reconcile` 模式：`current_examples.length`

### 4.2 学习会话（异步后台）

**触发时机**（两个稳定时机 + 手动）：

| 触发方式          | 条件             | 说明                         |
| ------------- | -------------- | -------------------------- |
| **切换账本时**     | 当前账本标记为"待学习"   | 用户切换离开当前账本，是最自然的"一轮修正结束"信号 |
| **App 回到前台时** | 当前账本标记为"待学习"   | 覆盖用户修正后锁屏/切走再回来的场景         |
| **手动触发**      | 用户在设置页点击"立即学习" | 无需等待累计阈值，立即执行              |

**执行流程**：

```
检测到触发条件
  → 异步后台静默启动学习会话
  → 读取当前快照内容（如有）
  → 读取实例库当前 revision
  → 基于 last_learned_example_revision 构造“相对上次学习的完整净变更”
      - upserts：新增 / 更新后仍存在的样本
      - deletions：已从实例库移除的样本
      - fallback：若无法重建变更，则切 full_reconcile 模式注入全量实例库
  → 发送给学习 AI（专用学习 Prompt）
  → 学习 AI 输出操作指令（ADD / MODIFY / DELETE）
  → 代码执行指令，得到新的完整记忆列表
  → 创建一个 `ai_learn` 快照（summary: 本次操作摘要）
  → 更新 `current_snapshot_id`
  → 推进 last_learned_example_revision 到当前实例库 revision
  → 清除"待学习"标记，修正计数归零
  → 检查列表长度，超阈值则触发收编
  → 顶部弹出轻量通知："AI 已学习新的分类偏好 ✓"
     持续 2-3 秒后自动收起，不阻塞任何用户操作
```

### 4.3 分类执行（由队列驱动）

分类不再由单一入口直接触发，而是通过任务队列统一调度（队列架构详见 5.6 节）。AI Engine 从队列中逐天取出任务，执行以下流程：

```
读取当前选中账本 currentLedger
  → 读取当前 UI 的 data range（仅作为消费许可窗口）
  → 从 classify_queue/{currentLedger}.json 中寻找“落在当前 data range 内的最早可消费日期”
      → 若当前范围内无可消费任务，则本轮不消费，但队列任务保留
  → 加载该天全部交易
  → 并行加载：
      ① classify_memory/{currentLedger}/ 中 current_snapshot_id 指向的快照（模式记忆）
      ② classify_examples/{currentLedger}.json
         → 对该天每条交易检索最多3条相关案例
         → 按 `id` 去重合并为统一案例列表
      ③ defined_categories（标签定义）
      ④ self_description/user_profile.md（自述，全局）
  → 拼接最终 Prompt（见第六节）
  → 调用 LLM
  → 解析结果 → Arbiter.ingest()（锁定条目受保护）
  → UI 反馈：统一展示“分类处理中 / 有未完成任务”
  → 若队列中仍存在超出当前 data range 的待处理日期，则统一提示“存在当前范围外待处理任务”
```

***

## 五、标签变更处理

### 5.1 `is_verified`（锁定）的语义

**铁律**：`is_verified === true` 的交易不被任何自动化流程覆盖。唯一破壁条件：该交易的标签被删除。

### 5.2 新增标签

**数据处理**：不自动修改任何现有数据。

**用户交互（渐进式披露）**：

```
新增标签完成
  → 弹窗："需要开始分类吗？"
      → [暂时跳过] → 结束
      → [现在启动分类] →
      	→ 通知消费端尝试启动（运行中则忽略；队列为空则 no-op）
```

### 5.3 删除标签

**数据处理**：

| 步骤 | 对象                         | 操作                                                                                                               |
| -- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1  | 受影响交易（`category === 被删标签`） | `category → "uncategorized"`，`source → FALLBACK`，`is_verified → false`（强制解锁）                                     |
| 2  | 实例库                        | 删除所有 `category === 被删标签` 的记录                                                                                     |
| 3  | 当前记忆快照                   | 生成一个新的 `tag_delete` 快照，并在其中追加一条：`标签 "xxx" 已从分类体系中移除，涉及该标签的规则不再适用`（此条为临时失效标记，下次收编时由 AI 根据当前 `defined_categories` 决定是否清理相关规则——如果该标签被重新添加，则保留） |

**用户交互（渐进式披露）**：

```
删除标签完成，数据处理执行完毕
  → 直接进入范围确认弹窗
      → [仅受影响的交易（原属于被删标签）]
      → [真全量重分类（全账本所有未锁定交易）] →
          展示锁定交易列表，允许用户当场勾选并解锁
          → 用户确认对应范围按钮
              → 同步完成该范围的前置处理与 dirtyDates 入队
              → 通知消费端开始消费（若当前空闲）
      → 关闭弹窗 / 返回上一步 → 结束
```

### 5.4 重命名标签

**数据处理**：四处批量字符串替换——交易记录、实例库、记忆文件文本、`defined_categories`。

**不触发重分类，不影响锁定状态。**

**与已有队列的关系**：若当前队列中已存在待处理日期，不需要改写队列任务本身。消费端按天读取的是最新账本状态，因此这些旧任务在后续消费时会自然使用重命名后的标签文本。

### 5.5 修改标签描述

**数据处理**：仅更新 `defined_categories` 中的描述文本。

**用户交互**：

```
描述修改完成
  → 弹窗："标签定义已更改，需要重新分类吗？"
      → [暂时跳过（不对该类别下现有交易做更改）] → 结束
      → [现在重新分类] →
          弹窗："选择重新分类范围"
            → [该标签下仅未锁定交易]
            → [该标签下所有交易] →
                展示该标签下锁定交易列表，允许用户当场解锁，**提供快捷全选按钮**
                → 用户确认对应范围按钮
                    → 同步完成该范围的前置处理与 dirtyDates 入队
                    → 通知消费端开始消费（若当前空闲）
```

### 5.6 分类任务队列架构

正常分类和重分类共用一套 AI Engine 管道（投喂全天交易、AI 输出全天结果、Arbiter 保护锁定条目）。本阶段重点是将“任务生产（前置处理 + 按天入队）”与“任务消费（按天执行）”彻底解耦；同时将“触发层”从 UI 中独立出来，统一承接按钮意图并暴露清晰接口。UI 可以在一次点击中同时触发两件事——任务生产与通知消费启动——但这只是控制流上的连续动作，不代表数据流耦合；消费端始终只读取队列，不读取 UI 上下文。

#### 5.6.1 队列设计

```
┌──────────────────────────────────────────────────┐
│             分类任务队列（按账本隔离）              │
│  存储：沙箱 classify_queue/{ledger}.json           │
│  每个元素 = { date }                               │
│                                                   │
│  队列语义：                                       │
│  - 只表达“这一天需要再跑一次 AI 分类”              │
│  - 不记录触发来源，不记录任务类型                  │
│  - UI 不按任务类型区分光效                         │
└───────────────────────┬──────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────┐
│                  AI Engine（消费者）               │
│  当前：一次消费一天                                │
│  未来：可一次消费多天                              │
│                                                   │
│  投喂方式统一：该天全部交易打包                    │
│  AI 为全部交易输出分类结果                         │
│  结果应用统一：ai_category 全覆盖，                │
│              Arbiter 保护 is_verified 条目          │
│  UI 反馈统一：仅展示“分类处理中”状态                │
└──────────────────────────────────────────────────┘
```

**队列持久化**：每个账本独立存于沙箱 `classify_queue/{ledger}.json`。App 重启后保留未完成任务，避免任务丢失。

**天内增量合并规则（唯一规则）**：在**当前账本队列**中，同一天只保留一个任务。反复入队同一天时，不新增第二条，视为“并入已有当日任务”。

**来源语义归属说明（冻结）**：

- “仅未分类 / 全量 / 仅受影响 / 仅该标签”这类差异，属于 **UI/触发层来源语义**
- 它们决定：如何筛选日期、是否清理实例库、是否解锁锁定交易
- 它们**不进入队列元素本身**
- 队列元素业务语义始终只有 `{ date }`

> 解释：我们不在队列中维护“条目级并集”。条目级增量由“生产前前置处理”直接落盘完成；消费时始终读取该天最新账本状态，因此天然覆盖多次解锁/重置后的并集结果。

**同日并发重入保护（工程硬约束）**：

- 业务语义保持不变：队列只表达 `{ date }`
- 工程实现允许附加不可见元数据（如 `revision` 或 `lastEnqueueAt`），用于并发安全，不承载业务语义
- 消费端取队首时记录该任务版本，出队时执行“版本一致性校验”（CAS 语义）
- 若消费期间同日再次入队导致版本变化，则本次消费完成后**不得删除该日任务**，必须保留并在下一轮继续消费（注：消费期间指的是AI引擎已经发送读入数据并发送LLM请求，到结果返回并完成后续链路触发过程的区间）
- 目标：避免“运行中二次触发被首次消费 remove 掉”的吞任务问题

**跨账本消费约束**：AI Engine 只消费当前选中账本对应的队列文件；其他账本队列保持停放，不会被后台自动处理。用户切换账本后，消费目标同步切换为新账本队列。

**`data range` 约束层级（v6 新增高层约束）**：

- `data range` 是 **UI 当前查看窗口**，同时也是 **AI Engine 的消费许可窗口**
- `data range` **不参与**条目级前置处理、dirtyDates 计算、队列入队与 recovery 补偿
- 换言之：**任务生产范围只由业务语义决定；`data range` 只决定“现在允许消费哪些已入队日期”**
- 若某次操作生产出的任务范围超出当前 `data range`，这些范围外任务必须继续保留在队列中，等待后续范围切换或显式全量消费
- 消费端不得把“当前范围外任务”视为成功完成、也不得静默丢弃

**消费调度规则（与 `data range` 联动）**：

- 允许消费端跳过“当前不在 `data range` 内”的更早任务，转而处理当前范围内最早可消费日期
- 这意味着 `data range` 可以暂时打破严格队首消费顺序；该行为属于**调度层策略**，不改变队列元素业务语义
- 若当前范围内没有任何待处理任务，则本轮消费安全结束；队列保持不变
- 当用户扩大、缩小或切换 `data range` 后，系统应重新尝试调度当前范围内可消费的待处理日期

#### 5.6.2 触发层设计

触发层必须作为**独立模块**存在，位于 UI 与 AI Engine 之间。\
其职责不是抽象成一个“大一统聚合接口”，而是**按 UI 按钮语义暴露明确入口**：场景少、语义清晰时，允许保留少量重复代码，优先保证每个按钮的行为一眼可读。\
触发层内部可同时完成两类动作：

1. **任务生产**：执行前置处理、计算 dirtyDates、按天入队
2. **消费通知**：在需要时通知消费端尝试启动

这两类动作可以在同一次点击里连续发生，但必须在概念上分离：

- **数据流**：生产端只负责把 `{ date }` 写入队列
- **消费流**：消费端只从队列读取，不关心 UI 来源
- **控制流**：某个按钮点击后，可以先生产、再通知消费；也可以只通知消费而不生产新任务

**触发层总原则**：

- 所有条目级数据改写必须在用户确认后、入队前同步完成
- 若某次场景需要入队，则入队成功后可立即通知消费端开始消费
- 若某次场景不需要生成新任务，则允许只发出“尝试启动消费”的控制信号
- 若消费端已在运行，则跳过重复启动，只保留队列中的待处理任务
- 接口按按钮拆分，不强求抽象复用；**三段重复的代码好过过早的抽象**

**日期筛选辅助判定**：

- "该天有未分类且未锁定的条目"：`is_verified === false && (category 为空 || category === "uncategorized")`
- "该天有未锁定条目"：存在 `is_verified === false` 的交易

**需要生产任务的通用流程**：

```
UI 点击某个会生产任务的按钮
  → 调用该按钮对应的触发层接口
  → 执行该场景要求的条目级数据改写（同步落盘）
  → 计算“脏日期集合 dirtyDates”
  → 将 dirtyDates 逐天并入 classify_queue（同日合并）
  → 若入队成功，通知消费端开始消费（空闲则立即启动；运行中则跳过启动）
  → 结束
```

**各按钮对应的触发层接口语义**：

**CSV 导入**：

```
UI/导入流程调用 CSV 导入接口
  → 扫描导入涉及的日期
  → 筛选：该天有未分类且未锁定的条目
  → dirtyDates += date
  → 入队 { date }
```

**新增标签 → [暂时跳过]**：

```
UI 调用新增标签跳过接口
  → 不做任何任务生产
  → 不通知消费端
```

**新增标签 → [现在启动分类]**：

```
UI 调用新增标签启动接口
  → 不做条目级改写
  → 不计算 dirtyDates
  → 不新增队列任务
  → 仅通知消费端尝试启动
  → 若当前队列为空，则安全 no-op
  → 若当前队列中已有待处理日期，则这些旧任务会按最新 defined_categories 执行
```

**删除标签 → 用户选"仅受影响"**：

```
UI 调用“删除标签-仅受影响”接口
  → （前置操作已完成：重置条目、清理实例库、记录受影响的日期列表）
  → dirtyDates += 受影响日期
  → 入队 { date }
```

**删除标签 → 用户选"真全量重分类"**：

```
UI 调用“删除标签-真全量重分类”接口
  → 扫描全量日期
  → 筛选：该天有未锁定条目
  → 前置处理：入选日期中所有未锁定条目按 `id` 清理实例库
  → dirtyDates += date
  → 入队 { date }
```

**修改标签描述 → 用户选"该标签下仅未锁定交易"**：

```
UI 调用“修改描述-仅该标签”接口
  → 扫描全量日期
  → 筛选：该天有该标签的未锁定条目
  → 前置处理：入选日期中该标签的未锁定条目按 `id` 清理实例库
  → dirtyDates += date
  → 入队 { date }
```

**修改标签描述 → 用户选"该标签下所有交易"**：

```
UI 调用“修改描述-该标签下所有交易”接口
  → 扫描全量日期
  → 筛选：该天有该标签条目
  → 前置处理：入选日期中该标签的未锁定条目，以及用户当场解锁的该标签锁定条目，按 `id` 清理实例库
  → dirtyDates += date
  → 入队 { date }
```

**学习完成 → 用户确认重分类**：

```
UI 调用学习后重分类接口
  → 扫描全量日期
  → 筛选：该天有未锁定条目
  → 前置处理：入选日期中所有未锁定条目按 `id` 清理实例库
  → dirtyDates += date
  → 入队 { date }
```

**设置页账本区 → [全量重分类]**：

```
UI 调用“设置页-全量重分类”接口
  → 扫描全量日期
  → 筛选：该天有未锁定条目
  → 前置处理：入选日期中所有未锁定条目按 `id` 清理实例库
  → dirtyDates += date
  → 入队 { date }
```

**生产范围与当前消费范围不一致时的统一提示约束**：

- 凡是某次操作最终生产出的 dirtyDates 超出当前 `data range`，UI 都必须给予用户**统一样式的提示**
- 提示只负责说明“已有部分任务进入队列，但当前不会立即消费”，**不改变队列内容，也不改变触发层语义**
- 提示文案与展现形式需在后续 UI/UX 专章统一设计；本章只冻结其**存在性与触发条件**
- CSV 导入后的特殊性不在“生产层例外”，而在“消费层例外”：导入完成后，UI 会自动把 `data range` 调整回最大日期范围，因此本来可能受当前范围限制的消费会被立即放开

**中断与恢复口径（与队列生产联动）**：

- 任务按“天”执行，单日成功后才出队
- 中断/断网/崩溃时不出队，保留在队首
- 恢复时继续消费队首任务，不重新计算 dirtyDates

**前置处理与入队原子性（强约束）**：

- 任何场景均遵循：`前置改写成功` 与 `dirtyDates 成功入队` 必须成对成立
- 若前置改写成功但入队失败，必须立即进入补偿流程（重试或恢复任务登记），禁止静默丢失
- 实施上可采用“触发事务日志”最小方案：记录 `triggerId + dirtyDates + enqueueState`，重启后自动补齐未完成入队
- 验收标准：不存在“条目已重置/解锁，但对应日期未入队”的状态

#### 5.6.3 按钮 → 触发层接口 → 副作用总表

| UI 按钮 / 入口 | 触发层接口职责 | 条目级改写 | 实例库处理 | dirtyDates | 入队 | 消费通知 | 锁定条目处理 |
| -------------- | -------------- | ---------- | ---------- | ---------- | ---- | -------- | ------------ |
| CSV 导入（自动） | 扫描导入日期并生产普通分类任务 | 无 | 无 | 导入日期中“有未分类且未锁定条目”的日期 | 是 | 可自动 | 不涉及 |
| 新增标签 → [暂时跳过] | 结束本次交互 | 无 | 无 | 无 | 否 | 否 | 不涉及 |
| 新增标签 → [现在启动分类] | 仅尝试启动当前消费 | 无 | 无 | 无 | 否 | 是 | 不涉及 |
| 删除标签 → [仅受影响的交易] | 对受影响日期生产任务 | 删除流程已完成 | 删除被删标签样本已完成 | 受影响日期 | 是 | 是 | 删除标签导致原标签条目强制解锁 |
| 删除标签 → [真全量重分类] | 对全账本未锁定条目生产任务 | 无额外条目重置 | 清理入选日期中所有未锁定条目的样本 | 全账本日期 | 是 | 是 | 锁定条目默认不参与，除非用户当场解锁 |
| 修改标签描述 → [该标签下仅未锁定交易] | 对该标签范围生产任务 | 无 | 清理该标签下未锁定条目的样本 | 该标签涉及日期 | 是 | 是 | 锁定条目不参与 |
| 修改标签描述 → [该标签下所有交易] | 对该标签范围生产任务 | 当场解锁用户勾选的该标签锁定条目 | 清理该标签下未锁定条目 + 当场解锁条目的样本 | 该标签涉及日期 | 是 | 是 | 仅该标签下的锁定条目进入解锁列表 |
| 设置页账本区 → [全量重分类] | 生产真全量任务 | 无 | 清理全账本未锁定条目的样本 | 全账本日期 | 是 | 是 | 锁定条目默认不参与，除非用户先在别处解锁 |

**按动作类型归类**：

- **生产型触发**：CSV 导入、删除标签范围按钮、修改描述范围按钮、设置页账本区的全量重分类
- **仅通知消费型触发**：新增标签后的“现在启动分类”
- **无副作用退出型触发**：新增标签后的“暂时跳过”

**代码分离点**：触发层独立于 AI Engine。**UI 不得直接读写 `classify_queue`，也不得直接编排 `BatchProcessor` 细节，必须通过触发层暴露的按钮级接口完成。** AI Engine 只看当前账本队列中的 `{ date }`，不关心“为什么要分类”。

#### 5.6.4 当前阶段实施边界（补充说明）

为避免触发策略过度复杂，当前阶段固定以下边界：

1. **队列统一为按天任务**：队列元素仅 `{ date }`。
2. **自动触发仅限 CSV 导入**：切换窗口、回前台、重启不自动生成新任务。
3. **重分类由用户操作触发**：标签相关操作与设置页账本区的“全量重分类”在 UI 渐进式确认后生成任务。
4. **前置处理必须同步落盘**：所有解锁与分类元数据联动改写在入队前完成。
5. **范围按钮即完成生产**：凡是会生成任务的范围按钮，点击当场必须完成该范围对应的入队，不得把“范围选择”延迟到后续按钮或后台推断。
6. **新增标签是特例**：新增标签后的“现在启动分类”不生成新任务，只尝试启动当前已有消费流程。
7. **消费启动自动衔接**：需要入队的按钮在入队成功后应自动通知消费端启动；若消费端已在运行，则不重复唤起。
8. **触发接口按按钮拆分**：不强制抽象为统一聚合入口；每个按钮可拥有独立触发层接口，以保持语义清晰、实现可审计。
9. **`data range` 永远不限制生产范围**：`data range` 只约束消费，不得反向限制 dirtyDates 生产、队列入队与补偿恢复。CSV 导入的特殊性仅在于：导入完成后 UI 会自动把 `data range` 调整回最大日期范围，因此消费限制会被自动放宽；这不是生产层例外。
10. **范围外 backlog 需可感知**：若队列中仍有超出当前 `data range` 的待处理任务，系统必须提供统一的待处理提示能力。

#### 5.6.5 方案正确性与健壮性说明（最终复盘）

本方案采用“**条目级改写前置落盘 + 日期级任务合并**”的简化模型。之所以可行，是因为消费端始终按天读取**当前最新账本状态**，而不是读取“入队瞬间快照”。

**为什么这是最简方案**：

- 队列只表达“某天需要重跑”，不承载条目级业务语义
- 触发层负责条目级复杂处理，消费层只负责按天执行
- 不维护条目级并集、不引入抢占/优先级状态机，减少心智与实现复杂度

**正确性时序验证**（以“同一天两次重分类触发，解锁集合有重叠”为例）：

1. **情况 A：两次触发之间，队列尚未消费**
   - 第一次触发：前置处理落盘（解锁集合 A），当日入队
   - 第二次触发：再次前置处理落盘（解锁集合 B），当日并入已有任务
   - 消费时读取当日最新状态，等价于作用在 `A ∪ B` 上，结果正确
2. **情况 B：两次触发之间，队列已消费一次**
   - 第一次触发并消费完成，得到阶段性结果
   - 第二次触发再次完成前置处理并重新入队当日
   - 第二次消费读取最新状态，覆盖新解锁集合（含与第一次重叠部分），最终结果仍正确

**必须成立的不变量**（若破坏则正确性不再保证）：

- 前置处理必须在入队前同步落盘（不可延迟到消费后）
- 单日任务成功后才出队，失败/中断不出队
- 消费必须按天读取实时账本状态并经过 Arbiter 锁定保护
- 出队必须附带版本一致性校验，防止同日重入被误删
- AI 结果写回前必须基于最新记录二次校验 `is_verified`，确保运行中用户新锁定不会被覆盖

满足以上不变量时，无论同一天被触发多少次、是否中途被消费，最终落盘结果都与“对该天最新状态进行一次完整分类”一致。

#### 5.6.6 边界风险与防护补充

为保证方案在极端边界下可落地，新增以下风险控制：

1. **消费过程中的锁定竞态**
   - 风险：AI 运行期间用户把某条交易改为 `is_verified=true`，旧快照仍可能尝试覆盖
   - 防护：在最终写回路径做“最新状态二次校验”，若已锁定则丢弃该条 AI proposal
2. **同日重复触发与消费交错**
   - 风险：第一次消费即将 remove 时，第二次触发已并入同日任务，导致误删
   - 防护：引入任务版本号校验，remove 仅在版本未变化时成功
3. **跨账本切换瞬间的消费目标漂移**
   - 风险：消费开始时是 A，执行中切到 B，导致状态归属混乱
   - 防护：一次消费会话固定 ledger 上下文；会话结束后才允许按当前账本重新选队首
4. **日期边界/时区导致 dirtyDates 误判**
   - 风险：`tx.time` 解析不一致导致跨日错分，任务入错日期
   - 防护：统一日期归一化函数（同一时区、同一格式）用于“筛选/入队/消费”三处，禁止各自解析
5. **实例库清理与分类写回的时序错配**
   - 风险：重分类前预清理不完整，旧样本污染本轮判断
   - 防护：前置清理完成后才可入队；失败则整体回滚/补偿，不允许“半清理半入队”
6. **空任务与脏任务积压**
   - 风险：某日交易被删除后仍反复入队，形成无效循环
   - 防护：消费端允许“空日任务成功出队”，并记录空任务计数用于监控异常触发源

#### 5.6.7 队列链路回归验收（新增）

以下用例为 P2 队列方案的最小必测集，全部通过才可视为“边界可用”：

1. **同日二次触发（未消费前）**：仅保留一个当日任务，消费结果覆盖两次前置改写并集
2. **同日二次触发（消费中）**：首次消费结束后任务仍保留并再次消费，不丢第二次触发
3. **运行中用户锁定**：AI 返回包含该条结果，但最终写回不覆盖新锁定交易
4. **前置改写成功 + 入队失败**：重启后可自动补齐入队，最终无漏分类日期
5. **跨账本切换**：A 消费会话不中途漂移到 B；切换后仅消费 B 队列
6. **崩溃恢复**：崩溃前未完成任务在重启后仍在队首可继续消费
7. **空任务清理**：当日无交易时任务能正常出队，不形成死循环
8. **日期边界样本**：23:59/00:00 邻近交易在筛选与消费阶段归属同一规则，结果一致
9. **新增标签启动消费**：点击“现在启动分类”时不新增 dirtyDates、不写入队列，仅尝试启动当前消费；若队列为空则安全 no-op
10. **标签重命名 + 队列共存**：重命名后无需改写既有队列任务，后续消费仍按最新账本状态正确执行

### 5.7 所有场景 vs is\_verified 交互矩阵

| 操作            | 未锁定交易                       | 已锁定交易                 |
| ------------- | --------------------------- | --------------------- |
| CSV 导入新交易     | 计算 dirtyDates 并入队           | 不适用                   |
| 新增标签 → 现在启动分类 | 不改写现有交易，不计算 dirtyDates，不入队；仅尝试启动当前消费 | 不适用 |
| 删除标签 → 仅受影响 / 真全量 | 重置 + 清理 + 计算 dirtyDates 并入队 | **强制解锁** → 重置；真全量路径中其余锁定条目默认不参与，除非用户当场解锁 |
| 重命名标签         | 批量改名                        | 批量改名（不影响锁定）           |
| 修改标签描述 → 该标签下仅未锁定交易 | 清理实例库 + 计算 dirtyDates 并入队   | **不参与** |
| 修改标签描述 → 该标签下所有交易 | 清理实例库 + 计算 dirtyDates 并入队   | 仅该标签下锁定条目在用户当场解锁后参与 |
| 学习完成 → 重分类    | 清理实例库 + 计算 dirtyDates 并入队   | **不参与**               |
| 设置页账本区 → 全量重分类 | 清理实例库 + 计算 dirtyDates 并入队   | **不参与**，除非用户先在别处手动解锁     |

**补充冻结说明**：

- “执行重分类”在本阶段通常指：**完成该按钮对应的前置处理 + dirtyDates 入队，并自动通知消费端开始消费**
- `新增标签 → 现在启动分类` 属于特例：**只通知消费，不生产新任务**
- “真全量”一词只用于：删除标签路径中的全账本重分类，以及设置页账本区的独立全量重分类入口
- 修改标签描述场景禁止复用“全量”一词；只能使用“该标签下仅未锁定交易 / 该标签下所有交易”
- 这不是让 UI 绕过队列直接调用分类逻辑，而是“触发层完成生产后自动衔接消费启动”，或在特例场景下仅发出消费启动信号
- `重命名标签` 维持特殊口径：只做批量改名，不进入渐进式重分类流程

***

## 六、Prompt 拼接方案

### 6.1 分类 System Prompt（完整静态部分）

以下为新版 System Prompt 的完整静态部分。动态部分（自述、当前记忆快照内容）在代码中拼接时插入到指定位置。

```typescript
export interface SystemPromptConfig {
  language?: string;
  /** 用户自述（全局，来自 self_description/user_profile.md） */
  selfDescription?: string;
  /** AI 记忆（按账本，来自 classify_memory/{ledger}/ 当前指针指向的快照） */
  memory?: string;
}

export const generateSystemPrompt = (config: SystemPromptConfig = { language: '简体中文' }) => {

  // 动态段：自述（全局）
  const selfDescriptionSection = config.selfDescription?.trim()
    ? `\n### Self-Description\nThe user has written the following self-description. This has the HIGHEST priority — follow it unconditionally, even if it conflicts with the learned memory below.\n${config.selfDescription.trim()}\n`
    : '';

  // 动态段：AI 记忆（按账本）
  const memorySection = config.memory?.trim()
    ? `\n### Learned Preferences\nThe following is a numbered list of classification patterns learned from the user's past corrections. Use these as strong guidance for your decisions.\n${config.memory.trim()}\n`
    : '';

  return `You are PixelBill, an advanced AI financial assistant specializing in personalized transaction categorization. You will receive the user's expense categories with descriptions, reference corrections from past interactions, and transaction records grouped by day. Your goal is to fully understand the user's personalized category definitions and classify every single transaction accordingly.

### Input Format
The user will provide a JSON object with the following structure:
- **category_list**: An object mapping category keys to their natural-language descriptions (e.g., {"meal": "Daily meals for two...", "others": "Everything else..."}). You MUST only use keys from this object.
- **reference_corrections**: 实例库注入的参考案例数组（按 §2.1.2 注入区块规则分 B 类和 A+C+D 类两个区块）。每条条目按 `time` 升序排列。`ai_reasoning` 和 `user_note` 始终作为字符串存在，可为空。遇到相似交易时必须遵循这些案例。
  - `id`, `time`, `sourceType`, `rawClass`
  - `counterparty`, `product`, `amount`, `direction`
  - `paymentMethod`, `transactionStatus`, `remark`
  - `category`, `is_verified`
  - B 类区块额外含 `ai_category`（前缀 `[错误判断] `）、`ai_reasoning`（前缀 `[错误判断] `）；A+C+D 区块含 `user_note`
- **days**: An array of day-grouped transaction batches. Each day object contains:
  - \`date\`: The date of the transactions (YYYY-MM-DD).
  - \`weekday\`: The day of the week (e.g., "Monday").
  - \`transactions\`: An array of transaction objects to be categorized. Each transaction object contains:
  - \`id\`: Unique transaction identifier.
  - \`time\`: Time of transaction.
  - \`amount\`: Transaction amount.
  - \`direction\`: "in" (income) or "out" (expense).
  - \`counterparty\`: The merchant or person involved.
  - \`description\`: Product name or remark.
  - \`source\`: Payment source (e.g., wechat, alipay).
  - \`raw_category\`: The original category from the payment platform (for reference only).

### Output Format
You MUST return a strictly valid JSON object. No markdown formatting, no introductory text.
\`\`\`json
{
  "date": "YYYY-MM-DD",
  "results": [
    {
      "id": "transaction_id",
      "category": "category_key",
      "reasoning": "Brief explanation in ${config.language}."
    }
  ]
}
\`\`\`

### Core Responsibilities
1. **Analyze**: Examine transaction descriptions, amounts, times, and counterparties to accurately categorize expenses.
2. **Follow corrections**: When a transaction is similar to a \`reference_corrections\` entry (same counterparty, similar amount/time pattern), follow that correction. This is your strongest signal.
3. **Apply learned preferences**: The "Learned Preferences" section (if present) contains patterns extracted from the user's history. Treat these as reliable rules unless a specific reference correction contradicts them.
4. **Respect self-description**: The "Self-Description" section (if present) is written by the user directly. It has the highest authority — follow it even if it conflicts with learned preferences.
5. **Category selection**: The \`category\` field MUST strictly match a key from \`category_list\`. Do not translate, paraphrase, or invent new categories.
6. **Reasoning language**: The \`reasoning\` field MUST be written in ${config.language}.
7. **Infer when needed**: If no correction, preference, or self-description applies, use logical inference based on the description, amount, time, and \`raw_category\`.

### Priority Hierarchy
When information sources conflict, follow this priority (highest to lowest):
1. **Self-Description** — user's direct instructions, unconditional
2. **Reference Corrections** — proven correct classifications from past interactions
3. **Learned Preferences** — patterns generalized from corrections
4. **Your own inference** — common sense and contextual reasoning

### Behavioral Guidelines
- Output strictly JSON only. No markdown fences, no introductory text.
- Remain objective and non-judgmental about spending habits.
- When a transaction is ambiguous, choose the most logical category. Explain your reasoning.
- Consider time-of-day context: consecutive transactions near the same time may be related (e.g., a small payment right after a large meal could be a supplement).
${selfDescriptionSection}${memorySection}`;
};
```

### 6.2 User Message 结构

**分类阶段实例库注入 Schema（`reference_corrections`）**：

实例库注入按 §2.1.2 的注入区块规则执行，分 B 类（错误案例）和 A+C+D 类（正向参考）两个区块分别注入。每个区块的条目结构与实例库存储字段一致，运行时按区块规则精简或添加前缀。

**注入示例（A+C+D 区块，运行时去掉 `ai_category`）**：

```json
{
  "id": "abc124",
  "time": "2026-01-15 19:40:00",
  "sourceType": "wechat",
  "rawClass": "商户消费",
  "counterparty": "面包码头",
  "product": "芝士面包",
  "amount": 16.8,
  "direction": "out",
  "paymentMethod": "零钱",
  "transactionStatus": "SUCCESS",
  "remark": "/",
  "category": "others",
  "ai_reasoning": "",
  "user_note": "同时段已吃过杨国福，这是零食",
  "is_verified": false
}
```

**不注入字段**：

- 不注入 `originalId`、`created_at`、`updated_at`、`user_category`
- A+C+D 区块运行时额外去掉 `ai_category`（无新信息）
- B 区块保留 `ai_category` 和 `ai_reasoning`，但字段值前加 `[错误判断] ` 前缀


```json
{
  "category_list": {
    "meal": "日常正餐支出（早午晚），仅限双人用餐，不含大餐和零食",
    "others": "所有非正餐支出，包括零食、饮品、交通、大餐、生活服务等"
  },

  "reference_corrections": [
    {
      "id": "5110f45d20aab6c3",
      "time": "2026-01-05 19:08:17",
      "sourceType": "wechat",
      "rawClass": "商户消费",
      "category": "meal",
      "counterparty": "袁记肉夹馍西工大店",
      "product": "袁记肉夹馍西工大店",
      "amount": 40,
      "direction": "out",
      "paymentMethod": "广发银行信用卡(6885)",
      "transactionStatus": "SUCCESS",
      "remark": "/",
      "ai_reasoning": "正餐时间段的肉夹馍餐饮消费，金额合理",
      "user_note": "Manual Test Update，111"
    },
    {
      "id": "d4db723dbb333a5a",
      "time": "2026-01-05 14:03:25",
      "sourceType": "alipay",
      "rawClass": "餐饮美食",
      "category": "meal",
      "counterparty": "水之源川菜",
      "product": "水之源川菜",
      "amount": 50,
      "direction": "out",
      "paymentMethod": "花呗",
      "transactionStatus": "SUCCESS",
      "remark": "",
      "ai_reasoning": "午餐时间段的川菜正餐消费",
      "user_note": "Manual Test Update222"
    }
  ],

  "days": [
    {
      "date": "2026-01-15",
      "weekday": "Thursday",
      "transactions": [
        { "待分类交易列表，同现有格式" }
      ]
    }
  ]
}
```

`reference_corrections` 的排序约束：先按检索命中集合去重，再按完整 `time` 字段升序排列；当前实现中若 `time` 相同，会再按 `created_at` 与 `id` 做稳定排序，但这两个字段属于**存储层稳定性细节**，不进入 Prompt schema。

### 6.3 关键变更总结

| 变更项             | 旧版                    | 新版                                                        |
| --------------- | --------------------- | --------------------------------------------------------- |
| `category_list` | 字符串数组                 | 映射（key → 描述）                                              |
| `user_rules` 字段 | Markdown 规则文件         | **移除**，被记忆快照替代                                            |
| `userContext`   | System Prompt 中的静态文本段 | **重命名为 Self-Description**，迁移至独立文件                         |
| 记忆快照            | 不存在                   | **新增**，由当前指针指向并注入为 Learned Preferences 段              |
| 实例库             | 不存在                   | **新增**，按固定 rich schema 注入为顶层 `reference_corrections`（含 `rawClass/paymentMethod/transactionStatus/remark`，按完整 `time` 升序，且 `ai_reason` / `user_reason` 固定存在） |
| 优先级层次           | 未明确                   | **新增**，四级优先级明确写入 Prompt                                   |

### 6.4 学习 System Prompt（完整）

```typescript
export interface LearningPromptConfig {
  /** 当前分类体系（defined_categories 的 JSON） */
  categories: Record<string, string>;
  /** 当前快照内容（可能为空） */
  currentMemory?: string;
}

export interface LearningCorrection {
  id: string;
  time: string;
  source: string;
  sourceType: string;
  counterparty: string;
  product: string;
  amount: number;
  direction: 'in' | 'out';
  paymentMethod: string;
  transactionStatus: string;
  remark: string;
  category: string;
  ai_category: string;
  ai_reasoning: string;
  is_verified: boolean;
  user_note: string;
}

export interface LearningDeltaPayload {
  mode: 'delta' | 'full_reconcile';
  from_revision: number;
  to_revision: number;
  upserts: LearningCorrection[];
  deletions: LearningCorrection[];
  current_examples?: LearningCorrection[];
}

export const generateLearningSystemPrompt = (config: LearningPromptConfig) => {
  const memorySection = config.currentMemory?.trim()
    ? `\n### Current Memory (Numbered List)\n${config.currentMemory.trim()}\n`
    : '\n### Current Memory\n(Empty — no learned preferences yet.)\n';

  return `You are a pattern analyst for PixelBill, a personal finance app. Your task is to analyze the user's classification corrections and extract generalizable rules and preferences.

### Your Role
The user has been correcting the AI classifier's mistakes. Each correction record shows what the AI predicted, what the user changed it to, and optionally why. Your job is to identify patterns in these corrections and update the current memory snapshot accordingly.

### Category System
The following categories are currently defined:
${JSON.stringify(config.categories, null, 2)}

Only reference categories that exist in this list. If a correction references a category not in this list, it may be outdated — do not create rules for non-existent categories.
${memorySection}
### Output Format
You MUST return a strictly valid JSON object. No markdown formatting, no introductory text.

\`\`\`json
{
  "operations": [
    { "type": "ADD", "content": "..." },
    { "type": "MODIFY", "index": 3, "content": "..." },
    { "type": "DELETE", "index": 5 }
  ]
}
\`\`\`

### Operation Types
- **ADD**: Append a new insight. Provide \`content\` (a single information point in natural language).
- **MODIFY**: Update an existing entry. Provide \`index\` (the line number in the current memory) and \`content\` (the replacement text).
- **DELETE**: Remove an entry that is no longer accurate or has been superseded. Provide \`index\` (the line number).

### Rules
1. Each memory entry must be a single, self-contained information point. One entry = one insight.
2. Do not duplicate information already present in the current memory.
3. Prefer MODIFY over DELETE+ADD when updating an existing rule (e.g., changing a threshold).
4. If corrections contradict an existing memory entry, MODIFY or DELETE it.
5. Focus on generalizable patterns, not individual transactions. "杨国福 at 45 yuan was meal" is a correction; "Fast food restaurants under 70 yuan during meal hours → meal" is a pattern.
6. Treat \`deletions\` as explicit evidence that some previously valid example semantics have been withdrawn. If an old memory rule is no longer supported after considering deletions, MODIFY or DELETE it.
7. If \`mode === "full_reconcile"\`, treat \`current_examples\` as the authoritative current example store and proactively remove stale memory that is no longer supported.
8. If the changes don't reveal any new pattern, return an empty operations array: \`{"operations": []}\`
9. Write entries in the same language the user uses (typically Chinese).
`;
};

export const buildLearningUserMessage = (payload: LearningDeltaPayload) => {
  return `以下是实例库相对上次学习的完整变更：

${JSON.stringify(payload, null, 2)}

请注意：
1. upserts 表示新增或更新后仍然存在的样本；
2. deletions 表示已从实例库删除的样本；
3. 若 mode 为 full_reconcile，则应以 current_examples 为准，主动清理与当前实例库不再一致的旧记忆。

请分析这些变更，输出你建议的记忆更新操作。`;
};
```

**学习阶段实例注入 Schema（`LearningDeltaPayload`）**：

```json
{
  "mode": "delta",
  "from_revision": 12,
  "to_revision": 15,
  "upserts": [
    {
      "id": "abc123",
      "time": "2026-01-15 19:40:00",
      "sourceType": "wechat",
      "rawClass": "商户消费",
      "counterparty": "面包码头",
      "product": "芝士面包",
      "amount": 16.8,
      "direction": "out",
      "paymentMethod": "零钱",
      "transactionStatus": "SUCCESS",
      "remark": "/",
      "category": "others",
      "ai_reasoning": "",
      "user_note": "同时段已吃过杨国福，这是零食"
    }
  ],
  "deletions": [
    {
      "id": "old_001",
      "time": "2026-01-03 12:20:00",
      "sourceType": "alipay",
      "rawClass": "餐饮美食",
      "counterparty": "旧商户",
      "product": "旧样本",
      "amount": 32,
      "direction": "out",
      "paymentMethod": "花呗",
      "transactionStatus": "SUCCESS",
      "remark": "",
      "category": "meal",
      "ai_reasoning": "午餐餐饮",
      "user_note": ""
    }
  ]
}
```

学习阶段同样沿用 2.1.2 的合并语义：学习 AI 看到的是“最终正确类别 + 完整交易上下文 + 固定理由字段”的净变更集，而不是原始分类元数据的并列快照。\
其中 `upserts` 与 `deletions` 必须同时提供，避免 AI 只看到新增语义、看不到旧语义被撤销，从而导致记忆残留。\
若系统无法可靠重建 revision 区间变更，则切换到 `full_reconcile` 模式，并补充 `current_examples` 全量注入。

### 6.5 收编 System Prompt（完整）

```typescript
export interface CompressPromptConfig {
  /** 当前分类体系（defined_categories 的 JSON） */
  categories: Record<string, string>;
  /** 当前快照内容 */
  currentMemory: string;
  /** 当前实例库全量 */
  currentExamples: LearningCorrection[];
  /** 当前条目数 */
  currentCount: number;
  /** 压缩目标条目数 */
  targetCount: number;
}

export const generateCompressSystemPrompt = (config: CompressPromptConfig) => {
  return `You are a memory compressor for PixelBill, a personal finance app. Your task is to compress a numbered list of classification preferences while preserving all essential information.

### Category System
The following categories are currently defined:
${JSON.stringify(config.categories, null, 2)}

### Rules
1. The current memory has ${config.currentCount} entries. Compress it to no more than ${config.targetCount} entries.
2. Merge semantically similar entries into one. For example, multiple merchant-specific rules for the same pattern can be combined.
3. Preserve ALL key information — thresholds, exceptions, special cases. Do not silently drop rules.
4. You will also receive the FULL current example store. Use it as the ground truth context to avoid dropping still-valid patterns or preserving outdated ones.
5. If an entry references a category that does NOT exist in the category system above, it is outdated. Remove it and do not preserve its content.
6. If an entry is a "tag deleted" marker (e.g., "标签 xxx 已从分类体系中移除..."), check whether that tag now exists again in the category system. If it does, remove only the marker but KEEP any related rules. If it does not, remove both the marker and all related rules.
7. Each output entry must be a single, self-contained information point.
8. Write entries in the same language as the input (typically Chinese).

### Output Format
Output ONLY the compressed numbered list as plain text, one entry per line, with sequential numbers. No JSON, no markdown fences, no commentary.

Example output:
1. First compressed entry
2. Second compressed entry
3. Third compressed entry
`;
};

export const buildCompressUserMessage = (
  currentMemory: string,
  currentExamples: LearningCorrection[]
) => {
  return `以下是当前的分类记忆，请进行压缩：

${currentMemory}

以下是当前实例库全量（必须视为仍然有效的现行上下文）：

${JSON.stringify(currentExamples, null, 2)}`;
};
```

**收编阶段实例注入原则**：

- 收编会话必须注入**当前实例库全量**
- 不能只依赖当前记忆做压缩，否则容易保留已过时规则，或在压缩时误删仍有大量实例支撑的有效规则
- 全量实例库的字段口径与分类阶段、学习阶段保持一致
- 若实例库为空，则按空数组注入，而不是省略字段

***

## 七、用户交互设计

### 7.1 当前修正方式（已实现）

**场景**：用户看到一条分错的交易。

**交互流程**：

```
用户点击交易条目 → 进入交易详情页
  → 点击分类区域 → 标签轮盘弹出
  → 选择正确分类 → 分类立即生效
  → 可选：在详情页填写用户备注（user_note）
  → 返回列表
```

**优点**：逻辑完整，所有信息都能采集到。

**不足**：需要进入详情页才能改分类，操作路径偏长；填写备注是独立步骤，容易被忽略。

### 7.2 快速修正层（规划中，非比赛核心）

**目标**：将修正摩擦力降到最低，让用户在列表页就能完成修正 + 可选补充理由。

**交互流程**：

```
用户在交易列表直接点击分类标签
  → 标签轮盘弹出，选择正确分类
  → 分类立即生效（无需进入详情页）
  → 底部浮现轻量提示条：
      "想告诉 AI 为什么改吗？"
      [🎤 语音] [✏️ 文字] [× 关闭]
  → 3秒后自动消失
  → 用户选择忽略：仅记录标签变更，user_note 为空
  → 用户选择输入：语音转文字或直接输入 → 存入 user_note
```

**设计哲学**：修正分类的摩擦力趋近于零，提供理由是锦上添花而非必须。

**工作量评估**：

- 列表页内联标签轮盘（需改造现有列表组件交互）：约 1-2 天
- 底部提示条 + 文字输入：约 0.5 天
- 语音输入（需集成语音转文字能力）：约 1-2 天
- **总计约 3-4 天**，其中语音输入可进一步延后

### 7.3 深度对话层（远期规划，比赛期间不实现）

**场景**：用户长按某条交易，唤出对话式界面。

**交互流程**：

1. AI 展示分类逻辑："我把这笔归为 meal，因为..."
2. 用户语音/文字反馈："不对，因为..."
3. AI 理解后更新分类 + 生成高质量实例记录

**价值**：获取最高质量的学习信号。作为答辩时的"技术展望"展示。

### 7.4 AI 记忆查看/编辑

详见 2.2 节的 UI 展示说明。入口分布在设置页的两个分区中：

- **全局设置区**："自述 —— 让 AI 了解你"
- **账本设置区**："AI 记忆"（有序列表编辑器 + 立即学习 + 历史版本）

***

## 八、代码现状复核与逻辑待办清单

> **说明**：前文第 1～7 章是 **v7 目标规格**；本章只回答两件事：  
>
> 1) 原 P2 规划里，当前代码实际上完成到了哪里；  
> 2) 放弃旧 P1/P2/P3 迭代口径后，除 UI/UX 外，还剩哪些逻辑与测试待落地。

### 8.1 原 P2 规划复核（基于当前代码）

**当前已明确落地的能力**：

- ✅ 队列已按账本隔离持久化，元素业务语义已冻结为 `{ date }`
- ✅ 同日去重、空日期防御、重启后恢复、按账本聚合查看均已落地
- ✅ 消费端已固定为“仅消费当前选中账本”
- ✅ 消费端已具备循环消费、失败不丢任务、失败任务移到队尾、空任务安全消费
- ✅ 已落地 CAS 版本校验，避免“消费中同日重入”误删任务
- ✅ 已落地 AI 写回前 `is_verified` 二次校验，保护运行中新增锁定
- ✅ CSV 自动触发、确认日期入队、recovery 补偿恢复已落地
- ✅ 切换账本时会自动恢复 `classify_queue_recovery` 与确认重分类补偿记录
- ✅ 删除/重命名账本时，`classify_queue` 与 `classify_queue_recovery` 已联动处理
- ✅ 标签重命名已回归冻结口径：只改名，不重分类，不改锁定
- ✅ 删除标签时会重置受影响交易并清理对应实例库样本，也会追加记忆失效标记

注：协作者声称已完成v6开发测试+原pixelbill表现层剥离，以下代码框中的内容为v6残留，不能确定具体情况

```
**当前仅部分落地的能力**：

- ⚠ 触发层已存在，但仍以“CSV 自动触发 + 确认日期入队 + recovery”通用接口为主，尚未完全重构为“每个 UI 按钮一个显式接口”
- ⚠ 标签描述修改与删除后的渐进式重分类交互已存在，但其内部触发职责仍有一部分散落在 UI/服务层，而非完全收敛到 v6 触发层模型
- ⚠ 设置页与重分类对话框已有相关能力，但“设置页账本区的真全量重分类入口”未在当前代码中形成与 v6 一致的清晰逻辑闭环

**当前尚未落地、且已被 v6 明确定义为目标规格的能力**：

- ❌ `data range` 仅约束消费、不约束生产的调度模型尚未落地
- ❌ “范围外 backlog 的统一提示”尚未落地
- ❌ 快照系统尚未重构为 `classify_memory/{ledger}/index.json + current_snapshot_id + 日期时间命名快照`
- ❌ 实例库 rich schema、学习 revision 变更集、收编全量实例库注入尚未落地
- ❌ 收编机制本体尚未落地
- ❌ `classify_confirm_recovery` 的账本重命名/删除联动清理尚未补齐
```



### 8.2 逻辑落实与测试 Checklist（不含 UI/UX）

- [ ] **重构快照存储为 v6 单一事实源**：迁移到 `classify_memory/{ledger}/index.json + snapshots/` 目录结构；创建账本即生成空快照；维护 `current_snapshot_id`
- [ ] **重写快照生命周期规则**：快照命名改为日期时间；当前快照不可删；GC 改为“删除最旧且非当前”；回退改为仅移动指针
- [ ] **改造 PromptBuilder 读取路径**：分类、学习、收编统一从 `current_snapshot_id` 读取当前记忆，不再依赖单独 `classify_memory/{ledger}.md`
- [ ] **升级实例库存储结构**：在当前态文件中加入 `revision`；补充 `classify_example_changes/{ledger}.json` 变更日志
- [ ] **实现学习基线推进机制**：在快照索引中维护 `last_learned_example_revision`；学习成功后推进，失败不推进
- [ ] **实现学习变更集构造器**：按 revision 区间生成净变更 `upserts + deletions`；丢日志或区间不可重建时切到 `full_reconcile`
- [ ] **统一分类/学习/收编实例注入 schema**：落地 §2.1.2 的注入区块规则，B 类单独区块 + `[错误判断]` 前缀，A+C+D 合并区块，字段名与主 JSON 保持一致
- [ ] **落地收编机制**：实现触发条件、压缩 Prompt、全量实例库注入、快照生成、失败回退策略
- [ ] **将触发层重构为按钮级接口**：把新增标签、删除标签两种范围、修改描述两种范围、设置页真全量重分类等动作全部收敛到独立触发接口
- [ ] **补齐 `data range` 调度层**：只约束引擎消费范围，不影响 dirtyDates 生产、队列入队与 recovery
- [ ] **实现范围内优先消费算法**：支持“在当前账本队列中寻找当前 `data range` 内最早可消费日期”，而不是死守队首
- [ ] **补齐范围外 backlog 状态输出**：为消费端和状态层提供“当前范围外仍有待处理任务”的统一信号，供后续 UI 统一接入
- [ ] **补齐 CSV 导入后的 data range 联动口径**：若产品层仍保留“导入后扩大视图范围”的行为，应明确它只是 UI 状态调整，不属于触发层职责
- [ ] **补齐 `classify_confirm_recovery` 生命周期联动**：账本重命名/删除时同步迁移或清理确认重分类补偿文件
- [ ] **补齐端到端测试基线**：覆盖快照迁移、revision 变更集、full_reconcile、收编、data range 调度、范围外 backlog、recovery 生命周期

### 8.3 建议测试顺序

- [ ] **先测底层存储**：快照迁移、当前指针、GC、账本创建空快照
- [ ] **再测实例库学习链路**：revision、change log、delta / full_reconcile
- [ ] **再测分类主链**：Prompt rich schema、`data range` 调度、范围外 backlog
- [ ] **最后测重分类与恢复链路**：触发层按钮接口、确认补偿、账本生命周期联动、收编回归

***

## 九、存储位置总览（当前代码现状）

### 9.1 文件分布

| 文件                                | 存储位置                                    | Directory 枚举          | 作用域 | 说明                               |
| --------------------------------- | --------------------------------------- | --------------------- | --- | -------------------------------- |
| `ledgers.json`                    | 沙箱                                      | `Directory.Data`      | 全局  | 账本索引，已有                          |
| `*.pixelbill.json`                | `Documents/PixelBill/`                  | `Directory.Documents` | 按账本 | 账本数据，已有                          |
| `secure_config.bin`               | 沙箱                                      | `Directory.Data`      | 全局  | 加密配置（API 密钥等），已有                 |
| `user_profile.md`                 | `Documents/PixelBill/self_description/` | `Directory.Documents` | 全局  | **新增**：自述文件，用户手写偏好，独立目录便于用户识别    |
| `classify_memory/{ledger}.md`     | `Documents/PixelBill/classify_memory/`  | `Directory.Documents` | 按账本 | **当前实现**：AI 记忆文件 |
| `classify_examples/{ledger}.json` | 沙箱 `classify_examples/`                 | `Directory.Data`      | 按账本 | **新增**：实例库                       |
| `memory_snapshots/{ledger}/`      | 沙箱 `memory_snapshots/`                  | `Directory.Data`      | 按账本 | **当前实现**：记忆文件快照目录（含 index.json + snap_XXX.md） |
| `classify_queue/{ledger}.json`    | 沙箱 `classify_queue/`                    | `Directory.Data`      | 按账本 | **新增**：分类任务队列（按账本隔离），App 重启后继续消费 |
| `classify_queue_recovery/{ledger}.json` | 沙箱 `classify_queue_recovery/`     | `Directory.Data`      | 按账本 | **当前实现**：队列入队失败补偿恢复文件 |
| `classify_confirm_recovery/{ledger}.json` | 沙箱 `classify_confirm_recovery/` | `Directory.Data`      | 按账本 | **当前实现**：前置改写成功但确认入队未完成时的补偿文件 |

**分布原则**：用户需要直接访问/编辑的 → Documents；纯系统内部维护的 → 沙箱。

### 9.2 账本管理器连锁变更

现有代码中的账本管理器已经扩展了 AI 相关文件的生命周期处理，但仍是基于**当前实现存储结构**：

**创建账本**：当前实现**不会**在创建账本时立即生成空快照；记忆文件、实例库、快照目录、队列文件、recovery 文件都按需创建。

**删除账本**：

```
删除账本 "{ledger}"
  → [已有] 删除 Documents/PixelBill/{ledger}.pixelbill.json
  → [新增] 删除 Documents/PixelBill/classify_memory/{ledger}.md（如存在）
  → [新增] 删除 沙箱/classify_examples/{ledger}.json（如存在）
  → [新增] 删除 沙箱/memory_snapshots/{ledger}/ 整个目录（如存在）
  → [新增] 删除 沙箱/classify_queue/{ledger}.json（如存在）
  → [新增] 删除 沙箱/classify_queue_recovery/{ledger}.json（如存在）
  → [缺口] classify_confirm_recovery/{ledger}.json 当前代码尚未联动删除
  → [已有] 更新 ledgers.json 索引
```

**重命名账本**：

```
重命名账本 "{old}" → "{new}"
  → [已有] 重命名 {old}.pixelbill.json → {new}.pixelbill.json
  → [新增] 重命名 classify_memory/{old}.md → classify_memory/{new}.md（如存在）
  → [新增] 重命名 classify_examples/{old}.json → classify_examples/{new}.json（如存在）
  → [新增] 重命名 memory_snapshots/{old}/ → memory_snapshots/{new}/（如存在）
  → [新增] 重命名 classify_queue/{old}.json → classify_queue/{new}.json（如存在）
  → [新增] 重命名 classify_queue_recovery/{old}.json → classify_queue_recovery/{new}.json（如存在）
  → [缺口] classify_confirm_recovery/{old}.json 当前代码尚未联动重命名
  → [已有] 更新 ledgers.json 索引
```

所有新增文件操作都带“如存在”判断——当前实现中，新账本可能尚未产生学习/修正，因此相关文件不一定存在。

> **注意**：自述文件（`user_profile.md`）为全局文件，不参与账本级别的生命周期管理。

***

## 十、与现有架构的兼容性（当前代码快照）

### 10.1 已修改/新增模块状态

| 模块                 | 变更内容                                                  | 状态          |
| ------------------ | ----------------------------------------------------- | ----------- |
| `PromptBuilder.ts` | 重构 Prompt 拼接逻辑，接入自述、当前记忆文件和实例库                    | ✅ 已完成 |
| `SystemPrompt.ts`  | 新增 Self-Description / Learned Preferences 动态段、四级优先级层次 | ✅ 已完成 |
| `Arbiter`          | 修正写入时同步更新实例库                                          | ✅ 已完成    |
| `ConfigManager`    | 新增用户上下文接口，支持自述文件迁移                                    | ✅ 已完成    |
| `SettingsPage`     | 新增 AI 记忆面板、历史版本、阈值配置                                  | ✅ 已完成    |
| `LedgerService`    | 新增标签管理 API（增删改 + 连锁处理）；确认重分类补偿恢复                        | ✅ 已部分按 v6 落地   |
| `ClassifyQueue`    | 分类任务队列（按账本隔离持久化、按天去重合并）                               | ✅ P2 已完成   |
| `ClassifyTrigger`  | 触发层——CSV 自动触发、确认日期入队、recovery 管理                       | ✅ 已部分按 v6 落地   |

### 10.2 新增模块状态

| 模块                       | 职责                        | 路径                                            | 状态        |
| ------------------------ | ------------------------- | --------------------------------------------- | --------- |
| `ExampleStore`           | 实例库的 CRUD + 批量检索逻辑        | `src/core/services/ExampleStore.ts`           | ✅ 已完成  |
| `MemoryManager`          | 记忆文件的读取、增量更新              | `src/core/services/MemoryManager.ts`          | ✅ 已完成（旧存储模型）  |
| `SnapshotManager`        | 快照的创建、索引维护、回退执行、上限清理      | `src/core/services/SnapshotManager.ts`        | ✅ 已完成（旧快照模型）  |
| `SelfDescriptionManager` | 自述文件的读取、写入、迁移             | `src/core/services/SelfDescriptionManager.ts` | ✅ 已完成  |
| `LearningSession`        | 学习会话的编排（Prompt 构建、结果执行）   | `src/core/ai_engine/LearningSession.ts`       | ✅ 已完成（旧学习模型）  |
| `ClassifyQueue`          | 分类任务队列（按账本隔离持久化、按天去重合并）   | `src/core/ai_engine/ClassifyQueue.ts`         | ✅ 已完成 |
| `ClassifyTrigger`        | 触发层——CSV 自动触发、确认日期入队、恢复补偿 | `src/core/ai_engine/ClassifyTrigger.ts`       | ✅ 已完成（未达 v6 按钮级接口） |

### 10.3 目标规格与当前代码差距

**继承自 v6 的未实施项**：

- **快照系统**：当前代码仍是 `classify_memory/{ledger}.md + memory_snapshots/{ledger}/` 双轨结构，尚未升级到前文的"目录内快照 + current 指针"模型
- **实例注入字段**：当前代码中的分类 Prompt 仍注入 `created_at`，且未提供 `rawClass / paymentMethod / transactionStatus / remark`；尚未收敛到第六章 rich schema
- **学习变更集**：当前代码尚未维护 `revision + change log + last_learned_example_revision`，因此无法按规格生成"相对上次学习的完整净变更（upserts + deletions）"
- **收编上下文**：当前代码的收编设计尚未实现"全量实例库注入"，仍缺少利用现行实例库校验旧记忆是否过时的能力
- **触发层接口形态**：当前 `ClassifyTrigger` 以"CSV 自动触发 + 确认日期入队 + recovery"三类接口为主，尚未完全按前文拆成"每个 UI 按钮一个显式触发接口"
- **账本创建时空快照**：前文规格要求创建账本立即生成空快照；当前代码尚未落地
- **快照命名与 GC**：当前代码仍使用 `snap_001` 风格和"保留最近 30 个"，尚未升级为日期时间命名与"删除最旧且非当前"
- **`data range` 调度层**：当前代码中的 `dateRange` 仍主要是 UI 状态；消费端尚未实现"只约束消费、不约束生产"的 v6 调度模型
- **范围外 backlog 提示**：当前代码尚未暴露"当前范围外仍有待处理任务"的统一状态信号
- **确认重分类补偿文件生命周期**：`classify_confirm_recovery/{ledger}.json` 当前尚未在账本重命名/删除时联动迁移或清理

**v7 新增的未实施项**：

- **实例库存储字段名对齐**：当前 `ExampleStore` 写入实例库时使用的字段名（`tx_id`、`source`、`description`、`ai_reason`、`user_reason`）与主 JSON 字段名不一致，需统一改为 `id`、`sourceType`、`product`、`ai_reasoning`、`user_note`
- **实例库四类来源区分**：当前 `ExampleStore.addOrUpdate()` 只区分"用户修正"和"用户锁定"两类来源，需扩展为 A/B/C/D 四类，并按对应规则填充 `ai_category`、`ai_reasoning`（B 类保留原值，不置空）
- **实例库 B 类 `ai_reasoning` 保留**：当前代码对 B 类置空 `ai_reasoning`（v6 旧逻辑），v7 要求保留原值
- **注入区块规则**：当前分类 Prompt 对所有实例库条目统一注入，未拆分 B 类（错误案例）单独区块。需在 `PromptBuilder` 中实现：B 类单独前置区块 + `[错误判断]` 字段前缀，A+C+D 类合并后置区块（运行时去掉 `ai_category`）
- **D 类（手记）实例库支持**：`ExampleStore` 当前无手记条目的入库路径。需在 `ManualEntryManager.addEntry()` 落地后，于 `product` 非空时触发写入（见 `Moni_Manual_Entry_Spec_v3.md` §3.3）
- **`SourceType` 枚举扩展**：`src/types/metadata.ts` 中 `SourceType` 需新增 `'manual'` 枚举值，并检查所有 switch/exhaustive 覆盖
- **`LearningCorrection` 接口字段对齐**：接口字段需对应更新为 `id`、`sourceType`、`product`、`ai_category`、`ai_reasoning`、`is_verified`、`user_note`


### 10.4 不需要修改的模块

- CSV Parser
- Mock 层
- UI 组件（除标签管理、AI 记忆页、修正交互外）
- 网络层 / LLMClient

***

## 十一、文档更新历史


### v7 (2026-04-08)

- **实例库字段名全面对齐主 JSON**：废弃 `tx_id`/`source`/`description`/`ai_reason`/`user_reason` 等重命名字段，统一使用 `id`/`sourceType`/`product`/`ai_reasoning`/`user_note`
- **废弃持久化层合并/丢弃逻辑**：原 v6"分类元数据合并逻辑"（B 类置空 `ai_reasoning`、`user_category` 合并为 `category` 等）从存储层移除，改为注入层运行时处理
- **实例库数据来源从两类扩展为四类**：A（AI 分对 + 用户锁定）/ B（AI 分错 + 用户纠正）/ C（AI 未处理 + 用户直接锁定）/ D（随手记 + subject 非空），各类存储填充规则明确化
- **B 类 `ai_reasoning` 保留**：不再置空，保留原始错误推理，由注入层添加 `[错误判断]` 前缀标注
- **注入区块规则**：实例库注入分两个区块——B 类单独前置区块（双重保险：区块语义 + 字段前缀），A+C+D 类合并后置区块（运行时去掉 `ai_category`）
- **D 类（手记）实例库支持**：`sourceType: "manual"` 条目纳入实例库，`product` 字段承载 subject，`user_note` 承载 description，检索中商户名匹配不参与，靠 `product` 和金额天然降权
- **`LearningCorrection` 接口字段对齐**：接口字段名同步更新
- **当前态文件与实例库主文件合并**：不再单独维护"当前态文件"，`classify_examples/{ledger}.json` 即同时承担当前态和存储角色
- **§10.3 补充 v7 新增未实施项**：明确 `ExampleStore`、`PromptBuilder`、`SourceType` 枚举等待实施的具体改动

### v6 (2026-04-05)

- 快照设计正式升版到 v6：单一事实源改为“快照集合 + 当前指针 + 写后快照”，并明确创建账本即生成空快照、当前快照不可删、GC 删除最旧且非当前
- 第五章补充 `data range` 的高层约束：只约束引擎消费范围，不影响 dirtyDates 生产与队列入队
- 第五章补充“生产范围超出当前消费范围时的统一提示”规格，并明确全量重分类为例外
- 第六章将分类、学习、收编的实例注入统一为 rich schema，并新增学习 revision 变更集与收编全量实例库上下文
- 第八章废弃旧 P1/P2/P3 路线图，改为“原 P2 规划复核 + 非 UI/UX 逻辑待办 checklist”
- 第九、十章同步到当前代码真实状态，新增 recovery 文件、生命周期联动缺口、`data range` 调度缺口等说明

### v5.2 (2026-04-05)

- 快照设计重定义为“快照集合 + 当前指针 + 写后快照”
- 第五章补齐触发层设计模式、按钮级接口、副作用总表与“真全量 / 标签下所有交易”的口径区分
- 第六章修正实例库注入 schema

### v5.1 (2026-03-29)

- 更新状态：P2 已完成，文档口径与实现重新对齐
- 删除标签交互口径收敛为“前置改写完成后直接进入范围确认”
- 全量路径补充“锁定交易列表 + 当场解锁”说明
- 生命周期联动、消费自动衔接、冻结口径回归按实现状态标记完成

### v4.3 (2026-03-24)

- 明确队列语义：任务元素业务语义固定为 `{ date }`
- 修正文档残留冲突：移除 `ClassifyQueue` 的“优先级升级”描述
- 新增并发防护：同日重入版本校验（防吞任务）
- 新增竞态防护：AI 写回前 `is_verified` 二次校验
- 新增前置处理与入队原子性约束及补偿要求
- 新增边界风险清单与 P2 队列最小必测回归集

### v4.2 (2026-03-16)

- 更新状态：P0、P1 已完成
- 新增 P0/P1 调试工具使用说明
- 新增相关文档链接（测试指南、实现总结）
- 更新模块实现状态表
- 补充 P1 实现细节（索引偏移处理、回退机制）

### v4.1 (2026-03-16)

- 初始完整设计文档
- 包含 P0-P3 完整规划
- 详细 Prompt 设计方案
- 存储架构与数据流设计

***

**文档完成。**
**下一步**：按第八章 checklist 推进非 UI/UX 逻辑实现与测试
