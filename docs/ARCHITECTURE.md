# Lattice Architecture

> **North star document.** If we lose context or drift, we come back here.

---

## Vision

Lattice is a universal simulation substrate. Cellular automata, reaction-diffusion, fluid dynamics, and any rule-based simulation are all just configuration files. The toolkit we use to build presets is the same toolkit users get. Everything is modular, customizable, and composable. A preset is just a YAML file describing how the building blocks are arranged — if users put in the work, they can build setups just as sophisticated as the built-in ones.

---

## Guiding Principles

1. **Modular everything.** Panels, cell types, rules, scripts, visual mappings — all pluggable building blocks. No hardcoded behavior that can't be overridden or composed.

2. **Three Surface Doctrine.** Every action is accessible through GUI panels, CLI terminal, and AI assistant. No surface has privileged logic. All three call `CommandRegistry.execute()`. This is the **foundational architectural constraint** — if a feature exists, it must be a command. If it's a command, every surface can invoke it. No exceptions. MCP and public API are future extensions of this same pattern (see below).

3. **YAML as universal API.** Presets, cell types, layouts, scripts — everything serializes to YAML. A preset file fully describes a simulation. URL hash encoding enables link sharing.

4. **Engine is source of truth.** Zustand stores are read-only mirrors. All mutations flow through commands → engine → EventBus → stores → render. Never bypass this.

5. **Python for users, TypeScript for us.** Built-in presets keep optimized TS/WASM fast paths. User-authored logic is Python (via Pyodide). Both paths coexist.

6. **Permanent fixtures.** Timeline and ControlBar are always pinned at top of bottom area. They are not panels — they are infrastructure.

---

## System Diagram

```
┌─ SURFACE LAYER ──────────────────────────────────────────────────────┐
│  GUI Panels     CLI Terminal     AI Assistant    MCP Server   Public  │
│  (React/TSX)    (autocomplete)   (OpenAI+tools)  (agents)    API     │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ CommandRegistry.execute()
                           │ (ALL surfaces use the same entry point)
┌──────────────────────────┴───────────────────────────────────────────┐
│ COMMAND LAYER                                                        │
│  CommandRegistry ─── SimulationController ─── KeyboardShortcutManager│
│                                                                      │
│  Layout commands     Sim commands     Script commands                 │
│  Link commands       Edit commands    Instance commands               │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ direct calls + EventBus
┌──────────────────────────┴───────────────────────────────────────────┐
│ ENGINE LAYER (pure TypeScript, no UI imports)                        │
│                                                                      │
│  ┌─ SimulationInstance ─────────────────────────────────────┐        │
│  │  Grid (1D/2D/3D ping-pong buffers, property channels)   │        │
│  │  <!-- Grid is a rank-3 tensor (W, H, P). Vec properties occupy consecutive channel slots. See Glossary. -->
│  │                                                         │        │
│  │  CellTypeRegistry (types, inheritance, property union)   │        │
│  │  RuleRunner (perceive → expressions → links → rule → tags)│       │
│  │  CommandHistory (undo/redo snapshots)                     │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                      │
│  ┌─ Scripting ──────────────────────────────────────────────┐        │
│  │  PyodideBridge (Web Worker, lazy-loaded)                  │        │
│  │  ExpressionCompiler (Python one-liners → vectorized numpy)│       │
│  │  GlobalScriptRunner (per-frame Python scripts)            │        │
│  │  GlobalVariableStore (key-value, addressable)             │        │
│  │  DependencyGraph (topological evaluation order)           │        │
│  │  NodeCompiler (node graph → Python scripts)               │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                      │
│  ┌─ Data ───────────────────────────────────────────────────┐        │
│  │  PropertyAddress (dot-path resolution)                    │        │
│  │  LinkRegistry (source → target with range + easing)       │        │
│  │  TagRegistry + TagRunner (stackable behaviors)            │        │
│  │  PresetSchema (Zod validation, YAML ↔ config)             │        │
│  │  Serializer (state → YAML) + URLCodec (YAML ↔ hash)      │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                      │
│  EventBus ── typed events ──→ wireStores ──→ Zustand stores          │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────────────┐
│ STORE LAYER (Zustand, read-only mirrors of engine state)             │
│  simStore    uiStore    viewStore    layoutStore    instanceStore     │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ React subscriptions
┌──────────────────────────┴───────────────────────────────────────────┐
│ RENDER LAYER                                                         │
│  LatticeRenderer (Three.js scene, animation loop)                    │
│  VisualMapper (cell props → color/size/shape, discrete/continuous/expr)│
│  CameraController / OrbitCameraController                            │
└──────────────────────────────────────────────────────────────────────┘
```

