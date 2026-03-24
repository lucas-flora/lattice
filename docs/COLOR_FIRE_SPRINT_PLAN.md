# Color & Fire Sprint Plan

> **STATUS: COMPLETE.** All 6 milestones delivered. Final audit passed — zero hardcoded colors, initial state, or preset-specific logic in engine code. All 10 presets are 100% YAML-driven.

## What Was Built

A proper visual mapping system that separates simulation state from color computation, plus a physically-accurate fire simulation with Navier-Stokes fluid dynamics and vorticity confinement. The previous attempt failed because the color system couldn't handle multi-property blending, so fire bypassed it entirely. This sprint built the right system first.

---

## Current State Assessment

### What exists (salvageable)
- **RampCompiler** (`src/engine/ir/RampCompiler.ts`): Compiles single-property gradient ramps to IR. Works correctly for `type: ramp`. Keep as-is for Level 1 gradients.
- **GPURuleRunner multi-pass**: Already supports N expression passes dispatched in sequence with ping-pong. This is the foundation for both visual mapping scripts and multi-pass fire rules.
- **PythonParser**: Already supports `if/elif/else`, `clamp`, `smoothstep`, `mix`, `step`, `neighbor_at`, property reads/writes. Everything needed for visual mapping scripts.
- **Visual scene node**: `NODE_TYPES.VISUAL` exists, `VisualSection.tsx` renders gradient stop editors.
- **Brush size**: Already implemented in `edit.ts` with `brushSize` in `uiStore`. Max is 7 — needs bump to 50.

### What needs to change
- **Schema**: Add `type: 'script'` to `VisualMappingSchema`. Add `initial_state` section. Add multi-stage `rule.stages` as alternative to single `rule.compute`.
- **GPURuleRunner**: Handle `visual_mapping: { type: script }` — compile the script code as an expression tag. Handle `rule.stages` for multi-pass rules.
- **Fire preset YAML**: Complete rewrite — proper N-S physics with velocity field, semi-Lagrangian advection, vorticity confinement, pressure projection. Colors moved to `visual_mapping: { type: script }`.
- **AppShell.tsx**: Remove all hardcoded `initializeSimulation` seeding. Replace with YAML `initial_state` system.
- **Gray-Scott YAML**: Add proper `type: ramp` with `stops` so it uses the GPU ramp compiler instead of the dormant `min/max` mapping.

---

## Milestones

### M1: Plan reviewed
This document. You're reading it.

### M2: Visual mapping system works
Gray-Scott renders via YAML `visual_mapping` with `type: ramp` + stops. Fire renders via `type: script`. No hardcoded colors anywhere.

**Delivers:**
- Updated schema supporting `type: 'script'` visual mappings
- GPURuleRunner compiles `type: script` visual mappings as expression passes
- Gray-Scott YAML updated with proper ramp stops
- Fire YAML visual mapping section with `type: script` code that reads temperature/fuel/smoke and writes colorR/G/B/alpha
- Fire rule code stripped of all colorR/G/B/alpha writes
- Visual node in Object Manager shows the mapping type and is editable

### M3: Multi-pass rule architecture + fire physics
Fire preset uses staged compute passes. Physics running (advection, diffusion, combustion, buoyancy). Even if it looks rough.

**Delivers:**
- Schema extension: `rule.stages[]` as alternative to `rule.compute`
- GPURuleRunner creates N pipelines from stages, dispatches in sequence
- Support for `iterations` on a stage (Jacobi pressure solver)
- Fire YAML rewritten with proper staged physics
- New cell properties: `vx`, `vy`, `pressure`, `curl`

### M4: Vorticity confinement + tuning
Fire looks like fire. Turbulent, flickering, vortices visible.

**Delivers:**
- Vorticity compute + confinement force stages added to fire rule
- `vorticity_strength` param visibly affects turbulence
- Parameter tuning pass for all fire params
- Semi-Lagrangian advection if the PythonParser can handle it (see Risks)

### M5: Visual mapping for fire
Fire colors come from `visual_mapping: { type: script }` in YAML. Rule code contains zero colorR/G/B writes.

**Delivers:**
- Fire visual mapping script in YAML with fuel/temperature/smoke conditional coloring
- Verified: deleting visual_mapping section → fire renders but with no color (black)
- Verified: modifying visual_mapping script → colors change without touching rule

### M6: Polish
Initial state from YAML, brush size up to 50, everything loads clean.

**Delivers:**
- `initial_state` YAML section with `type: script` support
- Parser/runner for initial state scripts (CPU-side, runs once on load)
- All `initializeSimulation()` hardcoded seeding removed from AppShell
- Gray-Scott and Fire initial states defined in their YAMLs
- Brush size max bumped from 7 to 50
- Navier-Stokes preset cleaned up (colors moved to visual_mapping)

