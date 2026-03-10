# Phase 1: Scaffold - Research

**Researched:** 2026-03-10
**Phase:** 01-scaffold
**Status:** Complete

## Research Summary

Phase 1 establishes the project foundation. All critical decisions are well-documented in existing project research (`.planning/research/`). This phase-specific research focuses on implementation details for the four deliverables: Next.js scaffold, Web Worker boundary, WASM toolchain proof-of-concept, and Three.js dispose utilities.

## 1. Next.js 16 Scaffold with TypeScript Strict Mode

### Setup Command
```bash
pnpm create next-app@latest . --typescript --tailwind --app --turbopack --eslint
```

### Key Configuration
- **TypeScript strict**: `"strict": true` in `tsconfig.json` (Next.js scaffolds this by default)
- **Tailwind CSS v4**: Uses `@import "tailwindcss"` in CSS — no `tailwind.config.js` needed
- **ESLint**: Next.js 16 ships with ESLint config; extend with custom rules for engine isolation
- **Node.js**: Requires 20.9+ (Next.js 16 requirement)

### Engine Isolation Lint Rule
Use ESLint `no-restricted-imports` in `src/engine/`:
```json
{
  "overrides": [{
    "files": ["src/engine/**/*.ts"],
    "rules": {
      "no-restricted-imports": ["error", {
        "patterns": ["react", "react-dom", "next", "next/*", "three", "@react-three/*", "zustand"]
      }]
    }
  }]
}
```

### Folder Structure
```
src/
  app/              # Next.js App Router
  engine/           # Pure TS engine (zero UI imports)
    core/           # SimulationEngine, GridState, types
    cell/           # CellPropertySystem
    rule/           # RuleRunner, builtin rules
    preset/         # PresetLoader, schema
    worker/         # Web Worker entry point
  renderer/         # Three.js rendering
  store/            # Zustand stores
  commands/         # CommandRegistry
  components/       # React UI components
    hud/
    terminal/
    viewport/
    panels/
  ai/               # AI assistant
  lib/              # Shared utilities
crates/
  lattice-engine/   # Rust WASM crate
```

## 2. Web Worker Architecture

### Worker File Pattern for Next.js
Next.js with Turbopack supports `new Worker(new URL('./worker.ts', import.meta.url))` syntax for bundling workers.

```typescript
// src/engine/worker/simulation.worker.ts
const ctx = self as unknown as DedicatedWorkerGlobalScope;

interface WorkerMessage {
  type: 'init' | 'tick' | 'command';
  payload?: unknown;
}

interface WorkerResponse {
  type: 'initialized' | 'tick-result' | 'error';
  payload?: unknown;
}

let tickCount = 0;

ctx.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;
  switch (type) {
    case 'init':
      tickCount = 0;
      ctx.postMessage({ type: 'initialized', payload: { tickCount } } satisfies WorkerResponse);
      break;
    case 'tick':
      tickCount++;
      // Minimal proof: increment counter, post back
      ctx.postMessage({ type: 'tick-result', payload: { tickCount } } satisfies WorkerResponse);
      break;
  }
});
```

### Main Thread Consumer
```typescript
// src/engine/worker/createSimulationWorker.ts
export function createSimulationWorker(): Worker {
  return new Worker(new URL('./simulation.worker.ts', import.meta.url));
}
```

### Key Decisions
- **postMessage** (not Comlink) for Phase 1 — minimal abstraction, full control
- **Transferable** ArrayBuffers for data (not SharedArrayBuffer — deferred to Phase 7)
- Worker file uses `.ts` extension and gets bundled by Turbopack/webpack
- Type-safe message protocol with discriminated union types

