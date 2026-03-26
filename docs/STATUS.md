# Lattice Project Status

**Version:** 1.1.0
**Last updated:** 2026-03-11

## Quick Start

```bash
pnpm dev          # Start dev server (default port 3000)
```

Open http://localhost:3000 in Chrome/Edge (WebGL required).

## User Guide

### What You See

A black canvas filling the screen with a green-on-black cellular grid (Conway's Game of Life, 128x128). Overlaid:

| Element | Location | Purpose |
|---------|----------|---------|
| **HUD** | Top-left | "Lattice", preset name, generation #, live cell count |
| **Preset Selector** | Top-right | Dropdown to switch between 6 simulations |
| **Control Bar** | Bottom-center | Play/Pause, Step, Step-back, Reset, Clear, Speed, Screenshot, Split |
| **Param Panel** | Right edge | Toggle with gear icon or **P** key — simulation parameters, grid config, rule editor, sparkline graphs |
| **Terminal** | Bottom | Toggle with **backtick** key — type commands or talk to AI |
| **Hotkey Help** | Overlay | Press **?** to see all keyboard shortcuts |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Space** | Play / Pause |
| **N** | Step forward |
| **B** | Step backward |
| **R** | Reset to generation 0 |
| **C** | Clear all cells |
| **T** | Toggle terminal |
| **P** | Toggle parameter panel |
| **F** | Toggle fullscreen viewport |
| **S** | Split into two viewports |
| **G** | Toggle grid lines |
| **?** | Show shortcut help |
| **Ctrl+Z** | Undo |
| **Ctrl+Shift+Z** | Redo |

### Mouse Controls (2D)

- **Left-click drag** — Draw cells
- **Right-click** — Erase cells
- **Middle-click drag** / **Shift+left drag** — Pan camera
- **Mouse wheel** — Zoom

### Terminal Commands

Open terminal with backtick, then type:

**Simulation:**
- `sim play` / `sim pause` / `sim step` / `sim step-back`
- `sim reset` / `sim clear` / `sim speed 30` / `sim seek 100`
- `sim status`

**Presets:**
- `preset load gray-scott` / `preset list`

**Parameters:**
- `param set F 0.05` — set a runtime parameter
- `param get F` — display current value
- `param list` — list all params with current values
- `param reset` — reset all to defaults

**Grid:**
- `grid resize 256 256` — resize grid (recreates simulation)
- `grid info` — show grid dimensions, topology, cell count

**Rule:**
- `rule show` — print current compute body
- `rule edit <body>` — replace compute body at runtime

**View:**
- `view zoom 2.5` / `view pan 10 20` / `view fit`
- `view split` / `view fullscreen`
- `view grid-lines on|off` — toggle grid line overlay

**Buffer:**
- `buffer resize 500` — resize circular frame buffer (clears existing data)
- `buffer clear` — clear the buffer without resizing

**Other:**
- `edit undo` / `edit redo` / `edit draw 5 5` / `edit erase 5 5`
- `edit brush-size 3`
- `viewport screenshot`
- Non-command text routes to AI assistant (requires OPENAI_API_KEY)

**Tab completion:**
- Press **Tab** to complete the current suggestion
- Press **Tab** again to cycle through alternatives (e.g., `g` Tab `grid info` Tab `grid resize`)
- Suggestions are ranked by frequency and recency — commands you use more often appear first
- Dot notation also works: `grid.resize 128 128`, `param.set F 0.05`

### 6 Built-in Presets

1. **Conway's GoL** — 2D cellular automaton (128x128) — params: surviveMin, surviveMax, birthCount
2. **Rule 110** — 1D elementary automaton as spacetime diagram (256 wide) — params: ruleNumber
3. **Langton's Ant** — 2D Turing machine ant (128x128)
4. **Brian's Brain** — 2D 3-state automaton (128x128)
5. **Gray-Scott** — 2D reaction-diffusion (128x128) — params: Du, Dv, F, k, dt
6. **Navier-Stokes** — 2D fluid dynamics (64x64) — params: viscosity, diffusion, dt

---

## Implemented Features

### Working

- **Simulation engine**: Domain-agnostic grid (1D/2D/3D), ping-pong double buffering, YAML preset loading, Zod schema validation, typed cell properties, configurable neighborhoods/topology, rule compiler
- **Runtime parameters**: Per-preset parameter definitions (name, type, min/max/step/default), wired through RuleRunner to ctx.params in compute bodies, WASM runner params injection
- **Grid configuration**: Resize grid at runtime (recreates simulation preserving preset/params), grid info inspector
- **Rule editing**: View and replace compute body at runtime with live recompilation
- **Rendering**: Three.js InstancedMesh (unified 1D/2D/3D), orthographic + perspective cameras, VisualMapper property-to-color, zero-copy buffer reads, GPU disposal, grid line overlay
- **Command system**: 35 commands, Zod param validation, three surfaces (GUI/CLI/AI)
- **Terminal**: Tab cycling through candidates, learning model (frequency + recency ranking), ghost text with arg hints, dot notation support, command history
- **UI**: HUD, ControlBar, PresetSelector, Terminal, ParamPanel (sliders, grid inputs, rule viewer/editor, sparklines), HotkeyHelp, multi-viewport, fullscreen
- **AI surface**: API route with GPT-4o streaming, RAG via Supabase pgvector, typo correction
- **Testing**: 590 tests across 61 test files

### Not Wired in Production

- **WASM acceleration** — Rust crate exists, `Simulation.create()` async loader exists, but production always uses `new Simulation()` synchronously (TS fallback)
- **Web Worker** — Protocol designed but never instantiated; simulation runs on main thread

---

## v1.1.0 Changelog (from v1.0)

### Runtime Parameter Controls
- Added `params` schema field to presets (name, type, min/max/step/default)
- Wired params through `Simulation.params` Map → `RuleRunner` → `ctx.params` in compute bodies
- All 4 parameterized presets (Conway's GoL, Rule 110, Gray-Scott, Navier-Stokes) now use `ctx.params.*` instead of hardcoded constants
- WASM runner reads params from provider instead of hardcoded values
- GUI: slider + numeric input per param in ParamPanel
- CLI: `param.set`, `param.get`, `param.list`, `param.reset`

### Grid Configuration
- `grid.resize` recreates simulation with new dimensions (preserves preset and params)
- `grid.info` displays current dimensions, topology, cell count
- Editable width/height inputs in ParamPanel

### Rule Viewer/Editor
- `rule.show` prints compute body to terminal
- `rule.edit` replaces compute body at runtime (recompiles via RuleCompiler)
- Collapsible code viewer + editor in ParamPanel

### Grid Lines
- `G` keyboard shortcut toggles grid line overlay
- `view.grid-lines on|off` terminal command
- THREE.LineSegments overlay on 2D grid

### Terminal Tab Cycling & Learning
- Tab cycles through completion candidates (categories, subcommands)
- Learning model tracks usage frequency and recency to rank suggestions
- Ghost text shows best-ranked suggestion first

---

## Vision vs. Reality Delta

See [KNOWN-ISSUES.md](./KNOWN-ISSUES.md) for tracked bugs.

| Vision Feature | Status | Notes |
|---------------|--------|-------|
| Universal grid engine | Done | |
| 6 built-in presets | Done | All load and run |
| Three Surface Doctrine | Done | 35 commands across GUI/CLI/AI |
| Runtime parameters | Done | Sliders, CLI, per-preset definitions |
| Grid configuration | Done | Resize, info, editable inputs |
| Rule editing | Done | View/edit compute body at runtime |
| GUI controls | Done | |
| CLI terminal | Done | Tab cycling, learning model, ghost text |
| AI assistant | Partial | Needs OPENAI_API_KEY |
| Keyboard shortcuts | Done | 13 shortcuts |
| Pan/zoom/orbit (mouse) | Done | |
| Pan/zoom (CLI commands) | Done | view:change events bridged to local camera |
| Multi-viewport | Done | |
| Parameter graphs | Done | Sparkline charts in ParamPanel |
| Grid lines | Done | Toggle via G key or CLI |
| Cell drawing/erasing | Done | |
| Undo/redo | Done | |
| Screenshot export | Done | |
| Timeline scrubber | Done | |
| Circular frame buffer | Done | Live mode, rAF loop, configurable buffer size |
| Node-based visual scripting | Done | React Flow editor, 27 node types, graph→Python compiler |
| Center zone layout tree | Done | Tabs/splits via LayoutRenderer, replaces hardcoded viewports |
| WASM acceleration | Not wired | Engine exists, never called in prod |
| Web Worker isolation | Not wired | Designed, never connected |

---

## Node Editor (v1.2)

### Architecture
- Center zone uses `LayoutRenderer` (recursive layout tree) instead of hardcoded viewports
- Default center: `TabsNode` with Viewport + Node Editor tabs
- NodeGraph engine is pure TypeScript, no React dependency — fully unit-testable
- `ExpressionTag.nodeGraph` optional field (same pattern as `linkMeta`)
- Graph→Python compilation via topological sort + per-node `compile()` functions
- Round-trip via `@nodegraph` JSON comment embedded in generated code

### Node Type Catalog (27 types)
- **Property**: PropertyRead, PropertyWrite, Constant, Time
- **Math**: Add, Subtract, Multiply, Divide, Negate, Abs, Power, Sqrt, Modulo, Sin, Cos, Floor, Ceil
- **Range**: RangeMap, Clamp, Smoothstep, Linear
- **Logic**: Compare, And, Or, Not, Select (np.where)
- **Utility**: Random, Sum, Mean, Max, Min, Count, Coordinates

### Commands (8 new)
- `node.compile`, `node.addNode`, `node.removeNode`, `node.connect`, `node.disconnect`, `node.openEditor`, `node.autoLayout`
- `ui.toggleNodeEditor` (E hotkey)

---

## Interactivity Sprint

### M1: Circular Buffer + Live Mode (Complete)

Replaced the linear pre-compute pipeline with a circular frame buffer and live mode.

**What changed:**
- **CircularFrameBuffer** (`src/engine/buffer/CircularFrameBuffer.ts`): ring buffer of interleaved GPU readback snapshots. Configurable capacity (10–2000 frames), auto-sized per grid targeting ~500MB RAM.
- **Live compute loop**: `requestAnimationFrame`-based (was `setInterval`). GPU ticks live each frame — no pre-compute wait. Buffer fills behind the playhead.
- **Scrubbing**: within buffer window = instant GPU upload. Beyond buffer = recompute from nearest cached frame or initial state.
- **Readback decimation**: large grids (>4MB/frame) skip readbacks to maintain framerate.
- **Timeline UI**: cyan buffer window indicator on minimap and ruler. Buffer utilization counter (`size/capacity`) in TimelineCounter.
- **Buffer settings**: ControlBar popover with size slider, RAM estimate, bytes/frame info, Clear Buffer button.
- **New commands**: `buffer.resize { frames }`, `buffer.clear`
- **New event**: `sim:bufferStatus` → simStore buffer fields
- **Removed**: old `gpuCacheFill()` offscreen runner, `Map<number, TickSnapshot>` frame cache, `computeFrames()`, `cacheCurrentFrame()`, `restoreFrame()`

### M1-fixup: Scrolling Timeline + Live Drawing (Complete)

**Scrolling timeline:**
- During live playback, the playhead stays centered and the timeline scrolls underneath — infinite forward scroll, no fixed end.
- Removed `smartExtendDuration()`, playback mode boundary checks (`once`/`loop`/`endless` in `playbackTick`), and duration ceiling clamping.
- Timeline duration auto-grows silently as generation advances.
- Auto-scroll driven by Zustand `subscribe` callback (synchronous with `setTick`) — not a React effect, which was too slow to keep up with the rAF tick loop.
- Reset snaps timeline to [0, 256] and re-emits `sim:play` if still playing so store stays in sync.

**Live drawing:**
- Drawing no longer pauses the simulation. Brush input writes directly to GPU buffer via `writeCellDirect()` — values are picked up by the next `tick()`.
- When paused: full undo history and state sync preserved.

### M2–M5: Planned
- M2: GPU brush compute shader, brush property mapping
- M3: Interaction scripts
- M4: Loop in/out point UI (AE-style, decoupled from buffer)
- M5: Performance profiling and optimization
