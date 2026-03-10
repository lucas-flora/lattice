# Architecture Research

**Domain:** Universal simulation substrate / cellular automata web app
**Researched:** 2026-03-10
**Confidence:** HIGH (core patterns) / MEDIUM (WASM bridge specifics)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          SURFACE LAYER (Three Equal Surfaces)            │
│  ┌─────────────────┐  ┌────────────────────────┐  ┌────────────────┐    │
│  │   GUI Panel     │  │   Terminal / CLI        │  │  AI Assistant  │    │
│  │ (React/Tailwind)│  │  (shared component)     │  │ (OpenAI API)   │    │
│  └────────┬────────┘  └──────────┬─────────────┘  └───────┬────────┘    │
│           │                      │                          │             │
├───────────┴──────────────────────┴──────────────────────────┴────────────┤
│                          ZUSTAND STORE LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │  simStore    │  │  viewStore   │  │  uiStore     │  │  aiStore    │  │
│  │(grid state   │  │(viewport/cam)│  │(panels, HUD) │  │(chat, cmds) │  │
│  │ mirror only) │  │              │  │              │  │             │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │
│         │                 │                  │                  │         │
├─────────┴─────────────────┴──────────────────┴──────────────────┴─────────┤
│                          ENGINE LAYER (Pure TypeScript, no UI deps)       │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │                        SimulationEngine                           │     │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐    │     │
│  │  │  GridState  │  │  RuleRunner  │  │  TimelineController  │    │     │
│  │  │(typed array │  │(TS fallback +│  │(step, play, seek,    │    │     │
│  │  │ ping-pong)  │  │ WASM module) │  │ undo/redo stack)     │    │     │
│  │  └──────┬──────┘  └──────┬───────┘  └──────────────────────┘    │     │
│  │         │                │                                        │     │
│  │  ┌──────┴──────┐  ┌──────┴───────┐                               │     │
│  │  │ PresetLoader│  │ CellProperty │                               │     │
│  │  │(YAML→config)│  │   System     │                               │     │
│  │  └─────────────┘  └──────────────┘                               │     │
│  └──────────────────────────────────────────────────────────────────┘     │
├───────────────────────────────────────────────────────────────────────────┤
│                          WASM COMPUTE LAYER                               │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │   Rust / wasm-pack modules (rule execution, neighbor counting)    │     │
│  │   SharedArrayBuffer bridge to engine GridState typed arrays       │     │
│  └──────────────────────────────────────────────────────────────────┘     │
├───────────────────────────────────────────────────────────────────────────┤
│                          RENDERING LAYER (Three.js)                       │
│  ┌────────────────────────────────────────────────────────────────┐       │
│  │                    ThreeRenderer                                │       │
│  │  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐    │       │
│  │  │ InstancedMesh│  │VisualMapper   │  │ ViewportManager  │    │       │
│  │  │ (cells)      │  │(cell prop →   │  │(multi-viewport,  │    │       │
│  │  │              │  │ color/size/   │  │ camera per view) │    │       │
│  │  │              │  │ shape/orient) │  │                  │    │       │
│  │  └──────────────┘  └───────────────┘  └──────────────────┘    │       │
│  └────────────────────────────────────────────────────────────────┘       │
├───────────────────────────────────────────────────────────────────────────┤
│                          EXTERNAL SERVICES                                │
│  ┌──────────────────┐  ┌───────────────────────────────────────────┐      │
│  │  OpenAI API      │  │  Supabase (pgvector RAG + preset storage) │      │
│  └──────────────────┘  └───────────────────────────────────────────┘      │
└───────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| SimulationEngine | Source of truth — owns grid state, step logic, timeline | Zustand stores (push updates), WASM modules (compute), ThreeRenderer (raw typed array) |
| GridState | Ping-pong double buffer using Float32Array/Uint8Array for current/next grid | SimulationEngine, WASM bridge (SharedArrayBuffer) |
| RuleRunner | Executes the active preset's rule — delegates to WASM if available, TS fallback otherwise | GridState (read/write), PresetLoader (rule def) |
| CellPropertySystem | Defines static params and computed functions for cells; composes inputs/outputs | PresetLoader (schema definition), VisualMapper (output values), RuleRunner (input values) |
| PresetLoader | Parses YAML, validates schema, returns a fully typed SimConfig | CellPropertySystem, RuleRunner, SimulationEngine |
| TimelineController | Manages play/pause/step/seek, undo/redo stack using command pattern | SimulationEngine, GridState (snapshot stack) |
| ThreeRenderer | Pure rendering — reads typed array from engine, updates InstancedMesh per frame | GridState (typed array reference), VisualMapper, ViewportManager |
| VisualMapper | Maps any cell property value → visual parameter (color, size, orientation, shape) | CellPropertySystem (property values), ThreeRenderer (output) |
| ViewportManager | Manages independent cameras and scene views for multi-viewport mode | ThreeRenderer |
| Zustand simStore | UI-facing mirror of engine state — triggers React re-renders | SimulationEngine (subscribes to updates), all surface layer components |
| Terminal | Shared surface for CLI commands, app logs, and AI chat input/output | CommandRegistry (command execution), aiStore (chat state) |
| CommandRegistry | Single catalog of all commands — same entries execute GUI actions, CLI commands, and AI tool calls | SimulationEngine, all Zustand stores |
| AI Assistant | Reads full app context, executes commands via CommandRegistry, streams responses | CommandRegistry, aiStore, Supabase RAG (context retrieval) |

