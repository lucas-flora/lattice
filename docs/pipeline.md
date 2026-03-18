# Lattice: Complete Technical Context

Comprehensive system documentation for architectural reasoning and WebGPU migration planning.
Audited from source 2026-03-17.

---

## 1. Project Overview

Lattice is a **universal cellular automaton / simulation platform** that runs entirely
in the browser. Users load or create grid-based simulations (Conway's Game of Life,
Gray-Scott reaction-diffusion, Navier-Stokes fluid dynamics, 1D elementary CA, etc.)
and interact with them through a unified editor environment.

### User-Facing Experience

- **Viewport**: WebGL canvas rendering a 1D/2D/3D cell grid with pan/zoom/orbit. Cells are
  colored by simulation state via configurable visual mappings.
- **Timeline**: Premiere-style scrubber with compute-ahead — frames are pre-computed into
  a cache so the entire timeline is instantly scrubbable.
- **Node Editor**: React Flow visual scripting canvas. Users wire property-read/math/logic
  nodes to create per-cell expressions that compile to Python and execute via Pyodide.
- **Terminal**: CLI with autocomplete, exposing all ~40 commands (sim.play, edit.draw,
  view.zoom, scene.buildTree, etc.) — same commands backing GUI and keyboard shortcuts.
- **Object Manager + Inspector**: C4D-style scene tree (sim-root, cell types, environment,
  global variables) with a context-sensitive property inspector.
- **Card Views**: Filtered list panels for tags, globals, cell properties.
- **Metrics**: Live sparkline graphs (cell count, generation rate).

### Intended Use Cases

- Classic cellular automata (Game of Life, Rule 110, Brian's Brain, Langton's Ant)
- Reaction-diffusion systems (Gray-Scott with WASM acceleration)
- Fluid simulation (simplified Navier-Stokes)
- User-authored Python rules via Pyodide
- Expression-based visual effects (age-fade, color mapping, oscillation)
- Visual scripting via node graph → Python codegen

---

## 2. Architecture Overview

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  REACT UI                                                           │
│  Next.js 16 / React 19 / Tailwind 4 / Zustand 5                   │
│  AppShell → Drawers, Viewport, Timeline, Terminal, NodeEditor      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ useXxxStore() hooks
┌──────────────────────────┴──────────────────────────────────────────┐
│  ZUSTAND STORES (reactive mirrors — read-only views of engine)     │
│  simStore, layoutStore, uiStore, viewStore, sceneStore,            │
│  expressionStore, scriptStore, aiStore                              │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ wireStores() subscriptions
┌──────────────────────────┴──────────────────────────────────────────┐
│  EVENT BUS (typed pub/sub singleton)                                │
│  sim:*, view:*, ui:*, tag:*, scene:*, pyodide:*, script:*          │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ emit
┌──────────────────────────┴──────────────────────────────────────────┐
│  COMMAND LAYER                                                      │
│  CommandRegistry (~40 commands) ← SimulationController              │
│  KeyboardShortcutManager ← three surfaces: GUI / CLI / AI          │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ calls engine methods
┌──────────────────────────┴──────────────────────────────────────────┐
│  ENGINE (source of truth)                                           │
│  ┌─────────────────┐  ┌───────────────────────┐                    │
│  │ Simulation       │  │ ExpressionTagRegistry │                    │
│  │ • Grid           │  │ (unified computation) │                    │
│  │ • RuleRunner     │  ├───────────────────────┤                    │
│  │ • CellTypeReg    │  │ SceneGraph            │                    │
│  │ • GlobalVarStore │  │ (object hierarchy)    │                    │
│  └─────────────────┘  └───────────────────────┘                    │
│                                                                     │
│  ┌─────────────────┐  ┌───────────────────────┐                    │
│  │ NodeCompiler     │  │ PyodideBridge         │                    │
│  │ (graph→Python)   │  │ (→ Web Worker)        │                    │
│  └─────────────────┘  └───────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────────────┐
│  RENDERING                                                          │
│  LatticeRenderer (vanilla Three.js, InstancedMesh)                 │
│  VisualMapper (data-driven color/size lookup)                       │
│  CameraController / OrbitCameraController                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Engine is source of truth** — Zustand stores are read-only mirrors, updated via
   EventBus. Stores never mutate engine state.
2. **Three surfaces, one command registry** — GUI, CLI, and AI all call the same
   `CommandRegistry.execute()`. No privileged surface.
3. **Computation and rendering decoupled** — Simulation runs on `setInterval` at
   configurable FPS; renderer runs on `requestAnimationFrame` at display refresh rate.
4. **YAML universal format** — Presets, cell types, visual mappings, parameters all
   serialize to YAML.
5. **Vanilla Three.js** — No R3F/Drei. Single `InstancedMesh` per viewport. Manual
   lifecycle management in `useEffect`.

---

## 3. Node Scripting System

### Node Types (30+ built-in)

Defined in `src/engine/nodes/builtinNodes.ts`. Each node has a `compile()` function
that emits Python:

```typescript
interface NodeTypeDefinition {
  type: string;
  label: string;
  category: 'property' | 'math' | 'range' | 'logic' | 'utility' | 'object';
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  hasData?: boolean;
  compile: (inputExprs: Record<string, string>, data: Record<string, unknown>) => string;
}
```

