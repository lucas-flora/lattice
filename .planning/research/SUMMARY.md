# Project Research Summary

**Project:** Lattice — Universal Simulation Substrate Web App
**Domain:** Cellular automata / simulation platform (CA, fluid dynamics, reaction-diffusion, agent-based models)
**Researched:** 2026-03-10
**Confidence:** HIGH (core stack and architecture verified against official sources; pitfalls cross-verified with real-world post-mortems)

## Executive Summary

Lattice is a browser-native simulation platform whose central value proposition is that any simulation — Conway's Game of Life, Gray-Scott reaction-diffusion, Navier-Stokes fluid, Langton's Ant — is described by a single human-readable YAML file. No existing web-based CA or simulation tool does this: Golly uses proprietary rule formats, VisualPDE uses LaTeX-like PDE expressions, Sandspiel hardcodes elements in Rust. The YAML preset format is a genuine market gap and the architectural load-bearing element of the entire product. Everything else — the engine, the renderer, the CLI, the AI assistant — derives its structure from the requirement that any preset must be loadable, shareable, and version-controllable.

The recommended build approach is layered and dependency-ordered. A pure TypeScript simulation engine (no UI dependencies) must come first, providing the Cell Property System and YAML preset loader before any rendering or UI work begins. Three.js (r183, WebGPU-ready) provides the unified 1D/2D/3D renderer, making multi-viewport and 3D support first-class from the start rather than retrofits. Rust/WASM replaces the TypeScript rule execution path as a transparent performance accelerator — but critically, the TypeScript fallback must always exist so the engine works before WASM is built. A CommandRegistry pattern enforces the "Three Surface Doctrine": every action available in the GUI is equally available via the CLI terminal and AI assistant, with no surface having privileged access.

The critical risks are architectural, not feature-level: (1) wasm-pack was archived in September 2025 — the project must use `wasm-bindgen-cli` directly; (2) the WASM API must be designed to cross the JS/WASM boundary once per tick (whole-grid buffer), not once per cell, or performance collapses; (3) Three.js GPU resources require explicit disposal or memory leaks will accumulate silently; (4) the simulation engine must run in a Web Worker from the start or UI freezes become structural; (5) the YAML schema must be formally versioned before any community preset is written or all shared files become migration liabilities.

## Key Findings

### Recommended Stack

The stack is dominated by Next.js 16 (App Router, Turbopack default) with React 19.2, TypeScript strict mode, and Tailwind CSS v4. Three.js r183 provides the unified WebGL/WebGPU renderer — the `three/webgpu` import path with automatic WebGL 2 fallback covers 95%+ of browsers. Zustand v5 provides client-side state management as a UI mirror of engine state (not as engine state itself). The Rust/WASM pipeline uses `wasm-bindgen-cli` directly, not the now-archived `wasm-pack`. OpenAI SDK v6 with GPT-4o and `zodResponseFormat` handles the AI surface. Supabase JS v2.79+ with pgvector covers preset storage and RAG retrieval.

One significant WASM toolchain warning: **wasm-pack is archived as of September 2025**. The PITFALLS research flags this as a critical Phase 1 issue. Use `cargo build --target wasm32-unknown-unknown` → `wasm-bindgen --target web` → `wasm-opt` directly, pinned via `mise`. The STACK.md recommendation for `wasm-pack 0.14.0` must be overridden — it was written before this research finding surfaced. The wasm-bindgen CLI itself is maintained under a new organization.

**Core technologies:**
- Next.js 16.1.6: Full-stack React framework — App Router, Turbopack, server API routes for AI and preset endpoints
- React 19.2 + React Compiler: Automatic memoization critical for simulation loop performance
- TypeScript 5.1+ (strict): Required minimum; prevents runtime errors in the grid engine
- Tailwind CSS 4.2.1: CSS-first config, no JS config file, 100x faster incremental builds than v3
- Three.js r183 (WebGPU): Unified 1D/2D/3D renderer; compute shaders via WebGPU for large fluid sims
- Zustand 5.0.11: Client-only stores as engine-state mirrors; `subscribeWithSelector` middleware is essential
- Rust + wasm-bindgen-cli: Rule execution at near-native speed; one-tick-per-call API is mandatory
- OpenAI SDK 6.27.0: GPT-4o via Next.js Route Handler; structured outputs via `zodResponseFormat`
- Supabase JS 2.79.0+: pgvector RAG + preset storage; requires Node.js 20+
- Zod 4.x: YAML preset schema validation and type inference; `z.infer<>` derives `SimConfig` type
- `yaml` 2.x: YAML 1.2 compliant, TypeScript-native, replaces js-yaml