## Recommended Project Structure

```
src/
├── engine/                  # Pure TypeScript engine — zero UI dependencies
│   ├── core/
│   │   ├── SimulationEngine.ts     # Orchestrator: step loop, event emission
│   │   ├── GridState.ts            # Ping-pong buffer, typed array management
│   │   ├── TimelineController.ts   # Play/pause/seek, undo/redo command stack
│   │   └── types.ts                # SimConfig, CellState, GridDimensions
│   ├── cell/
│   │   ├── CellPropertySystem.ts   # Property definitions, computed functions
│   │   └── CellPropertyTypes.ts    # Static params, computed param interfaces
│   ├── rule/
│   │   ├── RuleRunner.ts           # Dispatch: WASM if available, TS fallback
│   │   ├── RuleTypes.ts            # Rule interface all rules must implement
│   │   └── builtin/                # TS implementations of all built-in rules
│   │       ├── GameOfLife.ts
│   │       ├── Rule110.ts
│   │       ├── LangtonsAnt.ts
│   │       ├── BriansBrain.ts
│   │       ├── GrayScott.ts
│   │       └── NavierStokes.ts
│   ├── preset/
│   │   ├── PresetLoader.ts         # YAML → SimConfig validation and transform
│   │   ├── PresetSchema.ts         # Zod schema for YAML format (meta, grid, cell_properties, rule, visual_mappings, ai_context)
│   │   └── builtins/               # YAML files for built-in presets
│   └── export/
│       ├── GifExporter.ts
│       ├── CsvExporter.ts
│       └── AsciiExporter.ts
│
├── wasm/                    # Rust → WASM modules (compiled output + TS bindings)
│   ├── pkg/                 # wasm-pack output (auto-generated)
│   └── src/                 # Rust source
│       ├── lib.rs
│       ├── game_of_life.rs
│       ├── gray_scott.rs
│       └── navier_stokes.rs
│
├── renderer/                # Three.js rendering — reads engine state, no business logic
│   ├── ThreeRenderer.ts     # Scene setup, animation loop, canvas management
│   ├── InstancedCellMesh.ts # InstancedMesh with per-instance transform updates
│   ├── VisualMapper.ts      # Cell property value → Three.js visual parameter
│   ├── ViewportManager.ts   # Multi-viewport: cameras, scissors, render targets
│   └── ShaderMaterials.ts   # Custom GLSL shaders for GPU-accelerated viz
│
├── store/                   # Zustand stores — UI mirror of engine state
│   ├── simStore.ts          # Grid snapshot, step count, preset, running state
│   ├── viewStore.ts         # Viewport configs, camera states
│   ├── uiStore.ts           # Panel layout, HUD state, modal state
│   └── aiStore.ts           # Chat history, active session, command suggestions
│
├── commands/                # CommandRegistry — Three Surface Doctrine core
│   ├── CommandRegistry.ts   # Central catalog with execute(), list(), help()
│   ├── CommandTypes.ts      # Command interface with GUI/CLI/AI metadata
│   └── definitions/         # Individual command implementations
│       ├── simulation.ts    # play, pause, step, seek, reset, load-preset
│       ├── grid.ts          # resize, set-cell, clear, randomize
│       ├── viewport.ts      # add-viewport, remove-viewport, set-camera
│       └── export.ts        # export-gif, export-csv, export-ascii
│
├── components/              # React/Next.js UI components — surface layer
│   ├── Terminal/            # Shared log + CLI + AI chat surface
│   │   ├── Terminal.tsx
│   │   ├── CliInput.tsx     # Ghost-text autocomplete from CommandRegistry
│   │   └── LogStream.tsx
│   ├── ControlPanel/        # Playback, preset, grid controls
│   ├── Viewport/            # Three.js canvas mount + ViewportManager bridge
│   ├── HUD/                 # Hotkeys, contextual menus, cell inspector
│   └── Layout/              # Modular, resizable panel system
│
├── ai/                      # AI assistant integration
│   ├── AiAssistant.ts       # OpenAI API client, context builder, tool calls
│   ├── ContextBuilder.ts    # Serializes full app state for AI context window
│   ├── tools.ts             # AI tool definitions mapped to CommandRegistry
│   └── rag/
│       ├── SupabaseClient.ts
│       └── EmbeddingSearch.ts
│
└── app/                     # Next.js App Router
    ├── layout.tsx
    ├── page.tsx             # Main simulation workspace
    └── api/
        ├── ai/route.ts      # OpenAI streaming endpoint
        └── presets/route.ts # Community preset discovery / upload
```