---

## App Shell: 4 Zones + Pinned Bar

```
┌──────────────┬───────────────────────┬──────────────┐
│ Left Drawer   │  Center               │ Right Drawer │
│ (cells)       │  (viewports)          │ (environment)│
│ collapsible   │  layout tree          │ collapsible  │
│ 280px default │                       │ 320px default│
├──────────────┴───────────────────────┴──────────────┤
│ [Timeline — full width, pinned]                      │
│ [ControlBar — full width, pinned]                    │
├──────────────────────────────────────────────────────┤
│ Bottom Drawer (terminal default, customizable)       │
│ collapsible, 200px default                           │
└──────────────────────────────────────────────────────┘
```

**Zone rules:**
- Each zone has its own layout subtree (splits, tabs, panels).
- Any panel type can go in any zone.
- Bottom drawer gets full width. Left/right drawers get remaining height (between top and Timeline).
- Timeline + ControlBar sit between center and bottom — they are never part of a zone's layout tree.
- Drawers can collapse/expand. Center zone always exists.
- Panel types can be moved between zones via commands (drag-and-drop is a later enhancement).

### Layout Tree

```typescript
type LayoutNode =
  | { type: 'split'; id: string; direction: 'h' | 'v'; children: LayoutNode[]; sizes: number[] }
  | { type: 'tabs'; id: string; children: LayoutNode[]; activeIndex: number }
  | { type: 'panel'; id: string; panelType: string; config?: Record<string, unknown> }
```

JSON-serializable. Stored in Zustand (`layoutStore`). All mutations via commands (`layout.split`, `layout.addTab`, `layout.removePanel`, `layout.toggleDrawer`, `layout.reset`). Recursive `LayoutRenderer` maps nodes to `SplitContainer`, `TabContainer`, or `PanelHost`.

**Doctrine note:** Layout mutations go through commands, not direct store writes. This means CLI commands like `layout.split` and AI tool calls can rearrange the panel layout — same power as dragging in the GUI.

---

## Cell Property System

### Cell Types

A cell type is a named collection of properties with optional parent inheritance.

```typescript
interface CellTypeDefinition {
  id: string;              // unique identifier
  name: string;            // display name
  parent?: string;         // parent type ID (for inheritance)
  color: string;           // display color (hex)
  properties: CellPropertyConfig[];
  rule?: string;           // Python rule function (overrides global rule for this type)
  tags?: TagInstance[];     // stackable behavior modifiers
}
```

### Inheritance

Child types inherit all parent properties and add their own. Property union determines grid buffer layout. The `_cellType` property (uint8, inherent) stores each cell's type ID.

```
BaseCell                    SpecialCell (extends BaseCell)
├── alive (bool)            ├── alive (bool)      ← inherited
├── age (int)          ├── age (int)     ← inherited
├── alpha (float)           ├── alpha (float)      ← inherited
└── _cellType (inherent)    ├── _cellType          ← inherited
                            └── energy (float)     ← added
```

### Inherent Properties

Every cell always has these — they are not user-removable:

| Property    | Type  | Default | Behavior                                    |
|-------------|-------|---------|---------------------------------------------|
| `alive`     | bool  | 0       | Core state flag                             |
| `age`       | int   | 0       | Ticks alive (sim steps). Resets on death. Derive other units (seconds, frames) via expressions. |
| `alpha`     | float | 1.0     | Visual opacity multiplier                   |
| `_cellType` | int   | 0       | Type ID (internal, not user-editable)       |

