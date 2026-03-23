# Color Mapping Architecture

## Problem

The renderer supports only binary (2-color discrete) and gradient (2-color lerp) modes. There is no multi-stop color ramp. Color logic is scattered across rules and expression tags with no single discoverable configuration surface. The fire simulation needs black → red → orange → yellow → white — impossible with the current 2-stop system.

## Decision: Option C — Hybrid Visual Node with IR-Direct Compilation

A **Visual** node in the scene tree provides the discoverable UX. Under the hood, it compiles directly to IR (skipping the Python parser) which generates a WGSL compute shader that writes `colorR/G/B/alpha` to the cells buffer. The fragment shader stays unchanged in direct mode.

### Why not Option A (Renderer compiles through its own shader path)

Would require a new fragment shader compilation pipeline. The existing IR pipeline only generates compute shaders. Adding fragment shader codegen is a large new surface for minimal benefit.

### Why not Option B (Just better UX on expression tags)

No single place to configure visuals. The user must understand expression tags to set up color mapping. Not discoverable. Can't share color configs between presets.

### Why Option C

- **No new execution path** — reuses IR → WGSLCodegen → compute dispatch (same as expression tags)
- **Engine is source of truth** — colorR/G/B values are written to the cells buffer, readable by everything
- **Fragment shader unchanged** — direct mode already reads colorR/G/B from buffer
- **IR-direct avoids Python limitations** — the Python subset can't express nested select/mix chains cleanly; IR can
- **Three Surface Doctrine** — Inspector (ramp editor), Node Editor (future: color nodes), Python (expression tags), CLI (visual.* commands)

---

## Data Model

### YAML Format (backward compatible)

The existing `visual_mappings` format is extended. Old formats still work.

```yaml
# Existing binary (unchanged):
visual_mappings:
  - property: "alive"
    channel: "color"
    mapping:
      "0": "#000000"
      "1": "#00ff00"

# Existing gradient (unchanged):
visual_mappings:
  - property: "v"
    channel: "color"
    mapping:
      min: "#000000"
      max: "#ff6600"

# NEW — multi-stop ramp:
visual_mappings:
  - property: "temperature"
    channel: "color"
    type: "ramp"
    range: [0.0, 1.0]
    stops:
      - { t: 0.0, color: "#000000" }
      - { t: 0.25, color: "#8b0000" }
      - { t: 0.5, color: "#ff4500" }
      - { t: 0.75, color: "#ffa500" }
      - { t: 1.0, color: "#ffffff" }

# NEW — alpha channel ramp:
  - property: "smoke"
    channel: "alpha"
    type: "ramp"
    range: [0.0, 1.0]
    stops:
      - { t: 0.0, alpha: 0.0 }
      - { t: 0.5, alpha: 0.7 }
      - { t: 1.0, alpha: 1.0 }

# NEW — per-cell-type ramp:
  - cell_type: "wood"
    property: "fuel"
    channel: "color"
    type: "ramp"
    stops:
      - { t: 0.0, color: "#333333" }
      - { t: 0.3, color: "#4a2800" }
      - { t: 1.0, color: "#8b4513" }
```

**Detection logic:**
- `type: "ramp"` + `stops` present → compute path (RampCompiler)
- `min`/`max` keys → fragment shader gradient mode (existing)
- `"0"`/`"1"` keys → fragment shader binary mode (existing)

### Scene Node

A new `VISUAL` node type added to `NODE_TYPES`. One per sim-root. Child of sim-root, sibling to Environment, Globals, and CellType nodes.

```typescript
{
  id: 'node_X',
  type: 'visual',
  name: 'Color Mapping',
  parentId: '<sim-root-id>',
  childIds: [],
  enabled: true,
  properties: {
    mappings: [
      {
        property: 'temperature',
        channel: 'color',
        type: 'ramp',
        range: [0.0, 1.0],
        stops: [
          { t: 0.0, color: '#000000' },
          { t: 0.5, color: '#ff4500' },
          { t: 1.0, color: '#ffffff' },
        ],
      },
    ],
  },
  tags: [],
}
```

When disabled (`enabled: false`), the visual mapping pass is skipped and the renderer falls back to legacy fragment shader modes.

---

## Compilation Path

```
Visual node properties (ramp config)
  ↓
RampCompiler.compileRampToIR(mappings, propertyLayout)
  ↓
IRProgram (select/mix/smoothstep tree writing colorR/G/B/alpha)
  ↓
validateIR()
  ↓
generateWGSL(irProgram, { copyAllProperties: true })
  ↓
GPUComputePipeline (same as expression tag passes)
  ↓
Dispatched as FINAL expression pass (after all post-rule tags)
  ↓
colorR/G/B/alpha written to cells buffer
  ↓
Fragment shader reads in direct mode (unchanged)
```

### IR Structure for a 4-Stop Ramp

Given stops: `[{t:0, color:#000}, {t:0.3, color:#c00}, {t:0.6, color:#f80}, {t:1, color:#fff}]`

For each channel (R, G, B), the IR builds a right-to-left nested `select` tree:

```
// Normalize input
declare t = clamp((read_property('temperature') - 0.0) / (1.0 - 0.0), 0.0, 1.0)

// R channel: nested select for 3 segments
declare colorR = select(
  t < 0.3,
  mix(0.0, 0.8, smoothstep(0.0, 0.3, t)),     // segment 0→1
  select(
    t < 0.6,
    mix(0.8, 1.0, smoothstep(0.3, 0.6, t)),   // segment 1→2
    mix(1.0, 1.0, smoothstep(0.6, 1.0, t))    // segment 2→3
  )
)
write_property('colorR', colorR)

// Same pattern for G, B channels
```

