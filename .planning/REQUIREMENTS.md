# Requirements: Lattice

**Defined:** 2026-03-10
**Core Value:** The engine is universally extensible — any simulation type runs on the same substrate with no special-casing, and users can define, share, and load their own rules as first-class citizens identical to built-in presets.

## v1 Requirements

Requirements for v1.0 release. Each maps to roadmap phases.

### Foundation

- [ ] **FOUN-01**: Next.js App Router scaffold with TypeScript strict mode, Tailwind CSS, ESLint + Prettier
- [ ] **FOUN-02**: Folder structure per spec: /app, /components (hud, terminal, viewport, panels), /engine (grid, cell, rules, playback), /presets, /ai, /lib
- [ ] **FOUN-03**: Simulation loop runs in a dedicated Web Worker from the very first tick of v0.1 — never blocks the UI thread. This is load-bearing and cannot be retrofitted.
- [ ] **FOUN-04**: Engine is pure TypeScript with zero UI imports — independently testable in Node.js
- [ ] **FOUN-05**: Zustand stores mirror engine state for UI reactivity — engine is the source of truth, stores never duplicate it
- [ ] **FOUN-06**: All frontend work (components, layouts, visual design) must reference the UI/UX skill at https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git before implementation — non-negotiable quality bar

### Grid Engine

- [ ] **GRID-01**: 2D grid with configurable size using typed arrays (Float32Array) — no plain JS objects for cell state
- [ ] **GRID-02**: 1D grid support using the same engine abstraction
- [ ] **GRID-03**: 3D grid support (voxels) using the same engine abstraction
- [ ] **GRID-04**: Configurable grid topology per preset (toroidal wrap-around vs. finite edges, at minimum)
- [ ] **GRID-05**: Ping-pong double buffering (current/next typed arrays) for correct rule evaluation

### Cell Property System

- [ ] **CELL-01**: Every cell has a property component — a structured definition of all its state
- [ ] **CELL-02**: Properties can be static parameters (typed values: bool, int, float, vec2, etc.)
- [ ] **CELL-03**: Properties can be computed functions (derived values based on inputs and neighbor state)
- [ ] **CELL-04**: Properties declare input/output roles — enabling composable, pipeline-style cell behavior
- [ ] **CELL-05**: Any property can drive any visual parameter (color, size, shape, orientation)
- [ ] **CELL-06**: User-defined properties are first-class citizens — no distinction from built-in ones

### YAML Preset System

- [ ] **YAML-01**: Versioned YAML schema validated with Zod — the community-facing API contract
- [ ] **YAML-02**: Schema covers: meta (name, author, tags), grid (dimensions, resolution, boundary), cell_properties (types, defaults, I/O), rule (compute function), visual_mappings (property → visual), ai_context (optional hints)
- [ ] **YAML-03**: Preset loader parses YAML into engine configuration and validates against schema
- [ ] **YAML-04**: Built-in preset: Conway's Game of Life
- [ ] **YAML-05**: Built-in preset: Rule 110 (1D)
- [ ] **YAML-06**: Built-in preset: Langton's Ant
- [ ] **YAML-07**: Built-in preset: Brian's Brain
- [ ] **YAML-08**: Built-in preset: Gray-Scott reaction-diffusion
- [ ] **YAML-09**: Built-in preset: Navier-Stokes fluid dynamics (high-resolution 2D grid — proves universality)
- [ ] **YAML-10**: Built-in presets are not privileged — user-uploaded YAML files are treated identically

### Rule Execution

- [ ] **RULE-01**: Rules follow perceive-update contract: perceive (gather neighborhood) → update (compute next state)
- [ ] **RULE-02**: TypeScript rule execution as baseline (works without WASM)
- [ ] **RULE-03**: WASM (Rust) rule execution pipeline via wasm-bindgen-cli (NOT wasm-pack — archived Sept 2025) for performance-critical sims
- [ ] **RULE-04**: WASM API operates on whole ticks (not per-cell) to avoid JS/WASM boundary overhead
- [ ] **RULE-05**: RuleRunner checks for WASM module and falls back to TypeScript silently

### Rendering

- [ ] **RNDR-01**: Three.js renderer for 2D grids (orthographic camera, instanced quads)
- [ ] **RNDR-02**: Three.js renderer for 3D grids (voxels, perspective camera)
- [ ] **RNDR-03**: Three.js renderer for 1D grids (spacetime diagram or strip view)
- [ ] **RNDR-04**: Unified renderer — single Three.js rendering path for all dimensions, no separate renderers
- [ ] **RNDR-05**: Smooth pan and zoom with non-integer zoom levels
- [ ] **RNDR-06**: Zoom to fit / center view
- [ ] **RNDR-07**: Data-driven visual mappings: any cell property maps to color, size, shape, or orientation — no hardcoded visuals
- [ ] **RNDR-08**: Multi-viewport system — user can open multiple views with independent camera settings
- [ ] **RNDR-09**: Fullscreen mode per viewport (HUD hides, toggleable)
- [ ] **RNDR-10**: Full camera controls for 3D (orbit, zoom, angle)
- [ ] **RNDR-11**: Explicit Three.js dispose() on geometry, material, and texture — no GPU memory leaks
- [ ] **RNDR-12**: Renderer reads typed arrays directly from engine (zero-copy where possible)

