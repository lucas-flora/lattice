# Roadmap: Lattice

## Milestones

- ✅ **v1.0 Universal Simulation Substrate** — Phases 1-10 (shipped 2026-03-10)
- ✅ **WebGPU Migration** — All 7 phases complete (branch: `feature/webgpu-migration`, 2026-03-22)

## Phases

<details>
<summary>✅ v1.0 Universal Simulation Substrate (Phases 1-10) — SHIPPED 2026-03-10</summary>

- [x] Phase 1: Scaffold — Project foundation, Web Worker boundary, WASM toolchain, GPU dispose
- [x] Phase 2: Substrate — Grid engine (1D/2D/3D), Cell Property System, YAML preset schema
- [x] Phase 3: Rule Engine — Perceive-Update execution, TypeScript rules, 6 built-in presets, undo/redo
- [x] Phase 4: Rendering — Three.js unified renderer, VisualMapper, zero-copy data path, pan/zoom
- [x] Phase 5: Command Hub — CommandRegistry, Zustand stores, engine-store event protocol
- [x] Phase 6: Surfaces — Simulation controls, CLI terminal, GUI panels, cell drawing
- [x] Phase 7: WASM Acceleration — Rust rule execution, SharedArrayBuffer bridge, whole-tick API
- [x] Phase 8: AI Surface — OpenAI assistant, ContextBuilder, Supabase RAG, command execution
- [x] Phase 9: Advanced Rendering — Multi-viewport, 3D grid, timeline scrubbing, fullscreen
- [x] Phase 10: Polish — Hotkeys, screenshot, parameter graphs, RAG docs, performance pass

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

## Progress

| Phase | Milestone | Status | Completed |
|-------|-----------|--------|-----------|
| 1. Scaffold | v1.0 | Complete | 2026-03-10 |
| 2. Substrate | v1.0 | Complete | 2026-03-10 |
| 3. Rule Engine | v1.0 | Complete | 2026-03-10 |
| 4. Rendering | v1.0 | Complete | 2026-03-10 |
| 5. Command Hub | v1.0 | Complete | 2026-03-10 |
| 6. Surfaces | v1.0 | Complete | 2026-03-10 |
| 7. WASM Acceleration | v1.0 | Complete | 2026-03-10 |
| 8. AI Surface | v1.0 | Complete | 2026-03-10 |
| 9. Advanced Rendering | v1.0 | Complete | 2026-03-10 |
| 10. Polish | v1.0 | Complete | 2026-03-10 |

---

<details>
<summary>✅ WebGPU Migration (Phases 0-6) — COMPLETE</summary>

- [x] Phase 0: Performance Baseline — Benchmark harness, Supabase recording, `bench.run`/`bench.results` CLI
- [x] Phase 1: GPU Infrastructure — `GPUContext`, `BufferManager`, `ShaderCompiler`, `ComputeDispatcher`
- [x] Phase 2: IR + WGSL Codegen — Typed IR, `IRBuilder`, `WGSLCodegen`, `PythonCodegen`, `validate`, `neighbor_at`
- [x] Phase 3+4: GPU Simulation + Rendering — `GPURuleRunner`, `GPUGridRenderer`, dual-canvas, playback integration
- [x] Phase 5: Python Transpiler — PythonParser → IR for user-authored rules on GPU
- [x] Phase 6: Cleanup — Deleted BUILTIN_IR + all legacy CPU/Pyodide/WASM code, all 9 presets generic, data-driven rendering

Full details: `docs/WEBGPU_MIGRATION_PLAN.md`

</details>

| Phase | Milestone | Status | Completed |
|-------|-----------|--------|-----------|
| 0. Performance Baseline | WebGPU | Complete | 2026-03-18 |
| 1. GPU Infrastructure | WebGPU | Complete | 2026-03-18 |
| 2. IR + WGSL Codegen | WebGPU | Complete | 2026-03-19 |
| 3+4. GPU Sim + Rendering | WebGPU | Complete | 2026-03-20 |
| 5. Python Transpiler | WebGPU | Complete | 2026-03-20 |
| 6. Cleanup | WebGPU | Complete | 2026-03-22 |