### Expected Features

The feature landscape reveals a clear three-tier structure. The table-stakes tier (standard simulator controls) is well-understood with low implementation risk. The differentiator tier is where Lattice's identity lives — features no existing web tool has. The anti-features tier documents what not to build and why.

**Must have — table stakes (v1):**
- Universal Grid Engine (2D first) — nothing runs without it
- Cell Property System — load-bearing for YAML format and visual mapping
- YAML Preset Loader with Zod schema validation — the core value proposition
- Built-in presets: GoL, Rule 110, Gray-Scott, Langton's Ant — proves universality claim
- Three.js renderer (2D orthographic mode) — unified renderer from day one
- Play / pause / step / speed controls — minimum interaction model
- Cell drawing and erasing with undo/redo — essential editing surface
- Data-driven visual layer (color mapping from cell properties) — distinct visual identity
- GIF + screenshot export — output sharing
- CLI terminal (basic command tree) — Three Surface Doctrine foundation
- HUD with hotkeys — keyboard-driven workflow

**Should have — differentiators (v1.x after validation):**
- Reverse playback and timeline scrubbing — rewind to investigate pattern origins
- AI assistant (GPT-4o + Supabase RAG) — natural language simulation control
- Community preset gallery — living ecosystem of YAML presets
- Multi-viewport system — side-by-side comparison of parameter sets
- 3D grid support — Three.js already supports it; defer until 2D validated
- WASM rule execution (Rust) — unlock performance ceiling for Gray-Scott and Navier-Stokes
- Shareable URL state encoding — needed before community gallery launch
- ASCII art export — strong CLI identity marker, low cost