---

## Architecture Decisions

### Decision 1: `type: script` visual mapping compiles as an expression tag

**Rationale:** The expression tag pipeline (Python → IR → WGSL → GPU compute pass) already handles everything a visual mapping script needs: property reads, conditionals, `clamp`/`smoothstep`/`mix`, colorR/G/B writes. Adding a new compilation path would be redundant.

**Implementation:** In `GPURuleRunner.compileVisualMapping()`, when a mapping has `type: 'script'`, parse its `code` through `parsePython()`, compile to WGSL, and add as the final expression pass (after any ramp passes). The script runs as a standard post-rule compute shader.

### Decision 2: Multi-pass rules via `rule.stages[]`

**Rationale:** Fire needs 7+ compute passes per tick (advection, diffusion, combustion, buoyancy, vorticity compute, vorticity apply, pressure Jacobi x20, pressure project, cooling). A single `compute` body can't do this because intermediate results must be visible to subsequent passes (requires buffer swap between passes).

**Implementation:** The YAML `rule` section accepts either:
- `compute: |` (single pass, existing behavior)
- `stages: [{ name, compute, iterations? }]` (multi-pass, new)

GPURuleRunner creates one pipeline per stage. Stages dispatch in order with buffer swaps between them. A stage with `iterations: N` dispatches N times with swaps.

### Decision 3: `initial_state` as a YAML section with script support

**Rationale:** Hardcoded seeding in AppShell.tsx is the exact problem described in the prompt. Each preset should own its initial state. A script is the most flexible option — it can express random noise, regions, gradients, etc.

