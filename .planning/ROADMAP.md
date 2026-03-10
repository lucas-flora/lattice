# Roadmap: Lattice

## Overview

Lattice builds from the bottom up: pure engine substrate first, then rule execution, then rendering, then the command hub that enforces Three Surface Doctrine, then the surface features (simulation controls, terminal, GUI panels) wired simultaneously to GUI and CLI, then WASM acceleration, then the AI surface, then advanced rendering capabilities, then a final polish pass. Every phase delivers a coherent, independently verifiable capability. No horizontal layers. No "CLI pass later."

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Scaffold** - Project foundation, Web Worker boundary, WASM toolchain proof-of-concept, GPU dispose utilities
- [ ] **Phase 2: Substrate** - Grid engine (1D/2D/3D), Cell Property System, YAML preset schema and loader
- [ ] **Phase 3: Rule Engine** - Perceive-Update execution, TypeScript rules, built-in presets, undo/redo Command pattern
- [ ] **Phase 4: Rendering** - Three.js unified renderer, VisualMapper, zero-copy data path, pan/zoom
- [ ] **Phase 5: Command Hub** - CommandRegistry, Zustand stores, engine-store event protocol
- [ ] **Phase 6: Surfaces** - Simulation controls, CLI terminal, GUI panels, cell drawing — all wired to CommandRegistry simultaneously
- [ ] **Phase 7: WASM Acceleration** - Rust rule execution, SharedArrayBuffer bridge, whole-tick API
- [ ] **Phase 8: AI Surface** - OpenAI assistant in terminal, ContextBuilder, Supabase RAG, command execution
- [ ] **Phase 9: Advanced Rendering** - Multi-viewport, 3D grid view, reverse playback, timeline scrubbing, fullscreen
- [ ] **Phase 10: Polish** - Parameter graphs, HUD menus, hotkeys, screenshot export, docs, performance pass

## Phase Details

### Phase 1: Scaffold
**Goal**: A working Next.js project with strict TypeScript, the simulation engine running in a dedicated Web Worker from tick zero, the wasm-bindgen-cli build pipeline proven end-to-end, and Three.js GPU dispose utilities established before any dynamic scene content is written.
**Depends on**: Nothing (first phase)
**Requirements**: FOUN-01, FOUN-02, FOUN-03, FOUN-04, FOUN-05, FOUN-06
**Success Criteria** (what must be TRUE):
  1. `pnpm dev` starts the app and `pnpm lint` passes with zero errors under TypeScript strict mode
  2. A minimal simulation tick fires inside a Web Worker and posts a message to the main thread — confirmed via browser DevTools worker panel
  3. A Rust "hello" function compiles through the wasm-bindgen-cli pipeline (cargo build → wasm-bindgen → wasm-opt) and is callable from TypeScript in the browser
  4. A `disposeObject()` Three.js utility exists and is covered by a unit test asserting `renderer.info.memory.geometries === 0` after disposal
  5. The folder structure matches the spec (/engine, /components, /presets, /ai, /lib) and the engine has zero UI imports verified by a lint rule
**Plans**: TBD

### Phase 2: Substrate
**Goal**: The grid engine (1D, 2D, 3D), Cell Property System, and YAML preset schema form a stable, tested foundation that all other components depend on. The YAML schema is formally versioned before any preset is written.
**Depends on**: Phase 1
**Requirements**: GRID-01, GRID-02, GRID-03, GRID-04, GRID-05, CELL-01, CELL-02, CELL-03, CELL-04, CELL-05, CELL-06, YAML-01, YAML-02, YAML-03
**Success Criteria** (what must be TRUE):
  1. A 512×512 2D grid initializes as Float32Array with ping-pong double buffering and passes a Vitest test confirming no cell state leaks between buffers
  2. A cell property definition with static params (bool, int, float) and a computed function compiles and evaluates without errors in a Node.js Vitest test
  3. A hand-written YAML file matching the full schema (meta, grid, cell_properties, rule, visual_mappings, ai_context) passes Zod validation with `schema_version: "1"` present
  4. A YAML file with a missing required field produces a typed Zod error describing exactly which field is invalid
  5. 1D and 3D grid abstractions initialize and return correct neighbor lists in a Vitest test without touching any browser API
**Plans**: TBD

