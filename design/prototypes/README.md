# Prototypes

本目录存放局部可视化原型代码。

- 一个 feature 一个子目录。
- 原型统一使用 React + TypeScript。
- 原型只服务设计审查，不代表最终实现。
- 原型必须能通过开发态独立路径 `/__design/{feature}` 预览。
- `__design` 根路径只做索引，不直接混排多个原型。
- 每个 prototype 必须在 README 中写清自己是 `mirror` 还是 `sandbox`。
- `mirror` 直接原样引用正式页面或正式组件，用来做高保真局部探索。
- `sandbox` 完全独立实现，用来做新页面或大改版探索。
