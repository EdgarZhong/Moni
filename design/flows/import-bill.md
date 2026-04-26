# Import Bill

## 目标

支持用户导入账单，并在需要密码时以清晰方式继续完成导入。

## 当前口径

- 记账页现有导入入口不重做，继续保留“微信账单”和“支付宝账单”两个按钮。
- 两个按钮不承载复杂视觉差异，不新增导入舱、文件识别大面板或额外入口层级。
- 两个按钮的核心差异只体现在传给后端的 `expectedSource`：
  - 微信账单按钮：`expectedSource: "wechat"`
  - 支付宝账单按钮：`expectedSource: "alipay"`
- 两个按钮后续都走同一条后端链路：先 `probe`，再根据结果决定是否 `import`。
- 前端不需要提前判断文件是否为压缩包、CSV 或 Excel，文件形态识别由后端探测结果决定。

## 主路径

1. 用户点击“微信账单”或“支付宝账单”。
2. 前端打开系统文件选择器，并记录当前来源为 `wechat` 或 `alipay`。
3. 用户选择文件后，前端调用 `probeBillImportFiles(files, { expectedSource })`。
4. 如果返回 `ready`，前端直接调用 `importBillFiles(files, { expectedSource })`。
5. 如果返回 `password_required`，前端展示对应平台的压缩包密码输入。
6. 用户输入密码后，前端再次调用 `probeBillImportFiles(files, { expectedSource, password })`。
7. 密码正确且返回 `ready` 后，前端调用 `importBillFiles(files, { expectedSource, password })`。
8. 成功后刷新结果反馈。

## 密码交互

- 微信按钮触发的密码输入文案应明确为微信账单压缩包密码。
- 支付宝按钮触发的密码输入文案应明确为支付宝账单压缩包密码。
- `passwordState: "missing"`：提示用户输入对应平台账单压缩包密码。
- `passwordState: "invalid"`：提示对应平台账单密码不正确，请重新输入。
- 不需要密码的 CSV / Excel / 明文账单不展示密码输入。
- 密码输入是条件状态，不是导入入口的一部分；入口仍保持两个按钮。

## 状态反馈

- 探测中：导入卡片底部提示条改为“正在识别 / 正在解析”，默认导入指南提示让位。
- 导入中：导入卡片底部提示条改为“正在导入所选平台账单”。
- 成功：导入卡片底部提示条展示导入条数，可附带来源平台；成功提示出现时默认导入指南提示让位。
- 不支持：展示后端返回的 `message`，避免前端自行猜测失败原因。

## 约束

- UI/UX 对接需要基于主仓库当前 `probe -> import` 后端能力。
- 不改变现有记账页导入入口的视觉结构。
- 不把微信 / 支付宝拆成两套前端解析逻辑。
- 如果文件识别结果或密码交互需要重新定义，必须先回到 brief。