### Phase 3: Rule Engine
**Goal**: The simulation engine runs perceive-update cycles for all six built-in presets in TypeScript, with undo/redo using sparse Command-pattern diffs. Engine is fully testable in Node.js before any renderer exists.
**Depends on**: Phase 2
**Requirements**: RULE-01, RULE-02, RULE-05, YAML-04, YAML-05, YAML-06, YAML-07, YAML-08, YAML-09, YAML-10, CTRL-07
**Success Criteria** (what must be TRUE):
  1. Conway's Game of Life runs a glider pattern for 100 generations in a Vitest test and the glider is at the correct translated position
  2. Rule 110, Langton's Ant, Brian's Brain, Gray-Scott reaction-diffusion, and Navier-Stokes fluid all load from their YAML preset files and produce non-trivial output after 10 ticks in Vitest tests
  3. A user-supplied YAML file (not one of the six built-ins) loads and runs identically to a built-in preset — no privilege difference is detectable in tests
  4. Performing 5 cell edits and then calling undo 5 times returns the grid exactly to its original state, verified by buffer equality in a Vitest test
  5. RuleRunner silently falls back to TypeScript when no WASM module is present, with no thrown exceptions
**Plans**: TBD

### Phase 4: Rendering
**Goal**: The Three.js renderer displays a live simulation in the browser with data-driven visual mappings, zero-copy typed array reads from engine state, smooth pan/zoom, and no GPU memory leaks.
**Depends on**: Phase 3
**Requirements**: RNDR-01, RNDR-03, RNDR-04, RNDR-05, RNDR-06, RNDR-07, RNDR-11, RNDR-12
**Success Criteria** (what must be TRUE):
  1. Conway's Game of Life runs visually in the browser with live cells rendering as colored instanced quads via InstancedMesh — no per-frame object allocation
  2. A 1D Rule 110 spacetime diagram renders as a strip view using the same Three.js renderer path, not a separate renderer
  3. Any cell property can be mapped to color, size, shape, or orientation by editing the `visual_mappings` section of the YAML preset — the change is reflected on next reload without code changes
  4. Panning and zooming works smoothly with non-integer zoom levels and "zoom to fit" correctly frames the entire grid
  5. After unmounting and remounting the viewport component, `renderer.info.memory.geometries` returns to 0 — confirmed via browser DevTools
**Plans**: TBD

### Phase 5: Command Hub
**Goal**: The CommandRegistry is established as the architectural hub — every app action registered as a command, Zustand stores wired to engine events, no surface yet but the routing infrastructure is in place and testable.
**Depends on**: Phase 4
**Requirements**: CMDS-01, CMDS-02, CMDS-03, CMDS-04
**Success Criteria** (what must be TRUE):
  1. `CommandRegistry.list()` returns a typed catalog of all registered commands with name, description, and parameter schema
  2. Calling `CommandRegistry.execute("sim.play", {})` starts the simulation — the same call path that both GUI buttons and CLI input will use
  3. A Vitest test confirms that a command invoked via the registry produces identical engine state change as invoking the underlying engine method directly
  4. Zustand simStore, viewStore, uiStore, and aiStore all update reactively when the engine emits events — confirmed by a subscriber that records event sequence in a test
**Plans**: TBD

### Phase 6: Surfaces
**Goal**: All simulation controls, the CLI terminal, and primary GUI panels are wired to the CommandRegistry simultaneously — no feature ships to GUI without also shipping to CLI. This is the first phase where a human can actually use the app.
**Depends on**: Phase 5
**Requirements**: CTRL-01, CTRL-02, CTRL-03, CTRL-04, CTRL-05, CTRL-06, CTRL-08, TERM-01, TERM-02, TERM-03, TERM-04, TERM-05, TERM-06, GUIP-01
**Success Criteria** (what must be TRUE):
  1. A user can play, pause, step forward, and reverse-step the simulation using both GUI buttons and CLI commands (e.g., `sim play`, `sim step`) — both routes invoke the same CommandRegistry entry
  2. The terminal is always accessible via keyboard shortcut, displays curated app logs (not raw console output), and accepts CLI commands with ghost-text autocomplete that only suggests valid commands given current state
  3. A user can draw and erase cells on the grid with a configurable brush size, and each edit is undoable individually via Ctrl+Z
  4. The generation counter and live cell count update live as the simulation runs and are visible in the HUD
  5. A user can load any of the six built-in presets via a GUI dropdown or a CLI command (`preset load conways-gol`) and the grid resets to the preset's initial state
  6. Non-command terminal input is passed through to the AI assistant hook point (returns "AI not connected" placeholder until Phase 8)
**Plans**: TBD

