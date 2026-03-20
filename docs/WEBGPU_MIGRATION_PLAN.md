# Lattice WebGPU Migration Plan — Performance Architecture

> **North Star**: Lattice must run simulations at video-game-engine speeds. Conway's Game of Life at 1024×512 at 60fps. Navier-Stokes at 512×512 real-time. The entire tick pipeline — rule execution, expression evaluation, visual mapping, rendering — happens on the GPU. The CPU orchestrates; the GPU computes and draws. WebGPU is the first-class citizen.

---

## Context

Lattice is a universal simulation substrate web app (cellular automata, reaction-diffusion, fluid dynamics, etc.). The current architecture uses three CPU-based execution paths (TypeScript per-cell loops, Pyodide/Python via Web Worker, Rust WASM) and renders via Three.js InstancedMesh with per-cell `setColorAt()` calls.

### Current Performance (baseline to beat)

| Simulation | Grid Size | Current FPS | Bottleneck |
|---|---|---|---|
| Conway's GoL (TS path) | 512×512 | ~5 fps | 2.3M object allocs/tick (perceiveCell) |
| Conway's GoL (TS path) | 1024×512 | ~1 fps | Same, 2× worse |
| Conway's GoL (Python) | 512×512 | ~3 fps | Pyodide marshalling + interpreter |
| Gray-Scott (WASM) | 512×512 | ~5-6 fps | Laplacian double-nested loop |
| Rendering (any) | 512×512 | CPU-bound | setColorAt() × 262K per frame |

### Why It's Slow (root causes, in order of severity)

1. **Simulation is CPU-bound in every path.** TS path allocates ~2.3M JS objects/tick. Python path adds marshalling overhead. WASM only covers 2 hardcoded algorithms.
2. **Rendering is CPU-bound despite using GPU.** `setColorAt()` loop across 262K+ instances is CPU work — the GPU just draws what CPU prepared.
3. **CPU↔GPU boundary crossed every frame.** Grid state in Float32Arrays on CPU. Renderer reads, transforms, uploads per-instance color data.
4. **No shared pipeline between sim and render.** Renderer traverses every cell to build instance colors even when nothing changed.

---

## Architecture Decisions

### Decision 1: Pure GPU Pipeline

Grid state lives permanently in GPU storage buffers. Rule execution is `dispatchWorkgroups()`. Rendering reads directly from those buffers via a fullscreen quad — zero CPU readback. The CPU never touches cell data during steady-state simulation.

**What gets removed:**
- `RuleRunner.ts` — per-cell TS perceive-update loop
- `PythonRuleRunner.ts` — Pyodide async rule execution  
- `WasmRuleRunner.ts` — hardcoded Rust WASM functions
- `PyodideBridge.ts` + `pyodide.worker.ts` — Pyodide Web Worker
- `expressionHarness.ts` + `scriptHarness.ts` + `pythonHarness.ts` — Python codegen harnesses
- `gridTransfer.ts` — CPU buffer extract/apply
- `InstancedMesh` rendering path — per-cell setColorAt loop
- All Pyodide CDN dependency (~16MB download)

**What survives (unchanged or with minor adaptation):**
- `EventBus.ts`, `CommandRegistry.ts`, all Zustand stores, all React UI
- `Grid.ts` concept (but buffers move to GPU storage buffers)
- `NodeCompiler.ts` (retargeted: emits IR instead of Python)
- `ExpressionTagRegistry.ts` (orchestration layer — execution moves to GPU)
- `Simulation.ts` facade (tick orchestration, generation counting)
- `PresetConfig` / YAML format (unchanged — rule type becomes `webgpu`)
- `SimulationController.ts` (playback, compute-ahead — but frame cache uses GPU buffers)
- Three.js for camera management, scene graph, HUD, input handling
- All panel UI, node editor, terminal, layout system

### Decision 2: Typed IR as the Compilation Hub

A typed expression tree (Intermediate Representation) sits between all authoring surfaces and GPU execution. The IR is a TypeScript discriminated union — not a heavyweight compiler framework.

```
Node Editor → NodeCompiler → IR (typed expression tree)
Python Script → PythonParser → IR (same type)
                                    ↓
                              WGSL Codegen → GPU compute shader
                              Python Codegen → "Show Code" preview
                              (future: GLSL Codegen → WebGL2 fallback)
```

