# Moni 表面系统（Surface System）

**文档层级**: Layer 1 — Surface System
**作用**: 定义"什么场景用什么视觉组合"，是编码 agent 实现任何新组件时的第一参照物。

> 本文档中所有具体值以 `tailwind.config.js` 中的 token name 为准。文档中括号内标注的色值仅为阅读辅助，代码中禁止硬编码。

---

## 一、页面类型与视觉对应

| 页面类型 | 代表页面 | 卡片语法 | 说明 |
|----------|----------|----------|------|
| 一级页面 | 首页、记账页、设置页 Root | 主卡语法 | 粗描边、大圆角、强存在感 |
| 二级页面 | 设置子页面、详情页、密码输入页 | 内容卡语法 | 淡描边、克制、不抢注意力 |
| 弹层/蒙版 | 拖拽蒙版、分类选择器、确认对话框 | 弹层语法 | 依场景选择，见下文 |

**关键规则**：详情页、设置子页面等从一级页面推入的子页面，统一跟随**内容卡语法**，不跟随一级页面的主卡语法。

### 1.1 页面 Chrome 归属矩阵

仅定义“视觉语法”还不够。移动端页面还必须明确：**谁拥有顶部 header、谁拥有底部导航、谁拥有整块画布与 safe area。**

| 场景 | 顶部 header | 底部导航 footer | 画布主权 | 说明 |
|------|-------------|-----------------|----------|------|
| 首页 Root | 有 | 有 | Root 内容区 | 一级页面，使用主卡语法 |
| 记账页 Root | 有 | 有 | Root 内容区 | 一级页面，使用主卡语法 |
| 设置页 Root | 有 | 有 | Root 内容区 | 一级页面，使用主卡语法 |
| 设置子页面 | 无独立全局 header；仅保留子页自己的返回标题区 | 保留 | 子页面自身 | 二级页面，跟随内容卡语法；Android 返回手势必须优先由当前子页消费，不能落回 Root 双击退出逻辑 |
| 交易详情页 | 无 | 无 | 详情页自身全屏覆盖 | 从右侧滑入后接管整块画布，不得被 Root header/footer 挤压 |
| 压缩包密码输入页 | 无 | 无 | 页面自身全屏覆盖 | 二级页面；顶部仅吃 safe area，不共享 Root header/footer |
| 导入指南页 | 无 | 无 | 页面自身全屏覆盖 | 二级页面内容直接接管整块画布；底部导航必须被完全覆盖，不再露出 Root footer |
| 首页拖拽蒙版 | 无 | 可保留 | 蒙版自身全屏覆盖 | 拖拽激活后，分类区/安全带/细则区整套系统接管整块屏幕；底部导航不需要因拖拽态主动隐藏 |
| 记账页随手记拖拽蒙版 | 无 | 可保留 | 蒙版自身全屏覆盖 | 与首页同类，但结构更简化；底部保留导航栏高度量级的安全带 |

### 1.2 全屏覆盖层约束

- 凡是“画布主权 = 页面自身全屏覆盖 / 蒙版自身全屏覆盖”的场景，必须直接覆盖 `inset: 0` 的完整屏幕区域。
- 这类层禁止继续被 `AppRoot` 中的常驻 header/footer 占掉高度后，再塞进中间内容区。
- 若一级页面为了稳定切页需要把某些共享状态放在 Root 层，状态可以上提，但**视觉 chrome 不得因此强行上提**。

### 1.3 顶部 Safe Area 统一规则

- 顶部安全区分两层语义：
  - 画布内标题区的基础顶边距
  - 原生设备额外的 `env(safe-area-inset-top)`
- 所有页面与覆盖层都必须使用同一套口径组合这两层值，不能出现“浏览器里靠上、真机里又额外下沉很多”或“某些页完全没吃到 safe area”的割裂。
- 无全局 header 的页面，也必须自行处理顶部 safe area，不能因为“没有 header”就把正文顶进摄像头挖孔。
- 当前阶段固定口径：全局 header、设置 header、详情页、压缩包密码页、导入指南页必须共用同一套顶部常量；浏览器里可见的基础顶边距保持不变，仅 Android 原生环境额外的 `safe area` 统一回收约 `15%`，禁止页面各自额外补偿。

### 1.4 Root 常驻与可见性的分离规则