### Phase 7: WASM Acceleration
**Goal**: Rust implementations of performance-critical rules run transparently via the same RuleRunner interface, with a SharedArrayBuffer zero-copy bridge to the engine Web Worker. TypeScript fallback always present.
**Depends on**: Phase 6
**Requirements**: RULE-03, RULE-04
**Success Criteria** (what must be TRUE):
  1. Gray-Scott reaction-diffusion runs at 60fps on a 512×512 grid with WASM enabled — measured via the browser performance panel showing frame times under 16ms
  2. Disabling the WASM module (by removing the .wasm file) causes RuleRunner to fall back to TypeScript silently — no error thrown, simulation continues at lower speed
  3. The WASM API accepts the full grid buffer in one call per tick (not per-cell) — confirmed by a Rust unit test counting `extern` boundary crossings as exactly 1 per tick
  4. Navier-Stokes fluid simulation runs without freezing the UI thread — the main thread frame rate stays above 30fps even during heavy compute ticks
**Plans**: TBD

### Phase 8: AI Surface
**Goal**: The AI assistant lives in the terminal, has full app state context, can call CLI commands on the user's behalf via the CommandRegistry, and uses Supabase RAG over preset descriptions and CA documentation.
**Depends on**: Phase 7
**Requirements**: ASST-01, ASST-02, ASST-03, ASST-04, ASST-05, ASST-06, ASST-07
**Success Criteria** (what must be TRUE):
  1. A user types a natural language message in the terminal and receives a streaming GPT-4o response with awareness of the current preset, generation count, and active parameters
  2. The AI correctly executes a CLI command on the user's behalf (e.g., "load the Gray-Scott preset") — the command appears in the terminal log and the simulation changes
  3. A typo like "sim plya" triggers the AI to detect the misspelled command, execute the corrected version, and explain the correction in the terminal
  4. The AI retrieves relevant CA reference material from Supabase pgvector RAG and cites it in responses about rule behavior
  5. The AI never sends raw grid state to OpenAI — only metadata (preset name, generation, parameters, recent actions) — confirmed by inspecting the request body in network tools
**Plans**: TBD

### Phase 9: Advanced Rendering
**Goal**: Multi-viewport with independent cameras, full 3D grid visualization, reverse playback with timeline scrubbing, and per-viewport fullscreen mode — all using the existing Three.js renderer path without introducing a second render system.
**Depends on**: Phase 8
**Requirements**: RNDR-02, RNDR-08, RNDR-09, RNDR-10
**Success Criteria** (what must be TRUE):
  1. A user can open two viewport panels side by side, each with an independent camera position and zoom level, both rendering the same simulation live
  2. A 3D grid (voxel) simulation renders in the browser with orbit controls (rotate, zoom, pan) using the same InstancedMesh renderer path as 2D
  3. A user can drag the timeline scrubber backward and watch the simulation state rewind — the visual display keeps up as fast as possible
  4. A user can toggle fullscreen on any single viewport — the HUD hides, and pressing Escape or the toggle again restores the layout
**Plans**: TBD

### Phase 10: Polish
**Goal**: Parameter visualization graphs, contextual HUD menus, keyboard shortcuts for all major actions, screenshot export, full app documentation fed into AI RAG, and a measured performance optimization pass.
**Depends on**: Phase 9
**Requirements**: GUIP-02, GUIP-03, GUIP-04, GUIP-05, GUIP-06, GUIP-07
**Success Criteria** (what must be TRUE):
  1. Every major action in the app has a keyboard shortcut displayed in the HUD, and pressing the shortcut executes the action via the CommandRegistry
  2. A user can export a screenshot of the current viewport as a PNG file from a GUI button or CLI command (`viewport screenshot`)
  3. Parameter visualization graphs update live as the simulation runs and are displayed in a panel separate from the simulation viewport
  4. The app documentation is complete enough to be embedded in Supabase pgvector and returned as relevant RAG results when users ask the AI about features
  5. A performance profiling pass identifies and resolves the top three frame-rate bottlenecks — final Gray-Scott 512×512 frame time is documented
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scaffold | 0/TBD | Not started | - |
| 2. Substrate | 0/TBD | Not started | - |
| 3. Rule Engine | 0/TBD | Not started | - |
| 4. Rendering | 0/TBD | Not started | - |
| 5. Command Hub | 0/TBD | Not started | - |
| 6. Surfaces | 0/TBD | Not started | - |
| 7. WASM Acceleration | 0/TBD | Not started | - |
| 8. AI Surface | 0/TBD | Not started | - |
| 9. Advanced Rendering | 0/TBD | Not started | - |
| 10. Polish | 0/TBD | Not started | - |