Using the existing `IR` builder API:
```typescript
IR.select(
  IR.lt(tVar, IR.f32(0.3)),
  IR.mix(IR.f32(0.0), IR.f32(0.8), IR.smoothstep(IR.f32(0.0), IR.f32(0.3), tVar)),
  IR.select(
    IR.lt(tVar, IR.f32(0.6)),
    IR.mix(IR.f32(0.8), IR.f32(1.0), IR.smoothstep(IR.f32(0.3), IR.f32(0.6), tVar)),
    IR.mix(IR.f32(1.0), IR.f32(1.0), IR.smoothstep(IR.f32(0.6), IR.f32(1.0), tVar))
  )
)
```

All IR nodes needed (`select`, `mix`, `smoothstep`, `clamp`, `read_property`, `write_property`, `declare_var`, `lt`, `div`, `sub`) already exist in `IRBuilder.ts`. No new IR types required.

### Per-Cell-Type Branching

When `cell_type` is specified on a mapping, the RampCompiler wraps each type's ramp in an `if` statement reading `_cellType`:

```
if (_cellType == 0) {   // air type
  t = clamp(temperature, 0, 1)
  colorR = <fire ramp select tree>
  colorG = ...
  colorB = ...
}
if (_cellType == 1) {   // wood type
  t = clamp(fuel, 0, 1)
  colorR = <wood ramp select tree>
  colorG = ...
  colorB = ...
}
```

All types evaluated in one compute dispatch. The `_cellType` inherent property is already in every cell's buffer.

---

## UX Surfaces

### Inspector Panel
- **Color Ramp Editor**: Horizontal gradient bar, draggable stop handles, hex color input, property dropdown, range inputs
- Appears when a Visual node is selected in the Object Manager
- Live preview: edits trigger GPU recompilation immediately

### CLI Commands
- `visual.setMapping { property, channel, type, range, stops }` — configure a mapping
- `visual.addStop { channel, t, color }` — add a color stop
- `visual.removeStop { channel, index }` — remove a stop
- `visual.list` — show current visual mappings

### YAML
Full visual mapping serializes to/from the `visual_mappings` section. The YAML is the source of truth for presets.

### Node Editor (future)
The Visual node's mappings appear as connectable ports. Input: cell property value. Output: colorR/G/B. The ramp configuration is a node parameter. Wiring a different property to the input changes what drives the ramp.

### Python Scripting
Users can always bypass the Visual node by writing expression tags that set colorR/G/B/alpha directly. The Visual node provides the friendly UX for the common case.

---

## Data Flow Diagram

```
Simulation Tick
  │
  ├─ Rule (compute shader)
  │   └─ Writes: temperature, fuel, smoke, vx, vy, pressure
  │
  ├─ Expression Tags (compute shaders, post-rule)
  │   └─ Example: "self.alpha = clamp(temperature * 8.0 + smoke * 2.0, 0, 1)"
  │
  ├─ Visual Mapping Pass (compute shader, FINAL)  ← NEW
  │   ├─ Reads: temperature (or fuel, density, etc.)
  │   ├─ Evaluates: multi-stop ramp via select/mix/smoothstep
  │   └─ Writes: colorR, colorG, colorB (and optionally alpha)
  │
  └─ Fragment Shader (render pass)
      ├─ Reads: colorR, colorG, colorB, alpha from cells buffer
      ├─ Mode: direct (mode 2) — unchanged
      └─ Output: pixel color on screen
```

---

## What Changes vs What's New

### No changes needed
- `src/engine/ir/types.ts` — existing IR types sufficient
- `src/engine/ir/IRBuilder.ts` — all needed builder functions exist
- `src/engine/ir/WGSLCodegen.ts` — select/mix/smoothstep already handled
- `src/engine/ir/validate.ts` — validation works for ramp IR
- `src/renderer/GPUGridRenderer.ts` — direct mode already reads colorR/G/B

### New files
- `src/engine/ir/RampCompiler.ts` — ramp config → IRProgram
- `src/components/panels/inspector/VisualSection.tsx` — Inspector UI
- `src/components/ui/GradientBar.tsx` — reusable gradient canvas
- `src/commands/definitions/visual.ts` — CLI commands

### Modified files
- `src/engine/rule/GPURuleRunner.ts` — add `compileVisualMapping()` method
- `src/engine/preset/schema.ts` — extend VisualMappingSchema
- `src/engine/scene/SceneNode.ts` — add `VISUAL` to `NODE_TYPES`
- `src/engine/scene/SceneGraph.ts` — create Visual node in `fromSimulation()`
- `src/components/viewport/SimulationViewport.tsx` — force direct mode when ramp active

---

## Fire Simulation: Concrete Example

See `FIRE_SIMULATION_DESIGN.md` for the full fire preset specification. The fire preset demonstrates:

1. **Multi-stop ramp**: 8 color stops from black through fire colors to white
2. **Alpha from expression tag**: smoke + temperature → alpha (preserves transparency for empty cells)
3. **Separation of concerns**: rule handles physics, ramp handles visuals, expression tag handles alpha blending

The same architecture extends to multi-type scenarios (wood/air/water) via per-cell-type ramps — no new engine features, just more sophisticated YAML.