### Simulation Controls

- [ ] **CTRL-01**: Play / pause / step-forward controls
- [ ] **CTRL-02**: Speed control (integer FPS slider + "as fast as possible" mode)
- [ ] **CTRL-03**: Forward and reverse playback
- [ ] **CTRL-04**: Timeline scrubber with playhead — drag to scrub, visuals keep up as fast as possible
- [ ] **CTRL-05**: Cell drawing and erasing with mouse (configurable brush size for large grids)
- [ ] **CTRL-06**: Pattern reset (return to initial state) and clear (blank grid) as separate operations
- [ ] **CTRL-07**: Undo / redo using Command pattern (not full-state snapshots)
- [ ] **CTRL-08**: Generation counter and live cell count display

### Command System

- [ ] **CMDS-01**: CommandRegistry — central registry where all app actions are registered as commands
- [ ] **CMDS-02**: GUI buttons invoke commands through the registry (not directly)
- [ ] **CMDS-03**: CLI terminal invokes commands through the same registry
- [ ] **CMDS-04**: Three Surface Doctrine enforced: every new action is wired to GUI + CLI simultaneously as it is built — no "CLI pass" later

### CLI Terminal

- [ ] **TERM-01**: Terminal component always available, toggle show/hide at any time
- [ ] **TERM-02**: Displays curated app logs (UX-level, not dev console)
- [ ] **TERM-03**: Accepts CLI command input with deterministic command tree
- [ ] **TERM-04**: Ghost-text autocomplete — contextually aware, only suggests valid actions
- [ ] **TERM-05**: Built as generic shell infrastructure — shared shell first, AI consumer second. AI assistant (ASST-01–07) slots in at v0.3 with zero structural changes to terminal code.
- [ ] **TERM-06**: Non-command input is passed through to AI assistant (when AI is wired up in v0.3)

### AI Assistant

- [ ] **ASST-01**: OpenAI API integration (GPT-4o) living in the terminal
- [ ] **ASST-02**: Full app state context at all times (user focus, settings, parameters, rules, recent actions, available options)
- [ ] **ASST-03**: Supabase RAG — embeddings of all docs, CA reference material, tool lists, formulas
- [ ] **ASST-04**: Can call CLI commands on user's behalf via CommandRegistry
- [ ] **ASST-05**: Detects misspelled/mangled commands and corrects them, explaining what it did
- [ ] **ASST-06**: Centralized personality config file with behavior tuning levers
- [ ] **ASST-07**: Stays out of the way unless needed — never interrupts the user

### GUI & Polish

- [ ] **GUIP-01**: Parameter panels for grid size, rule parameters, and cell property editing
- [ ] **GUIP-02**: Novel parameter visualization graphs (separate from sim viewport)
- [ ] **GUIP-03**: HUD contextual menus
- [ ] **GUIP-04**: Hotkeys for all major actions
- [ ] **GUIP-05**: Screenshot export
- [ ] **GUIP-06**: Full app documentation (fed into AI RAG)
- [ ] **GUIP-07**: Performance profiling and optimization pass

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Export

- **EXPO-01**: GIF animation export
- **EXPO-02**: CSV per-frame data export
- **EXPO-03**: ASCII art per-frame export

### Community

- **COMM-01**: Community preset discovery / upload UI
- **COMM-02**: Shareable URL state encoding

### Layout

- **LYOT-01**: Responsive layout for various screen sizes
- **LYOT-02**: User preference persistence across sessions

### Advanced

- **ADVN-01**: Scripting access to rules via Python (Pyodide) or equivalent
- **ADVN-02**: Neural cellular automata support
- **ADVN-03**: Agent-based model extensions beyond simple movement patterns

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Native mobile apps | Web-first; responsive design covers mobile |
| Real-time multiplayer / collaborative editing | Simulation state is deterministic-sequential; merging concurrent grid edits is a CRDT nightmare |
| Server-side simulation execution | Destroys offline-first property; adds latency; WASM handles performance client-side |
| Custom rendering engine (non-Three.js) | Unified Three.js renderer is a key decision; maintaining two render paths doubles surface area |
| Scripting language in presets (Lua/Python in v1) | YAML + WASM covers custom rule needs without the sandbox complexity |
| Node-based visual rule editor | Node graphs become unreadable for complex rules; YAML with live preview at 20% of the cost |
| Social features (follows, likes, comments) | Social graph is a separate product; defer until community gallery is validated |
| Historical/infinite undo | O(generations x grid_size) memory; configurable history depth with keyframe checkpointing instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (populated by roadmapper) | | |

**Coverage:**
- v1 requirements: 63 total
- Mapped to phases: 0
- Unmapped: 63

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after initial definition*
