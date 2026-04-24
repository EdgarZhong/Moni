# Prototype Gallery

## 目标

为局部原型提供稳定、轻量、可审查的开发态展示机制。

## 规则

- 原型统一存放在 `design/prototypes/{feature}/`。
- 每个原型目录必须包含 `README.md` 与至少一个 React + TypeScript 原型文件。
- 原型必须可通过 `__design` 入口预览。
- 原型只覆盖本次改动区域，不重建全 App。
- 原型必须使用 mock 数据，不接真实业务逻辑。

## 审查要求

- 审查时应给出直达链接。
- 同一 feature 下可保留多个 variant 方案。
- 拍板后把稳定结论回写到 `brand / components / flows / standards / decisions`。