```typescript
// Core IR types (src/engine/ir/types.ts)
type IRNode =
  | { kind: 'literal'; value: number; type: 'f32' | 'u32' | 'bool' }
  | { kind: 'read'; property: string; scope: 'cell' | 'env' | 'global' }
  | { kind: 'write'; property: string; scope: 'cell'; value: IRNode }
  | { kind: 'binop'; op: '+' | '-' | '*' | '/' | '%'; left: IRNode; right: IRNode }
  | { kind: 'compare'; op: '>' | '<' | '==' | '!=' | '>=' | '<='; left: IRNode; right: IRNode }
  | { kind: 'select'; condition: IRNode; ifTrue: IRNode; ifFalse: IRNode }
  | { kind: 'call'; fn: 'sqrt' | 'sin' | 'cos' | 'abs' | 'floor' | 'ceil' | 'clamp' | 'smoothstep' | 'min' | 'max'; args: IRNode[] }
  | { kind: 'neighbor_sum'; property: string }
  | { kind: 'neighbor_count'; property: string; op: '>' | '<' | '==' | '!='; threshold: number }
  | { kind: 'var'; name: string; type: 'f32' | 'u32' | 'bool' }
  | { kind: 'cast'; target: 'f32' | 'u32' | 'bool'; value: IRNode }

interface IRStatement =
  | { kind: 'assign'; target: string; value: IRNode }
  | { kind: 'write_property'; property: string; scope: 'cell'; value: IRNode }
  | { kind: 'declare'; name: string; type: 'f32' | 'u32' | 'bool'; value: IRNode }

interface IRProgram {
  statements: IRStatement[];
  inputs: { property: string; scope: 'cell' | 'env' | 'global'; type: 'f32' | 'u32' | 'bool' }[];
  outputs: { property: string; scope: 'cell'; type: 'f32' | 'u32' | 'bool' }[];
  neighborhoodAccess: boolean;  // true if any node reads neighbors
}
```

### Decision 3: Python Stays as Authoring Language (via transpilation)

Users write Python in the script editor. A transpiler parses it into the same IR that nodes produce. Constraint: a well-defined transpilable subset covering scalar math, neighbor reads, conditionals, property writes.

**Supported Python subset:**
- Arithmetic: `+`, `-`, `*`, `/`, `%`, `**`
- Comparison: `>`, `<`, `==`, `!=`, `>=`, `<=`
- Logic: `and`, `or`, `not`
- Conditionals: `if`/`elif`/`else` (expression and statement forms)
- Assignment: `alive = ...`, `self.colorR = ...`
- Built-ins: `abs()`, `sqrt()`, `sin()`, `cos()`, `floor()`, `ceil()`, `clamp()`, `min()`, `max()`, `smoothstep()`, `rangeMap()`
- Property access: `cell['alive']`, `neighbors_alive`, `env.feedRate`, `glob.myVar`
- Numeric literals, boolean literals

