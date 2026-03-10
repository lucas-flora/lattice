# Pitfalls Research

**Domain:** Universal simulation substrate / cellular automata web app
**Researched:** 2026-03-10
**Confidence:** HIGH (most pitfalls verified against official sources and real-world post-mortems)

---

## Critical Pitfalls

### Pitfall 1: wasm-pack Is Archived — The Rust/WASM Toolchain Changed

**What goes wrong:**
The project spec lists "WASM (Rust) via wasm-pack" as the toolchain. wasm-pack and the entire rustwasm GitHub organization were sunset and archived in July–September 2025. Using it creates a dependency on an unmaintained tool with no future security patches or compatibility updates.

**Why it happens:**
wasm-pack was the dominant Rust→WASM tutorial recommendation for years. Project scoping documents written before September 2025 naturally defaulted to it without knowing the org archived.

**How to avoid:**
Adopt the post-wasm-pack toolchain immediately:
1. Use `wasm-bindgen-cli` directly (transferred to a new org with active maintainers)
2. Build pipeline: `cargo build --target wasm32-unknown-unknown` → `wasm-bindgen --target web` → `wasm-opt`
3. Use `mise` as the declarative tool manager to pin `wasm-bindgen-cli` and `wasm-opt` versions per-project
4. Use `vitest` for JS-side tests; `wasm-bindgen-test-runner` + Geckodriver for browser-specific Rust tests

**Warning signs:**
- Any tutorial or dependency that pulls in `wasm-pack` CLI
- Build scripts calling `wasm-pack build`
- CI pipelines that `cargo install wasm-pack`

**Phase to address:** Foundation phase (Phase 1). Lock the toolchain before writing a single line of Rust. Do not let incorrect tooling assumptions bake into the build system.

---

### Pitfall 2: JS/WASM Boundary Crossing in the Simulation Tick Loop

**What goes wrong:**
The WASM rule engine gets called per-cell or per-row inside the tick loop rather than per-tick. At a 512×512 grid (262,144 cells), a single JS→WASM call costs ~100–200ns. At 262,144 calls per tick at 60fps, this is ~3 billion nanoseconds of boundary overhead alone — before any computation.

**Why it happens:**
wasm-bindgen makes JS→WASM calls syntactically trivial, hiding their cost. Developers naturally write `engine.compute_cell(x, y)` in a JS loop instead of `engine.tick(full_grid_buffer)`.

**How to avoid:**
- Design the WASM API around whole-tick operations: Rust receives the full grid buffer, runs the complete rule pass, writes results back — one call per tick
- Use `SharedArrayBuffer` or WASM linear memory views (`Uint8Array` / `Float32Array` over `wasmMemory.buffer`) to share grid state without copying
- Never copy large buffers across the boundary per frame; pin the JS typed array to WASM memory once and reuse it
- If WASM memory grows (`.grow()`), typed array views are detached and must be re-pinned — track this explicitly

**Warning signs:**
- WASM API has per-cell methods like `get_cell(x, y)` or `set_cell(x, y, val)`
- JS code has `for (let i = 0; i < gridSize; i++) { wasmModule.compute(...) }`
- Profiler shows WASM calls in the thousands per frame

**Phase to address:** Phase 1 (engine core + WASM integration). Establish the boundary contract before implementing any rules — it determines the entire WASM API shape.

---

### Pitfall 3: Three.js GPU Memory Leaks on Grid Resize or Rule Swap

**What goes wrong:**
When the user changes grid dimensions, swaps presets, or navigates between viewports, old geometries, materials, and textures remain allocated on the GPU. Three.js does not garbage-collect GPU resources automatically. Over a session, VRAM fills up, performance degrades, and WebGL contexts eventually get killed by the browser.

**Why it happens:**
`scene.remove(object)` only removes from the scene graph. Calling `.dispose()` on geometry, material, and texture must be done explicitly and separately. Forgetting any one of them leaves GPU allocations stranded. The animation loop also continues running after the canvas is unmounted unless `cancelAnimationFrame` is called.

