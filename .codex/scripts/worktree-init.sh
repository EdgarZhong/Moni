#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[moni-codex] root: $ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[moni-codex] missing node" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[moni-codex] missing npm" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "[moni-codex] warning: expected Node 22+, current=$(node -v)" >&2
fi

if [ ! -d node_modules ]; then
  echo "[moni-codex] installing dependencies with npm ci"
  npm ci --no-audit --no-fund
else
  echo "[moni-codex] node_modules exists, skipping npm ci"
fi

echo "[moni-codex] running minimal check: npm run typecheck"
npm run typecheck

if [ "${MONI_CODEX_RUN_FULL_VERIFY:-0}" = "1" ]; then
  echo "[moni-codex] running full verify: npm run verify"
  npm run verify
else
  echo "[moni-codex] full verify skipped"
  echo "[moni-codex] set MONI_CODEX_RUN_FULL_VERIFY=1 to run npm run verify"
fi