### Structure Rationale

- **engine/:** Isolated from all UI — engine can be tested in Node.js with no browser APIs. This boundary is the most important constraint in the project.
- **wasm/:** Separate from engine because it requires a build pipeline (wasm-pack) and has async initialization. Engine's RuleRunner treats WASM as an optional accelerator, not a dependency.
- **renderer/:** Separate from engine because it requires DOM and WebGL — Two.js cannot run server-side. Renderer reads typed arrays from GridState, never calls engine methods.
- **store/:** Zustand stores are the engine-to-React bridge. They subscribe to engine events and republish state as React-observable atoms. They do not hold canonical state.
- **commands/:** CommandRegistry is the architectural hub of Three Surface Doctrine. All three surfaces (GUI, CLI, AI) call the same execute() path. No surface has privileged access.
- **components/Terminal/:** One terminal component serves three roles (logs, CLI, AI chat) — shared infrastructure reduces surface area and ensures consistent UX across modes.

## Architectural Patterns

### Pattern 1: Perceive-Update (CA Standard)

**What:** Every simulation step is decomposed into two phases: perceive (gather neighborhood information for each cell) then update (apply rule to compute next state). From the CAX framework (ICLR 2025 Oral).
**When to use:** Always — this is the universal pattern for all CA types. Both discrete (GoL) and continuous (Gray-Scott, Navier-Stokes) fit this model.
**Trade-offs:** Clean mental model; the split enforces that update logic never reads from the "next" buffer mid-step, preventing asymmetric propagation bugs.

```typescript
// RuleRunner.ts — schematic
interface Rule {
  perceive(grid: GridState, x: number, y: number): NeighborhoodView;
  update(cell: CellState, neighborhood: NeighborhoodView): CellState;
}

function step(grid: GridState, rule: Rule): void {
  // Perceive all, then update all — never mix reads from next buffer
  const perceptions = grid.current.map((cell, idx) =>
    rule.perceive(grid, idxToX(idx), idxToY(idx))
  );
  grid.next.forEach((_, idx) => {
    grid.next[idx] = rule.update(grid.current[idx], perceptions[idx]);
  });
  grid.swap(); // ping-pong: next becomes current
}
```

### Pattern 2: Ping-Pong Double Buffer

**What:** Grid state lives in two typed arrays (current, next). Each step reads from current, writes to next, then swaps. The renderer always reads from current, which is never modified during a step.
**When to use:** Always for grid-based simulations. Without this, cell updates in one direction propagate asymmetrically within the same step.
**Trade-offs:** 2x memory for the grid (acceptable — Float32Array is compact). Enables lock-free reads from the renderer because current is immutable during computation.

