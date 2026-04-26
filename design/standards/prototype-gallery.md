# Prototype Gallery

## 目标

为局部原型提供稳定、轻量、可审查的开发态展示机制。

## 规则

- 原型统一存放在 `design/prototypes/{feature}/`。
- 每个原型目录必须包含 `README.md` 与至少一个 React + TypeScript 原型文件。
- 原型必须可通过独立 URL 预览，格式为 `/__design/{feature}`。
- `__design` 根路径只允许做索引，不允许把多个 prototype 内容直接串联渲染。
- 审查链接必须直达本次 prototype，不允许让用户先看到无关 prototype。
- 原型只覆盖本次改动区域，不重建全 App。
- 原型必须使用 mock 数据，不接真实业务逻辑。
- 面向用户与设计评审的 prototype UI 只能展示用户可见文案，不得把设计决策原因、实现解释、评审说明写进界面正文。
- 每个 prototype 必须明确声明自己属于 `mirror` 或 `sandbox`。
- `mirror`：直接原样引用正式页面或正式组件，禁止为了 prototype 改正式代码。
- `sandbox`：完全在 `design/prototypes/` 内独立实现，不要求复用正式页面，但必须显式标注自己不是正式现状镜像。
- 两种模式的 mock 壳层都必须只在开发态动态加载，不得进入普通应用运行路径。

## 模式边界

- `mirror` 适合：小功能点、微调、局部状态验证、真实页面布局压力验证。
- `mirror` 不适合：新页面、大改版、多视觉方向探索、重写型交互探索。
- `sandbox` 适合：新页面、大重构、信息架构调整、视觉方向探索、强动效探索。
- `sandbox` 不适合：替代真实页面来判断当前正式实现里的局部挤压、真实状态承载或现有交互细节。
- 若方向先用 `sandbox` 收口，落地前仍需用 `mirror` 或正式实现验证回到真实页面后的表现。

## 审查要求

- 审查时应给出直达链接。
- 同一 feature 下可保留多个 variant 方案。
- 拍板后把稳定结论回写到 `brand / components / flows / standards / decisions`。