Position is implicit (`ctx.x`, `ctx.y`, `ctx.z`), not stored per-cell.

### Property Config (extended)

```typescript
interface CellPropertyConfig {
  name: string;
  type: CellPropertyType;        // 'bool' | 'int' | 'float' | 'vec2' | 'vec3' | 'vec4'
  default: number | number[];
  role?: PropertyRole;            // 'input' | 'output' | 'input_output'
  compute?: string;               // TypeScript compute body (existing, for built-in presets)
  expression?: string;            // Python expression (new, for user-authored logic)
}
```

---

## Scripting System

### Python via Pyodide

Python is the user-facing scripting language for everything: expressions, rules, global scripts, node logic. Pyodide (Python compiled to WASM) runs in a Web Worker.

**Loading strategy:**
1. App loads normally — no Pyodide overhead.
2. First script editor open or Python rule load triggers lazy-load.
3. ~6.4MB core + ~10MB numpy, cached via service worker.
4. Loading indicator shown during first load (~5-10s).

**Performance strategy:**
- Rule functions operate on the **entire grid at once** using numpy vectorized operations.
- Grid Float32Arrays are copied to numpy once per frame (~1-2ms for 512x512).
- Rule runs as vectorized numpy ops (~5-15ms).
- Results read back via zero-copy `getBuffer()`.
- Built-in presets keep their optimized JS/WASM paths.

### Three Scripting Modes

**1. Per-property expression** — Python one-liner attached to a single property.
```python
# On alpha: fade cell over age
clamp(1.0 - (cell.age / 100), 0, 1)
```

**2. Global script** — Free-standing Python that can read/write any parameter.
```python
# inputs: cell.alive, env.generation
# outputs: global.entropy, env.birthThreshold
import numpy as np
alive_grid = inputs["cell.alive"]
entropy = -np.sum(alive_grid * np.log2(alive_grid + 1e-10)) / alive_grid.size
outputs["global.entropy"] = entropy
if entropy < 0.1:
    outputs["env.birthThreshold"] = max(2, env.birthThreshold - 1)
```

**3. Global variable store** — First-class key-value store accessible from any script or expression.
```
global.entropy = 0.0       # float, updated by script
global.colorMode = "age"   # string, read by visual mapping
global.userSeed = 42       # int, used by random functions
```

### Expression Context

Available in every expression and script:

```python
cell       # dict of current cell's property values
neighbors  # list of neighbor cell dicts
grid       # { width, height, depth, dimensionality }
env        # dict of environment/sim parameters
glob       # global variable store
time       # current generation
dt         # time step
x, y, z    # cell position
value      # property's base value (for per-property expressions)

# Built-in functions:
wiggle, linear, clamp, random_val, smoothstep, noise
abs, min, max, sin, cos, floor, ceil
```

### Dependency Graph

Scripts and expressions declare their inputs (what they read) and outputs (what they write). The system builds a DAG and evaluates in topological order. Cycle detection reports errors.

### Node-Based Scripting

Nodes are visual representations of Python scripts. Each node has typed input/output ports. Wires show data flow. The node graph compiles to the same Python scripts — nodes are an authoring tool, not a separate runtime.