```typescript
// GridState.ts — schematic
class GridState {
  private buffers: [Float32Array, Float32Array];
  private activeIdx = 0;

  get current(): Float32Array { return this.buffers[this.activeIdx]; }
  get next(): Float32Array { return this.buffers[1 - this.activeIdx]; }

  swap(): void { this.activeIdx = 1 - this.activeIdx; }
}
```

### Pattern 3: Command Registry (Three Surface Doctrine)

**What:** Every action in the system is registered as a Command object with a name, description, parameters, and execute() function. GUI buttons, CLI commands, and AI tool calls all invoke the same registry entry. No surface has any logic the others lack.
**When to use:** For every user-facing action. This is the architectural enforcement mechanism for Three Surface Doctrine.
**Trade-offs:** Additional indirection — worth it. Autocomplete, help text, AI tool definitions, and keyboard shortcuts are all generated from the same registry. One place to add a feature, three surfaces get it.

```typescript
// CommandTypes.ts — schematic
interface Command<P extends Record<string, unknown> = Record<string, unknown>> {
  name: string;            // e.g. "simulation.play"
  description: string;     // shown in CLI help and AI context
  params: CommandParam[];  // typed parameter definitions
  execute: (params: P) => void | Promise<void>;
}

// All three surfaces call this:
CommandRegistry.execute("simulation.load-preset", { name: "game-of-life" });
```

### Pattern 4: Engine-Store Separation (Engine as Source of Truth)

**What:** SimulationEngine is the authoritative source of truth. Zustand stores are read-only mirrors that re-publish engine events as React-observable state. UI components never mutate engine state directly — they call CommandRegistry.
**When to use:** Always — this prevents the "two masters" problem where UI state and engine state diverge.
**Trade-offs:** Requires defining a clean event protocol between engine and stores. Subscription setup adds ~20 lines of wiring code per store. Worth it for testability and predictability.

```typescript
// simStore.ts — schematic (Zustand)
const useSimStore = create<SimStore>((set) => {
  // Subscribe to engine events on store creation
  SimulationEngine.on("stepped", (snapshot) => {
    set({ currentStep: snapshot.step, generation: snapshot.generation });
  });
  SimulationEngine.on("preset-loaded", (config) => {
    set({ activePreset: config.meta.name, dimensions: config.grid });
  });
  return { currentStep: 0, generation: 0, activePreset: null };
});
```

### Pattern 5: WASM as Optional Accelerator

**What:** RuleRunner checks if a WASM module is available for the current rule. If yes, it delegates to WASM (passing a SharedArrayBuffer view of the grid). If not, it falls back to the TypeScript implementation. Both paths produce identical output.
**When to use:** For all performance-critical rules (Gray-Scott, Navier-Stokes, large GoL grids). The TS fallback allows the engine to work without WASM initialization completing.
**Trade-offs:** Maintaining dual implementations (TS + Rust) for complex rules. Mitigated by the TS implementation serving as a specification/reference that the Rust implementation must match.

```typescript
// RuleRunner.ts — schematic
async function step(grid: GridState, rule: RuleConfig): Promise<void> {
  const wasmModule = WasmRegistry.get(rule.id);
  if (wasmModule && grid.supportsSharedBuffer) {
    // Zero-copy path: WASM reads/writes shared memory directly
    wasmModule.step(grid.sharedBuffer, grid.width, grid.height);
    grid.swap();
  } else {
    // Pure TS fallback
    stepTypeScript(grid, rule);
  }
}
```

## Data Flow

### Simulation Step Flow

```
User clicks "Play" (or types "simulation.play" in CLI, or asks AI)
    ↓
CommandRegistry.execute("simulation.play")
    ↓
SimulationEngine.play()
    ↓ (each tick, via requestAnimationFrame or setInterval)
TimelineController.tick()
    ↓
RuleRunner.step(gridState, activeRule)
    ├── [WASM path] WasmModule.step(sharedBuffer) → gridState.swap()
    └── [TS fallback] perceive → update → gridState.swap()
    ↓
SimulationEngine.emit("stepped", snapshot)
    ↓
    ├── simStore.set(snapshot)  →  React re-renders control panel
    └── ThreeRenderer.onStep()  →  InstancedCellMesh.update(gridState.current)
                                    → Visual mapper applies color/size/shape
                                    → Three.js renders frame
```

