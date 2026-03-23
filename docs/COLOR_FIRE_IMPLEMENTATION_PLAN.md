# Color Mapping + Fire: Implementation Plan

Phased build plan for the composable color mapping system and fire simulation preset.

## Phase 1: RampCompiler (Core IR Generation)

**Goal**: Pure function that converts ramp configuration into an IRProgram.

### New Files
- `src/engine/ir/RampCompiler.ts`
- `src/engine/ir/__tests__/RampCompiler.test.ts`

### What It Does

`compileRampToIR(mappings, propertyLayout)` → `IRProgram`

1. For each mapping with `type: "ramp"`:
   - Read source property from cells buffer
   - Normalize to [0,1] using range: `t = clamp((value - min) / (max - min), 0, 1)`
   - Build nested `select/mix/smoothstep` tree for each color channel (R, G, B)
   - Emit `write_property('colorR', ...)`, `write_property('colorG', ...)`, `write_property('colorB', ...)`
2. For alpha channel mappings: same pattern, emit `write_property('alpha', ...)`
3. For per-cell-type mappings (`cell_type` field): wrap each type's ramp in `if (_cellType == typeIndex)`
4. Return single `IRProgram` with all statements

### Key Implementation Detail

Build ramp from right to left — the last segment is the `else` branch:

```typescript
function buildRampChannel(stops: {t: number, value: number}[], tVar: IRNode): IRNode {
  if (stops.length === 1) return IR.f32(stops[0].value);
  if (stops.length === 2) {
    return IR.mix(IR.f32(stops[0].value), IR.f32(stops[1].value),
      IR.smoothstep(IR.f32(stops[0].t), IR.f32(stops[1].t), tVar));
  }
  // Last segment (else branch)
  let result = IR.mix(
    IR.f32(stops.at(-2)!.value), IR.f32(stops.at(-1)!.value),
    IR.smoothstep(IR.f32(stops.at(-2)!.t), IR.f32(stops.at(-1)!.t), tVar));
  // Build from right to left
  for (let i = stops.length - 3; i >= 0; i--) {
    const seg = IR.mix(
      IR.f32(stops[i].value), IR.f32(stops[i+1].value),
      IR.smoothstep(IR.f32(stops[i].t), IR.f32(stops[i+1].t), tVar));
    result = IR.select(IR.lt(tVar, IR.f32(stops[i+1].t)), seg, result);
  }
  return result;
}
```

### Reused Code
- `src/engine/ir/IRBuilder.ts` — `IR.select`, `IR.mix`, `IR.smoothstep`, `IR.clamp`, `IR.readCell`, `IR.writeProperty`, `IR.program`
- `src/engine/ir/validate.ts` — `validateIR()` for correctness checking
- `src/engine/ir/WGSLCodegen.ts` — `generateWGSL()` to verify compilation

### Validation
- [ ] 1-stop ramp → solid color (write_property with literal)
- [ ] 2-stop ramp → single mix/smoothstep (equivalent to current gradient)
- [ ] 8-stop fire ramp → valid IR that passes `validateIR()`
- [ ] Generated WGSL compiles via `generateWGSL()` without errors
- [ ] Color + alpha combined → correct write order (colorR, colorG, colorB, alpha)
- [ ] Per-cell-type → correct `_cellType` branching in IR

---

## Phase 2: GPU Pipeline Integration

**Goal**: Wire the RampCompiler into GPURuleRunner so ramp presets get a visual mapping compute pass.

### Modified Files
- `src/engine/rule/GPURuleRunner.ts` — add `compileVisualMapping()` method
- `src/engine/preset/schema.ts` — extend `VisualMappingSchema`

### GPURuleRunner Changes

After `compileExpressionTags()` (line 164), add:

```typescript
// 12. Compile visual mapping ramp (runs after all expression tags)
this.compileVisualMapping();
```

New method `compileVisualMapping()`:
1. Read `this.preset.visual_mappings`
2. Filter for entries with `type === 'ramp'` and `stops` array
3. If none → return (no-op for binary/gradient presets)
4. Call `compileRampToIR(rampMappings, this.propertyLayout)`
5. `validateIR(irProgram)` — log and skip on failure
6. `generateWGSL(irProgram, config)` with `copyAllProperties: true`
7. Create pipeline via `this.createPipelineWithLayout(wgsl, 'visual-ramp')`
8. Create bind groups (same ping-pong pattern as expression tags)
9. Push to `this.expressionPasses` as the last entry

