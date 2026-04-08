# `.codex` 初始化说明

## 目的

该目录为 Moni 主仓库的本地协作脚手架，目标是让新 worktree 在进入开发前完成一致化初始化，避免依赖未提交的本地状态。

## 当前策略

- worktree 统一放在 `/home/edgar/code/moni-worktree`
- Node 基线沿用 CI：22.x
- 包管理器沿用现状：`npm`
- 默认初始化脚本：`./.codex/scripts/worktree-init.sh`
- 默认最小检查：`npm run typecheck`
- 完整检查：`npm run verify`

## 为什么暂不切到 pnpm

当前仓库已有 `package-lock.json`，GitHub Actions 也固定使用 `npm ci`。为了避免在并行开发阶段同时引入包管理器迁移成本，本轮不切换到 `pnpm`。

如需后续评估 `pnpm` 以降低多 worktree 依赖复制开销，必须满足：

- 补齐 `pnpm-lock.yaml`
- 同步更新 CI
- 评估 Capacitor / Vite / ESLint 链路在新包管理器下的稳定性

## 建议使用方式

在新建 worktree 后执行：

```bash
./.codex/scripts/worktree-init.sh
```

如需在本机完整跑验收链路：

```bash
MONI_CODEX_RUN_FULL_VERIFY=1 ./.codex/scripts/worktree-init.sh
```

## 说明

- 受限沙箱内 `npm run build` 可能触发 `esbuild spawn EPERM`
- 因此初始化脚本默认先做最小检查，再由主协调或对应 agent 视环境决定是否跑完整 `verify`
