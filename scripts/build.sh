#!/bin/bash
# Build @dsh-local/palis-theme-panel.
# host: tsc（checkout 的 node_modules/.bin/tsc）；client: tsdown（checkout 的 .bin）。
# 依赖 junction：cordis/schemastery/cosmokit 来自 checkout vendor/；
# @deepseek-ai/dsh-settings 来自 DSH 桌面版 runtime node_modules（运行期唯一真实来源）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# DSH_CHECKOUT 探测：环境变量 → 常见路径（home 下 dsh-harness）
CHECKOUT="${DSH_CHECKOUT:-}"
if [ -z "$CHECKOUT" ]; then
  for candidate in "$HOME/dsh-harness" "$HOME/dsh" "$HOME/.dsh/dsh-harness"; do
    if [ -d "$candidate/vendor/cordis" ]; then CHECKOUT="$candidate"; break; fi
  done
fi
if [ -z "$CHECKOUT" ] || [ ! -d "$CHECKOUT/vendor/cordis" ]; then
  echo "build: cannot locate the dsh checkout (set DSH_CHECKOUT)" >&2
  exit 1
fi

# DSH 桌面版 runtime node_modules（dsh-settings 唯一来源）
RUNTIME_NM="${LOCALAPPDATA}/DeepSeek Harness Desktop/runtime/node_modules"
if [ ! -d "$RUNTIME_NM/@deepseek-ai/dsh-settings" ]; then
  echo "build: dsh-settings not found under $RUNTIME_NM" >&2
  exit 1
fi

link_abs() {
  local name="$1"
  local target="$2"
  node -e "
    const fs = require('fs');
    const path = require('path');
    const link = path.resolve(process.argv[1]);
    const target = path.resolve(process.argv[2]);
    fs.rmSync(link, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  " "node_modules/$name" "$target"
}

echo "=== Linking build/runtime dependencies (checkout: $CHECKOUT) ==="
mkdir -p node_modules/@deepseek-ai node_modules/.bin
link_abs cordis "$CHECKOUT/vendor/cordis"
link_abs cosmokit "$CHECKOUT/vendor/cosmokit"
link_abs schemastery "$CHECKOUT/vendor/schemastery"
link_abs @deepseek-ai/dsh-settings "$RUNTIME_NM/@deepseek-ai/dsh-settings"

# tsdown：完整安装在 dsh-super-injector 的 node_modules（checkout 的 dist 不完整）
TSDOWN_HOME="$HOME/.dsh/plugins/dsh-super-injector/node_modules"
if [ ! -d "$TSDOWN_HOME/tsdown" ]; then
  echo "build: tsdown not found under $TSDOWN_HOME" >&2
  exit 1
fi
link_abs tsdown "$TSDOWN_HOME/tsdown"
link_abs .bin/tsdown "$TSDOWN_HOME/.bin/tsdown"
link_abs .bin/tsdown.cmd "$TSDOWN_HOME/.bin/tsdown.cmd"
link_abs .bin/tsdown.ps1 "$TSDOWN_HOME/.bin/tsdown.ps1"

echo "=== Compiling host src → lib (tsc) ==="
"$CHECKOUT/node_modules/.bin/tsc" -p tsconfig.json

echo "=== Bundling client (tsdown) ==="
"$TSDOWN_HOME/.bin/tsdown"

echo "=== Build complete ==="
