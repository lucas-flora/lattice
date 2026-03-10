# Phase 7: WASM Acceleration - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Rust implementations of performance-critical rules (Gray-Scott reaction-diffusion, Navier-Stokes fluid dynamics) run transparently via the same RuleRunner interface, with a SharedArrayBuffer zero-copy bridge to the engine Web Worker. TypeScript fallback is always present -- removing the .wasm file causes silent fallback with no errors.

Requirements: RULE-03, RULE-04

</domain>

<decisions>
## Implementation Decisions

### Rust Rule Implementations (RULE-03)
- Implement Gray-Scott reaction-diffusion and Navier-Stokes fluid dynamics in Rust
- Each rule is a Rust function that operates on the entire grid buffer in one call per tick (RULE-04)
- Rust functions receive raw `&mut [f32]` slices for input/output buffers plus grid dimensions and rule parameters
- Gray-Scott signature: `gray_scott_tick(u_buf: &mut [f32], v_buf: &mut [f32], width: u32, height: u32, du: f32, dv: f32, f: f32, k: f32, dt: f32)`
- Navier-Stokes signature: `navier_stokes_tick(vx: &mut [f32], vy: &mut [f32], density: &mut [f32], pressure: &mut [f32], width: u32, height: u32, viscosity: f32, diffusion: f32, dt: f32)`
- Both functions operate in-place on the buffers -- no allocation per tick
- Laplacian computation uses direct neighbor indexing with toroidal wrapping via modular arithmetic
- All Rust rule functions are `#[wasm_bindgen]` exported and accept `&mut [f32]` (wasm-bindgen maps this to JS Float32Array)
- The existing `hello()` and `add()` proof-of-concept functions remain in lib.rs alongside the new rule functions

### Whole-Tick API Design (RULE-04)
- The WASM API accepts the full grid buffer in one call per tick -- NOT per-cell
- Each `*_tick()` function processes all cells in a single invocation, avoiding JS/WASM boundary overhead
- Rust unit test confirms exactly 1 extern boundary crossing per tick by testing that a single function call updates all cells
- The Rust functions handle ping-pong internally: they read from current state and write to separate output positions, or they operate on paired input/output buffers
- Grid buffers are passed as mutable references -- wasm-bindgen handles the JS-to-Rust pointer passing

### SharedArrayBuffer Bridge
- Enable SharedArrayBuffer by adding COOP/COEP headers in next.config.ts:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- Grid property buffers use SharedArrayBuffer backing when available, falling back to regular ArrayBuffer
- The Web Worker and main thread share the same buffer memory -- no postMessage transfer needed for grid data
- WASM module is loaded inside the Web Worker (not on the main thread)
- The worker holds the WASM instance and calls Rust tick functions directly on the shared buffers
- Main thread reads the shared buffers for rendering (read-only from main thread perspective)
- Atomics.wait/notify used for synchronization: worker signals tick completion, main thread reads on next animation frame

### RuleRunner WASM Integration
- Extend RuleRunner to detect and load WASM module for known presets (gray-scott, navier-stokes)
- Detection: attempt dynamic `import()` of the wasm-bindgen generated JS module
- If WASM module loads successfully, RuleRunner.tick() delegates to the Rust function instead of the JS per-cell loop
- If WASM fails to load (file missing, import error), fall back to existing TypeScript execution silently -- no error thrown (RULE-05 already implemented, enhance with actual WASM loading)
- The `isUsingWasm()` method reflects actual runtime state
- WASM-capable presets identified by `rule.type` field: add `'wasm'` as a valid rule type alongside `'typescript'`
- Built-in presets updated: gray-scott.yaml and navier-stokes.yaml get `rule.type: 'wasm'` with the TypeScript compute body retained as fallback

### WASM Build Pipeline Enhancement
- Existing `scripts/build-wasm.sh` already works -- extend it minimally
- Add `console_error_panic_hook` crate for better Rust panic debugging in browser
- Output directory remains `src/wasm/pkg/`
- Generated files: `lattice_engine_bg.wasm`, `lattice_engine.js`, `lattice_engine.d.ts`
- The `.wasm` file is loaded by the worker via the wasm-bindgen generated JS glue code
- Build script already handles wasm-opt optimization for release builds

### Next.js Configuration
- Add custom headers in next.config.ts for SharedArrayBuffer support:
  ```
  headers: [{ source: '/(.*)', headers: [
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
  ]}]
  ```
- Webpack config already has `asyncWebAssembly: true` -- keep it
- Worker instantiation may need adjustment for SharedArrayBuffer: use `new Worker(url, { type: 'module' })` with explicit SharedArrayBuffer support check

### Performance Targets
- Gray-Scott at 512x512: target sub-16ms tick time with WASM (60fps capable)
- Navier-Stokes at 64x64: must not freeze UI thread -- main thread frame rate stays above 30fps
- WASM tick runs in the Worker thread, decoupled from rendering frame rate
- If WASM tick takes longer than 16ms, rendering continues at whatever rate it can sustain -- no UI freeze

### Claude's Discretion
- Exact Atomics synchronization pattern (Atomics.wait/notify vs simple flag polling)
- Whether to use `wasm-bindgen`'s `js_sys` or `web_sys` for any browser API access from Rust
- Internal Rust code organization (single lib.rs vs module structure)
- Exact error handling strategy for WASM load failures (log to console vs silent)
- Whether SharedArrayBuffer feature detection falls back gracefully or skips entirely
- Exact buffer layout for multi-property rules (interleaved vs separate arrays passed to Rust)

</decisions>

<specifics>
## Specific Ideas