You can switch between node view and code view of the same logic. Node subgraphs can exist outside any property, feeding into multiple targets (C4D-style, unlike AE's per-layer model).

**Built-in node types:** Property, Math, Logic, Script, Constant, Time, Random, Visual.

---

## Parameter Addressing

Dot-path strings address any parameter in the system:

| Pattern              | Examples                           |
|----------------------|------------------------------------|
| `cell.<property>`    | `cell.alive`, `cell.age`      |
| `cell.<type>.<prop>` | `cell.special.energy`              |
| `env.<param>`        | `env.feedRate`, `env.killRate`     |
| `visual.<channel>`   | `visual.color`, `visual.size`      |
| `global.<var>`       | `global.entropy`, `global.myVar`   |

Addresses are used in: expressions, scripts, links, commands, serialization.

---

## Parameter Linking

C4D-style property-to-property linking with range mapping and easing:

```typescript
interface ParameterLink {
  source: string;       // address: "cell.age"
  target: string;       // address: "cell.alpha"
  sourceRange: [number, number];  // [0, 100]
  targetRange: [number, number];  // [1.0, 0.0]  (inverted = fade out)
  easing: EasingType;   // 'linear' | 'easeIn' | 'easeOut' | 'smoothstep' | ...
}
```

Links are resolved during the tick pipeline, after expressions and before rule execution.

---

## Visual Mapper Evolution

Three mapping modes:

| Mode         | Description                                    | Example                           |
|--------------|------------------------------------------------|-----------------------------------|
| `discrete`   | Exact value → color (existing)                 | `alive: 0→#000, 1→#0f0`          |
| `continuous`  | Range → interpolated color with easing         | `age: [0,100]→[green,black]` |
| `expression` | Python expression returning color/size/etc.    | `hsv(cell.age/100, 1, 1)`    |

---

## Data Flow

Every mutation follows the same path regardless of which surface initiates it (Three Surface Doctrine):

```
Any surface (GUI click, CLI command, AI tool call, MCP request, API endpoint)
  → CommandRegistry.execute(name, params)      ← single entry point, always
    → SimulationController / engine method
      → Engine mutates state
        → EventBus.emit(event, payload)
          → wireStores listener
            → Zustand store.setState()
              → React re-render
                → Three.js / DOM update
```

**No shortcutting.** A button onClick handler does NOT directly mutate engine state. It calls `commandRegistry.execute()`. This guarantees that CLI, AI, MCP, and API can always do exactly what the GUI can do.

For scripting:
```
Tick pipeline (per frame):
  1. Evaluate expressions (topological order)
  2. Resolve parameter links
  3. Execute rule (TS/WASM for built-in, Python for custom)
  4. Run tags (per-cell post-processing)
  5. Run global scripts (per-frame)
  6. Swap buffers
  7. Emit sim:tick
```

---

## Three Surface Doctrine (extended)

The Three Surface Doctrine is the single most important architectural constraint. It states:

> **Every capability of the application MUST be a registered command. Every registered command MUST be accessible from every surface. No surface has privileged logic.**

### Core surfaces (built)

| Surface | Entry point | How it invokes |
|---------|-------------|----------------|
| **GUI** | Button click, slider drag, panel interaction | `commandRegistry.execute(name, params)` |
| **CLI** | Terminal text input, autocomplete, ghost-text | `commandRegistry.execute(name, params)` |
| **AI** | OpenAI tool calls mapped to commands | `commandRegistry.execute(name, params)` |

All three surfaces converge on `CommandRegistry.execute()`. The registry validates params with Zod, executes the handler, and returns a typed result. No surface has special access to engine internals.

### Extended surfaces (planned)

| Surface | Transport | How it invokes |
|---------|-----------|----------------|
| **MCP Server** | JSON-RPC over stdio/SSE | Same `commandRegistry.execute()`, exposed as MCP tools |
| **Public API** | REST/WebSocket HTTP endpoints | Same `commandRegistry.execute()`, behind auth |

### MCP Integration

MCP (Model Context Protocol) lets external AI agents — Claude, GPT, local models, automation scripts — control Lattice as a tool. Because every action is already a command, the MCP server is a thin transport layer:

1. **MCP tool list** is auto-generated from `commandRegistry.list()`. Each command's Zod schema becomes the tool's input schema. Command descriptions become tool descriptions. Zero manual mapping.
2. **MCP tool execution** calls `commandRegistry.execute(name, params)` and returns the result as MCP tool output.
3. **MCP resources** expose read-only state: current grid snapshot, generation count, parameter values, preset metadata — all via existing store getters.
4. **Bidirectional events** via MCP notifications: `sim:tick`, `sim:presetLoaded`, etc. map directly from EventBus events.

The result: an external agent can load presets, adjust parameters, run simulations, read results, modify cell types, execute scripts, and control the entire environment — using the exact same command set available to the GUI, CLI, and built-in AI.

### Public API

A REST/WebSocket API for programmatic access without the MCP protocol:

- **REST endpoints**: `/api/commands/:name` → `commandRegistry.execute(name, body)`. Same commands, HTTP transport.
- **WebSocket**: Real-time event stream (sim:tick, state changes) + command execution.
- **Auth**: API key or session token. Rate limiting. Scoped permissions per key.
- **Use cases**: Dashboard integrations, CI/CD pipelines triggering simulation runs, external monitoring tools, mobile companion apps, educational platforms embedding Lattice.

### Doctrine enforcement

When adding ANY new feature:
1. Does it have a command? If not, create one.
2. Can the CLI invoke it? If not, fix the command interface.
3. Can the AI invoke it? If not, register it as a tool.
4. Will MCP/API consumers be able to invoke it? If not, the command needs better params/result types.

**If you find yourself writing logic inside a React component that doesn't go through `commandRegistry.execute()`, stop. Extract it into a command first.** The only exceptions are pure rendering logic (camera math, Three.js scene updates) and ephemeral UI state (hover effects, animation tweens).

---

## Independent Viewports

Each viewport can be its own simulation instance:

| Mode               | Description                                        |
|--------------------|----------------------------------------------------|
| **Shared**         | All viewports show same instance, different cameras |
| **Independent**    | Each viewport has own Grid + Rule + state           |
| **Linked playback**| Independent instances, synchronized play/pause/speed|

`SimulationInstance` wraps Grid + RuleRunner + state. `instanceStore` maps instance IDs to state. `SimulationController` manages multiple instances with an "active instance" for command routing.

---

## YAML as Universal Format

Everything serializes to YAML. A complete preset file captures:

```yaml
schema_version: "2"

meta:
  name: "My Simulation"
  author: "..."
  description: "..."
  tags: [...]

grid:
  dimensionality: "2d"
  width: 256
  height: 256
  topology: "toroidal"

cell_types:
  - id: "base"
    name: "Base Cell"
    color: "#4ade80"
    properties:
      - name: "alive"
        type: "bool"
        default: 0
        expression: null
      - name: "energy"
        type: "float"
        default: 1.0
        expression: "clamp(value - 0.01, 0, 1)"

rule:
  type: "python"
  compute: |
    import numpy as np
    alive = grid["alive"]
    neighbors = count_neighbors(alive)
    birth = (alive == 0) & (neighbors == 3)
    survive = (alive == 1) & ((neighbors == 2) | (neighbors == 3))
    result["alive"] = (birth | survive).astype(np.float32)

params:
  - name: "birthThreshold"
    type: "int"
    default: 3
    min: 1
    max: 8

visual_mappings:
  - property: "alive"
    channel: "color"
    mode: "discrete"
    mapping:
      "0": "#000000"
      "1": "#4ade80"

parameter_links:
  - source: "cell.age"
    target: "cell.alpha"
    sourceRange: [0, 100]
    targetRange: [1.0, 0.0]
    easing: "smoothstep"

global_scripts:
  - name: "entropy_monitor"
    inputs: ["cell.alive"]
    outputs: ["global.entropy"]
    code: |
      import numpy as np
      alive = inputs["cell.alive"]
      outputs["global.entropy"] = float(-np.sum(alive * np.log2(alive + 1e-10)) / alive.size)

global_variables:
  - name: "entropy"
    type: "float"
    default: 0.0

tags:
  - type: "aging"
    params: { rate: 1 }

layout:   # optional — panel arrangement
  center: { type: "panel", id: "v1", panelType: "viewport" }
  left: { type: "panel", id: "c1", panelType: "cellPanel" }
  right: { type: "panel", id: "p1", panelType: "paramPanel" }
  bottom: { type: "panel", id: "t1", panelType: "terminal" }

ai_context:
  description: "..."
  hints: [...]
```

### URL Sharing

1. User clicks "Share" → serialize to YAML.
2. Compress with pako/lz-string → base64 → URL hash.
3. Recipient opens URL → decode → load YAML → everything configures.
4. Users can also download/upload raw YAML files.

---

## Guiding Use Cases

These must work when the system is complete:

### 1. GoL with default setup (baseline)
Load `conways-gol.yaml`. Single cell type (base), boolean `alive`, B3/S23 rule (TypeScript fast path). Green/black discrete mapping. Play, pause, step, draw, undo, scrub timeline. **This is the zero-cost path — no Pyodide loaded.**

### 2. GoL with expression on alpha tied to age
Add expression `clamp(1.0 - (cell.age / 100), 0, 1)` to the `alpha` property. Cells fade out as they age. Triggers Pyodide lazy-load on first expression edit. Visual mapper reads alpha from buffer.

### 3. GoL with two cell types
Create "Red Cell" extending base with `kill_threshold: int = 4`. Assign red color. Global rule checks `_cellType` — base uses B3/S23, red cells die at 4+ neighbors. Left drawer shows two CellCards. Grid paint tool has type selector.

### 4. GoL with global script monitoring entropy
Add global script that reads `cell.alive` grid, computes Shannon entropy, writes to `global.entropy`. Add expression on `env.birthThreshold` that lowers threshold when entropy drops. Visible in GlobalVarPanel. Script runs once per frame (not per-cell).

### 5. Custom sim built entirely from scratch
User creates a new preset. Adds cell types with custom properties. Writes Python rule operating on numpy arrays. Adds visual mappings, links, global scripts. Saves as YAML. Everything is the same toolkit we use for built-in presets.

### 6. Sharing a sim via URL
User builds a custom sim. Clicks Share. URL encodes the full YAML. Recipient opens URL in browser. App loads, decodes hash, reconstructs the entire setup. No server needed.

### 7. External agent controlling a simulation via MCP
An external Claude agent connects to Lattice via MCP. It loads a preset (`preset.load`), adjusts parameters (`param.set`), runs 1000 steps (`sim.play` + `sim.seek`), reads the grid state, computes metrics, adjusts parameters again, and exports a screenshot (`viewport.screenshot`). The agent uses the exact same commands as a human clicking buttons — no special API, no privileged access. The Three Surface Doctrine means the agent is a first-class citizen.

### 8. CI pipeline running simulation benchmarks via Public API
A GitHub Actions workflow hits the Lattice REST API: loads each built-in preset, runs 100 frames, reads performance metrics (tick rate, memory), and fails the build if any preset regresses beyond thresholds. Same commands, HTTP transport.

---

## Existing Infrastructure (Reuse)

| Component              | Location                              | Reuse                               |
|------------------------|---------------------------------------|--------------------------------------|
| ResizeHandle           | `src/components/ui/ResizeHandle.tsx`  | SplitContainer panel resizing        |
| CommandRegistry        | `src/commands/CommandRegistry.ts`     | All new commands register here       |
| EventBus               | `src/engine/core/EventBus.ts`        | New events for scripting, types      |
| RuleCompiler pattern   | `src/engine/rule/RuleCompiler.ts`    | ExpressionCompiler follows same shape|
| wireStores pattern     | `src/commands/wireStores.ts`         | Wire layoutStore, instanceStore      |
| Worker infrastructure  | `src/engine/worker/`                 | Pyodide worker uses same protocol    |
| Zod schema validation  | `src/engine/preset/schema.ts`        | All new config validated with Zod    |
| Preset YAML loader     | `src/engine/preset/loader.ts`        | Schema v2 backward-compatible        |

---

## Roadmap Summary

| Phase | Name                     | Goal                                                        |
|-------|--------------------------|-------------------------------------------------------------|
| 0     | Architecture Document    | This document. North star.                                  |
| 1     | Layout Tree Foundation   | Recursive layout tree + panel registry. Refactor AppShell. Same visual output. |
| 2     | Left Drawer + Cell Cards | Left drawer UI shell. CellCard reads from CellPropertyRegistry. |
| 3     | Cell Type Engine         | CellTypeDefinition + CellTypeRegistry. GoL parity with single type. |
| 4     | Pyodide Integration      | Python runtime in Web Worker. Lazy loading. Grid transfer.  |
| 5     | Python Scripting         | Expressions, global scripts, global variable store.         |
| 6     | Parameter Linking        | C4D-style property-to-property links with range + easing.   |
| 7     | Multi-Cell Types + Tags  | Multiple types per grid. Stackable behavior tags.           |
| 8     | Node-Based Scripting     | Visual node editor as panel type. Compiles to Python.       |
| 9     | Independent Viewports    | Each viewport can be its own SimulationInstance.             |
| 10    | YAML + URL Sharing       | Full serialization. Share via URL hash.                     |
| 11    | MCP Server               | Expose CommandRegistry as MCP tools. External agent control. |
| 12    | Public API               | REST/WebSocket endpoints. Auth, rate limiting, CI/CD use cases. |

Each phase ends with full functionality of everything built so far. No phase breaks existing features.

**Three Surface Doctrine checkpoint at every phase:** Before a phase is considered complete, verify that every new command works from GUI, CLI, and AI. If MCP/API phases are complete, verify those surfaces too.

### Dependency Graph

```
P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 → P10
                       ↑         ↑                      ↓
                       └── P4 ───┘  (P3/P4 overlap)    P11 → P12
                                                    (MCP)  (API)
```

P11 (MCP) can begin any time after P10 — it only needs the command registry and serialization to be stable. P12 (Public API) extends P11 with HTTP transport and auth.

---

## Glossary

| Term              | Definition                                                       |
|-------------------|------------------------------------------------------------------|
| **Cell type**     | Named collection of properties. Defines what data a cell stores. |
| **Property**      | A typed data channel stored per-cell (bool, int, float, vec).    |
| **Inherent property** | Property every cell has (alive, age, alpha, _cellType). |
| **Expression**    | Python one-liner attached to a property, evaluated per-tick.     |
| **Global script** | Free-standing Python that can read/write any parameter per-frame.|
| **Global variable** | Named value in a shared store, addressable as `global.*`.     |
| **Tag**           | Stackable behavior modifier attached to a cell type.             |
| **Link**          | Property-to-property connection with range mapping and easing.   |
| **Panel**         | A registered UI component (viewport, terminal, cellPanel, etc.). |
| **Zone**          | Layout area: left drawer, center, right drawer, bottom drawer.   |
| **Drawer**        | Collapsible side/bottom zone wrapping a layout subtree.          |
| **Layout tree**   | Recursive JSON structure of splits, tabs, and panels.            |
| **Preset**        | YAML file fully describing a simulation setup.                   |
| **Address**       | Dot-path string identifying any parameter (`cell.alive`, `env.feedRate`). |
| **Node**          | Visual block in the node editor representing a Python operation. |
| **Instance**      | Independent simulation with its own Grid, Rule, and state.       |
| **Surface**       | A way to invoke commands: GUI, CLI, AI, MCP, or public API.     |
| **MCP**           | Model Context Protocol. JSON-RPC transport for external AI agents to call commands. |
| **Public API**    | REST/WebSocket HTTP endpoints exposing commands to external clients. |
| **Command**       | A registered, named action with Zod-validated params and typed result. The atomic unit of the Three Surface Doctrine. |
| **Tensor (rank-n)** | The grid is a rank-3 tensor `(W, H, P)` where W/H are spatial dimensions and P is total property channels. A single cell is a rank-1 slice (vector). The timeline adds a 4th dimension `(T, W, H, P)`. Vec properties (vec2/vec3/vec4) occupy consecutive channel indices within P. |