**Categories:**
- **Property**: `PropertyRead`, `PropertyWrite`, `Constant`, `Time`
- **Math**: `Add`, `Subtract`, `Multiply`, `Divide`, `Power`, `Modulo`, `Negate`,
  `Abs`, `Sqrt`, `Sin`, `Cos`, `Floor`, `Ceil`
- **Range**: `RangeMap`, `Clamp`, `Smoothstep`, `Linear`
- **Logic**: `Compare` (>, <, ==, etc.), `And`, `Or`, `Not`, `Select` (ternary)
- **Utility**: `Random`, `Sum`, `Mean`, `Max`, `Min`, `Count`, `Coordinates`
- **Object**: `ObjectNode` (C4D-style dual-column node with dynamic ports per object)

### Port Types

```typescript
type PortType = 'scalar' | 'array' | 'bool' | 'string';
```

Connections allow implicit broadcasting (scalar→array) and coercion (bool→scalar).

### Graph Data Model

```typescript
interface NodeGraph {
  nodes: NodeInstance[];
  edges: Edge[];
}

interface NodeInstance {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface Edge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}
```

The graph is **strictly a DAG** — cycle detection happens both at compile time
(topological sort) and at the tag registry level (DFS on dependency graph).

---

## 4. Compilation Pipeline

### Graph → Python Codegen

`src/engine/nodes/NodeCompiler.ts` → `compileNodeGraph(graph: NodeGraph): CompilationResult`