Also add `hasVisualMappingPass(): boolean` public method for SimulationViewport to query.

### Schema Changes

Extend `VisualMappingSchema` in `schema.ts`:

```typescript
const ColorStopSchema = z.object({
  t: z.number().min(0).max(1),
  color: z.string().optional(),  // hex, for color channel
  alpha: z.number().optional(),  // 0-1, for alpha channel
});

const VisualMappingSchema = z.object({
  property: z.string(),
  channel: z.enum(['color', 'size', 'shape', 'orientation', 'alpha']),
  mapping: z.record(z.unknown()).optional(),  // existing binary/gradient
  type: z.enum(['ramp']).optional(),          // NEW
  range: z.tuple([z.number(), z.number()]).optional().default([0, 1]),  // NEW
  stops: z.array(ColorStopSchema).optional(), // NEW
  cell_type: z.string().optional(),           // NEW
});
```

Backward compatible: `mapping` stays optional, `type`/`range`/`stops` are all optional and only used when `type === 'ramp'`.

### Validation
- [ ] Fire ramp preset loads → visual mapping pass in `expressionPasses`
- [ ] `gpuRunner.hasVisualMappingPass()` returns true for fire, false for Conway's
- [ ] Existing presets: 0 extra compute passes (no `type: "ramp"` → early return)

---

## Phase 3: Scene Node + YAML Serialization

**Goal**: Visual node in the scene tree, created from visual_mappings at load time.

### Modified Files
- `src/engine/scene/SceneNode.ts` — add `VISUAL: 'visual'` to `NODE_TYPES`
- `src/engine/scene/SceneGraph.ts` — create Visual node in `fromSimulation()`

### SceneNode.ts Change

```typescript
export const NODE_TYPES = {
  SIM_ROOT: 'sim-root',
  CELL_TYPE: 'cell-type',
  GROUP: 'group',
  ENVIRONMENT: 'environment',
  GLOBALS: 'globals',
  INITIAL_STATE: 'initial-state',
  SHARED: 'shared',
  VISUAL: 'visual',         // NEW
} as const;
```

### SceneGraph.ts Change

In `fromSimulation()`, after creating Environment/Globals/CellType nodes, create Visual node:

```typescript
// Create Visual node from visual_mappings (if ramp-type mappings exist)
const rampMappings = preset.visual_mappings?.filter(m => m.type === 'ramp');
if (rampMappings && rampMappings.length > 0) {
  graph.addNode({
    type: NODE_TYPES.VISUAL,
    name: 'Color Mapping',
    parentId: simRoot.id,
    childIds: [],
    enabled: true,
    properties: { mappings: rampMappings },
    tags: [],
  });
}
```

### Validation
- [ ] Visual node appears in scene graph for fire preset
- [ ] Visual node does NOT appear for Conway's, Gray-Scott (no ramp mappings)
- [ ] Visual node properties contain correct stops, range, property

---

## Phase 4: Renderer Mode Detection

**Goal**: Fragment shader uses direct mode when ramp compute pass is active.

### Modified Files
- `src/components/viewport/SimulationViewport.tsx`

### Change

In the GPU renderer setup block (~line 466), update the mode detection:

```typescript
// NEW: If ramp visual mapping pass exists, force direct mode
const hasRampPass = gpuRunner.hasVisualMappingPass();

if (hasRampPass || useDirectColor) {
  colorMapping = { mode: 'direct', ...baseConfig };
} else if (parsed.mode === 'gradient') {
  colorMapping = { mode: 'gradient', ...baseConfig };
} else {
  colorMapping = { mode: 'binary', ...baseConfig };
}
```

### Validation
- [ ] Fire preset renders fire colors (temperature ramp applied)
- [ ] Gray-Scott renders orange gradient (unchanged)
- [ ] Conway's renders green/black binary (unchanged)
- [ ] Conway's Advanced renders position-based colors (expression tags still work)
- [ ] Navier-Stokes renders density colors (rule-written colorR/G/B still work)

---

## Phase 5: Fire Simulation Preset

**Goal**: Working fire.yaml that demonstrates the entire system.

### New Files
- `src/engine/preset/builtins/fire.yaml`

### Contents

Full YAML as specified in `FIRE_SIMULATION_DESIGN.md`. Key elements:
- 6 cell properties (temperature, fuel, smoke, vx, vy, pressure)
- 8 env params (viscosity, diffusion, burnRate, coolingRate, ignitionTemp, buoyancy, smokeRate, dt)
- N-S combustion rule (transpilable Python subset)
- 8-stop temperature color ramp (type: ramp)
- Alpha expression tag (temperature + smoke → alpha)