**How to avoid:**
- Write a single `disposeObject(obj)` utility that traverses the scene graph and calls `geometry.dispose()`, `material.dispose()` (handling array materials), and `texture.dispose()` on all descendants
- Always pair `renderer.dispose()` with `WEBGL_lose_context` extension call on unmount (forces eager GPU release, especially important in Next.js hot-reload dev mode)
- Store the `requestAnimationFrame` ID and cancel it in the cleanup function — never leave zombie animation loops
- For preset swaps, implement a `reset()` method that disposes the previous scene before allocating the new one
- Use `renderer.info.memory` in development to track geometry/texture counts — add an assertion or dev overlay

**Warning signs:**
- `renderer.info.memory.geometries` or `.textures` keeps climbing during normal use
- Browser Memory tab shows heap growth after preset changes
- "Too many active WebGL contexts" console warning in dev mode (caused by hot-reload creating new renderers without disposing old ones)
- Performance degrades after 10+ minutes of use

**Phase to address:** Phase 1 (Three.js renderer setup). Establish the dispose pattern before building any UI that dynamically creates/destroys scene objects. Retrofitting this is painful.

---

### Pitfall 4: Cell Property System Becoming an Interpretation Bottleneck

**What goes wrong:**
The Cell Property System allows arbitrary computed functions defined in YAML (e.g., `computed: "u * v * v"`). If these are evaluated naively — parsing the expression string, building an AST, and interpreting it per-cell per-tick in JavaScript — a 512×512 grid running at 60fps means 16 million expression evaluations per second. Pure JS interpretation of even simple expressions adds 5–20x overhead vs compiled code.

**Why it happens:**
The YAML format makes computed properties look trivially simple. The assumption is that "it's just a formula." The bottleneck only manifests when grid sizes reach meaningful simulation scales. Early prototypes on small grids (64×64) pass tests fine.

**How to avoid:**
- Compile YAML-defined computed functions to native Rust at load time, not interpret them at runtime
  - Option A: JIT-compile to WASM on load using a lightweight expression compiler in Rust
  - Option B: Restrict computed functions to a safe expression DSL, pre-compile to a stack VM in Rust
  - Option C: For MVP, restrict to a fixed set of named operations (add, multiply, threshold, convolve) and compose them without arbitrary expressions
- Keep the computed function boundary inside the WASM tick — never evaluate computed properties in JavaScript
- Profile with a 512×512 grid before shipping any preset that uses computed properties

**Warning signs:**
- Computed properties evaluated in JavaScript's main thread per-cell
- `eval()` or `new Function()` used on YAML-derived expressions
- Simulation tick time scales faster than O(n) as grid grows
- Gray-Scott or Navier-Stokes presets run acceptably at 128×128 but drop to 5fps at 256×256

**Phase to address:** Phase 1 (Cell Property System design) and Phase 2 (WASM rule execution). The decision of whether computed functions run in JS or WASM must be made before the YAML schema is finalized — changing it later requires a schema breaking change.

---

### Pitfall 5: YAML Preset Schema Instability Breaking Community Presets

**What goes wrong:**
The YAML format is described as "the community-facing API" and "a stable contract." If the schema changes between versions — renaming fields, restructuring `cell_properties`, changing `visual_mappings` key names — all community presets break silently or with cryptic errors. Users lose trust in the format as a portable exchange medium.

**Why it happens:**
Schema design during early development is exploratory. Fields get renamed as the domain model clarifies. Without a versioning mechanism and migration layer, every schema change is a breaking change with no upgrade path.

**How to avoid:**
- Add a `schema_version` field to every YAML preset from day one (e.g., `schema_version: "1"`)
- Define the schema formally (JSON Schema or Zod) before shipping any community-facing features
- Treat any field rename, removal, or type change as a major version bump with a documented migration
- Ship a `lattice validate <preset.yaml>` CLI command that reports schema version and validation errors
- Store all built-in presets as canonical examples that must pass CI validation after any schema change