### Preset Load Flow

```
User selects preset YAML (GUI, CLI, or AI command)
    ↓
CommandRegistry.execute("simulation.load-preset", { name: "gray-scott" })
    ↓
PresetLoader.load("gray-scott.yaml")
    ↓ (parse YAML, validate with Zod schema)
SimConfig { meta, grid, cell_properties, rule, visual_mappings, ai_context }
    ↓
SimulationEngine.loadConfig(config)
    ├── GridState.resize(config.grid.dimensions)    — reallocates typed arrays
    ├── CellPropertySystem.configure(config.cell_properties)
    ├── RuleRunner.setRule(config.rule)             — loads WASM if available
    ├── VisualMapper.configure(config.visual_mappings)
    └── emit("preset-loaded", config)
    ↓
simStore, viewStore update  →  UI re-renders to reflect new preset
```

### AI Assistant Flow

```
User types in AI chat: "Make the feed rate 0.055"
    ↓
AiAssistant.sendMessage(userText, appContext)
    ↓ (context includes: active preset config, current step, grid dimensions,
       available commands from CommandRegistry)
OpenAI API (GPT-4o) with tool_calls enabled
    ↓ (AI selects tool: "simulation.set-param")
AiAssistant.executeTool("simulation.set-param", { param: "f", value: 0.055 })
    ↓
CommandRegistry.execute("simulation.set-param", { param: "f", value: 0.055 })
    ↓
SimulationEngine updates CellPropertySystem → rule param changes live
    ↓
Response streamed back to Terminal AI chat pane
```

### Three.js Render Flow (per frame)

```
requestAnimationFrame
    ↓
ThreeRenderer.render()
    ↓
InstancedCellMesh.syncFromGrid(gridState.current)
    ├── For each active cell:
    │   ├── VisualMapper.getColor(cellValue, propertyName)  → instanceColor
    │   ├── VisualMapper.getScale(cellValue, propertyName)  → instanceMatrix
    │   └── setMatrixAt(idx, matrix) + setColorAt(idx, color)
    └── instancedMesh.instanceMatrix.needsUpdate = true
    ↓
ViewportManager.renderAll(scene, renderer)
    ↓ (scissor test per viewport)
    For each viewport: renderer.setScissor → renderer.render(scene, camera)
```

## Scaling Considerations

| Concern | At 100x100 grid | At 1000x1000 grid | At 3D 100x100x100 |
|---------|----------------|-------------------|--------------------|
| Grid memory | ~40KB Float32 — trivial | ~4MB Float32 — fine | ~4MB Float32 — fine |
| Per-step compute | TS is fine | WASM required | WASM required + consider GPU compute |
| InstancedMesh updates | Fast — 10K instances | Acceptable — 1M instances, need frustum cull | Need LOD + culling |
| Undo/redo snapshots | Full grid copy cheap | Full copy = 4MB per step — limit depth | Limit depth, use delta encoding |
| SharedArrayBuffer | No benefit at this size | Large benefit — avoids 4MB copy per step | Essential |

### Scaling Priorities

1. **First bottleneck:** Rule compute. TypeScript neighborhoodscan becomes too slow at ~500x500. WASM from the start means this scales to 1000x1000 without rewrite.
2. **Second bottleneck:** InstancedMesh synchronization. At 1M+ cells, per-frame typed array scans hurt. Solution: only update dirty cells (change tracking in GridState), or GPU texture-based rendering (cells as pixel data → shader reads directly).
3. **Third bottleneck:** Undo/redo memory. Storing full Float32Array snapshots at 4MB each and 100 history depth = 400MB. Mitigation: compress snapshots or store delta diffs.

## Anti-Patterns

### Anti-Pattern 1: UI Component Mutates Engine State Directly

**What people do:** Call `SimulationEngine.grid[x][y] = newValue` from a React component or event handler.
**Why it's wrong:** Bypasses the command system, breaks undo/redo, creates race conditions with the render loop, and makes it impossible to replay actions via CLI or AI.
**Do this instead:** Call `CommandRegistry.execute("grid.set-cell", { x, y, value })` from every surface. Engine handles the mutation.

### Anti-Pattern 2: Storing Engine State in Zustand as Primary State