- Success criterion #1: Gray-Scott at 512x512 at 60fps with WASM -- this means the Rust implementation must be significantly faster than the TypeScript per-cell loop. The TS version iterates 262,144 cells with neighbor lookups and object allocations per cell. The Rust version should use direct array indexing with no allocations.
- Success criterion #2: Removing the .wasm file causes silent fallback -- RuleRunner must wrap the WASM import in a try/catch and fall back to the existing TypeScript path. This is already partially implemented (tryLoadWasm returns false).
- Success criterion #3: Exactly 1 extern boundary crossing per tick -- the Rust unit test must verify that a single `gray_scott_tick()` call processes all cells. This is architectural, not just a test -- the API must accept full buffers.
- Success criterion #4: Navier-Stokes must not freeze UI -- since the sim runs in a Web Worker, UI thread blocking is already prevented by architecture. The concern is the worker tick taking so long that the frame buffer doesn't update. With WASM acceleration, the 64x64 NS sim should complete ticks fast enough.
- The existing `tryLoadWasm()` in RuleRunner returns false unconditionally -- this is the hook point for Phase 7. Replace with actual WASM module loading.
- SharedArrayBuffer was explicitly deferred from Phase 1 to Phase 7 (documented in Phase 1 CONTEXT.md deferred ideas).
- The build pipeline (cargo build -> wasm-bindgen -> wasm-opt) was proven in Phase 1 with the hello/add functions.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `crates/lattice-engine/src/lib.rs`: Existing Rust crate with wasm-bindgen proof-of-concept (hello, add functions) -- extend with rule implementations
- `scripts/build-wasm.sh`: Working WASM build pipeline (cargo -> wasm-bindgen -> wasm-opt) -- minimal changes needed
- `src/engine/rule/RuleRunner.ts`: Has `tryLoadWasm()` stub returning false and `isUsingWasm()` method -- wire to actual WASM loading
- `src/engine/rule/RuleCompiler.ts`: TypeScript rule compilation via `new Function()` -- remains as fallback path
- `src/engine/grid/Grid.ts`: Float32Array buffers with getCurrentBuffer/getNextBuffer -- these buffers will back SharedArrayBuffers
- `src/engine/worker/simulation.worker.ts`: Worker entry point -- WASM module loads here
- `src/engine/preset/builtins/gray-scott.yaml`: Existing preset with TypeScript compute body -- add wasm rule type
- `src/engine/preset/builtins/navier-stokes.yaml`: Existing preset with TypeScript compute body -- add wasm rule type
- `next.config.ts`: Webpack WASM experiment already configured -- add COOP/COEP headers

### Established Patterns
- Engine is pure TypeScript, zero UI imports -- WASM integration stays in engine layer
- RuleRunner implements IRuleRunner interface -- WASM path must satisfy same interface
- Grid uses separate Float32Arrays per property -- Rust functions receive these individually
- Worker uses typed message protocol -- extend with WASM-related messages if needed
- Test co-location in `__tests__/` directories
- Rust tests via `cargo test -p lattice-engine`

### Integration Points
- `crates/lattice-engine/Cargo.toml`: Add `console_error_panic_hook` dependency
- `crates/lattice-engine/src/lib.rs`: Add gray_scott_tick and navier_stokes_tick functions
- `src/engine/rule/RuleRunner.ts`: Replace tryLoadWasm() stub with actual WASM loading
- `src/engine/rule/types.ts`: May need WasmRuleRunner type or WASM module type definition
- `src/engine/preset/schema.ts`: Add 'wasm' as valid rule type
- `src/engine/preset/builtins/gray-scott.yaml`: Update rule.type to 'wasm'
- `src/engine/preset/builtins/navier-stokes.yaml`: Update rule.type to 'wasm'
- `src/engine/grid/Grid.ts`: Optional SharedArrayBuffer backing for property buffers
- `next.config.ts`: Add COOP/COEP headers
- `src/engine/worker/simulation.worker.ts`: Load WASM module on init

</code_context>

<deferred>
## Deferred Ideas

- WASM implementations for other presets (Conway's GoL, Brian's Brain, etc.) -- not in scope, only Gray-Scott and Navier-Stokes are performance-critical enough to warrant WASM
- GPU compute (WebGPU) for even higher performance -- future consideration beyond v1
- WASM SIMD instructions for vectorized grid operations -- optimization pass in Phase 10
- Custom WASM module loading from user-uploaded .wasm files -- community feature, not v1

</deferred>

## Testing Requirements (AX)

All new functionality in this phase MUST include:
- **Rust unit tests** for all Rust rule implementations (cargo test -p lattice-engine)
- **Unit tests** for WASM loading, fallback behavior, and SharedArrayBuffer bridge
- **Integration tests** for full WASM rule execution pipeline (load preset -> init WASM -> tick -> verify output)
- **Scenario tests** for end-to-end WASM acceleration with fallback verification

### Phase 7 Test Coverage Requirements
- **Gray-Scott Rust implementation**: Unit test verifying correct reaction-diffusion output after N ticks
- **Navier-Stokes Rust implementation**: Unit test verifying correct fluid dynamics output after N ticks
- **Whole-tick API**: Rust unit test confirming exactly 1 extern boundary crossing per tick
- **WASM fallback**: Test that removing WASM module causes silent TypeScript fallback (no error thrown)
- **WASM loading**: Test that RuleRunner detects and loads WASM module for wasm-type presets
- **SharedArrayBuffer**: Test that buffers are shared between worker and main thread when SAB is available
- **Performance**: Benchmark test comparing WASM vs TypeScript tick times on Gray-Scott 512x512

Test naming: `Test<Component>_<Behavior>[_<Condition>]`
Reference: TEST_GUIDE.md for requirement mapping

---

*Phase: 07-wasm-acceleration*
*Context gathered: 2026-03-10*