**Implementation:** The `initial_state` YAML section has `type: script` with `code` that runs on the CPU (not GPU — it's a one-time setup). The script has access to `x`, `y`, `width`, `height`, property setters. It executes after grid creation but before `captureInitialState()`. Uses a simple interpreter (not the GPU pipeline) since it runs once.

### Decision 4: Semi-Lagrangian advection feasibility

**Rationale:** True semi-Lagrangian advection (`value(x - vx*dt, y - vy*dt)` with bilinear interpolation) requires reading from arbitrary grid positions, not just fixed neighbor offsets. The current `neighbor_at(dx, dy, prop)` only supports integer offsets.

**Options:**
- **A: Extend `neighbor_at` to support float offsets** — requires bilinear interpolation in WGSL codegen. Significant parser + codegen change.
- **B: Implement bilinear interpolation manually** — use `floor(x)`, `fract(x)`, and four `neighbor_at` calls. Works within existing parser if we add `floor` and `fract`.
- **C: Skip semi-Lagrangian, use upwind advection** — simpler, still directional transport via velocity field, good enough for visual fire sim.

**Decision:** Start with **C** (upwind advection using velocity-weighted neighbor sampling). If it looks wrong, upgrade to **B** (manual bilinear with existing builtins — `floor` and `fract` are already in the IR). Semi-Lagrangian with float `neighbor_at` is out of scope for this sprint.

**Upwind advection approach:**
```
# Velocity-directed sampling — blend current cell with upstream neighbor
# This is a simplified advection that moves quantities in the velocity direction
upstream_t = mix(neighbor_at(-1, 0, temperature), neighbor_at(1, 0, temperature), step(0.0, vx))
upstream_t = mix(upstream_t, mix(neighbor_at(0, -1, temperature), neighbor_at(0, 1, temperature), step(0.0, vy)), 0.5)
advected_t = mix(temperature, upstream_t, clamp(sqrt(vx*vx + vy*vy) * dt, 0.0, 0.5))
```

This gives directional transport without needing float-offset neighbor reads.

---

## Files to Create

| File | Purpose |
|------|---------|
| (none — all changes are modifications to existing files or YAML rewrites) | |

## Files to Modify

| File | Changes |
|------|---------|
| `src/engine/preset/schema.ts` | Add `'script'` to VisualMapping type enum. Add `code` field. Add `initial_state` section. Add `stages` to RuleSchema. |
| `src/engine/preset/types.ts` | Update `PresetConfig` type if manually defined (or auto-inferred from Zod). |
| `src/engine/rule/GPURuleRunner.ts` | Handle `type: script` in `compileVisualMapping()`. Handle `rule.stages[]` multi-pass. |
| `src/engine/preset/builtins/gray-scott.yaml` | Replace `min/max` mapping with proper `type: ramp` + `stops`. Add `initial_state` section. |
| `src/engine/preset/builtins/fire.yaml` | Complete rewrite: staged physics, visual mapping script, initial state, new cell properties. |
| `src/engine/preset/builtins/navier-stokes.yaml` | Move hardcoded colors to visual mapping. Add initial state. |
| `src/components/AppShell.tsx` | Remove `initializeSimulation()` hardcoded seeding. Replace with `initial_state` handler. |
| `src/commands/definitions/edit.ts` | Bump brush size max from 7 to 50. |
| `src/store/uiStore.ts` | Update brushSize validation/doc if needed. |
| `src/engine/preset/builtinPresetsClient.ts` | Will auto-update when YAML files change (imports inline YAML). |
| `src/components/panels/inspector/VisualSection.tsx` | Show script code editor for `type: script` mappings (in addition to existing gradient editor). |

## Files to Delete

None.

---

## Risks and Mitigations

### Risk 1: PythonParser can't handle complex fire physics
**Likelihood:** Medium. The parser handles basic expressions but fire needs things like velocity-weighted blending.
**Mitigation:** Test each physics step individually. If a construct isn't supported, break it into simpler statements the parser can handle. The parser supports local variables, so complex expressions can be decomposed.

### Risk 2: Multi-pass dispatch with 20+ Jacobi iterations is slow
**Likelihood:** Low. Each dispatch is a single workgroup grid — 512x512 at workgroup 8x8 = 4096 dispatches. Modern GPUs handle this fine.
**Mitigation:** If too slow, reduce Jacobi iterations to 10 or implement Red-Black Gauss-Seidel (needs only 2 passes). Can also batch dispatches into a single command encoder.

### Risk 3: Vorticity confinement needs the curl field from the *current* frame
**Likelihood:** High — this is a known requirement. Computing curl and applying confinement must be two separate passes because vorticity confinement reads the curl magnitude of *neighbors*, which means curl must be fully computed for all cells before the confinement force is applied.
**Mitigation:** This is why we use `rule.stages` — the `vorticity_compute` stage writes `curl`, buffer swaps, then `vorticity_apply` reads `curl` from neighbors. This is architecturally correct.

### Risk 4: Initial state scripts need randomness
**Likelihood:** High — fire initial state uses `Math.random()` for organic fuel placement.
**Mitigation:** The initial state script runs on CPU (JavaScript), not GPU. It has full access to `Math.random()`. The script is evaluated as JS with property setter functions provided as context. This is intentionally NOT the GPU pipeline — it's a one-time setup.

### Risk 5: Expression tag ordering — visual mapping must run LAST
**Likelihood:** Low — already handled. `compileVisualMapping()` runs after `compileExpressionTags()`, so visual mapping passes are appended to the end of `expressionPasses[]`.
**Mitigation:** Already correct in current architecture. Document this invariant.

---

## Execution Order

```
M2: Visual Mapping System
  1. Update schema (add script type, code field)
  2. Update GPURuleRunner.compileVisualMapping() to handle script type
  3. Update Gray-Scott YAML with proper ramp stops
  4. Create fire visual mapping script in fire.yaml
  5. Strip colorR/G/B writes from fire rule code
  6. Test both presets render correctly
  → STOP, commit, test checklist

M3: Multi-Pass Rules + Fire Physics
  1. Add stages[] to schema
  2. Extend GPURuleRunner to create multi-stage pipelines
  3. Rewrite fire.yaml with staged physics (advection, diffusion, combustion, buoyancy, cooling)
  4. Add vx, vy, pressure, curl cell properties to fire
  5. Test fire physics run (simulation state updates correctly)
  → STOP, commit, test checklist

M4: Vorticity Confinement
  1. Add vorticity_compute stage (curl field)
  2. Add vorticity_apply stage (confinement force)
  3. Add pressure Jacobi + projection stages
  4. Tune all physics parameters
  5. Test turbulence is visible
  → STOP, commit, test checklist

M5: Fire Visual Mapping
  1. Write the fire visual mapping script (temperature/fuel/smoke → color)
  2. Verify rule code has zero colorR/G/B writes
  3. Verify changing visual_mapping script changes colors
  → STOP, commit, test checklist

M6: Polish
  1. Add initial_state schema
  2. Implement initial state script runner
  3. Add initial_state to fire.yaml, gray-scott.yaml, navier-stokes.yaml
  4. Remove initializeSimulation() from AppShell.tsx
  5. Bump brush size max to 50
  6. Clean up navier-stokes colors
  → STOP, commit, test checklist
```

---

## Milestone Dependency Note: M2 vs M5

The prompt separates visual mapping system (M2) from fire visual mapping (M5). This is intentional — M2 proves the system works with Gray-Scott's simple gradient and a basic script. M3-M4 build the fire physics. M5 then wires the completed fire physics to the proven visual mapping system. This avoids building the visual mapping and fire physics simultaneously, which is what caused the first attempt to fail.

However, to prove `type: script` works in M2, we need *some* script-type visual mapping to test. We'll use a simplified fire visual mapping in M2 (temperature → orange gradient via script, not the full multi-property version). The final multi-property visual mapping comes in M5 after the physics are complete and we know what properties exist and how they behave.