**What people do:** Let Zustand stores be the source of truth. Components read from store, mutations go into store actions.
**Why it's wrong:** Engine step loop runs independently of React render cycles. If the store is canonical, the simulation must block on React — crushing performance. Also, the engine becomes untestable outside React.
**Do this instead:** Engine owns truth. Stores are read-only mirrors. Engine emits events; stores subscribe and re-publish.

### Anti-Pattern 3: Separate Renderers for 1D/2D/3D

**What people do:** Use a canvas/DOM renderer for 1D (row history), a 2D canvas for 2D grids, and Three.js only for 3D.
**Why it's wrong:** Three renderers means three visual mapping systems, three viewport management systems, three camera systems. Multi-viewport becomes impossible.
**Do this instead:** Use Three.js for all dimensions. 1D Rule 110 is a 2D plane of cells (width × history depth). 2D GoL is a flat mesh. 3D automata is a volume. InstancedMesh handles all cases.

### Anti-Pattern 4: Checking CA Type in Rule Logic

**What people do:** Write `if (ruleType === "game-of-life") { ... } else if (ruleType === "gray-scott") { ... }` in RuleRunner.
**Why it's wrong:** Violates the universality of the substrate. Adding a new simulation type requires modifying core engine code.
**Do this instead:** RuleRunner accepts any object implementing the Rule interface. All CA-specific logic lives inside the Rule implementation (built-in or WASM module). RuleRunner is type-agnostic.

### Anti-Pattern 5: Tight WASM Coupling (Treating WASM as Required)

**What people do:** Make the engine wait for WASM to initialize before the simulation can start. Error out if WASM module isn't found for a rule.
**Why it's wrong:** WASM initialization is async and can fail in some browser contexts. It blocks first interactivity. And some rules are fast enough in TS.
**Do this instead:** TypeScript implementation is always present as fallback. WASM is a transparent accelerator the engine prefers when available. User never sees a WASM error.

### Anti-Pattern 6: AI Assistant With Direct Engine Access (Bypassing Commands)

**What people do:** Give the AI assistant direct function references into the engine — `tools: { setParam: engine.setParam.bind(engine) }`.
**Why it's wrong:** Bypasses undo/redo, logging, and the command audit trail. AI actions become opaque and irreversible.
**Do this instead:** AI tool definitions map exactly to CommandRegistry entries. AI executes commands the same way a CLI or button does.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| OpenAI API | Server-side Next.js API route (`/api/ai`) streams responses to client. Client sends serialized app context + tool definitions | Keep API key server-side. Context window budget matters — ContextBuilder must be selective about what state to include |
| Supabase pgvector | Client calls Supabase JS SDK for embedding search (CA docs, preset descriptions). Server API route handles preset CRUD | RAG lookup augments AI context before sending to OpenAI. Preset community table is public read, authenticated write |
| wasm-pack | Build-time: `wasm-pack build --target web` outputs to `wasm/pkg/`. Runtime: async `import()` of the WASM module | Must configure COOP/COEP headers in Next.js for SharedArrayBuffer support. See `next.config.js` headers |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Engine ↔ Zustand stores | Engine emits typed events via EventEmitter. Stores subscribe on initialization | One-directional: engine → store. Store never writes back to engine |
| Engine ↔ ThreeRenderer | ThreeRenderer holds a reference to GridState and reads `current` typed array each frame | One-directional: renderer reads, never writes. No need for events — renderer polls on rAF |
| Engine ↔ WASM module | RuleRunner calls exported WASM functions, passes SharedArrayBuffer pointer | WASM must be initialized before first step. RuleRunner checks readiness flag |
| CommandRegistry ↔ all surfaces | All surfaces call `CommandRegistry.execute(name, params)`. Registry dispatches to engine methods | Synchronous for most commands; async for preset load and AI-executed commands |
| AI ↔ CommandRegistry | AI tool call response → `AiAssistant.executeTool()` → `CommandRegistry.execute()` | Same path as GUI and CLI. AI gets confirmation message with what was executed |
| PresetLoader ↔ CellPropertySystem | PresetLoader validates YAML then passes `cell_properties` section to CellPropertySystem.configure() | CellPropertySystem schema must be defined before PresetLoader schema — dependency order |
| Terminal ↔ CommandRegistry | CLI input parses command name + args, calls `CommandRegistry.execute()`. Ghost-text autocomplete queries `CommandRegistry.list()` | Terminal is pure UI — it does not contain command logic |

