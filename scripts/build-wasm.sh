#!/usr/bin/env bash
set -euo pipefail

# WASM Build Pipeline for Lattice
# Uses wasm-bindgen-cli directly (NOT wasm-pack — archived Sept 2025)

CRATE_NAME="lattice-engine"
OUT_DIR="src/wasm/pkg"
PROFILE="${1:-release}"

echo "==> Building ${CRATE_NAME} for wasm32-unknown-unknown (${PROFILE})..."

# Ensure target is installed
rustup target add wasm32-unknown-unknown 2>/dev/null || true

# Step 1: Build with cargo
if [ "$PROFILE" = "release" ]; then
  cargo build --target wasm32-unknown-unknown --release -p "${CRATE_NAME}"
  WASM_PATH="target/wasm32-unknown-unknown/release/${CRATE_NAME//-/_}.wasm"
else
  cargo build --target wasm32-unknown-unknown -p "${CRATE_NAME}"
  WASM_PATH="target/wasm32-unknown-unknown/debug/${CRATE_NAME//-/_}.wasm"
fi

# Step 2: Generate JS bindings with wasm-bindgen
echo "==> Running wasm-bindgen..."
mkdir -p "${OUT_DIR}"
wasm-bindgen "${WASM_PATH}" \
  --out-dir "${OUT_DIR}" \
  --target web \
  --omit-default-module-path

# Step 3: Optimize WASM binary (release only)
if [ "$PROFILE" = "release" ] && command -v wasm-opt &>/dev/null; then
  echo "==> Running wasm-opt..."
  wasm-opt -O3 "${OUT_DIR}/${CRATE_NAME//-/_}_bg.wasm" \
    -o "${OUT_DIR}/${CRATE_NAME//-/_}_bg.wasm"
fi

echo "==> WASM build complete: ${OUT_DIR}"
ls -la "${OUT_DIR}"