**Steps:**
1. **Topological sort** (Kahn's algorithm) — orders nodes source→target
2. **Port usage analysis** — count downstream consumers per source port
3. **Expression inlining** — single-consumer expressions are inlined (no temp variable);
   multi-consumer expressions get readable `_nodetype_id` variable names
4. **ObjectNode compilation** — maps to `cell['prop']` / `env['prop']` / `glob['prop']`
   reads/writes depending on object kind
5. **Graph metadata** — embeds full `NodeGraph` JSON as `# @nodegraph: {JSON}` comment
   for perfect round-trip decompilation

**Example compilation:**
```
ObjectNode(age, output) → RangeMap(0,20,1,0) → ObjectNode(alpha, input)
```
compiles to:
```python
self.alpha = ((cell['age'] - 0) / (20 - 0) * (0 - 1) + 1)
# @nodegraph: {"nodes":[...],"edges":[...]}
```

**Output:**
```typescript
interface CompilationResult {
  code: string;       // Python source
  inputs: string[];   // Addresses read (e.g., "cell.age", "env.feedRate")
  outputs: string[];  // Addresses written (e.g., "cell.alpha")
}
```

### Decompilation (Round-Trip)

`src/engine/nodes/NodeDecompiler.ts` — extracts `NodeGraph` from the `# @nodegraph:`
JSON comment in generated code. Fallback: pattern-matching on Python source for
best-effort recovery.

### Target Language

**Python (NumPy)** — all node compilation targets Python. Expressions operate on
entire grid arrays (vectorized NumPy ops), not per-cell loops.

### No Intermediate Representation

There is no IR between the node graph and Python source. Compilation is direct:
`NodeGraph → Python string`. The generated code is injected into the expression
harness (see Section 6) which sets up NumPy arrays and helper functions.

---

## 5. Rule System

### Rule Execution Paths

| Path | Preset Type | Execution | Per-Cell or Whole-Grid |
|------|-------------|-----------|----------------------|
| **TypeScript** | `typescript` | `new Function('ctx', body)` via `compileRule()` | Per-cell loop |
| **WASM (Rust)** | `wasm` | `wasm-bindgen` exported functions | Whole-grid |
| **Python** | `python` | Pyodide in Web Worker | Whole-grid (NumPy) |

### TypeScript Path (Default)

`src/engine/rule/RuleCompiler.ts`:
```typescript
function compileRule(computeBody: string): RuleFn {
  return new Function('ctx', computeBody) as RuleFn;
}
```

The compiled function receives a `RuleContext`:
```typescript
interface RuleContext {
  cell: Record<string, number | number[]>;       // current cell properties
  neighbors: Array<Record<string, number | number[]>>; // Moore neighborhood
  grid: { width, height, depth, dimensionality };
  params: Record<string, number>;                // runtime parameters
  cellIndex: number;
  x: number; y: number; z: number;
  generation: number;
  dt: number;
}
```

Returns `Record<string, number | number[]>` — property name → new value.

**Per-cell loop** in `RuleRunner.tick()`:
```typescript
for (let i = 0; i < grid.cellCount; i++) {
  const cellValues = this.perceiveCell(i);      // read current buffer
  const neighbors = neighborIndices.map(ni => this.perceiveCell(ni));
  const ctx = { cell: cellValues, neighbors, ... };
  const result = this.ruleFn(ctx);              // execute compiled rule
  // write result to next buffer
  for (const [propName, value] of Object.entries(result)) {
    grid.setCellValue(propName, i, value);
  }
}
grid.swap();  // flip current/next
generation++;
```

**Critical bottleneck**: `perceiveCell()` allocates a new `Record<string, number>`
per cell per tick. For a 512x512 grid, that's 262,144 object allocations per tick,
plus 8 neighbor perceptions each = ~2.3M allocations/tick.

### WASM Path (Rust)

`src/engine/rule/WasmRuleRunner.ts` — delegates to Rust functions compiled to
WASM via `wasm-bindgen`:

```typescript
// Whole-grid API — Rust processes entire grid in one call
wasmModule.gray_scott_tick(uCurrent, vCurrent, uNext, vNext, width, height, Du, Dv, F, k, dt);
```

Currently two WASM functions exist:
- `gray_scott_tick` — reaction-diffusion
- `navier_stokes_tick` — simplified fluid dynamics

WASM module: `src/wasm/pkg/lattice_engine_bg.wasm` (31 KB, built from Rust via
`cargo build --target wasm32-unknown-unknown`).

**Silent fallback**: if WASM module fails to load, falls back to TypeScript with
no error thrown.

### Python Path

`src/engine/rule/PythonRuleRunner.ts` → `PyodideBridge` → Pyodide Web Worker.

Extract all grid buffers as Float32Array copies → post to worker → execute Python →
return modified buffers → apply back to grid.

---

## 6. Runtime / Execution Layer

### Tick Pipeline

Complete order for `Simulation.tickAsync()`:

```
Step 0: resolveLinks()
  └─ ExpressionTagRegistry.resolvePreRule()
     └─ JS fast-path: rangeMap() for link-sourced tags (no Pyodide needed)

Step 1: Execute rule
  ├─ TypeScript: RuleRunner.tick() — per-cell perceive-update loop
  ├─ WASM: WasmRuleRunner.tick() — whole-grid Rust function
  └─ Python: PythonRuleRunner.tickAsync() — Pyodide worker
  → grid.swap() (flip current/next pointers, no data copy)

Step 2: Post-rule expressions (Python via Pyodide)
  └─ buildExpressionHarness() wraps all enabled post-rule tags into single script
     └─ NumPy vectorized: operates on entire grid arrays, not per-cell
     └─ Results written to 'current' buffer (immediately visible)

Step 3: Global scripts (Python via Pyodide)
  └─ For each enabled script tag:
     └─ buildScriptHarness() wraps user code
     └─ Can modify env params and global variables
     └─ Changes applied back to Simulation.params and GlobalVariableStore

→ emit 'sim:tick' { generation, liveCellCount }
```

### Grid State (Float32Array Double Buffering)

`src/engine/grid/Grid.ts`:

```typescript
interface PropertyBuffers {
  bufferA: Float32Array;
  bufferB: Float32Array;
  aIsCurrent: boolean;
  channels: number;          // floats per cell (1 for scalar, 2-4 for vectors)
  defaultValue: number[];
  sharedA?: SharedArrayBuffer;
  sharedB?: SharedArrayBuffer;
}
```

- **Swap** is a flag flip (`aIsCurrent = !aIsCurrent`), not a data copy
- **Display lock**: `lockDisplay()` snapshots all current buffers so the renderer reads
  frozen state while compute-ahead modifies live buffers
- **SharedArrayBuffer** support for zero-copy worker sharing (enabled by COOP/COEP headers)

### Inherent Cell Properties

Every cell automatically has:

| Property | Type | Channels | Default | Purpose |
|----------|------|----------|---------|---------|
| `alive` | bool | 1 | 0 | Cell state |
| `age` | int | 1 | 0 | Auto-incremented when alive |
| `alpha` | float | 1 | 1.0 | Render opacity |
| `colorR/G/B` | float | 1 each | 0.0 | Direct RGB override |
| `_cellType` | int | 1 | 0 | Type identifier |

User-defined properties: `bool`, `int`, `float`, `vec2`, `vec3`, `vec4`.

### Expression Tag System (Unified Computation)

`src/engine/expression/ExpressionTagRegistry.ts` — the **single registry** for ALL
computation beyond the core rule:

```typescript
interface ExpressionTag {
  id: string;
  name: string;
  owner: { type: 'cell-type' | 'environment' | 'global' | 'root'; id?: string };
  code: string;              // Python (or auto-generated from link/node graph)
  phase: 'pre-rule' | 'rule' | 'post-rule';
  enabled: boolean;
  source: 'code' | 'link' | 'script';
  inputs: string[];          // dot-path addresses: "cell.alive", "env.feedRate"
  outputs: string[];
  linkMeta?: LinkMeta;       // preserved for JS fast-path
  nodeGraph?: NodeGraph;     // node editor metadata for round-trip
}
```

Tags serve multiple purposes:
- **Links** (source='link', phase='pre-rule') — parameter-to-parameter with range mapping.
  JS fast-path via `rangeMap()` — no Pyodide.
- **Expressions** (source='code', phase='post-rule') — per-property Python.
  Node editor output goes here.
- **Scripts** (source='script', phase='post-rule') — global Python scripts.
- **Rule tag** (phase='rule') — the simulation rule itself, toggleable.

### Compute-Ahead

`SimulationController` pre-computes frames into a cache:

```typescript
interface TickSnapshot {
  generation: number;
  buffers: Map<string, Float32Array>;  // copies of all property buffers
  liveCellCount: number;
}
```

- **Chunk sizes**: 50 frames (paused) / 10 frames (playing)
- **Scheduling**: `setTimeout(fn, 0)` between chunks — yields to browser
- **Display lock**: grid.lockDisplay() during async compute
- **Auto-extend**: timeline duration doubles when playhead reaches end (smart rounding)

### Playback

- `setInterval` at configurable FPS (1, 5, 10, 30, 60, Max)
- Three modes: `loop` (restart at end), `endless` (auto-extend), `once` (stop at end)
- Scrubbing: seeks to cached frame via `restoreSnapshot()` — replays from nearest
  cached generation if exact frame not in cache

---

## 7. Rendering Pipeline

### No React Three Fiber

Vanilla Three.js. The `LatticeRenderer` class manages the Three.js lifecycle
imperatively inside a React `useEffect`. No JSX scene graph.

### Scene Contents

```
THREE.Scene (background: #000000)
  ├─ THREE.InstancedMesh (all cells — single draw call)
  ├─ THREE.LineSegments (grid lines — optional)
  ├─ THREE.AmbientLight (3D only — 0x404040)
  └─ THREE.DirectionalLight (3D only — white 80%, pos [1, 1.5, 1])
```

### Render Modes

| Mode | Geometry | Material | Camera |
|------|----------|----------|--------|
| 2D | `PlaneGeometry(1,1)` | `MeshBasicMaterial` | Orthographic |
| 1D spacetime | `PlaneGeometry(1,1)` | `MeshBasicMaterial` | Orthographic |
| 3D | `BoxGeometry(0.9,0.9,0.9)` | `MeshLambertMaterial` | Perspective (60° FOV) |

Instance count: `cellCount` for 2D/3D, `width * 128` for 1D (history depth).

### Per-Frame Update

`LatticeRenderer.update()` — called every rAF frame:

1. Read grid buffers via `grid.getDisplayBuffer(prop)` (locked or live)
2. For each cell:
   - Check direct RGB buffers (`colorR/G/B`) — used if written by tags
   - Fall back to `VisualMapper.getColor(prop, value)` — discrete lookup
   - Apply alpha (premultiply toward black)
   - `instancedMesh.setColorAt(i, color)`
3. Mark `instanceColor.needsUpdate = true`
4. `renderer.render(scene, camera)`

**Zero allocation per frame** — reusable `tempColor`, `tempMatrix`, `tempPosition`, etc.

### Visual Mapping

`src/renderer/VisualMapper.ts` — reads `visual_mappings` from preset:

```yaml
visual_mappings:
  - property: "alive"
    channel: "color"
    mapping:
      "0": "#000000"
      "1": "#00ff00"
```

Lookup: `Map<string, Map<string, THREE.Color>>`, keyed by `String(Math.round(value))`.
Default mapping: first bool property → green/black.

### Camera Controllers

- **2D**: `CameraController` — orthographic, pan/zoom with cursor-locked scroll,
  zoom-to-fit. Range: 0.1x–20x.
- **3D**: `OrbitCameraController` — perspective, spherical coordinates (theta/phi/radius),
  orbit/pan/zoom. Custom implementation (no Three.js OrbitControls addon).

---

## 8. Python / Pyodide Integration

### PyodideBridge

`src/engine/scripting/PyodideBridge.ts`:
- **Lazy initialization** — worker created on first `ensureReady()` call
- Pyodide v0.29.3 from CDN (~16MB WASM)
- Serial execution queue (Pyodide is single-threaded)
- Promise-based API with request ID tracking

### Expression Harness

`src/engine/scripting/expressionHarness.ts` →
`buildExpressionHarness(expressions, propertyNames, w, h, d): string`

Generates a Python script that sets up:
- NumPy arrays from grid buffers (reshaped for 2D)
- Shorthand variables: `alive`, `age`, `x`, `y`, `generation`, `dt`, `time`
- Environment params: `env_feedRate`, `env_killRate`, etc.
- Global variables as locals
- `self` proxy for statement-mode writes (`self.alpha = ...`)
- Built-in helpers: `clamp()`, `smoothstep()`, `rangeMap()`, `wiggle()`
- Overridden `max()`/`min()` for NumPy compatibility

Each expression executes in a try/except (silent fail). Results propagate to `cell`
dict so downstream expressions see updated values.

### Grid Buffer Transfer

`src/engine/scripting/gridTransfer.ts`:
```typescript
extractGridBuffers(grid): Record<string, Float32Array>
  // → new Float32Array(grid.getCurrentBuffer(name)) for each property

applyResultBuffers(grid, results, target='next')
  // → grid.getNextBuffer(name).set(data) for each result
```

Buffers are copied (Pyodide has separate WASM memory). ~1-2ms per property for 512x512.

### Web Worker Protocol

```typescript
// Messages TO worker
{ type: 'init'; indexURL?: string }
{ type: 'exec-rule'; id; code; buffers; gridW/H/D; params }
{ type: 'exec-expressions'; id; code; buffers; gridW/H/D; params; globalVars }
{ type: 'exec-script'; id; code; params; globalVars; gridW/H/D }

// Messages FROM worker
{ type: 'init-progress'; phase; progress }
{ type: 'ready' }
{ type: 'rule-result'; id; buffers }
{ type: 'expression-result'; id; buffers }
{ type: 'script-result'; id; envChanges; varChanges }
{ type: 'error'; id?; message; stack? }
```

---

## 9. Performance Profile

### Measured Benchmarks

**Gray-Scott 512x512 (TypeScript baseline):**
- ~170-180ms per tick
- ~5-6 FPS
- Far below 60fps target

**Documented bottlenecks** (from test comments):
1. Laplacian computation (double nested loop over 512x512)
2. Reaction-diffusion update (U*V^2 per cell)
3. Object allocation in perceive-update loop

### Structural Performance Issues

**Per-cell object allocation in TS rule path:**
```typescript
// RuleRunner.tick() — for EACH cell:
const cellValues = this.perceiveCell(i);       // allocates Record<string, number>
const neighbors = neighborIndices.map(ni =>
  this.perceiveCell(ni)                        // allocates Record per neighbor
);
// 512x512 = 262,144 cells × (1 + ~8 neighbors) = ~2.3M allocations/tick
```

**Buffer copy overhead for Pyodide:**
- Every Pyodide call copies ALL property buffers to/from the worker
- Float32Array → Array → toPy() → Python list → NumPy → back
- ~0.5-1ms per property per round-trip

**Rendering:**
- Per-cell color set via `instancedMesh.setColorAt(i, color)` — no GPU compute
- Full grid traversal every frame even if most cells unchanged
- No dirty-region optimization

**Compute-ahead:**
- Each cached frame copies ALL property buffers (`new Float32Array(buf)`)
- 200 frames × 7+ properties × 512×512 × 4 bytes = ~1.4 GB for a single timeline

### What Runs at 60fps Today

- Conway's Game of Life at 128x128 (TS path)
- Any preset with WASM acceleration (Gray-Scott, Navier-Stokes)
- Rendering loop itself (rAF) — always 60fps independent of sim speed
- Small grids (<64x64) with any rule type

---

## 10. Frontend Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.1.6 |
| React | React 19 | 19.2.3 |
| State | Zustand (9 stores, subscribeWithSelector) | 5.0.0 |
| Styling | Tailwind CSS 4 | 4.x |
| 3D | Three.js (vanilla, no R3F) | 0.183.0 |
| Node Editor | @xyflow/react | 12.10.1 |
| Validation | Zod | 3.24.0 |
| Serialization | yaml | 2.0.0 |
| Testing | Vitest + Testing Library | 3.0.0 |
| TypeScript | strict mode, ES2017 target | 5.x |

### Build Config

- **Turbopack** enabled (no Webpack)
- **COOP/COEP headers** for SharedArrayBuffer
- **Path alias**: `@/* → ./src/*`
- **Fonts**: Geist Sans + Geist Mono (from next/font)

---

## 11. Backend / Scripting Stack

**No server-side computation.** Everything runs client-side.

| Component | Technology | Notes |
|-----------|-----------|-------|
| Python runtime | Pyodide 0.29.3 (WASM CPython) | Lazy-loaded, ~16MB |
| NumPy | via Pyodide | Vectorized grid operations |
| WASM rules | Rust → wasm-bindgen → 31KB .wasm | Gray-Scott, Navier-Stokes |
| Workers | 2 Web Workers | Simulation worker + Pyodide worker |

### Simulation Worker

`src/engine/worker/simulation.worker.ts` — dedicated thread for tick computation.
Pure `handleMessage()` function in `protocol.ts` (testable, no DOM).

### Pyodide Worker

`src/engine/scripting/pyodide.worker.ts` — lazy-loaded, downloads Pyodide from CDN,
serial execution queue.

---

## 12. Data Flow

### From Preset to Pixels

```
YAML Preset
  │ loadPreset() → Zod schema validation → PresetConfig
  ▼
SimulationController.loadPresetConfig()
  │ creates Simulation(preset)
  │   ├─ Grid (Float32Array buffers per property)
  │   ├─ RuleRunner or PythonRuleRunner
  │   ├─ CellTypeRegistry (property union)
  │   ├─ ExpressionTagRegistry (all tags loaded)
  │   └─ GlobalVariableStore (variables loaded)
  ▼
initializeSimulation()
  │ seeds grid (random cells, center blob, etc.)
  ▼
captureInitialState()
  │ snapshots all buffers, starts compute-ahead
  ▼
EventBus.emit('sim:presetLoaded')
  │
  ├─ wireStores → simStore.setActivePreset() → React re-renders
  │
  └─ SimulationViewport.useEffect
      │ LatticeRenderer.setSimulation(grid, preset)
      │   ├─ VisualMapper(preset) — builds color/size maps
      │   ├─ InstancedMesh(geometry, material, instanceCount)
      │   ├─ initializePositions() — set grid coordinates
      │   └─ initializeColors() — all black
      │
      └─ requestAnimationFrame loop:
          ├─ renderer.update()  — read buffers, set instance colors
          └─ renderer.render()  — GPU draw call
```

### From Node Graph to Execution

```
User wires nodes in React Flow
  │
  ▼
NodeEditorCanvas.onGraphChange() → updates tag.nodeGraph
  │
  ▼
node.compile command
  │ compileNodeGraph(graph) → CompilationResult { code, inputs, outputs }
  ▼
tag.edit command
  │ updates ExpressionTag.code, .inputs, .outputs
  │ cycle detection via DFS
  ▼
EventBus.emit('tag:updated')
  │ SimulationController.onTagChanged() → pause + reset
  ▼
Next tickAsync():
  │ buildExpressionHarness(expressions, ...)
  │   → single Python script with NumPy setup
  │ PyodideBridge.execExpressions(code, buffers, ...)
  │   → postMessage to Pyodide worker
  │   → worker executes Python
  │   → returns modified buffers
  │ applyResultBuffers(grid, results, 'current')
  ▼
Renderer reads updated buffers → updated colors on screen
```

---

## 13. File / Module Structure

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (fonts, metadata)
│   ├── page.tsx                  # Single page → <AppShell />
│   ├── globals.css               # Tailwind + custom properties
│   └── api/ai/chat/route.ts      # OpenAI chat endpoint
│
├── components/                   # React components (~87 files)
│   ├── AppShell.tsx              # Top-level: init, drawers, zones
│   ├── viewport/
│   │   └── SimulationViewport.tsx # Three.js canvas + mouse events + HUD
│   ├── nodes/
│   │   ├── NodeEditorCanvas.tsx   # React Flow wrapper
│   │   ├── CustomNode.tsx         # Custom node component
│   │   ├── ObjectNodeComponent.tsx# C4D-style dual-column object node
│   │   └── AddNodeMenu.tsx        # Right-click node palette
│   ├── hud/
│   │   ├── HUD.tsx               # Generation + cell count overlay
│   │   ├── ControlBar.tsx         # Transport controls, speed, screenshot
│   │   └── HotkeyHelp.tsx         # Keyboard shortcut modal
│   ├── timeline/
│   │   └── Timeline.tsx           # Premiere-style scrubber
│   ├── terminal/
│   │   ├── Terminal.tsx           # CLI component
│   │   └── TerminalInput.tsx      # Autocomplete input
│   ├── panels/
│   │   ├── ObjectManagerPanel.tsx  # Scene tree view
│   │   ├── InspectorPanel.tsx      # Context-sensitive editor
│   │   ├── CardViewPanel.tsx       # Filtered card list
│   │   ├── MetricsPanel.tsx        # Sparkline charts
│   │   ├── ParamGraph.tsx          # Canvas 2D sparkline
│   │   └── NodeEditorPanel.tsx     # Node editor tab wrapper
│   ├── layout/
│   │   ├── LayoutRenderer.tsx     # Recursive tree renderer
│   │   ├── SplitContainer.tsx     # Resizable split
│   │   ├── TabContainer.tsx       # Tab switching
│   │   ├── DrawerShell.tsx        # Collapsible drawer
│   │   ├── BottomTray.tsx         # Timeline + controls
│   │   └── PanelHost.tsx          # Mounts registered panel
│   └── ui/
│       └── ResizeHandle.tsx       # Drag resize handle
│
├── engine/                       # Simulation engine (~72 files)
│   ├── core/
│   │   └── EventBus.ts           # Typed pub/sub (EngineEventMap)
│   ├── grid/
│   │   ├── Grid.ts               # Float32Array buffers, ping-pong swap
│   │   ├── neighbors.ts          # Moore neighborhood indices
│   │   └── types.ts              # GridConfig, PropertyBuffers
│   ├── rule/
│   │   ├── Simulation.ts         # Facade: Grid + Runner + Tags
│   │   ├── RuleRunner.ts         # TS per-cell perceive-update loop
│   │   ├── RuleCompiler.ts       # new Function('ctx', body)
│   │   ├── WasmRuleRunner.ts     # Rust WASM whole-grid delegate
│   │   ├── PythonRuleRunner.ts   # Pyodide async rule execution
│   │   ├── CommandHistory.ts     # Undo/redo snapshots
│   │   └── types.ts              # RuleFn, RuleContext, TickResult
│   ├── cell/
│   │   ├── CellTypeRegistry.ts   # Type hierarchy + property union
│   │   └── types.ts              # INHERENT_PROPERTIES, CHANNELS_PER_TYPE
│   ├── expression/
│   │   ├── ExpressionTagRegistry.ts # Unified computation registry
│   │   ├── PropertyAddress.ts     # Dot-path addressing (cell.alive, env.x)
│   │   └── types.ts              # ExpressionTag, LinkMeta
│   ├── nodes/
│   │   ├── builtinNodes.ts       # 30+ node type definitions
│   │   ├── NodeCompiler.ts       # Graph → Python codegen
│   │   ├── NodeDecompiler.ts     # Python → Graph recovery
│   │   ├── NodeTypeRegistry.ts   # Node type lookup
│   │   ├── sceneDataResolver.ts  # Scene object → node port data
│   │   └── types.ts              # NodeGraph, NodeInstance, Edge, etc.
│   ├── scene/
│   │   ├── SceneGraph.ts         # Object tree (not Three.js scene)
│   │   ├── SceneNode.ts          # Node types + factory
│   │   └── ScopeResolver.ts      # Variable scoping per object
│   ├── preset/
│   │   ├── types.ts              # PresetConfig schema
│   │   ├── loader.ts             # YAML → Zod validation
│   │   ├── serializer.ts         # Config → YAML
│   │   └── builtins/             # 8 built-in preset YAMLs
│   │       ├── conways-gol.yaml
│   │       ├── gray-scott.yaml
│   │       ├── navier-stokes.yaml
│   │       ├── langtons-ant.yaml
│   │       ├── rule-110.yaml
│   │       ├── brian-brain.yaml
│   │       ├── conways-advanced.yaml
│   │       └── link-testbed.yaml
│   ├── scripting/
│   │   ├── PyodideBridge.ts      # Main ↔ Worker messaging
│   │   ├── pyodide.worker.ts     # Pyodide Web Worker
│   │   ├── expressionHarness.ts  # Python codegen for expressions
│   │   ├── scriptHarness.ts      # Python codegen for scripts
│   │   ├── pythonHarness.ts      # Python codegen for rules
│   │   ├── gridTransfer.ts       # Grid buffer extract/apply
│   │   ├── GlobalVariableStore.ts# Key-value global variables
│   │   └── types.ts              # PyodideStatus, message types
│   └── worker/
│       ├── simulation.worker.ts  # Simulation Web Worker
│       ├── protocol.ts           # Message protocol (pure function)
│       └── createSimulationWorker.ts
│
├── commands/                     # Command system (~27 files)
│   ├── CommandRegistry.ts        # Registry + execute router
│   ├── SimulationController.ts   # Playback, compute-ahead, frame cache
│   ├── KeyboardShortcutManager.ts# Hotkey → command binding
│   ├── wireStores.ts             # EventBus → Zustand bridge
│   └── definitions/              # ~20 command definition files
│       ├── sim.ts, grid.ts, rule.ts, preset.ts, cell.ts
│       ├── expression.ts, link.ts, tag.ts, node.ts
│       ├── layout.ts, scene.ts, script.ts, view.ts
│       ├── state.ts, edit.ts, etc.
│
├── store/                        # Zustand stores (9 files)
│   ├── simStore.ts, layoutStore.ts, uiStore.ts, viewStore.ts
│   ├── sceneStore.ts, expressionStore.ts, scriptStore.ts
│   ├── aiStore.ts, index.ts
│
├── renderer/                     # Three.js visualization
│   ├── LatticeRenderer.ts       # Scene, InstancedMesh, update, render
│   ├── VisualMapper.ts          # Property value → color/size lookup
│   ├── CameraController.ts     # Orthographic pan/zoom
│   ├── OrbitCameraController.ts # Perspective orbit/pan/zoom
│   └── types.ts                 # RendererConfig, GridRenderMode
│
├── layout/
│   ├── types.ts                 # LayoutNode (split|tabs|panel)
│   ├── PanelRegistry.ts        # Global panel type registry
│   └── registerPanels.ts       # Register all panel types
│
├── lib/                         # Utilities
│   ├── debugLog.ts              # Level-based colored logging
│   ├── paramGraphData.ts        # Ring buffer for sparklines
│   ├── performanceProfiler.ts   # Frame time profiling
│   ├── screenshotExport.ts      # Canvas → PNG download
│   └── three-dispose.ts         # GPU resource cleanup
│
├── ai/                          # AI integration
│   ├── aiService.ts, ragClient.ts, ragDocuments.ts
│   ├── contextBuilder.ts, personality.ts, typoDetector.ts
│
└── wasm/pkg/                    # Compiled Rust WASM
    ├── lattice_engine_bg.wasm   # 31 KB
    ├── lattice_engine.js        # wasm-bindgen wrapper
    └── lattice_engine.d.ts      # TypeScript types
```

---

## 14. Current Pain Points & Limitations

### Performance

1. **Per-cell object allocation in TS rule path** — `perceiveCell()` creates a new
   JS object per cell per tick. For 512x512 (262K cells × 9 perceptions), that's
   ~2.3M object allocations/tick. GC pressure is severe.

2. **No GPU compute** — all simulation runs on CPU (main thread or worker). The GPU
   is only used for rendering via Three.js `InstancedMesh`. The rendering itself
   (setting 262K instance colors per frame) is also CPU-bound.

3. **Pyodide overhead** — buffer copy cost (~1-2ms per property), type conversion
   (Float32Array → Array → Python list → NumPy → back), and serial execution queue.

4. **Frame cache memory** — each cached frame stores copies of ALL property buffers.
   At 512x512 with 7 properties, 200 cached frames = ~1.4 GB.

5. **No dirty-region rendering** — every cell's color is recomputed and uploaded to
   the GPU every frame, even if nothing changed.

### Architecture

6. **TS rule path doesn't scale** — the perceive-update loop with JS objects is
   fundamentally per-cell. There's no vectorized TS path. WASM helps but only for
   hardcoded algorithms (Gray-Scott, Navier-Stokes).

7. **Node compiler targets Python only** — there's no path from the node graph to
   WGSL, GLSL, or TS. Any GPU compute migration requires a new codegen backend.

8. **Three render paths** — TS, WASM, and Python are three separate code paths with
   different performance characteristics and capabilities. Adding a fourth (WebGPU)
   increases maintenance surface.

9. **InstancedMesh rendering** — one instance per cell. At 1024x1024 (1M cells), the
   CPU cost of setting 1M instance colors per frame becomes the bottleneck, not the
   GPU draw call itself.

10. **No shared memory between sim and renderer** — the renderer reads from
    `getDisplayBuffer()` which returns either a locked snapshot or the live buffer.
    No TypedArray view sharing.

### Missing Capabilities

11. **No continuous-value visual mapping** — `VisualMapper` only does discrete lookup
    (`Map<string, Color>` keyed by `Math.round(value)`). Continuous gradients (e.g.,
    temperature → blue-to-red) require expression-based colorR/G/B overrides.

12. **No adaptive grid** — fixed size at preset load time. No dynamic resize, no LOD,
    no sparse grids.

13. **WASM rules are hardcoded** — `WasmRuleRunner.tick()` has explicit branches for
    `gray_scott_tick` and `navier_stokes_tick`. Adding a new WASM rule requires
    writing Rust, building WASM, and adding a TS branch.

---

## 15. Open Questions & Unresolved Design Decisions

1. **WebGPU compute shader target** — the node graph compiles to Python. A WebGPU
   path would need either: (a) a new WGSL codegen backend in `NodeCompiler`, or
   (b) a shared IR that can target both Python and WGSL.

2. **Texture-based rendering vs InstancedMesh** — for large grids, a fullscreen quad
   reading from a DataTexture (or storage buffer) would eliminate per-instance CPU
   cost. But this changes the rendering architecture fundamentally.

3. **Double-buffering on GPU** — the current ping-pong lives in CPU Float32Arrays.
   Moving it to GPU storage buffers would enable compute-shader-to-render pipeline
   with zero readback.

4. **Hybrid CPU/GPU** — some tags (links, simple math) could stay on CPU while heavy
   rules move to GPU. The expression tag system would need to route to different
   backends per tag.

5. **Node type extensibility** — all 30+ node types are hardcoded in `builtinNodes.ts`.
   A plugin system for user-defined nodes is not yet implemented.

6. **Multi-simulation** — `SimulationManager` and `SimulationInstance` exist but
   multi-sim viewport support is incomplete. Each viewport could theoretically run
   an independent simulation, but the UI wiring is partial.

7. **3D performance** — 3D voxel grids at scale (64x64x64 = 262K visible voxels)
   hit the same InstancedMesh bottleneck. Volume rendering or marching cubes would
   be more appropriate.

---

## 16. Key Type Signatures Reference

```typescript
// === Rule System ===
type RuleFn = (ctx: RuleContext) => Record<string, number | number[]>;

interface RuleContext {
  cell: Record<string, number | number[]>;
  neighbors: Array<Record<string, number | number[]>>;
  grid: { width: number; height: number; depth: number; dimensionality: string };
  params: Record<string, number>;
  cellIndex: number;
  x: number; y: number; z: number;
  generation: number;
  dt: number;
}

// === Grid ===
interface GridConfig {
  dimensionality: '1d' | '2d' | '3d';
  width: number; height: number; depth: number;
  topology: 'toroidal' | 'finite';
  neighborhood: 'moore';
  useSharedBuffer?: boolean;
}

// === Node Graph ===
interface NodeGraph { nodes: NodeInstance[]; edges: Edge[]; }
interface CompilationResult { code: string; inputs: string[]; outputs: string[]; }

// === Expression Tags ===
interface ExpressionTag {
  id: string; name: string;
  owner: { type: 'cell-type' | 'environment' | 'global' | 'root'; id?: string };
  code: string; phase: 'pre-rule' | 'rule' | 'post-rule';
  enabled: boolean; source: 'code' | 'link' | 'script';
  inputs: string[]; outputs: string[];
  linkMeta?: LinkMeta; nodeGraph?: NodeGraph;
}

// === Pyodide Bridge ===
type PyodideStatus = 'idle' | 'loading' | 'ready' | 'error';
execExpressions(code, buffers, w, h, d, params, globals): Promise<Record<string, Float32Array>>;
execRule(code, buffers, w, h, d, params): Promise<Record<string, Float32Array>>;
execScript(code, params, globals, w, h, d): Promise<{ envChanges; varChanges }>;

// === Renderer ===
interface RendererConfig {
  canvas: HTMLCanvasElement;
  width: number; height: number;
  antialias?: boolean;
  backgroundColor?: number;
}
type GridRenderMode = '2d' | '1d-spacetime' | '3d';

// === Preset ===
interface PresetConfig {
  schema_version: '1';
  meta: { name: string; author?: string; description?: string };
  grid: { dimensionality: '1d'|'2d'|'3d'; width: number; height?: number; depth?: number; topology: 'toroidal'|'finite' };
  cell_properties: CellPropertyConfig[];
  cell_types?: CellTypeConfig[];
  rule: { type: 'typescript'|'wasm'|'python'; compute: string; wasm_module?: string };
  params?: ParamDefConfig[];
  visual_mappings?: VisualMappingConfig[];
  global_variables?: GlobalVariableDef[];
  global_scripts?: GlobalScriptDef[];
  parameter_links?: ParameterLinkConfig[];
  expression_tags?: ExpressionTagConfig[];
}
```