## Build Order Implications

Components must be built in dependency order. Earlier items have no dependencies on later items.

```
Phase 1 — Core substrate (everything else depends on this)
  GridState → CellPropertySystem → PresetSchema → PresetLoader
  (No rendering, no UI, no WASM — just the data model and types)

Phase 2 — Engine and rule execution
  SimulationEngine → RuleRunner → TimelineController
  Built-in TS rules (GoL, Rule 110, Brian's Brain — simpler ones first)
  (Pure engine, testable in Node.js)

Phase 3 — Rendering
  ThreeRenderer → InstancedCellMesh → VisualMapper
  (Requires engine from Phase 2; no UI components yet)

Phase 4 — Command system and state bridge
  CommandRegistry → command definitions → Zustand stores
  (Requires engine from Phase 2; enables Three Surface Doctrine)

Phase 5 — Surface layer
  Terminal component → CLI autocomplete
  GUI control panels
  (Requires CommandRegistry from Phase 4)

Phase 6 — WASM acceleration
  Rust rule implementations → wasm-pack build → WasmRegistry in RuleRunner
  (Engine TS fallback must already work; WASM replaces compute, not design)

Phase 7 — AI surface
  ContextBuilder → tool definitions → AiAssistant → Supabase RAG
  (Requires CommandRegistry from Phase 4; AI surface uses same commands)

Phase 8 — Advanced rendering features
  ViewportManager (multi-viewport) → complex presets (Gray-Scott, Navier-Stokes)
  (Requires solid VisualMapper from Phase 3)

Phase 9 — Community and export
  Export system (GIF, CSV, ASCII) → Supabase preset discovery/upload
```

The critical insight: **the engine must be buildable and testable before any UI exists.** This boundary is what makes each subsequent phase independently verifiable.

## Sources

- [CAX: Cellular Automata Accelerated in JAX (ICLR 2025 Oral)](https://arxiv.org/abs/2410.02651) — Perceive/update architecture pattern, unifying framework design
- [Conway's Game of Life in Three.js with Renderbuffers — Codrops](https://tympanus.net/codrops/2022/11/25/conways-game-of-life-cellular-automata-and-renderbuffers-in-three-js/) — Ping-pong buffer pattern in Three.js, GPU-side compute
- [3D Cellular Automata with Three.js — GitHub](https://github.com/its-hmny/3D-Cellular-Automata) — Next.js + Three.js CA architecture reference
- [Three.ez InstancedMesh2 — Three.js Discourse](https://discourse.threejs.org/t/three-ez-instancedmesh2-enhanced-instancedmesh-with-frustum-culling-fast-raycasting-bvh-sorting-visibility-management-lod-skinning-and-more/69344) — Per-instance frustum culling for large cell counts
- [Web Workers + SharedArrayBuffer — Medium](https://medium.com/@maximdevtool/web-workers-sharedarraybuffer-parallel-computing-for-heavy-algorithms-in-frontend-662391ae0558) — Zero-copy WASM bridge patterns
- [Rust + WebAssembly 2025 — DEV Community](https://dev.to/dataformathub/rust-webassembly-2025-why-wasmgc-and-simd-change-everything-3ldh) — WASM architecture, SharedArrayBuffer, SIMD
- [WebAssembly Component Model](https://component-model.bytecodealliance.org/) — Typed imports/exports for clean TS/WASM boundary
- [Zustand — pmndrs/zustand GitHub](https://github.com/pmndrs/zustand) — Store architecture, subscribe outside React
- [Event Sourcing — Martin Fowler](https://martinfowler.com/eaaDev/EventSourcing.html) — Engine-as-event-log foundation for undo/redo
- [Building Efficient Three.js Scenes — Codrops 2025](https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/) — InstancedMesh optimization patterns
- [Reaction-Diffusion ThreeJS — GitHub](https://github.com/colejd/Reaction-Diffusion-ThreeJS) — GPU-accelerated ping-pong for continuous simulations

---
*Architecture research for: Lattice — universal simulation substrate / cellular automata web app*
*Researched: 2026-03-10*
