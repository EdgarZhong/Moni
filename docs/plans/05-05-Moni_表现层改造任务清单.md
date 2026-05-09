# 表现层改造任务清单

本清单基于当前代码库审计结果，列出需要修正的表现层问题。改造原则：**只修有问题的，不大刀阔斧重构已经被接受的页面。**

> 改造完成后，`tailwind.config.js`、`docs/design/SURFACE_SYSTEM.md`、`docs/design/Moni_Brand_Identity.md` 将作为表现层的正式规格基准。

---

## 优先级 P0：阻塞性问题

### T1：以 `tailwind.config.js` 作为唯一 Token 注册表

当前仓库已落入新版 `tailwind.config.js`。后续所有表现层改造统一以它为唯一 token 注册表；若代码或文档仍引用旧命名或旧设计系统口径，必须继续清理。这是所有后续任务的前提。

- 删除所有 PixelBill 遗留（`pixel-green`、`font-pixel: Press Start 2P`、`alipay-blue`、`expense-red`、`income-yellow`）
- 删除 `darkMode: 'class'`（Moni 当前不支持暗色模式）
- 新配置注册了 Moni 的 semantic token：品牌色、功能色、中性色、状态色、字体、圆角、描边粗细、间距
- 注意：替换 config 后现有三页不会立刻崩溃，因为它们主要用内联样式而非 Tailwind class。但后续新代码应优先使用 token

### T2：更新 src/ui/styles/index.css 中的 CSS variables

将 CSS variable 默认值对齐到新 token：

```css
:root {
  --bg-primary: #F5F0EB;
  --bg-card: #FFFFFF;
  --text-primary: #222222;
  --text-secondary: #888888;
}
```

删除 `html.light` 备用值（当前不使用）。删除所有 PixelBill 相关的变量和注释。

---

## 优先级 P1：详情页视觉对齐

### T3：详情页字体清理

`TransactionDetailPage.tsx` 中引入了系统中不存在的字体，必须清除：

- 删除所有 `IBM Plex Mono` 引用，替换为 `'Space Mono', monospace`
- 删除所有 `Avenir Next` / `PingFang` / `Noto Sans` 的显式指定，替换为 `inherit`（继承根容器的 Nunito）
- `components.tsx` 中拖拽细则面板金额如果已使用 Nunito，改为 `'Space Mono', monospace`（金额统一用等宽字体）

### T4：详情页卡片语法对齐

详情页属于二级页面，应跟随内容卡语法（参照设置子页面）。需要调整：

- 将主卡和分区卡的描边统一为 `1.5px solid #DDD`，圆角 `12-14px`，白底，无阴影
- 移除所有玻璃感渐变背景（`backdrop-blur`、半透明叠层）
- 移除所有密集 chip 装饰
- 对齐后，详情页的卡片应该和设置子页面（如 AI 配置页、标签管理页）视觉上属于同一家族

### T5：详情页返回按钮对齐

详情页的返回按钮应与设置子页面的 `SubPageHeader` 保持一致：裸 SVG 箭头 + 轻量 padding 触控区。不使用圆形白底字形箭头。

---

## 优先级 P2：一致性微调（可随后续迭代逐步完成）

### T6：记账页密码输入页返回按钮对齐

`MoniEntry.tsx` 中密码页的返回按钮（36x36 / 圆角 / 白底 / 描边）应对齐到设置页 `SubPageHeader` 的裸箭头样式。

### T7：BottomNav 收口

当前首页、记账页、设置页各自维护了一份近似的底部导航实现。虽然视觉壳基本一致，但代码是复制粘贴的。

- 建议：将三份实现统一为共享组件，首页版本额外承载 AI 控制功能
- 此任务不紧急，可在后续重构中完成

### T8：间距标准化

现有代码中存在 5px、7px、15px 等非 4px 网格的间距值。应在后续修改相关组件时顺手对齐到最近的 4px 倍数值（4→4、5→4、7→8、15→16）。不需要一次性全部替换。

### T9：内联样式到 Tailwind token 的渐进迁移

现有三个页面大量使用内联样式硬编码色值和尺寸。随着后续功能迭代，在修改到某个组件时，顺手将其内联样式迁移到 Tailwind token 引用。不做一次性全量迁移。

---

## 改造顺序

```
T1（替换 config）→ T2（更新 CSS variables）
  → T3 + T4 + T5（详情页三项，可在一次 PR 中完成）
  → T6 ~ T9（随后续迭代逐步完成）
```

## 改造验收标准

- T1/T2：替换后现有三页运行正常，无视觉回归
- T3/T4/T5：详情页视觉语言与设置子页面属于同一家族；无非标准字体；无渐变/玻璃效果；返回按钮与设置子页面一致
- T6~T9：逐项验收，不要求一次性完成