- “常驻在 `AppRoot`”只表示该对象的**宿主权**和**状态连续性**放在 Root 层，不表示这个 DOM 必须一直可见。
- Root 层允许常驻：
  - 共享状态宿主（当前账本、AI 控制、返回栈、全局 toast）
  - 受场景策略控制的 shell chrome（例如底部导航）
  - 全屏覆盖层宿主（overlay host）
- Root 层不应长期拥有：
  - 首页 / 记账页 / 设置页各自的页面 header DOM
  - 会接管整块画布的二级页内容 DOM
- 任何“全屏覆盖层”一旦激活，视觉上必须直接接管屏幕；Root 中即便仍然保留共享状态，也不得继续让常驻 chrome 占住它的可视高度。

---

## 二、卡片家族

### 2.1 主卡（Primary Card）

用于一级页面的核心内容容器：看板卡片、展开态日卡片、设置页 Root 的 SectionCard。

```
底色:       white
描边:       border-primary border-ink（2px solid #222）
圆角:       rounded-card 至 rounded-card-lg（14-16px）
阴影:       无
内边距:     14-16px
```

### 2.2 内容卡（Content Card）

用于二级页面的主体内容区：设置子页面的 FormCard、详情页的信息区块。

```
底色:       white
描边:       border-secondary border-muted（1.5px solid #DDD）
圆角:       rounded-card-sm（12px）至 rounded-card（14px）
阴影:       无
内边距:     12-14px
```

**危险变体**：

```
底色:       bg-danger-surface（#FFF0F0）
描边:       border-secondary border-danger-border（1.5px solid #FFB8B8）
其余同上
```

### 2.3 次级卡（Minor Card）

用于次级信息展示：统计小卡、折叠态日卡片。

```
底色:       white
描边:       border-secondary border-muted（1.5px solid #DDD）
圆角:       rounded-card-xs（10px）
阴影:       无
透明度:     折叠态可降至 0.76
```

### 2.4 情景提示卡（Hint Card）

用于临时性提示信息。

```
底色:       bg-warn-surface（#FFF8F0）
描边:       border-secondary border-warn-border（1.5px solid #F0C89A）
圆角:       rounded-card-xs 至 rounded-card-sm（10-12px）
阴影:       无
```

### 全局卡片禁止项

- 禁止使用渐变背景作为卡片底色
- 禁止使用玻璃态（backdrop-blur / glassmorphism）效果
- 禁止在卡片上叠加多层半透明边框模拟深度
- 卡片不使用 box-shadow，深度感通过描边粗细和颜色区分

---

## 三、按钮家族

### 3.1 主按钮（Primary）

```
底色:       bg-ink（#222）
文字:       text-surface（#F5F0EB）
描边:       border-primary border-ink
圆角:       rounded-card-sm（12px）
```

### 3.2 次级按钮（Secondary）

```
底色:       white
文字:       text-ink（#222）
描边:       border-secondary border-muted（#DDD）
圆角:       rounded-card-sm（12px）
```

### 3.3 危险按钮（Danger）

```
底色:       bg-danger-surface（#FFF0F0）
文字:       text-coral（#FF6B6B）
描边:       border-secondary border-danger-border（#FFB8B8）
圆角:       rounded-card-sm（12px）
```

### 3.4 薄荷按钮（Mint）

用于正向操作强调。

```
底色:       bg-mint（#4ECDC4）
文字:       white
描边:       border-primary border-mint
圆角:       rounded-card-sm（12px）
```

### 3.5 幽灵按钮（Ghost）

```
底色:       transparent
文字:       text-dim（#888）
描边:       无
```

### 3.6 Pill 按钮（标签轨道专用）

```
激活态:     bg-ink / text-surface / 无描边
普通态:     bg-white / text-dim / border-secondary border-muted
警示态:     bg-danger-surface / text-uncat-text / border-secondary border-danger-border
形状:       圆角使用 rounded-pill（9999px）
```

### 3.7 设置行按钮（Setting Row）

设置页 Root 的列表行，整行可点击。

```
内边距:     14px 0
底部分割:   border-b border-divider border-faint（0.5px solid #EEE）
左侧图标:   36x36 / rounded-card-xs（10px）
```

### 3.8 来源标签（Source Badge）

用于首页日流水条目、拖拽细则面板、交易详情页等场景，表达账单来源，不承担分类或状态含义。