**Warning signs:**
- Preset YAML has no `schema_version` field
- Built-in preset files are edited without a CI validation step
- New YAML fields added without updating the formal schema
- "It's just YAML" attitude — treating the schema as informal documentation rather than a contract

**Phase to address:** Phase 1 (YAML schema definition). The schema must be formally specced and versioned before any preset is written. Built-in presets are the first schema consumers and should break CI if the schema changes incompatibly.

---

### Pitfall 6: Rendering Two Grids Instead of Mapping Grid State to Visuals

**What goes wrong:**
The engine maintains its own grid state (typed arrays in WASM memory). The renderer needs per-cell color/size/opacity data. Without careful design, developers create a second copy of the grid as a JavaScript array or Three.js attribute buffer, then sync them on every tick. For a 512×512 grid this means copying 262,144 values every frame, which adds 2–5ms per tick and doubles memory use.

**Why it happens:**
The instinctive approach is "read engine state, write to render buffer" as separate steps. The concept of "visual mappings" in the YAML spec is well-intentioned but often implemented as a copy layer rather than a view.

**How to avoid:**
- Use WASM linear memory as the source of truth for cell state; expose a typed array view into that memory (`new Float32Array(wasmMemory.buffer, offset, size)`)
- Write cell visual attributes (color, instance matrix) directly to Three.js `InstancedMesh` attribute buffers using the WASM memory view without intermediate copies
- If the visual mapping is a simple function (e.g., `state → color`), implement it as a vertex shader that reads from a texture updated from the WASM buffer — one GPU upload per tick instead of per-cell JS processing

**Warning signs:**
- `new Array(gridWidth * gridHeight)` or `new Float32Array(gridWidth * gridHeight)` created outside of WASM memory for render purposes
- A `syncToRenderer()` function that copies engine state to render buffers
- `instancedMesh.setColorAt(i, color)` called in a JS for-loop over all cells every tick

**Phase to address:** Phase 1 (engine/renderer data contract) and Phase 2 (visual mapping layer). Establish the zero-copy data path before implementing visual mappings.

---

### Pitfall 7: Undo/Redo Storing Full Grid Snapshots

**What goes wrong:**
Undo/redo is required across all three surfaces (GUI, CLI, AI). Naively storing a full copy of grid state for each undoable action means each undo entry is `gridWidth × gridHeight × bytesPerCell`. At 1024×1024 with 4 bytes per cell = 4MB per snapshot. With 100 undo levels = 400MB of undo history. This triggers browser memory pressure, GC pauses, and eventual tab crashes.

**Why it happens:**
The Command pattern examples found in standard resources store state snapshots. For small state (a UI preference change), snapshots are fine. For grid state, the same approach is catastrophic.

**How to avoid:**
- Use the Command pattern with inverse operations, not state snapshots, for grid mutations
  - Each command stores: what changed (sparse diff), how to apply it, how to reverse it
  - Example: "paint cell (x, y)" stores previous value of cell (x, y) — not the whole grid
- For bulk operations (paste, flood fill, randomize), store a sparse delta (only changed cells)
- Limit undo history depth (50–100 entries) with oldest entries evicted
- For simulation parameter changes (speed, rule coefficients), store only the parameter delta
- Grid reset / load preset are "clear history" operations — do not try to undo them

**Warning signs:**
- `history.push(structuredClone(gridState))` or similar in action handlers
- Memory profiler shows large allocations correlated with undo stack depth
- Undo/redo becomes noticeably slow as session lengthens

**Phase to address:** Phase 2 (undo/redo implementation). Define the Command interface before implementing any undoable action. Retrofitting sparse diffs after snapshot-based undo is a significant rewrite.

---

### Pitfall 8: Main Thread Simulation Blocking the UI at Scale