**Not supported (clear error message explaining what's available):**
- Imports, classes, generators, list comprehensions, string operations, dynamic typing
- Any I/O or side effects

### Decision 4: GPU-Native Rendering

Replace `InstancedMesh` + `setColorAt()` loop with a fullscreen quad sampling directly from the simulation storage buffer. The GPU already has the data.

Three.js stays for: camera management, scene graph (HUD, grid lines, lights), input handling. Cell rendering is a custom `ShaderMaterial` on a fullscreen quad or a raw WebGPU render pass.

---

## Implementation Phases

### Phase 0: Performance Baseline & Analytics

**Goal**: Quantitative benchmarks before any migration. Every subsequent change must be measurable.

**Deliverables:**
1. Supabase project + `perf_benchmarks` table
2. Benchmark harness (`src/lib/benchmarkRunner.ts`) that runs standardized tests
3. Initial baseline data recorded

**Table schema:**
```sql
CREATE TABLE perf_benchmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  git_commit TEXT NOT NULL,
  architecture_tag TEXT NOT NULL,  -- 'baseline-cpu', 'phase-1-gpu-infra', etc.
  browser TEXT NOT NULL,
  gpu TEXT,
  test_name TEXT NOT NULL,
  grid_width INT NOT NULL,
  grid_height INT NOT NULL,
  metric_name TEXT NOT NULL,      -- 'tick_ms', 'fps', 'heap_mb', 'transfer_ms'
  metric_value FLOAT NOT NULL,
  metadata JSONB                  -- extra context (num_properties, rule_type, etc.)
);
```

**Benchmark suite:**
- Conway's GoL (TS path): 128², 256², 512², 1024²
- Conway's GoL (Python/Pyodide path): 128², 256², 512²
- Gray-Scott (WASM path): 256², 512²
- Expression tag overhead: post-rule Python expressions on 512²
- Render-only: sim paused, measure pure render update cost at 512², 1024²
- Metrics per test: tick time (ms), FPS, JS heap (MB), per-phase breakdown

**Each record includes**: git commit hash, browser UA, GPU name, timestamp, architecture tag.

**Phase 0 Status: COMPLETE** (commit `c40afd7`)
- Supabase project: `lattice` (`jcrmmezzyybuhcdnqcew`, us-east-1)
- `perf_benchmarks` table live with open RLS
- Benchmark harness: async with periodic yields, live terminal progress bar via EventBus
- CLI commands: `bench.run [test]`, `bench.results`
- `next.config.ts` injects `NEXT_PUBLIC_GIT_COMMIT` at build time
- Architecture tag: `baseline-cpu` for all pre-WebGPU measurements

### Phase 1: GPU Infrastructure

**Goal**: WebGPU device acquisition, buffer management, basic compute shader dispatch. Prove the GPU pipeline works before migrating any simulation logic.

**New files:**
```
src/engine/gpu/
├── GPUContext.ts         — device/adapter acquisition, capability detection, error handling
├── BufferManager.ts      — GPU storage buffer allocation, double-buffering, property layout
├── ShaderCompiler.ts     — WGSL string → GPUShaderModule, caching, error reporting  
├── ComputeDispatcher.ts  — pipeline creation, bind group management, dispatchWorkgroups()
└── types.ts              — GPUBufferLayout, GPUPropertyDescriptor, etc.
```

**Key design:**
- `GPUContext` is a singleton, initialized once, provides `device`, `queue`
- `BufferManager` owns all grid storage buffers on GPU. Exposes `getReadBuffer(prop)` / `getWriteBuffer(prop)` for ping-pong
- Double-buffering on GPU: two storage buffers per property, swap is a bind group switch (not a copy)
- `ShaderCompiler` caches compiled modules by WGSL hash

**Validation**: Dispatch a trivial compute shader (fill buffer with 1.0, read back, verify). Confirm on Chrome + Safari + Firefox.

**Phase 1 Status: COMPLETE** (commit `a94c491`)

Implementation notes:
- `BufferManager` uses interleaved layout (all props for cell 0, then cell 1, etc.) for GPU cache coherence, rather than separate buffers per property
- `ShaderCompiler` uses FNV-1a content hash for cache keys — fast, sufficient for ~dozens of shaders
- `ComputeDispatcher` supports both single-pass (`dispatchAndSubmit`) and multi-pass batching (`beginCommandEncoder` → `dispatch` × N → `submit`) for the tick pipeline
- `GPUContext` requests `powerPreference: 'high-performance'` and negotiates max available `maxStorageBufferBindingSize`
- Non-blocking GPU init at app startup in `AppShell.tsx` — CPU paths still work if WebGPU unavailable
- `gpu_compatibility` Supabase table tracks adapter fingerprints, device limits, and test results per browser/GPU

**First gpu.test result** (2026-03-18, Firefox 148, macOS):

| Metric | Value | Notes |
|--------|-------|-------|
| Test | PASSED | 4096/4096 cells = 1.0 |
| Init | 0.9ms | GPU context already warm from AppShell startup |
| Compile | 0.2ms | Trivial fill shader |
| Dispatch | 28.1ms | Dominated by submission fence overhead, not compute |
| Readback | 105.5ms | `mapAsync` + staging buffer copy — confirms readback is the expensive path |
| Total | 134.6ms | |
| Max storage buffer | 1024 MB | |
| Max grid (4ch) | 8192×8192 | 67M cells |
| Max grid (8ch) | 5792×5792 | 33M cells |
| Max grid (16ch) | 4096×4096 | 16M cells |
| Adapter info | null | Firefox 148 does not expose GPUAdapterInfo fields |

**Key takeaways:**
- **Readback cost varies wildly by browser** — Firefox 105ms, Safari 3ms, Chrome 1.6ms for the same 16KB buffer. Firefox's `mapAsync` path is ~70× slower. GPU-native rendering (Phase 4) must eliminate readback from the hot loop regardless.
- **Dispatch overhead** (22-48ms) is submission fence + GPU scheduling, not compute time. Real workloads on large grids will amortize this.
- **Chrome gives the most storage** (4GB) followed by Safari (2GB) then Firefox (1GB). All far exceed our needs.
- **Adapter info varies** — Chrome reports "metal-3" architecture, Safari just says "apple" for everything, Firefox reports nothing.
- **iOS Safari does NOT support WebGPU** even with the feature flag enabled. The flag exists in settings but `navigator.gpu` is not exposed at runtime. Desktop Safari 26+ only.

#### GPU Compatibility Matrix (as of 2026-03-18)

| Browser | OS | Adapter | Pass | Init | Compile | Dispatch | Readback | Total | Max Buffer | Max Grid (8ch) |
|---------|-----|---------|------|------|---------|----------|----------|-------|------------|----------------|
| Chrome 146 | macOS | apple metal-3 | PASS | 0.6ms | 0.5ms | 22.8ms | 1.6ms | 25.6ms | 4096 MB | 11585² |
| Safari 26.2 | macOS | apple apple | PASS | 1.8ms | 0.7ms | 48.4ms | 3.0ms | 53.9ms | 2048 MB | 8191² |
| Firefox 148 | macOS | (hidden) | PASS | 0.9ms | 0.2ms | 28.1ms | 105.5ms | 134.6ms | 1024 MB | 5792² |
| Safari 26.3 | iOS 18.7 | N/A | FAIL | — | — | — | — | — | — | — |

**iOS note**: Safari 26.3 on iOS 18.7 (iPhone) has a "WebGPU" feature flag in WebKit settings, but the runtime API (`navigator.gpu`) is not present. The flag appears to be a placeholder — Apple has not shipped WebGPU on iOS as of March 2026. Our `isAvailable()` check correctly detects this at the `navigator.gpu` level before even attempting `requestAdapter()`.

**Compatibility data is auto-collected**: every `gpu test` invocation submits adapter fingerprint, device limits, timing, and pass/fail to the `gpu_compatibility` Supabase table. Failures are logged too — the iOS row above was captured automatically.

### Phase 2: IR + WGSL Codegen

**Goal**: Build the typed IR and WGSL code generator. Retarget the node compiler.

**New files:**
```
src/engine/ir/
├── types.ts            — IRNode, IRProgram, IRStatement discriminated unions
├── IRBuilder.ts        — helper functions to construct IR trees (sugar over raw constructors)
├── WGSLCodegen.ts      — IR → WGSL compute shader string
├── PythonCodegen.ts    — IR → Python string (for "Show Code" preview)
├── validate.ts         — type checking, scope validation, neighbor access analysis
└── optimize.ts         — constant folding, dead code elimination (optional, can defer)
```

**NodeCompiler retargeting:**
- `builtinNodes.ts`: each node's `compile()` returns `IRNode` instead of Python string
- `NodeCompiler.ts`: topological sort + expression inlining operates on IR trees
- Output: `IRProgram` instead of `CompilationResult { code: string }`
- `NodeDecompiler.ts`: still works from `@nodegraph` JSON comment — IR is transparent to round-trip

**WGSL codegen produces:**
```wgsl
@group(0) @binding(0) var<storage, read> cellsIn: array<f32>;
@group(0) @binding(1) var<storage, read_write> cellsOut: array<f32>;
@group(0) @binding(2) var<uniform> params: SimParams;

struct SimParams {
  width: u32,
  height: u32,
  generation: u32,
  dt: f32,
  // ... env params
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x;
  let y = gid.y;
  if (x >= params.width || y >= params.height) { return; }
  let idx = y * params.width + x;
  
  // --- generated from IR ---
  let alive = cellsIn[idx * PROPS + 0u];
  let neighbors_alive = /* neighbor sum logic */;
  let new_alive = select(0.0, 1.0, 
    (neighbors_alive == 3.0) | ((alive > 0.5) & (neighbors_alive == 2.0)));
  cellsOut[idx * PROPS + 0u] = new_alive;
  // --- end generated ---
}
```

**Validation**: Compile Conway's GoL node graph → IR → WGSL. Inspect shader. Compare output against hand-written WGSL reference.

**Phase 2 Status: COMPLETE** (commit `d5d8ce6`)

Implementation notes:
- `IRBuilder.ts` exports an `IR` object with fluent construction methods — `IR.lit()`, `IR.add()`, `IR.neighborSum()`, `IR.select()`, etc. Type propagation is automatic.
- `validate.ts` checks type consistency, variable scoping, property declarations, and built-in function arities before codegen.
- `WGSLCodegen.ts` handles WGSL quirks: `select()` arg order reversal, bool logic with `&`/`|` instead of `&&`/`||`, literal suffixes (`.0` for f32, `u` for u32), toroidal wrapping via modular arithmetic.
- `PythonCodegen.ts` emits NumPy-convention code and preserves `@nodegraph` metadata comments for round-trip decompilation.
- Three reference IR programs hand-built for validation: Conway's GoL, age-fade expression, Gray-Scott reaction-diffusion.
- `ir.test` CLI command: full IR→validate→WGSL→GPU→readback pipeline. Seeds a glider on 16×16 grid, dispatches one tick, verifies glider advanced correctly. Runs in ~4ms.
- `ir.show [preset]` CLI command: displays generated WGSL and Python for `conway`, `fade`, or `gray-scott` reference programs.
- `optimize.ts` deferred — constant folding and dead code elimination not needed yet.
- `NodeCompiler` retargeting deferred to Phase 3 — reference programs prove the IR→codegen pipeline works end-to-end.

### Phase 3+4: GPU Simulation Pipeline + GPU-Native Rendering

**Goal**: Execute simulation rules as GPU compute shaders and render directly from GPU storage buffers. This is where performance flips.

**New files:**
```
src/engine/rule/
├── GPURuleRunner.ts    — orchestrates compute dispatch for rule execution
└── builtinShaders/     — hand-optimized WGSL for built-in presets
    ├── conway.wgsl
    ├── gray-scott.wgsl
    ├── navier-stokes.wgsl
    ├── brians-brain.wgsl
    └── langtons-ant.wgsl
```

**Changes to existing files:**
- `Simulation.tickAsync()` → dispatches to `GPURuleRunner` when rule type is `webgpu`
- `Grid.ts` → grid metadata (dimensions, property layout) stays on CPU; actual buffers are GPU-side via `BufferManager`
- `ExpressionTagRegistry` → expression tags compile through IR → WGSL, execute as additional compute passes after the rule pass
- `SimulationController` → compute-ahead caches GPU buffer snapshots (via `copyBufferToBuffer`) instead of CPU Float32Array copies

**Tick pipeline (new):**
```
Step 0: resolveLinks() — still CPU, lightweight (scalar param → uniform buffer update)
Step 1: Upload any changed params to uniform buffer
Step 2: Dispatch rule compute shader (reads cellsIn, writes cellsOut)
Step 3: Dispatch expression compute shaders (post-rule tags, reads/writes cellsOut)
Step 4: Swap bind groups (cellsIn ↔ cellsOut)
Step 5: Render pass reads from cellsOut directly (zero readback)
→ emit 'sim:tick' { generation, liveCellCount }
```

Note: `liveCellCount` requires a GPU reduction or readback. Options: (a) async readback with 1-frame latency, (b) GPU atomic counter, (c) compute reduction shader. Atomic counter is simplest.

**Validation**: Conway's GoL at 1024×512 at 60fps. Gray-Scott at 512×512 at 60fps. Cell-for-cell correctness comparison against CPU baseline.

**Phase 3+4 Status: COMPLETE** (commit `6df9cd6`)

Implementation notes:
- `neighbor_at` IR node added for directional neighbor reads (von Neumann Laplacian). Supported in WGSLCodegen, PythonCodegen, and validator.
- `builtinIR.ts` provides hand-built IR programs for 4 presets: `Conway's Game of Life`, `Gray-Scott Reaction-Diffusion`, `Brian's Brain`, `Conway's Advanced`. Others fall back to CPU. Keys match YAML `meta.name`.
- Gray-Scott uses proper von Neumann 4-neighbor Laplacian via `neighbor_at(dx, dy, prop)` instead of Moore 8-neighbor sum.
- `GPURuleRunner` orchestrates the full GPU tick: IR→WGSL→compile→dispatch→swap. Uses ping-pong bind groups (zero-cost swap, no buffer copy).
- `GPUGridRenderer` renders a fullscreen triangle (3 vertices) with a fragment shader that reads directly from the simulation storage buffer. Supports binary (alive/dead) and gradient (reaction-diffusion) color mapping modes. Y-flipped UV for correct grid orientation.
- Dual-canvas architecture: WebGPU canvas (cell rendering, z-index 0) underneath Three.js canvas (grid lines/HUD, z-index 1, alpha:true). InstancedMesh hidden when GPU active.
- Camera coordination: orthographic camera state (`cam.position + cam.left/bottom`) converted to grid-space uniforms for the WebGPU fragment shader.

Integration & Polish (20 commits):
- **No CPU compute-ahead in GPU mode.** GPU ticks live. CPU compute-ahead completely disabled when GPU is active or expected (checks `BUILTIN_IR[preset.meta.name]`).
- **Background GPU cache fill** via separate offscreen `GPURuleRunner` — ticks + readback per frame, stores snapshots in frame cache. Display runner's buffers never touched (zero visual artifacts). Fills ~256 frames in <1s on Chrome.
- **GPU↔CPU sync**: `syncGridToGPU()` uploads Grid→GPU after edit/reset/seek/clear. `syncGPUToGrid()` reads GPU→Grid on pause so edits see correct base state.
- **Playback from cache**: GPU `playbackTick` prefers cached frames (preserves edits). Falls back to live GPU tick only when no cache exists.
- **Seek clamps to cache**: GPU seek only restores cached frames — never blocks with sync compute. Snaps to nearest cached frame if target uncached.
- **Timeline scrubbing unlocked immediately**: `computedGeneration` set to `timelineDuration` in `captureInitialState` when GPU expected, before async init completes.
- **Preset reload/grid resize**: GPU renderer torn down and rebuilt on `sim:presetLoaded`. Handles dimension changes cleanly.
- **Edit→cache refill**: Drawing invalidates frames after the edit point, debounced 150ms restart of `gpuCacheFill()` from the edit frame.
- **Loop mode**: Restores initial state via `restoreFrame(0)` from cache. Endless mode extends timeline.
- **GPUContext dedup**: `initPromise` prevents concurrent `initialize()` calls from racing.
- **Always-visible `[gpu]` logs**: `logGPU()` prints without env var. Color: orange. Documents adapter, init, shader compile, runner, renderer lifecycle.
- **ControlBar layout fix**: Removed viewport `minHeight: 200px` that pushed ControlBar off-screen during GPU canvas insertion. Uses `overflow-hidden` instead.

### Phase 4: GPU-Native Rendering

**Goal**: Render directly from GPU sim buffers. Zero CPU readback for rendering.

**Changes:**
- `LatticeRenderer.ts` refactored:
  - Cell rendering: fullscreen quad with custom fragment shader that reads storage buffer
  - Fragment shader maps screen coords → grid coords → buffer index → cell state → color
  - Visual mapping logic (property → color) moves into the fragment shader
  - Continuous gradients become trivial (mix/smoothstep in shader vs discrete Map lookup)
- Three.js retains: camera, scene management, HUD overlay, grid lines, lights (3D mode)
- `VisualMapper.ts` → generates uniform data (color ramp textures, mapping params) uploaded to GPU once per preset load

**2D rendering:**
```wgsl
@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let gridCoord = screenToGrid(pos.xy);
  let idx = u32(gridCoord.y) * params.width + u32(gridCoord.x);
  let alive = cells[idx * PROPS + 0u];
  let age = cells[idx * PROPS + 1u];
  let colorR = cells[idx * PROPS + 4u];
  // ... visual mapping logic ...
  return vec4<f32>(r, g, b, a);
}
```

**3D rendering:** Design TBD — options include GPU-driven instancing (instance buffer populated by compute shader), or ray-marching for voxel volumes. Decision depends on Phase 3 performance data.

**Validation**: Conway's GoL at 1024×1024 at 60fps with sim running. GPU timeline shows zero readback. Render cost < 1ms.

### Phase 5: Python Transpiler

**Goal**: Users write Python, it compiles to IR, runs on GPU.

**New files:**
```
src/engine/ir/
└── PythonParser.ts     — parse Python subset → IR
```

**Parser approach:**
- Use `tree-sitter-python` compiled to WASM for robust parsing (handles syntax errors gracefully)
- OR hand-rolled recursive descent parser for the supported subset (simpler, no WASM dependency)
- Recommended: start with recursive descent. The subset is small enough. Add tree-sitter later if needed.

**Script editor UX:**
- User writes Python in the existing script editor
- On save/compile: PythonParser → IR → validate → WGSLCodegen → ShaderCompiler
- Errors shown inline with line numbers and clear messages
- "Show WGSL" tab alongside "Show Code" (Python) for advanced users
- Auto-complete for supported built-ins and property names

**Validation**: Conway's GoL written as Python script transpiles to identical WGSL output as node graph version. Runs at 1024×512 at 60fps.

### Phase 6: Cleanup & Polish

**Goal**: Remove all legacy CPU execution paths. Update presets. Ship it.

**Delete:**
- `src/engine/scripting/PyodideBridge.ts`
- `src/engine/scripting/pyodide.worker.ts`
- `src/engine/scripting/expressionHarness.ts`
- `src/engine/scripting/scriptHarness.ts`
- `src/engine/scripting/pythonHarness.ts`
- `src/engine/scripting/gridTransfer.ts`
- `src/engine/rule/RuleRunner.ts` (TS per-cell path)
- `src/engine/rule/RuleCompiler.ts` (`new Function` path)
- `src/engine/rule/PythonRuleRunner.ts`
- `src/engine/rule/WasmRuleRunner.ts`
- `src/wasm/` directory (Rust WASM rules)

**Update:**
- All 8 built-in presets: `rule.type` → `webgpu`
- `PresetConfig` schema: add `webgpu` rule type, deprecate `python` and `typescript` types
- Node editor: "Show Code" tab displays Python (IR → PythonCodegen) + WGSL (IR → WGSLCodegen)
- `ARCHITECTURE.md` and `pipeline.md` rewritten for new architecture
- Error UX: clear messages when Python transpilation fails

**Re-run full benchmark suite**: Compare against Phase 0 baseline. Document improvement ratios.

---

## Performance Targets

| Simulation | Grid Size | Current | Target |
|---|---|---|---|
| Conway's GoL | 1024×512 | ~1 fps | 60 fps |
| Conway's GoL | 512×512 | ~3-5 fps | 60 fps |
| Gray-Scott | 512×512 | ~5-6 fps | 60 fps |
| Navier-Stokes | 512×512 | untested | 60 fps |
| Conway's GoL | 2048×2048 | impossible | 30+ fps |
| Any rule | 4096×4096 | impossible | 10+ fps |
| Render only | 1024×1024 | CPU-bound | <1ms GPU |

---

## WebGPU Platform Status (March 2026)

All major browsers now ship WebGPU:
- **Chrome/Edge**: Stable since v113 (May 2023). Windows, macOS, ChromeOS, Android 12+.
- **Safari**: Stable since Safari 26.0 (Sept 2025). macOS Tahoe 26, iOS 26, iPadOS 26, visionOS 26.
- **Firefox**: Stable on Windows since v141 (July 2025). ARM64 macOS since v147 (Jan 2026). Linux in Nightly, expected stable 2026. Android behind flag.
- **Global coverage**: ~70% of browser users.

**Decision**: WebGPU only. No WebGL fallback for v1. WebGL2 fallback can be added later from the same IR if needed.

---

## Key Principles

1. **Measure before and after everything.** No optimization is real without a number.
2. **The GPU is the execution environment.** CPU orchestrates, GPU computes and renders.
3. **One IR, multiple front-ends.** Nodes and Python converge on the same typed representation before WGSL codegen.
4. **Python is for humans, WGSL is for silicon.** Users never see or think about WGSL unless they want to.
5. **WebGPU is the only backend.** No fallback complexity. Build modern, ship modern.
6. **Presets remain YAML.** The simulation description format is decoupled from the execution backend.
7. **Three Surface Doctrine holds.** GUI, CLI, AI all dispatch the same commands. Nothing changes above the engine layer.
8. **Don't over-engineer documentation ahead of working code.** This plan is the north star; implementation details evolve as we build.