### Also Modified
- Preset loader/registry to include fire preset in the built-in list

### Validation
- [ ] Preset loads without parse errors
- [ ] Rule transpiles to WGSL without errors
- [ ] Ramp compiles to IR and generates valid WGSL
- [ ] Fire renders: black → red → orange → yellow → white gradient
- [ ] Smoke visible as semi-transparent overlay
- [ ] Buoyancy visible: hot gas and smoke rise
- [ ] Combustion works: fuel near hot cells ignites, fuel depletes
- [ ] Draw fuel + click to ignite works interactively

---

## Phase 6: Inspector UI (Color Ramp Editor)

**Goal**: Editable ramp in the Inspector panel for the Visual node.

### New Files
- `src/components/panels/inspector/VisualSection.tsx`
- `src/components/ui/GradientBar.tsx`
- `src/commands/definitions/visual.ts`

### Modified Files
- `src/components/panels/InspectorPanel.tsx` — add VisualSection case
- `src/commands/definitions/index.ts` — register visual commands

### UI Components

**GradientBar** (`<canvas>`, ~200x24px):
- Renders the current ramp as a horizontal gradient
- Draws stop handles as small triangles below the bar
- Click on bar to add stop, click handle to select, drag to reposition

**VisualSection**:
- Property dropdown (lists cell properties — temperature, fuel, etc.)
- Mode selector (Binary / Gradient / Ramp / Direct)
- GradientBar with interactive stops
- Range inputs (min/max number fields)
- Hex color input for selected stop

**Commands**:
- `visual.setMapping` — full configuration
- `visual.addStop` — add a stop at position
- `visual.removeStop` — remove by index
- `visual.moveStop` — reposition
- `visual.setRange` — change normalization range
- `visual.list` — display current mappings

### Validation
- [ ] Inspector shows color ramp when Visual node is selected
- [ ] Stop handles are draggable
- [ ] Color changes update the ramp live
- [ ] Adding/removing stops triggers GPU recompilation
- [ ] Range changes affect color distribution

---

## Phase 7: Tests

### New Files
- `src/engine/ir/__tests__/RampCompiler.test.ts` — unit tests
- `test/integration/visual-mapping.test.ts` — integration tests
- `test/scenarios/color-ramp-workflow.test.ts` — scenario tests

### Unit Tests (RampCompiler)
- 1-stop solid color
- 2-stop equivalent to gradient
- 8-stop fire ramp (IR validity + WGSL compilation)
- Alpha channel ramp
- Mixed color + alpha
- Per-cell-type branching
- Edge cases: unsorted stops, duplicate t values, out-of-range values

### Integration Tests
- Load fire.yaml → verify ramp compute pass exists
- Load Conway's → verify no ramp compute pass
- Fire preset: verify colorR/G/B buffer values match expected ramp output
- Backward compat: all existing presets render identically

### Scenario Tests
- Full workflow: load fire preset → verify visual output → edit ramp in Inspector → verify update

---

## Build Order & Dependencies

```
Phase 1: RampCompiler       (standalone, no dependencies)
Phase 2: GPU Integration    (depends on Phase 1)
Phase 3: Scene Node         (depends on Phase 2 for full test, but can parallelize)
Phase 4: Renderer Detection (depends on Phase 2)
Phase 5: Fire Preset        (depends on Phase 2 + Phase 4)
Phase 6: Inspector UI       (depends on Phase 3 + Phase 5)
Phase 7: Tests              (run incrementally per phase)
```

Phases 3 and 4 can be done in parallel. Phase 5 is the integration test — if fire renders correctly, the system works.

## Complexity Estimates

| Phase | Files | Complexity | Notes |
|-------|-------|-----------|-------|
| 1. RampCompiler | 2 new | Medium | Core algorithm: nested select/mix tree builder |
| 2. GPU Integration | 2 modified | Low | Mirrors existing compileExpressionTags pattern |
| 3. Scene Node | 2 modified | Low | Add type constant + node creation in fromSimulation |
| 4. Renderer Detection | 1 modified | Low | One conditional check in mode detection |
| 5. Fire Preset | 1 new, 1 modified | Medium | Rule tuning for convincing fire behavior |
| 6. Inspector UI | 5 new/modified | High | Interactive gradient editor with drag/color picker |
| 7. Tests | 3 new | Medium | Three-tier test pyramid coverage |