```
形态:       胶囊标签（capsule）
圆角:       rounded-pill（9999px）
字重:       700-800
字号:       10-11px
内边距:     纵向 1-3px / 横向 5-7px
```

固定来源映射：

```
微信:
  底色: bg-success-surface / 或现有轻量绿色表面
  文字: text-success-text / 深色正文

支付宝:
  底色: bg-info-surface / 或现有轻量蓝色表面
  文字: text-ink

随手记:
  底色: bg-warn-surface / 或现有轻量暖黄色表面
  文字: text-ink
```

规则：

- 同一来源在首页日卡、拖拽细则、交易详情页必须使用同一套文案和颜色语义
- 来源标签文案固定为：`微信` / `支付宝` / `随手记`
- 来源标签只表达“这笔钱从哪里来”，不得复用分类色或 AI 状态色

---

## 四、输入框家族

### 4.1 标准输入框

用于记账页表单、设置页编辑、详情页文本输入。

```
底色:       white
描边:       border-secondary border-muted（1.5px solid #DDD）
圆角:       rounded-card-xs（10px）至 rounded-card-sm（12px）
内边距:     10-14px
字体:       系统 UI 字体（仅限用户可编辑内容）
outline:    none
```

### 4.2 高亮编辑态

标准输入框的焦点/编辑状态变体。

```
描边:       依语境使用对应功能色（如薄荷绿表示正常编辑，珊瑚红表示危险编辑）
其余同标准输入框
```

### 4.3 金额输入

特殊用途，极简处理。

```
底色:       transparent
描边:       无
字体:       font-mono（Space Mono）
字号:       大号突出
```

### 4.4 密码格输入

特殊用途（压缩包密码），不纳入通用体系。

---

## 五、返回按钮规范

**统一规则**：所有二级页面（设置子页面、详情页、密码输入页）的返回按钮使用同一套样式。

统一基准：设置页 `SubPageHeader` 的裸 SVG 箭头 + 轻量 padding 触控区。

---

## 六、阴影使用规则

阴影只允许在以下场景中使用：

- 浮动弹层（账本选择器下拉、分类选择器弹层、确认对话框）
- 拖拽预览卡片（表达"悬浮拎起"的物理隐喻）
- 底部导航的 AI 控制弹层

普通卡片、按钮、输入框禁止使用阴影。深度感通过描边粗细区分，不通过阴影。

---

## 七、渐变使用规则

渐变只允许在以下场景中使用：

- 预算进度条（表达连续的状态变化）
- 分类概览中未分类段的斜杠条纹（`repeating-linear-gradient`，表达"缺失/待补"）
- 全局点阵背景装饰工具

卡片底色、按钮底色、输入框底色禁止使用渐变。

---

## 八、字体使用规则

全局只允许三种字体族：

| Token | 字体 | 用途范围 |
|-------|------|----------|
| font-brand | Nunito + 系统回退 | 页面根容器字体、品牌标题、区域标题 |
| font-mono | Space Mono + 等宽回退 | 金额数字、数据展示、模型名 |
| （系统 UI） | 平台默认 UI 字体栈 | 仅用户可编辑的输入内容 |

**禁止引入任何上述三种之外的字体族。**

补充规则：
- 凡是用户不能直接编辑的静态文案，包括标题、说明、提示、只读正文，必须显式落在 `font-brand`
- 凡是用户正在输入的文本内容，使用系统 UI 字体，避免输入体验和系统键盘联想割裂
- 金额输入是唯一例外，继续使用 `font-mono`

---

## 九、间距规则

间距遵循 4px 网格，允许的值为：

```
4px / 8px / 12px / 16px / 20px / 24px / 32px / 48px / 64px
```

不允许使用 5px、7px、15px 等非 4px 倍数值。现有代码中的非标准间距应在后续迭代中逐步对齐。

---

## 十、分类色板

分类色板独立于品牌核心色，是一组为分类标签和概览图表定义的扩展色彩。

分类色板的管理原则：
- 分类色的具体值在 `config.ts` 的分类定义中维护，不纳入 tailwind token
- 新增分类时，色彩必须与现有分类可区分，且符合品牌气质（明快、饱和度适中、不刺眼）
- 分类标签的文字色使用该分类色的深色变体，底色使用浅色变体
