# Known Issues

**Last updated:** 2026-03-11

## Fixed

### [FIXED] Viewport renders black — no grid visible
- **Root cause**: SimulationViewport's `useEffect` ran before AppShell's `useEffect` created the controller (React child effects run before parent effects). `getController()` returned null, renderer was never created.
- **Fix**: Changed useEffect deps from `[]` to `[activePreset]` so it retries when the simStore signals a preset is loaded.

### [FIXED] `fs` module imported in browser bundle
- **Root cause**: `SimulationController.ts`, `PresetSelector.tsx`, and `preset.ts` imported from `builtinPresets.ts` which uses `fs.readFileSync`.
- **Fix**: Switched to `builtinPresetsClient.ts` (inlined YAML strings).

### [FIXED] Next.js 16 Turbopack config error
- **Root cause**: `next.config.ts` had a webpack config but no turbopack config. Next.js 16 defaults to Turbopack.
- **Fix**: Replaced webpack config with `turbopack: {}`.

### [FIXED] Screenshot command fails silently
- **Root cause**: `viewport.screenshot` queried `[data-testid="viewport-canvas"]` but canvas had no data-testid.
- **Fix**: Added `data-testid="viewport-canvas"` to dynamically created canvas.

### [FIXED] Preset initialization wrong for Gray-Scott, Navier-Stokes, Langton's Ant
- **Root cause**: `initializeSimulation()` set random binary cells for ALL presets. Gray-Scott needs u/v chemistry, Navier-Stokes needs density+velocity, Langton's Ant needs ant placement.
- **Fix**: Added preset-name-based initialization branches.

### [FIXED] View commands (zoom/pan/fit) disconnected from camera
- **Root cause**: `view.zoom`, `view.pan`, `view.fit` updated `viewStore` and emitted `view:change` events, but SimulationViewport used local CameraController refs that didn't listen for those events.
- **Fix**: Subscribed to `view:change` events in SimulationViewport and applied zoom/pan/fit to the local CameraController.

---

## Open — P2 (Tech Debt)

### WASM acceleration never activates
- **Description**: `Simulation.create()` (async WASM loader) exists but production always uses `new Simulation()`. The Rust WASM crate compiles but is never loaded.
- **Impact**: Gray-Scott/Navier-Stokes run ~4 FPS on 512x512 instead of potentially 40+ FPS.

### Web Worker never instantiated
- **Description**: Simulation runs on main thread. Worker protocol designed but not wired.
- **Impact**: Heavy sims stutter the UI.

### Client Gray-Scott YAML uses type: "typescript" instead of "wasm"
- **Description**: The inlined YAML in `builtinPresetsClient.ts` diverged from the file-based YAML during client module creation.
- **Impact**: Even if WASM path were wired, Gray-Scott would still use TS.