**Defer — v2+:**
- 1D Wolfram automata with spacetime diagram view
- Full agent-based model system (Langton's Ant in v1; full agent semantics in v2)
- Neural cellular automata
- PWA / offline install

**Anti-features confirmed not to build:**
- Real-time multiplayer (CRDT grid merging is unsolved and out of scope)
- Server-side simulation execution (destroys offline-first property)
- Embedded scripting language (YAML + WASM covers all cases; scripting adds security risk)
- Node-based visual rule editor (YAML with live preview achieves 80% at 20% cost)

### Architecture Approach

The architecture is five vertical layers with strict one-way data flow: Surface Layer (GUI + CLI + AI) → Zustand Stores (engine-state mirrors) → Engine Layer (pure TypeScript, no UI deps) → WASM Compute Layer (Rust rule execution) → Rendering Layer (Three.js reads engine typed arrays). The CommandRegistry is the horizontal hub: every user action from any surface routes through `CommandRegistry.execute(name, params)`, ensuring Three Surface Doctrine is structurally enforced rather than a convention. The SimulationEngine must run in a Web Worker — main thread WASM calls will freeze the UI at Navier-Stokes grid sizes.

**Major components:**
1. SimulationEngine — orchestrator; owns grid state; emits events to stores; runs in Web Worker
2. GridState — ping-pong double buffer using Float32Array; never expose raw mutable state to UI
3. CellPropertySystem — typed property definitions and computed functions; schema finalized before YAML schema
4. PresetLoader — YAML → Zod validation → SimConfig; `schema_version` field mandatory from day one
5. RuleRunner — dispatches to WASM if available, TypeScript fallback always present; whole-tick WASM API
6. ThreeRenderer — reads typed arrays from GridState per frame; never calls engine methods; InstancedMesh for cells
7. VisualMapper — maps any cell property value to color/size/shape/orientation per YAML `visual_mappings`
8. CommandRegistry — single catalog; GUI buttons, CLI input, AI tool calls all invoke `execute(name, params)`
9. Zustand stores (4 slices) — simStore, viewStore, uiStore, aiStore; subscribe to engine events; read-only mirrors
10. Terminal — shared component for logs, CLI autocomplete, AI chat; no command logic lives here

**Key patterns (non-negotiable):**
- Perceive-Update split: every step reads from buffer A, writes to buffer B, then swaps — prevents asymmetric propagation
- Engine as source of truth: Zustand stores are read-only mirrors; engine emits, stores subscribe
- WASM as optional accelerator: TypeScript fallback always present; WASM is performance-only, not correctness requirement
- CommandRegistry as architectural hub: all surfaces identical; no privileged access

### Critical Pitfalls

1. **wasm-pack is archived (September 2025)** — Use `wasm-bindgen-cli` + `cargo build` + `wasm-opt` pipeline directly. Pin versions via `mise`. Never reference `wasm-pack` in any script or CI pipeline. Must be resolved in Phase 1 before any Rust code is written.

2. **JS/WASM boundary per-cell** — Calling WASM once per cell at 512×512 × 60fps = billions of boundary crossings per second. Design the Rust API to accept the full grid buffer and run the complete tick in one call. Use WASM linear memory views (`Float32Array` over `wasmMemory.buffer`) to avoid copying. Must be the WASM API contract before any Rust implementation begins.

3. **Three.js GPU memory leaks** — `scene.remove(obj)` does not free GPU memory. Every geometry, material, and texture needs explicit `dispose()`. Write a `disposeObject()` utility before building any dynamic scene content. Add `renderer.info.memory` assertions in tests. Establish in Phase 1 renderer setup.

4. **Simulation on main thread** — WASM tick on the main thread blocks the event loop. Navier-Stokes ticks can take 30–100ms. Worker↔MainThread boundary must be designed in Phase 1 — retrofitting it later restructures all engine call sites.

5. **YAML schema instability** — Schema changes after community presets exist break all shared files. Add `schema_version: "1"` to every preset from day one. Formalize the Zod schema before writing any built-in preset. Run `lattice validate <preset.yaml>` in CI. This is a one-way door: once community presets exist, schema changes require migrations.

6. **Cell Property System as JS interpretation bottleneck** — Evaluating computed functions (`u * v * v`) per-cell per-tick in JavaScript at 512×512 × 60fps = 16M evaluations/sec. Computed properties must run inside WASM, not JS. This decision must be made before the YAML schema is finalized — it affects what the `computed:` field can contain.

7. **Undo/redo storing full grid snapshots** — 1024×1024 × 100 undo levels = 400MB. Use the Command pattern with inverse operations (sparse diffs of changed cells), not state snapshots. Define the Command interface before implementing any undoable action.

## Implications for Roadmap

The architecture research explicitly documents a 9-phase build order based on dependency constraints. The roadmap should follow this ordering closely, as each phase is independently verifiable only if the prior phase is complete. Critical insight: **the engine must be buildable and testable before any UI or WASM exists.**

### Phase 1: Foundation and Core Substrate

**Rationale:** Everything else depends on GridState, CellPropertySystem, and the YAML schema. The YAML schema must be formally versioned before any preset is written (PITFALLS: schema instability). The WASM toolchain (wasm-bindgen-cli) and Web Worker architecture must be established before any engine code is written — retrofitting either is HIGH recovery cost. Three.js dispose utility must be written before any dynamic scene content.
**Delivers:** GridState (ping-pong typed arrays), CellPropertySystem (typed properties + computed function DSL decision), PresetSchema (Zod, with `schema_version`), PresetLoader (YAML → SimConfig), WASM build pipeline (wasm-bindgen-cli, no wasm-pack), Web Worker boundary, Three.js renderer with dispose pattern, COOP/COEP headers for SharedArrayBuffer.
**Addresses:** Table stakes (grid topology, built-in presets foundation), differentiators (YAML preset format as universal API)
**Avoids:** wasm-pack toolchain debt, schema instability, GPU memory leaks, main-thread simulation, JS/WASM per-cell boundary (establishes whole-tick API contract)
**Research flag:** Needs `/gsd:research-phase` — WASM toolchain transition from wasm-pack to wasm-bindgen-cli has sparse tutorials; Web Worker + SharedArrayBuffer + COOP/COEP in Next.js App Router is non-trivial.

### Phase 2: Engine and Rule Execution

**Rationale:** SimulationEngine, RuleRunner, and TimelineController depend on GridState from Phase 1. Built-in TypeScript rules (GoL, Rule 110, Brian's Brain as simpler first; Gray-Scott after) prove the engine works before rendering exists. Undo/redo Command pattern must be defined here — before any undoable action is implemented.
**Delivers:** SimulationEngine (orchestrator, event emitter), RuleRunner (TS dispatch + WASM accelerator slot), TimelineController (play/pause/step/seek, undo/redo with sparse diffs), built-in TS rules (GoL, Rule 110, Langton's Ant, Gray-Scott), `lattice validate` CLI command.
**Uses:** Vitest for engine-only tests in Node.js (no browser needed), TypeScript strict mode, ping-pong buffer from Phase 1
**Implements:** Perceive-Update pattern, Engine-as-source-of-truth, Command pattern for undo/redo
**Avoids:** Full-grid snapshot undo (sparse diff Command pattern from the start), simulation on main thread (engine designed for Worker from day one)
**Research flag:** Standard patterns — skip `/gsd:research-phase`.

### Phase 3: Rendering

**Rationale:** ThreeRenderer depends on the engine typed array contract from Phase 2. Establishing the zero-copy data path (ThreeRenderer reads GridState.current directly, no intermediate copy) before implementing visual mappings prevents the most common performance trap.
**Delivers:** ThreeRenderer (scene setup, animation loop), InstancedCellMesh (per-instance transform updates), VisualMapper (cell property → color/size/shape/orientation), DataTexture-based grid upload (GPU path), basic 2D orthographic viewport.
**Uses:** Three.js r183, `three/webgpu` import path, InstancedMesh
**Implements:** Zero-copy render path (WASM memory view → instance buffer), single-renderer-all-dimensions pattern
**Avoids:** Separate renderers for 1D/2D/3D (anti-pattern confirmed in ARCHITECTURE.md), rendering two grids (zero-copy path established here)
**Research flag:** Standard Three.js patterns — skip `/gsd:research-phase`.

### Phase 4: Command System and State Bridge

**Rationale:** CommandRegistry is the architectural hub of Three Surface Doctrine. Zustand stores cannot be wired until the engine emits events (Phase 2). CommandRegistry must exist before any surface layer is built — it's the mechanism all surfaces share.
**Delivers:** CommandRegistry (central catalog with execute/list/help), command definitions (simulation, grid, viewport, export namespaces), Zustand stores (simStore, viewStore, uiStore, aiStore) subscribed to engine events, engine ↔ store event protocol.
**Uses:** Zustand 5 `subscribeWithSelector` middleware
**Implements:** Engine-Store Separation pattern, Three Surface Doctrine hub
**Avoids:** UI components mutating engine state directly (all mutations go through CommandRegistry from this phase forward)
**Research flag:** Standard patterns — skip `/gsd:research-phase`.

### Phase 5: Surface Layer (GUI + CLI)

**Rationale:** Terminal and GUI control panels depend on CommandRegistry from Phase 4. This phase completes the v1 MVP — the first time all three layers (engine, renderer, surface) are connected.
**Delivers:** Terminal component (logs + CLI input + ghost-text autocomplete from CommandRegistry), GUI control panels (play/pause/step/speed, preset selector, grid config), HUD with hotkeys, cell drawing/erasing tool, Viewport canvas mount, Layout system.
**Addresses:** All table stakes features — play/pause/step, speed control, pan/zoom, cell drawing/erasing, undo/redo, grid topology config, export (GIF + screenshot), HUD hotkeys
**Avoids:** Surface-local command logic (terminal is pure UI; CLI autocomplete queries CommandRegistry.list())
**Research flag:** Standard patterns — skip `/gsd:research-phase`. CLI ghost-text autocomplete may need a small targeted search.

### Phase 6: WASM Acceleration

**Rationale:** TypeScript fallback (Phase 2) must work before WASM is added. WASM drops in as a transparent accelerator — no engine API changes. This phase is a performance optimization, not a correctness requirement.
**Delivers:** Rust implementations of performance-critical rules (GoL, Gray-Scott, Navier-Stokes), WasmRegistry in RuleRunner, SharedArrayBuffer zero-copy bridge, WASM module lazy initialization with TS fallback.
**Uses:** wasm-bindgen-cli, `cargo build`, `wasm-opt`, `mise` for version pinning
**Implements:** WASM as Optional Accelerator pattern, whole-tick WASM API (one call per tick, full grid buffer)
**Avoids:** Per-cell WASM calls, treating WASM as required (TS fallback always present), wasm-pack toolchain
**Research flag:** Needs `/gsd:research-phase` — wasm-bindgen-cli direct pipeline tutorials are sparse; SharedArrayBuffer + Worker bridge with Next.js COOP/COEP has known friction points.

### Phase 7: AI Surface

**Rationale:** AI assistant depends on CommandRegistry (Phase 4) — AI tool calls map directly to registry entries, same as CLI and GUI. Supabase RAG requires the YAML preset corpus to exist (Phase 2 built-in presets). AI is the last surface to add, not an early feature.
**Delivers:** AiAssistant (OpenAI GPT-4o, streaming via Next.js Route Handler), ContextBuilder (selective app-state serialization — metadata only, never raw grid), AI tool definitions mapped to CommandRegistry, Supabase pgvector RAG (CA docs + preset descriptions), session-level token budget enforcement, AI chat pane in Terminal component.
**Uses:** OpenAI SDK 6.27.0, `zodResponseFormat` for structured outputs, Supabase JS 2.79+ pgvector
**Avoids:** AI direct engine access bypassing commands, full grid state in OpenAI context (metadata only), auto-triggered AI requests on simulation tick, no rate limiting (token budget enforced from day one)
**Research flag:** Needs `/gsd:research-phase` — AI tool call + CommandRegistry integration pattern, Supabase pgvector RAG chunk sizing (1500 chars, 300 overlap, HNSW index), OpenAI streaming in Next.js App Router.

### Phase 8: Advanced Rendering and Complex Presets

**Rationale:** Multi-viewport requires ThreeRenderer to be modular (Phase 3 established this). Gray-Scott and Navier-Stokes presets require WASM (Phase 6). 3D grid support extends the existing Three.js InstancedMesh path.
**Delivers:** ViewportManager (multi-viewport, independent cameras, scissor test per viewport), 3D grid support (orthographic + perspective cameras, volume rendering), complex presets (Gray-Scott, Navier-Stokes with WASM), reverse playback and timeline scrubbing (state history buffer with configurable depth), shareable URL state encoding.
**Avoids:** Storing full grid history (configurable depth + keyframe checkpointing), creating separate renderers per dimension
**Research flag:** Multi-viewport scissor rendering and 3D InstancedMesh at scale may need `/gsd:research-phase`.

### Phase 9: Community and Export

**Rationale:** Community gallery requires a stable YAML schema (established in Phase 1) and a meaningful built-in preset library (Phase 2+). Export system (GIF, CSV, ASCII) is independent of community but shares the frame buffer infrastructure.
**Delivers:** Export system (GIF via Web Worker, CSV, ASCII art), Supabase preset CRUD (upload/browse/download, public read / authenticated write), community gallery UI, server-side schema validation on upload (maxGridWidth/Height/Iterations limits), shareable URL (if not done in Phase 8).
**Uses:** gif.js (wrapped in abstraction layer, Web Worker-based), Supabase JS, Next.js Route Handler for preset API
**Avoids:** Export blocking UI (Web Worker), community upload without server-side validation, social graph features (defer indefinitely)
**Research flag:** Standard patterns — skip `/gsd:research-phase`.

### Phase Ordering Rationale

- Phases 1–2 are a strict prerequisite for everything: GridState, CellPropertySystem, and the YAML schema must be stable before any other component can be specified. The engine must be testable in Node.js before any browser code exists.
- Phase 3 (rendering) is independent of Phase 4 (commands) — both depend only on the engine. They can be developed in parallel but Phase 4 must complete before Phase 5.
- Phase 6 (WASM) is explicitly deferred until Phase 5 is working: WASM replaces compute, not design. Adding it before the TS engine is validated wastes effort if rule logic changes.
- Phase 7 (AI) is last of the three surfaces because it depends on CommandRegistry maturity and a populated preset corpus for RAG.
- Phases 8 and 9 are additive features that don't change core architecture — they can be ordered by user demand after v1 ships.

### Research Flags

Phases needing `/gsd:research-phase` during planning:
- **Phase 1:** wasm-bindgen-cli direct pipeline (post-wasm-pack toolchain); Web Worker + SharedArrayBuffer + COOP/COEP headers in Next.js App Router; Next.js WASM loading with Turbopack fallback
- **Phase 6:** Rust/WASM integration with whole-tick API and zero-copy SharedArrayBuffer bridge; wasm-bindgen-cli build pipeline in CI
- **Phase 7:** OpenAI streaming in Next.js App Router Route Handlers; AI tool call mapping to CommandRegistry; Supabase pgvector RAG setup (HNSW index, chunk sizing)
- **Phase 8:** Multi-viewport scissor rendering pattern in Three.js; 3D InstancedMesh at scale (frustum culling)

Phases with standard, well-documented patterns (skip `/gsd:research-phase`):
- **Phase 2:** CA engine patterns are thoroughly documented; Vitest + TypeScript is standard
- **Phase 3:** Three.js InstancedMesh rendering is well-documented; ping-pong buffer is a known pattern
- **Phase 4:** Zustand stores and EventEmitter wiring is standard; CommandRegistry pattern is established
- **Phase 5:** React + Tailwind UI components are standard; terminal/CLI components have prior art
- **Phase 9:** gif.js Web Worker export is documented; Supabase CRUD is standard

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH (with one override) | All versions verified against official releases. Critical override: STACK.md recommends wasm-pack 0.14.0, but PITFALLS.md confirms it was archived September 2025. Use wasm-bindgen-cli directly. All other stack decisions remain valid. |
| Features | HIGH | Cross-verified against 11 competitor tools (Golly, LifeViewer, VisualPDE, Sandspiel, Powder Toy, NetLogo, etc.). Feature dependency graph is internally consistent. MVP definition is realistic and well-scoped. |
| Architecture | HIGH (core) / MEDIUM (WASM bridge specifics) | Core patterns (Perceive-Update, ping-pong, CommandRegistry, Engine-Store separation) are verified against production CA implementations and ICLR 2025 research. WASM bridge specifics (SharedArrayBuffer, Worker communication protocol) are MEDIUM confidence — known patterns but Next.js-specific integration needs validation. |
| Pitfalls | HIGH | Most pitfalls verified against official sources (Rust blog post on rustwasm sunset, wasm-bindgen GitHub issues, Three.js discourse) and real-world post-mortems. The wasm-pack archival warning is sourced from the official Inside Rust blog. |

**Overall confidence:** HIGH

### Gaps to Address

- **wasm-bindgen-cli in Next.js App Router:** The STACK.md recommendation and PITFALLS.md finding conflict on toolchain (wasm-pack vs wasm-bindgen-cli). The PITFALLS finding is correct and should override STACK.md. The build pipeline for wasm-bindgen-cli + Turbopack/webpack fallback in Next.js needs a working proof-of-concept in Phase 1 before the engine is built.
- **Computed property DSL boundary:** PITFALLS.md flags the decision of whether computed functions run in JS or WASM as a Phase 1 constraint. The YAML schema for `computed:` fields cannot be finalized until this architectural decision is made. Options A (JIT to WASM), B (stack VM in Rust), and C (fixed named operations) need evaluation in Phase 1.
- **Web Worker ↔ Three.js render handoff:** The simulation engine runs in a Worker; Three.js runs on the main thread. The render data handoff (Worker writes pre-computed color buffer → main thread reads into InstancedMesh) needs a concrete SharedArrayBuffer protocol defined in Phase 1. This is not fully specified in the architecture research.
- **Turbopack WASM support:** As of early 2026, Turbopack does not natively support `asyncWebAssembly: true`. The webpack fallback (`next dev --webpack`) is documented in STACK.md but the migration path when Turbopack gains WASM support is unclear. Track Next.js release notes during Phase 6.

## Sources

### Primary (HIGH confidence)
- [Next.js 16 release post](https://nextjs.org/blog/next-16) — version, Turbopack stable, React 19.2, Node.js 20.9+ requirement
- [Tailwind CSS releases](https://github.com/tailwindlabs/tailwindcss/releases) — v4.2.1 CSS-first config confirmed
- [Three.js npm](https://www.npmjs.com/package/three) — r183 confirmed current
- [Zustand npm](https://www.npmjs.com/package/zustand) — v5.0.11 concurrent-safe
- [OpenAI Node.js SDK releases](https://github.com/openai/openai-node/releases) — v6.27.0 (March 5, 2026)
- [Supabase JS GitHub](https://github.com/supabase/supabase-js) — v2.79.0+ drops Node.js 18
- [Zod GitHub](https://github.com/colinhacks/zod) — v4.0 released July 2025
- [Sunsetting the rustwasm GitHub org — Inside Rust Blog](https://blog.rust-lang.org/inside-rust/2025/07/21/sunsetting-the-rustwasm-github-org/) — wasm-pack archived September 2025
- [Life after wasm-pack — nickb.dev](https://nickb.dev/blog/life-after-wasm-pack-an-opinionated-deconstruction/) — wasm-bindgen-cli migration guide
- [CAX: Cellular Automata Accelerated in JAX (ICLR 2025 Oral)](https://arxiv.org/abs/2410.02651) — Perceive-Update architecture pattern
- [Golly Home Page](https://golly.sourceforge.io/) — competitor feature enumeration
- [VisualPDE paper — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10570185/) — architectural approach to browser simulation (peer-reviewed)

### Secondary (MEDIUM confidence)
- [Three.js WebGPU production-ready — utsubo.com](https://www.utsubo.com/blog/threejs-2026-what-changed) — r171+ WebGPU with `three/webgpu`
- [wasm-bindgen GitHub issue #1119](https://github.com/rustwasm/wasm-bindgen/issues/1119) — JS/WASM per-cell boundary performance data
- [Three.js memory leak forum](https://discourse.threejs.org/t/does-threejs-leak-memory/51054) — dispose patterns
- [Web Workers + SharedArrayBuffer — Medium](https://medium.com/@maximdevtool/web-workers-sharedarraybuffer-parallel-computing-for-heavy-algorithms-in-frontend-662391ae0558) — zero-copy WASM bridge patterns
- [Conway's Game of Life in Three.js — Codrops](https://tympanus.net/codrops/2022/11/25/conways-game-of-life-cellular-automata-and-renderbuffers-in-three-js/) — ping-pong buffer in Three.js
- [LifeViewer - LifeWiki](https://conwaylife.com/wiki/LifeViewer) — competitor playback, undo features
- [Sandspiel by maxbittker](https://maxbittker.itch.io/sandspiel) — WASM+WebGL community gallery precedent
- [NetLogo Home](https://www.netlogo.org/) — agent-based modeling features

### Tertiary (LOW confidence — needs validation during implementation)
- [Next.js WASM integration patterns — danirisdiandita.com](https://www.danirisdiandita.com/articles/rust-wasm-nextjs) — webpack experiments config (consistent with Next.js issues tracker but single source)
- Turbopack native WASM support timeline — not confirmed; track Next.js release notes

---
*Research completed: 2026-03-10*
*Ready for roadmap: yes*
