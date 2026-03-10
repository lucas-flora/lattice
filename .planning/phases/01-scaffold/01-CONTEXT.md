# Phase 1: Scaffold - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

A working Next.js project with strict TypeScript, the simulation engine running in a dedicated Web Worker from tick zero, the wasm-bindgen-cli build pipeline proven end-to-end, and Three.js GPU dispose utilities established before any dynamic scene content is written. Folder structure matches the spec. Engine has zero UI imports verified by a lint rule.

Requirements: FOUN-01, FOUN-02, FOUN-03, FOUN-04, FOUN-05, FOUN-06

</domain>

<decisions>
## Implementation Decisions

### WASM Build Pipeline
- Use `wasm-bindgen-cli` directly, NOT wasm-pack (archived Sept 2025)
- Pipeline: `cargo build --target wasm32-unknown-unknown --release` -> `wasm-bindgen --target web --out-dir` -> `wasm-opt -O3`
- Use `mise` or direct cargo install to pin `wasm-bindgen-cli` version per-project
- Proof-of-concept: a Rust "hello" function that takes a number and returns a number, callable from TypeScript in the browser
- WASM output goes to `src/wasm/pkg/` (auto-generated, gitignored except for type stubs)
- For Next.js integration, use webpack fallback config with `asyncWebAssembly: true` experiment since Turbopack does not yet support WASM natively

### Web Worker Architecture
- Simulation loop runs in a dedicated Web Worker from tick zero -- this is load-bearing and non-negotiable
- Communication via `postMessage` with typed message protocol (not Comlink -- too much abstraction for a performance-critical boundary)
- Message types: `{ type: 'tick', payload: ... }`, `{ type: 'init', payload: ... }`, `{ type: 'command', payload: ... }`
- Worker owns engine state; main thread receives state snapshots via structured clone or transferable typed arrays
- SharedArrayBuffer deferred to Phase 7 (WASM Acceleration) -- use transferable ArrayBuffers for now to avoid COOP/COEP header complexity in Phase 1
- Worker file at `src/engine/worker/simulation.worker.ts`
- Proof-of-concept: a minimal tick that increments a counter and posts the value back to the main thread

### Project Structure
- Use `src/` as the root for all application code (Next.js App Router convention)
- Structure inside `src/`:
  - `app/` -- Next.js App Router pages and layouts
  - `engine/` -- Pure TypeScript engine (zero UI imports, testable in Node.js)
    - `core/` -- SimulationEngine, GridState, TimelineController, types
    - `cell/` -- CellPropertySystem, CellPropertyTypes
    - `rule/` -- RuleRunner, RuleTypes, builtin/
    - `preset/` -- PresetLoader, PresetSchema, builtins/
    - `worker/` -- Web Worker entry point and message protocol
  - `renderer/` -- Three.js rendering (separate from engine)
  - `store/` -- Zustand stores (simStore, viewStore, uiStore, aiStore)
  - `commands/` -- CommandRegistry and command definitions
  - `components/` -- React UI components (Terminal, ControlPanel, Viewport, HUD, Layout)
  - `ai/` -- AI assistant integration
  - `lib/` -- Shared utilities
  - `wasm/` -- Rust source and compiled WASM output
- Top-level `engine/` directory also exists as an alias/symlink or tsconfig path for test commands (`pnpm vitest run --dir engine`)
- Rust crate at `crates/lattice-engine/` with standard Cargo.toml

### TypeScript and Linting
- TypeScript strict mode (`"strict": true`) -- non-negotiable
- ESLint (not Biome) for linting -- Next.js 16 ecosystem integration is better with ESLint
- Prettier for formatting -- standard config, consistent with Next.js defaults
- Custom lint rule or ESLint restricted-imports rule to enforce engine has zero UI imports (no `react`, no `next`, no `three` in `src/engine/`)
- `skipLibCheck: true` in tsconfig for compatibility with yaml and Zod type requirements