**What goes wrong:**
Running the simulation tick on the main JavaScript thread — even via WASM — blocks the event loop when tick time exceeds ~16ms. On a large Navier-Stokes grid, a single tick can easily take 30–100ms. This makes the UI stutter or freeze: hotkeys stop working, the terminal becomes unresponsive, and the AI chat input lags.

**Why it happens:**
WASM execution on the main thread is synchronous. The convenience of direct WASM calls from React/Zustand makes it easy to run the tick in the render loop without isolating it to a worker. Small grids work fine in development, hiding the problem.

**How to avoid:**
- Run the simulation engine in a dedicated Web Worker from Phase 1
- Communication pattern: Worker owns grid state in WASM memory; main thread sends control commands (play/pause/step/reset) via `postMessage`; Worker sends rendered output (a pre-computed color buffer) back via `SharedArrayBuffer` or `Transferable`
- Use `SharedArrayBuffer` for the render output buffer if `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers are configured — this is a Next.js configuration requirement
- Main thread never calls into WASM directly for simulation — it only posts messages

**Warning signs:**
- Simulation tick called directly in the Three.js animation loop (same thread)
- No Web Worker in the architecture
- UI input latency measurably increases when simulation is running
- `performance.mark` shows tick durations exceeding 16ms on medium grids

**Phase to address:** Phase 1 (architecture). The Worker↔MainThread boundary must be established before the engine is implemented. Adding it later requires restructuring all engine calls.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Evaluate YAML computed functions in JS with `new Function()` | Fast to implement, no Rust required | Performance collapses at scale; security risk if user input reaches `new Function()` | Never — define the expression DSL boundary in Rust |
| Run simulation on main thread | Simpler architecture, direct WASM calls | UI freezes on large grids; unacceptable UX for fluid sims | MVP prototype only, must be refactored before any fluid sim preset ships |
| Copy grid to JS array for rendering | Simpler data flow | 2× memory, per-frame copy overhead | Never — establish zero-copy path from day one |
| No `schema_version` in YAML | Simpler format | Community presets break on any schema change | Never — add from the first preset file |
| Store full grid snapshots for undo | Easy to implement | Memory explosion on large grids | Only on grids ≤ 64×64 for prototyping |
| Skip `dispose()` during development | Faster iteration | Memory leaks bake into architecture; painful to find later | Never — write the dispose utility before building dynamic scene content |
| Use wasm-pack | Familiar from tutorials | Unmaintained toolchain, no security patches | Never — migrate to wasm-bindgen CLI directly |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Rust/WASM via wasm-bindgen | Calling WASM functions per-cell in a JS loop | Call once per tick with full grid buffer; use WASM memory views to avoid copies |
| Rust/WASM via wasm-bindgen | Not re-pinning `Float32Array` view after WASM memory grows | Subscribe to WASM memory growth events; re-create typed array views when `wasmMemory.buffer` changes |
| Three.js in Next.js (App Router) | Instantiating `WebGLRenderer` in a Server Component or without `'use client'` | All Three.js code must be in `'use client'` components; use `dynamic(() => import(...), { ssr: false })` for the canvas component |
| Three.js + hot reload | `WebGLRenderer` created fresh on every HMR cycle without disposing previous | Use `WEBGL_lose_context` extension + `renderer.dispose()` in the module cleanup hook (`useEffect` return or React strict mode double-invoke) |
| SharedArrayBuffer (Worker ↔ Main) | Missing COOP/COEP headers → `SharedArrayBuffer` unavailable | Configure `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` in Next.js `next.config.js` headers |
| OpenAI API with full app state | Sending full simulation grid state as context on every AI message | Send only metadata (grid dimensions, active preset name, current tick, UI state) — never raw cell data arrays |
| Supabase pgvector RAG | Chunk size too small loses semantic context; too large wastes tokens | Use ~1500-character chunks with 300-character overlap; index with HNSW; filter by metadata (preset type, simulation family) |
| OpenAI API cost runaway | AI assistant fires a request on every simulation state change | Gate AI requests behind explicit user action (button press, Enter key); never auto-trigger on simulation tick |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| JS loop over cells calling WASM per-cell | Profiler shows WASM call count in hundreds of thousands per tick | Whole-tick WASM API; never per-cell calls | 64×64 grid (fine) → 256×256 (noticeable) → 512×512 (unusable) |
| `InstancedMesh.setColorAt()` in JS per-cell per-frame | CPU-bound render loop; GPU underutilized | Write color attributes via typed array view directly into instance buffer; or use a texture + shader | Breaks at ~10,000 cells on lower-end hardware |
| No double-buffer in rule evaluation | Cells in later rows read values already updated in current generation | Always maintain read-buffer and write-buffer; swap after full pass | Incorrect from cell 0, but subtle bugs only noticed at rule testing time |
| Zustand store holding raw grid state | Every cell state change triggers React re-renders across all subscribers | Engine is source of truth; Zustand stores only simulation metadata (tick count, play state, dimensions) — never cell values | Breaks immediately with any grid larger than toy size |
| Fluid sim (Navier-Stokes) without resolution downscaling | 60fps target impossible on CPU at full display resolution | Run physics at 1/4 resolution; upsample to display via shader | Breaks at 256×256 full-res on mid-range hardware |
| requestAnimationFrame not cancelled on component unmount | Memory leak + zombie loop continues consuming CPU | Store rAF ID; call `cancelAnimationFrame` in cleanup | Manifests on every route change or preset swap |
| Three.js geometry recreated every tick | GC pressure from allocating new `BufferGeometry` per frame | Create geometry once; update `BufferAttribute.array` in place; call `attribute.needsUpdate = true` | Breaks at first tick if geometry is naively recreated |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `new Function(yamlComputedExpr)` to evaluate YAML computed properties | Remote code execution if user-supplied presets reach this path; XSS if the result affects the DOM | Never use `eval` or `new Function` on user-provided strings; compile to WASM-side bytecode or restrict to a safe DSL |
| Passing full simulation state to OpenAI API | Token cost explosion; data leak if grid contains user-sensitive seed data | Send only metadata; establish a fixed context schema and enforce it |
| Community preset upload without schema validation | Malformed presets crash the engine for all users; malicious presets could trigger expensive computation loops | Validate against JSON Schema on upload; enforce `maxGridWidth`, `maxGridHeight`, `maxIterations` limits server-side |
| No rate limiting on AI chat surface | Runaway API costs if AI surface is abused | Implement per-session and per-day token budget; surface usage to user; hard-stop at configurable limit |
| WASM memory buffer exposed to arbitrary JS | A bug in WASM boundary code could allow arbitrary memory reads | Wrap WASM memory access in typed accessors; never expose raw `wasmMemory.buffer` to untrusted code paths |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Simulation runs in tight loop with no frame rate cap | Browser tab consumes 100% CPU at idle; laptop fans spin; battery drains | Cap tick rate to a configurable maximum; use `setTimeout` + `requestAnimationFrame` double-scheduling to enforce tick intervals |
| Export (GIF/CSV) blocks the UI during generation | App freezes for seconds; user assumes it crashed | Run export generation in a Web Worker; show progress indicator; use streaming writes |
| Three Surface Doctrine breaks down — CLI command succeeds but GUI doesn't update | Users using keyboard/CLI workflow see stale state | All three surfaces must read from and write to the same Zustand store; never maintain surface-local state |
| Grid editor allows editing during simulation playback | Race condition between user edits and WASM tick; corrupts grid state | Either pause simulation on edit, or queue edits as atomic commands applied at tick boundaries |
| AI assistant sends first message with no context | "I don't know what simulation is running" responses | Always inject current preset name, tick count, play state, and grid dimensions into every AI system prompt |
| 1D simulation (Rule 110) shown in the same 3D viewport as 3D sims | Disorienting; 1D needs a space-time history view, not a 3D scene | Per-dimension viewport mode: 1D uses a 2D history raster; 2D uses overhead orthographic; 3D uses perspective camera |
| Undo across AI surface is ambiguous | User doesn't know if AI executed a command that can be undone | AI commands that execute engine actions must be routed through the same Command pattern as GUI/CLI; all surfaces share one undo stack |

---

## "Looks Done But Isn't" Checklist

- [ ] **WASM Rule Engine:** Verify tick is called once per frame, not once per cell. Check `renderer.info` call count matches expected WASM invocations.
- [ ] **Memory Management:** Run a 5-minute session with `renderer.info.memory` logged. Geometry and texture counts must be stable (not growing) after initial load.
- [ ] **Double Buffer:** Verify rule evaluation reads from buffer A and writes to buffer B; confirm buffers are swapped, not copied, at tick end.
- [ ] **Preset Schema:** Confirm all built-in presets have `schema_version` field and pass the `lattice validate` CLI command in CI.
- [ ] **SharedArrayBuffer Headers:** Verify COOP/COEP headers are served in production. `crossOriginIsolated` must be `true` in the browser console.
- [ ] **Worker Architecture:** Confirm simulation engine runs in a Worker, not the main thread. Main thread should show zero WASM execution time in profiler during simulation.
- [ ] **Undo Stack Memory:** Load a large preset, run 100 undo-able actions, verify heap size is not proportional to grid size × action count.
- [ ] **WebGL Context on HMR:** Trigger 10 hot-reloads in dev mode. Browser memory tab should not show sustained growth. No "Too many active WebGL contexts" warnings.
- [ ] **AI Cost Guard:** Verify AI surface has a visible token budget display and refuses requests that would exceed the session limit.
- [ ] **Export Non-Blocking:** Trigger a GIF export of a large simulation. Verify UI remains interactive (hotkeys, terminal) during generation.
- [ ] **Three Surface Parity:** Execute the same action via GUI, CLI, and AI in sequence. Verify all three produce identical observable state changes.
- [ ] **Computed Properties at Scale:** Run a preset using computed cell properties at 512×512. Tick time must remain under 16ms or a clear "requires WASM" label must be shown.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| wasm-pack toolchain entrenched | MEDIUM | Swap `wasm-pack build` for direct `cargo build` + `wasm-bindgen` + `wasm-opt` pipeline; update CI; no WASM API changes required |
| JS/WASM boundary called per-cell | HIGH | Redesign WASM API surface (Rust side) to accept full grid buffer; update all call sites; may require YAML schema change if computed props were JS-side |
| Three.js memory leak baked in | HIGH | Audit entire codebase for missing `dispose()` calls; write centralized dispose utility; add `renderer.info` assertions to test suite |
| Cell Property System in JS | HIGH | Move expression evaluation to Rust; requires WASM recompile; may require YAML schema adjustments for DSL constraints |
| YAML schema without versioning | HIGH (community impact) | Add `schema_version: "1"` immediately; write migration scripts for any community presets already published; announce breaking change |
| Simulation on main thread | HIGH | Extract engine to Web Worker; all call sites change from direct WASM calls to `postMessage`; Worker/main boundary must be designed fresh |
| Full grid snapshots in undo | MEDIUM | Replace snapshot strategy with sparse Command pattern; existing undo history is discarded on upgrade |
| No COOP/COEP headers | LOW | Add headers to `next.config.js`; test that third-party iframes or scripts still work (may need `Cross-Origin-Resource-Policy` adjustments) |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| wasm-pack toolchain | Phase 1 (Foundation) | CI builds using `cargo build` + `wasm-bindgen` + `wasm-opt` only; no `wasm-pack` in any script |
| JS/WASM boundary per-cell | Phase 1 (Engine + WASM API design) | API review: Rust public API has no per-cell methods; profiler shows WASM calls ≤ 1 per tick |
| Three.js memory leaks | Phase 1 (Renderer setup) | `renderer.info.memory` stable across 10 preset swaps in automated test |
| Main thread simulation | Phase 1 (Architecture) | Performance profiler shows simulation WASM execution in Worker thread, not main |
| SharedArrayBuffer headers | Phase 1 (Next.js configuration) | `crossOriginIsolated === true` in browser console in both dev and production |
| Cell Property bottleneck | Phase 1–2 (CPS design + WASM rules) | 512×512 preset with computed properties ticks under 16ms on target hardware |
| Double buffer correctness | Phase 1–2 (Rule execution) | Deterministic rule test: Conway GoL glider survives 100 ticks with correct cell count |
| Grid-to-render copy overhead | Phase 1–2 (Renderer data path) | Memory profiler shows single allocation for grid state, not two; no `Float32Array` copy in tick path |
| YAML schema instability | Phase 1 (Schema definition) | JSON Schema spec committed; all built-in presets pass `lattice validate` in CI before Phase 2 |
| Undo full-grid snapshots | Phase 2 (Undo/redo) | Undo stack memory measured ≤ 10MB after 100 actions on 1024×1024 grid |
| AI cost runaway | Phase 3 (AI assistant) | Session-level token budget enforced; integration test verifies hard-stop at configured limit |
| Export blocking UI | Phase 3 (Export system) | Export test: GIF generation for 100-frame simulation completes without blocking UI hotkeys |
| Three Surface parity | Each phase adding new actions | Test: same action executed via all three surfaces produces identical Zustand state diff |

---

## Sources

- [Sunsetting the rustwasm GitHub org — Inside Rust Blog](https://blog.rust-lang.org/inside-rust/2025/07/21/sunsetting-the-rustwasm-github-org/)
- [Life after wasm-pack: an opinionated deconstruction — nickb.dev](https://nickb.dev/blog/life-after-wasm-pack-an-opinionated-deconstruction/)
- [16 Patterns for Crossing the WebAssembly Boundary — DEV Community](https://dev.to/rafacalderon/16-patterns-for-crossing-the-webassembly-boundary-and-the-one-that-wants-to-kill-them-all-5kb)
- [Very poor Rust/WASM performance vs JavaScript — wasm-bindgen issue #1119](https://github.com/rustwasm/wasm-bindgen/issues/1119)
- [Three.js memory leak forum — discourse.threejs.org](https://discourse.threejs.org/t/does-threejs-leak-memory/51054)
- [Fixing Performance Drops and Memory Leaks in Three.js — Mindful Chase](https://www.mindfulchase.com/explore/troubleshooting-tips/frameworks-and-libraries/fixing-performance-drops-and-memory-leaks-in-three-js-applications.html)
- [InstancedMesh LOD — 1 million instances — three.js forum](https://discourse.threejs.org/t/instancedmesh-lod-1-million-instances/70748)
- [WebAssembly and Web Workers prevent UI freezes — The New Stack](https://thenewstack.io/for-darryl-webassembly-and-web-workers/webassembly-and-web-workers-preventing-ui-freezes/)
- [SharedArrayBuffer — MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [WebAssembly.Memory — MDN](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory)
- [Conway's Game Of Life — Cellular Automata and Renderbuffers in Three.js — Codrops](https://tympanus.net/codrops/2022/11/25/conways-game-of-life-cellular-automata-and-renderbuffers-in-three-js/)
- [You Don't Know Undo/Redo — DEV Community](https://dev.to/isaachagoel/you-dont-know-undoredo-4hol)
- [Best Practices for AI API Cost and Throughput Management 2025 — Skywork](https://skywork.ai/blog/ai-api-cost-throughput-pricing-token-math-budgets-2025/)
- [Rust vs JavaScript and TypeScript: Performance and WebAssembly — JetBrains Blog](https://blog.jetbrains.com/rust/2026/01/27/rust-vs-javascript-typescript/)

---
*Pitfalls research for: Universal simulation substrate / cellular automata web app (Lattice)*
*Researched: 2026-03-10*
