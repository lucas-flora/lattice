# Testing Requirements (AX)

Every feature implementation MUST include tests at all three tiers:

## Test Tiers
1. **Unit tests** — Test individual functions/methods in isolation. Mock external dependencies.
2. **Integration tests** — Test component interactions with real services via docker-compose.test.yml.
3. **Scenario tests** — Test full user workflows end-to-end.

## Test Naming
Use semantic names: `Test<Component>_<Behavior>[_<Condition>]`
- Good: `TestGridEngine_InitializeWithPingPong`, `TestFullSimulationTickFlow`
- Bad: `TestShouldWork`, `Test1`, `TestGivenUserWhenLoginThenSuccess`

## Reference
- See `TEST_GUIDE.md` for requirement-to-test mapping
- See `.claude/ax/references/testing-pyramid.md` for full methodology
- Every requirement in ROADMAP.md must map to at least one scenario test

## Phase 10: Polish — Testing Requirements
- **GUIP-02** Parameter graphs: unit tests for data sampling, graph data updates; integration tests for live update during simulation
- **GUIP-03** HUD menus: unit tests for contextual menu rendering and keyboard shortcut display
- **GUIP-04** Hotkeys: unit tests for KeyboardShortcutManager mapping; integration tests for command execution via hotkey
- **GUIP-05** Screenshot: unit tests for canvas-to-PNG export; integration test for viewport.screenshot command
- **GUIP-06** RAG docs: unit tests for document structure; integration test for seed script document count
- **GUIP-07** Performance: unit test documenting measured frame times for Gray-Scott 512x512

## Frontend Design
- **Theme**: Dark (zinc-900/zinc-800 backgrounds, zinc-300/400 text, green-400/500 accents) consistent with existing HUD/ControlBar
- **Parameter Graphs**: Sparkline-style mini-charts in ParamPanel using canvas 2D context. Ring buffer of last 200 samples. Show live cell count and generation rate (ticks/sec). Monochrome green (#4ade80) on transparent background.
- **HUD Contextual Menus**: Extend HUD with a hotkey legend overlay toggled via `?` key. Show command name and shortcut in a two-column layout. Semi-transparent zinc-900/95 backdrop.
- **Keyboard Shortcuts**: Space=play/pause, N=step, B=step-back, R=reset, C=clear, T=terminal, P=params, F=fullscreen, S=split, ?=hotkey help. Displayed as `kbd` elements with zinc-700 background and zinc-300 text.
- **Screenshot Button**: Camera icon in ControlBar, triggers canvas.toDataURL('image/png') and downloads via anchor click.
- **Typography**: font-mono throughout for data display. tabular-nums for counters.

## Architecture & Scripting

See `docs/ARCHITECTURE.md` for the full system architecture document (north star).

### Key Architecture Decisions
- **Layout**: Custom recursive tree (no library). `LayoutNode` = split | tabs | panel. JSON-serializable, stored in Zustand.
- **App Shell**: 4 zones (left drawer, center, right drawer, bottom drawer) + pinned Timeline/ControlBar. Each zone has its own layout subtree.
- **Cell Types**: Inheritance via property union. Base type has inherent properties (alive, age, alpha, _cellType). Child types inherit + extend.
- **Scripting**: Python via Pyodide (WASM) in Web Worker. Lazy-loaded. Three modes: per-property expressions, global scripts, global variable store.
- **Performance**: Python rules operate on entire grid via numpy vectorized ops. No per-cell Python loops. Built-in presets keep JS/WASM fast paths.
- **Parameter Addressing**: Dot-path strings (`cell.alive`, `env.feedRate`, `global.myVar`).
- **Linking**: C4D-style property-to-property with range mapping and easing.
- **YAML**: Universal format. Presets, layout, scripts — everything serializes to YAML. URL hash sharing.
- **Independent Viewports**: Each viewport can be its own SimulationInstance with separate Grid/Rule/state.

### Tick Pipeline Order (GPU)
1. Update env params uniform (current slider values)
2. Execute rule stages (1..N GPU compute dispatches, buffer swap after each)
3. Execute post-rule op passes (expression tags + visual mappings — all unified, GPU compute)
4. Fragment shader reads colorR/G/B/alpha → render

### Node Editor & Decompiler
Code ↔ nodes are fully bidirectional. The decompiler uses IR-based decompilation:
`code → PythonParser → IR → walk IR → create visual NodeGraph`. The compiler goes
the other direction: `NodeGraph → NodeCompiler → Python code → prettifyCode → tag`.
All views (card view, inspector, node editor) stay in sync via the expression store.
Rule-phase ops recompile GPU rule stages dynamically (not just post-rule ops).

### Visual Mapping
Colors are NEVER written in rules. Visual mappings are regular post-rule ops (same compile path as every other op) that write colorR/G/B via GPU compute. Registered with `owner: { type: 'visual' }` to attach to the Visual scene node. The fragment shader only reads colorR/G/B/alpha from the buffer. Fallback: if no color mapper writes colorR/G/B, first cell property renders as grayscale. Every preset MUST have a visual mapping script.

### Multi-Stage Rules
`rule.stages[]` as alternative to `rule.compute`. Each stage is a separate GPU dispatch. Supports `iterations: N` for solvers. Fire uses 8 stages (17 dispatches/tick).

### Initial State
`initial_state: { type: "script", code: "..." }` — JS executed on CPU at load. Access to `width`, `height`, `buffers`, `Math`. No hardcoded seeding in engine code.

### Built-in Presets
10 presets in `src/engine/preset/builtins/`. All are 100% YAML-driven — the engine has zero preset-specific logic. Every preset defines meta, grid, cell_properties, rule, visual_mappings, and initial_state.