### Three.js GPU Dispose Utilities
- Create `src/lib/three-dispose.ts` with a `disposeObject(obj: Object3D)` utility
- Recursively traverses scene graph: calls `.dispose()` on geometry, material (handling array materials), and texture
- Pairs `renderer.dispose()` with `WEBGL_lose_context` extension call on unmount
- Unit test asserts `renderer.info.memory.geometries === 0` after disposal
- No actual rendering in Phase 1 -- just the dispose utility and its test

### Zustand Store Stubs
- Create stub stores (simStore, viewStore, uiStore, aiStore) with minimal initial state
- Stores are empty shells in Phase 1 -- they exist to establish the pattern
- Engine-to-store event subscription pattern established but not wired (no engine events yet)
- Stores use `subscribeWithSelector` middleware from the start

### Package Manager and Dependencies
- pnpm as package manager (non-negotiable)
- Phase 1 dependencies: next, react, react-dom, typescript, tailwindcss, three, zustand, yaml, zod
- Dev dependencies: vitest, eslint, prettier, @types/three, @types/react, @types/node
- No @react-three/fiber in Phase 1 -- direct Three.js for now, decision revisited in Phase 4

### CI Pipeline
- GitHub Actions workflow at `.github/workflows/ci.yml`
- Jobs: lint, type-check, unit tests, WASM build verification
- WASM build job installs Rust toolchain and runs the full pipeline
- Tests run via `pnpm vitest run`

### Claude's Discretion
- Exact ESLint rule configuration details
- Prettier formatting options (tabs vs spaces, etc.)
- Exact Tailwind CSS theme customization
- Vitest configuration details (vitest.config.ts)
- next.config.ts specifics beyond WASM experiment
- Exact message protocol field names for Worker communication
- Whether to use `@testing-library/react` in Phase 1 (likely not needed -- no UI tests yet)

</decisions>

<specifics>
## Specific Ideas

- The Web Worker boundary is described as "load-bearing" in the project requirements -- this means it cannot be added later. The Phase 1 proof-of-concept must demonstrate a real tick loop inside the Worker, not just a postMessage round-trip.
- The WASM proof-of-concept must go through the full pipeline (cargo build -> wasm-bindgen -> wasm-opt) and be callable from TypeScript in the browser -- not just compile.
- The engine isolation lint rule is critical: if UI imports leak into `src/engine/`, the entire architecture breaks. This must be enforced from day one.
- Success criteria #2 specifies: "A minimal simulation tick fires inside a Web Worker and posts a message to the main thread -- confirmed via browser DevTools worker panel." This means we need a real page that creates the Worker and logs the messages.
- The `disposeObject()` test needs a Three.js WebGLRenderer, which requires a DOM. Use jsdom or happy-dom in Vitest config for this specific test, or use a mock renderer for the unit test.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet -- greenfield project. Only LICENSE, planning docs, and test directory structure exist.

### Established Patterns
- pnpm as package manager (from config)
- Vitest as test framework (from config)
- Test directories: `src/` and `engine/` for unit tests, `test/integration/` and `test/scenarios/` for higher-level tests

### Integration Points
- `.github/workflows/ci.yml` needs to be created for CI pipeline
- `docker-compose.test.yml` already exists for integration test infrastructure (PostgreSQL with pgvector)
- `.claude/ax/config.json` tracks phase completion

</code_context>

<deferred>
## Deferred Ideas

- SharedArrayBuffer for zero-copy Worker communication -- Phase 7 (WASM Acceleration)
- COOP/COEP headers for cross-origin isolation -- Phase 7 (required for SharedArrayBuffer)
- @react-three/fiber vs direct Three.js decision -- Phase 4 (Rendering)
- Biome vs ESLint re-evaluation -- future if ESLint becomes a bottleneck

</deferred>

---

*Phase: 01-scaffold*
*Context gathered: 2026-03-10*