### Testing Workers in Vitest
Vitest does not natively support Web Workers. For unit tests:
- Test the message handler logic as a pure function (extract handler from worker context)
- Use `vitest-webworker` or mock the Worker API for integration-like tests
- The actual Worker instantiation is verified manually in the browser (success criterion #2)

## 3. WASM Toolchain (wasm-bindgen-cli)

### Pipeline (NOT wasm-pack)
```bash
# 1. Build Rust to WASM target
cargo build --target wasm32-unknown-unknown --release -p lattice-engine

# 2. Generate JS bindings with wasm-bindgen
wasm-bindgen target/wasm32-unknown-unknown/release/lattice_engine.wasm \
  --out-dir src/wasm/pkg \
  --target web \
  --omit-default-module-path

# 3. Optimize WASM binary
wasm-opt -O3 src/wasm/pkg/lattice_engine_bg.wasm -o src/wasm/pkg/lattice_engine_bg.wasm
```

### Rust Crate Setup
```toml
# crates/lattice-engine/Cargo.toml
[package]
name = "lattice-engine"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"

[profile.release]
opt-level = 3
lto = true
```

### Proof-of-Concept Rust Function
```rust
// crates/lattice-engine/src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn hello(n: u32) -> u32 {
    n * 2
}
```

### Next.js WASM Loading
For Turbopack (default in Next.js 16), WASM async loading is not yet natively supported. Use webpack fallback:

```typescript
// next.config.ts
const nextConfig = {
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    config.output.webassemblyModuleFilename = 'static/wasm/[modulehash].wasm';
    return config;
  },
};
```

**Alternative approach (recommended for Phase 1):** Load WASM manually via `fetch` + `WebAssembly.instantiate`:
```typescript
export async function loadWasm() {
  const wasmModule = await import('../wasm/pkg/lattice_engine');
  await wasmModule.default(); // init
  return wasmModule;
}
```

### Installing wasm-bindgen-cli
```bash
cargo install wasm-bindgen-cli
# Or via mise for project-level pinning:
# mise use cargo:wasm-bindgen-cli@0.2.100
```

### wasm-opt Installation
```bash
# Install via cargo
cargo install wasm-opt
# Or via npm (alternative)
# pnpm add -D wasm-opt
```

## 4. Three.js GPU Dispose Utilities

### disposeObject Utility
```typescript
// src/lib/three-dispose.ts
import * as THREE from 'three';

export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(disposeMaterial);
        } else {
          disposeMaterial(child.material);
        }
      }
    }
  });
}

function disposeMaterial(material: THREE.Material): void {
  material.dispose();
  // Dispose textures
  for (const key of Object.keys(material)) {
    const value = (material as Record<string, unknown>)[key];
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
}

export function disposeRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.dispose();
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_lose_context');
  if (ext) ext.loseContext();
}
```

### Testing Strategy
Three.js `WebGLRenderer` requires a WebGL context. Options for unit testing:
1. **Use `jsdom` + mock WebGL context** — limited fidelity but works in CI
2. **Use a headless WebGL implementation** like `gl` npm package
3. **Test the dispose logic via `renderer.info.memory`** — requires a real renderer

For Phase 1, test the dispose traversal logic with mock objects and verify the dispose methods are called. A real WebGL test can be done in the browser (success criterion #4).

## 5. Zustand Store Stubs

```typescript
// src/store/simStore.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface SimState {
  generation: number;
  isRunning: boolean;
  activePreset: string | null;
}

export const useSimStore = create<SimState>()(
  subscribeWithSelector((set) => ({
    generation: 0,
    isRunning: false,
    activePreset: null,
  }))
);
```

Repeat pattern for `viewStore`, `uiStore`, `aiStore` with appropriate initial state shapes.

## 6. CI Pipeline

### GitHub Actions Workflow
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm tsc --noEmit

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm vitest run --dir src --dir engine

  wasm-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - run: cargo install wasm-bindgen-cli
      - run: cargo build --target wasm32-unknown-unknown --release -p lattice-engine
      - run: wasm-bindgen target/wasm32-unknown-unknown/release/lattice_engine.wasm --out-dir src/wasm/pkg --target web
```

## Validation Architecture

### Test Points for Phase 1
1. **Worker message handling**: Extract handler as pure function, test with mock event
2. **WASM function**: Build WASM, import in test, call `hello(5)` === `10`
3. **Dispose utility**: Create mock Object3D tree, call disposeObject, verify dispose called on all resources
4. **Engine isolation**: Run ESLint on `src/engine/` — zero restricted import violations
5. **TypeScript strict**: `pnpm tsc --noEmit` exits 0

### What Cannot Be Unit Tested (Manual Verification)
- Worker running in browser DevTools worker panel
- WASM callable from browser (not just Node.js)
- `renderer.info.memory.geometries === 0` after disposal (requires real WebGL context)
- `pnpm dev` starts successfully

---

## RESEARCH COMPLETE

*Phase: 01-scaffold*
*Researched: 2026-03-10*
