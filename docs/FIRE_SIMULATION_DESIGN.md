# Fire Simulation Design

Navier-Stokes fluid dynamics with combustion, buoyancy, smoke, and multi-stop color ramp rendering.

## Cell Properties

| Name | Type | Default | Role | Purpose |
|------|------|---------|------|---------|
| temperature | float | 0.0 | input_output | Heat value — drives color ramp and buoyancy |
| fuel | float | 0.0 | input_output | Combustible material — consumed during burning |
| smoke | float | 0.0 | input_output | Smoke density — rises, diffuses, fades |
| vx | float | 0.0 | input_output | X velocity — fluid flow |
| vy | float | 0.0 | input_output | Y velocity — fluid flow |
| pressure | float | 0.0 | input_output | Incompressibility constraint |

6 custom + 6 inherent (age, alpha, colorR, colorG, colorB, _cellType) = stride 12.
At 128x128: 128 * 128 * 12 * 4 bytes = 786KB. At 256x256: ~3.1MB. Both fine.

## Environment Parameters

| Name | Label | Default | Min | Max | Step | Purpose |
|------|-------|---------|-----|-----|------|---------|
| viscosity | Viscosity | 0.1 | 0.01 | 0.5 | 0.01 | Fluid viscous diffusion rate |
| diffusion | Diffusion | 0.05 | 0.01 | 0.3 | 0.01 | Heat and smoke diffusion rate |
| burnRate | Burn Rate | 0.02 | 0.001 | 0.1 | 0.005 | Fuel consumption per tick while burning |
| coolingRate | Cooling Rate | 0.005 | 0.001 | 0.05 | 0.001 | Temperature decay per tick |
| ignitionTemp | Ignition Temp | 0.15 | 0.05 | 0.5 | 0.01 | Temperature threshold for combustion |
| buoyancy | Buoyancy | 0.5 | 0.0 | 2.0 | 0.1 | Upward force from temperature |
| smokeRate | Smoke Rate | 0.01 | 0.001 | 0.05 | 0.005 | Smoke generated per unit fuel burned |
| dt | Time Step | 0.5 | 0.01 | 2.0 | 0.1 | Simulation time step |

## Rule (Python subset → WGSL)

```python
# 1. Laplacian diffusion (velocity, heat, smoke)
lap_vx = neighbor_at(0,-1,vx) + neighbor_at(0,1,vx) + neighbor_at(-1,0,vx) + neighbor_at(1,0,vx) - 4.0 * vx
lap_vy = neighbor_at(0,-1,vy) + neighbor_at(0,1,vy) + neighbor_at(-1,0,vy) + neighbor_at(1,0,vy) - 4.0 * vy
lap_t = neighbor_at(0,-1,temperature) + neighbor_at(0,1,temperature) + neighbor_at(-1,0,temperature) + neighbor_at(1,0,temperature) - 4.0 * temperature
lap_s = neighbor_at(0,-1,smoke) + neighbor_at(0,1,smoke) + neighbor_at(-1,0,smoke) + neighbor_at(1,0,smoke) - 4.0 * smoke

# 2. Pressure gradient
dpdx = (neighbor_at(1,0,pressure) - neighbor_at(-1,0,pressure)) * 0.5
dpdy = (neighbor_at(0,1,pressure) - neighbor_at(0,-1,pressure)) * 0.5

# 3. Velocity update (viscous diffusion + pressure + buoyancy)
new_vx = clamp(vx + env_dt * (env_viscosity * lap_vx - dpdx), -5.0, 5.0)
new_vy = clamp(vy + env_dt * (env_viscosity * lap_vy - dpdy - env_buoyancy * temperature), -5.0, 5.0)
self.vx = new_vx * 0.999
self.vy = new_vy * 0.999

# 4. Combustion: fuel + heat -> more heat + smoke
burning = step(env_ignitionTemp, temperature) * step(0.001, fuel)
fuel_consumed = burning * env_burnRate * env_dt
new_fuel = clamp(fuel - fuel_consumed, 0.0, 1.0)
heat_generated = fuel_consumed * 3.0
new_temp = clamp(temperature + env_dt * (env_diffusion * lap_t + heat_generated) - env_coolingRate, 0.0, 1.0)

# 5. Smoke generation and diffusion
smoke_generated = fuel_consumed * env_smokeRate * 10.0
new_smoke = clamp(smoke + env_dt * (env_diffusion * lap_s + smoke_generated) - 0.002, 0.0, 1.0)

# 6. Pressure update (divergence → pressure correction)
div_v = (neighbor_at(1,0,vx) - neighbor_at(-1,0,vx) + neighbor_at(0,1,vy) - neighbor_at(0,-1,vy)) * 0.5
self.pressure = clamp(pressure - env_dt * div_v * 0.5, -10.0, 10.0)

self.temperature = new_temp
self.fuel = new_fuel
self.smoke = new_smoke
```

### Rule Design Notes

- `step(edge, x)` returns 1.0 if x >= edge, else 0.0. Used for branchless combustion check — avoids if/else which compiles to divergent control flow on GPU.
- `burning = step(ignitionTemp, temperature) * step(0.001, fuel)` is 1.0 only when both conditions met (hot enough AND has fuel).
- Velocity damping (`* 0.999`) prevents runaway energy accumulation.
- The buoyancy term (`-env_buoyancy * temperature`) adds upward velocity proportional to heat — hot gas rises, creating the flame shape.
- The cooling term (`- env_coolingRate`) provides linear temperature decay, ensuring fire goes out when fuel is exhausted.
- All the builtins used (`step`, `clamp`, `neighbor_at`) are in the transpilable Python subset and compile to IR → WGSL.

## Visual Mapping

### Temperature Color Ramp (via RampCompiler → compute shader)

```yaml
visual_mappings:
  - property: "temperature"
    channel: "color"
    type: "ramp"
    range: [0.0, 1.0]
    stops:
      - { t: 0.0, color: "#0a0a0a" }     # near-black (empty/cool)
      - { t: 0.10, color: "#1a0000" }     # barely glowing
      - { t: 0.25, color: "#8b0000" }     # dark red
      - { t: 0.40, color: "#cc2200" }     # red
      - { t: 0.55, color: "#ff4500" }     # orange-red
      - { t: 0.70, color: "#ff8c00" }     # orange
      - { t: 0.85, color: "#ffd700" }     # gold/yellow
      - { t: 1.0, color: "#ffffee" }      # near-white (hottest)
```

### Alpha Expression Tag (via existing tag pipeline)

```yaml
expression_tags:
  - name: "fire-alpha"
    owner: { type: "cell-type", id: "default" }
    code: "self.alpha = clamp(temperature * 8.0 + smoke * 2.0, 0.0, 1.0)"
    phase: "post-rule"
    source: "code"
    outputs: ["cell.alpha"]
    inputs: ["cell.temperature", "cell.smoke"]
```

This makes empty cells (no temperature, no smoke) transparent, burning cells fully opaque, and smoke partially visible. The `* 8.0` multiplier means even low temperature (>0.125) produces full opacity for the fire core.

### Rendering Pipeline

1. Rule writes temperature, fuel, smoke, velocity, pressure
2. Expression tag writes alpha from temperature + smoke blend
3. Visual mapping pass (RampCompiler) writes colorR/G/B from temperature ramp
4. Fragment shader reads colorR/G/B + alpha in direct mode

The ramp pass runs AFTER the expression tag. Since the ramp only writes colorR/G/B (not alpha), the alpha value from the expression tag is preserved via `copyAllProperties: true` in the WGSL codegen.

## Initial State

- **Fuel**: Rectangular region, 40% of grid width centered horizontally, bottom 30% vertically. Fuel values 0.8–1.0 with slight randomness for organic appearance.
- **Ignition**: Small cluster (3x3) at center-bottom of fuel patch, temperature = 0.5.
- **Everything else**: All properties at 0 (empty/cool air).

## Interaction

- **Draw tool**: Paints `fuel` property onto cells. Right-click erases (sets fuel to 0).
- **Click to ignite**: Sets `temperature = 0.5` at click position. Fire spreads via diffusion to adjacent fuel.
- **Parameter tuning**: All env params adjustable in Inspector during simulation for real-time experimentation.

## Expected YAML

```yaml
schema_version: "1"

meta:
  name: "Fire"
  author: "Lattice Engine"
  description: "Navier-Stokes combustion with fuel, smoke, and multi-stop color ramp."
  tags: ["2d", "continuous", "fluid", "fire", "combustion"]

grid:
  dimensionality: "2d"
  width: 128
  height: 128
  topology: "toroidal"

cell_properties:
  - name: "temperature"
    type: "float"
    default: 0.0
    role: "input_output"
  - name: "fuel"
    type: "float"
    default: 0.0
    role: "input_output"
  - name: "smoke"
    type: "float"
    default: 0.0
    role: "input_output"
  - name: "vx"
    type: "float"
    default: 0.0
    role: "input_output"
  - name: "vy"
    type: "float"
    default: 0.0
    role: "input_output"
  - name: "pressure"
    type: "float"
    default: 0.0
    role: "input_output"

params:
  - name: "viscosity"
    label: "Viscosity"
    type: "float"
    default: 0.1
    min: 0.01
    max: 0.5
    step: 0.01
  - name: "diffusion"
    label: "Diffusion"
    type: "float"
    default: 0.05
    min: 0.01
    max: 0.3
    step: 0.01
  - name: "burnRate"
    label: "Burn Rate"
    type: "float"
    default: 0.02
    min: 0.001
    max: 0.1
    step: 0.005
  - name: "coolingRate"
    label: "Cooling Rate"
    type: "float"
    default: 0.005
    min: 0.001
    max: 0.05
    step: 0.001
  - name: "ignitionTemp"
    label: "Ignition Temp"
    type: "float"
    default: 0.15
    min: 0.05
    max: 0.5
    step: 0.01
  - name: "buoyancy"
    label: "Buoyancy"
    type: "float"
    default: 0.5
    min: 0.0
    max: 2.0
    step: 0.1
  - name: "smokeRate"
    label: "Smoke Rate"
    type: "float"
    default: 0.01
    min: 0.001
    max: 0.05
    step: 0.005
  - name: "dt"
    label: "Time Step"
    type: "float"
    default: 0.5
    min: 0.01
    max: 2.0
    step: 0.1

rule:
  type: "webgpu"
  compute: |
    lap_vx = neighbor_at(0,-1,vx) + neighbor_at(0,1,vx) + neighbor_at(-1,0,vx) + neighbor_at(1,0,vx) - 4.0 * vx
    lap_vy = neighbor_at(0,-1,vy) + neighbor_at(0,1,vy) + neighbor_at(-1,0,vy) + neighbor_at(1,0,vy) - 4.0 * vy
    lap_t = neighbor_at(0,-1,temperature) + neighbor_at(0,1,temperature) + neighbor_at(-1,0,temperature) + neighbor_at(1,0,temperature) - 4.0 * temperature
    lap_s = neighbor_at(0,-1,smoke) + neighbor_at(0,1,smoke) + neighbor_at(-1,0,smoke) + neighbor_at(1,0,smoke) - 4.0 * smoke
    dpdx = (neighbor_at(1,0,pressure) - neighbor_at(-1,0,pressure)) * 0.5
    dpdy = (neighbor_at(0,1,pressure) - neighbor_at(0,-1,pressure)) * 0.5
    new_vx = clamp(vx + env_dt * (env_viscosity * lap_vx - dpdx), -5.0, 5.0)
    new_vy = clamp(vy + env_dt * (env_viscosity * lap_vy - dpdy - env_buoyancy * temperature), -5.0, 5.0)
    self.vx = new_vx * 0.999
    self.vy = new_vy * 0.999
    burning = step(env_ignitionTemp, temperature) * step(0.001, fuel)
    fuel_consumed = burning * env_burnRate * env_dt
    new_fuel = clamp(fuel - fuel_consumed, 0.0, 1.0)
    heat_generated = fuel_consumed * 3.0
    new_temp = clamp(temperature + env_dt * (env_diffusion * lap_t + heat_generated) - env_coolingRate, 0.0, 1.0)
    smoke_generated = fuel_consumed * env_smokeRate * 10.0
    new_smoke = clamp(smoke + env_dt * (env_diffusion * lap_s + smoke_generated) - 0.002, 0.0, 1.0)
    div_v = (neighbor_at(1,0,vx) - neighbor_at(-1,0,vx) + neighbor_at(0,1,vy) - neighbor_at(0,-1,vy)) * 0.5
    self.pressure = clamp(pressure - env_dt * div_v * 0.5, -10.0, 10.0)
    self.temperature = new_temp
    self.fuel = new_fuel
    self.smoke = new_smoke

expression_tags:
  - name: "fire-alpha"
    owner: { type: "cell-type", id: "default" }
    code: "self.alpha = clamp(temperature * 8.0 + smoke * 2.0, 0.0, 1.0)"
    phase: "post-rule"
    source: "code"
    outputs: ["cell.alpha"]
    inputs: ["cell.temperature", "cell.smoke"]

visual_mappings:
  - property: "temperature"
    channel: "color"
    type: "ramp"
    range: [0.0, 1.0]
    stops:
      - { t: 0.0, color: "#0a0a0a" }
      - { t: 0.10, color: "#1a0000" }
      - { t: 0.25, color: "#8b0000" }
      - { t: 0.40, color: "#cc2200" }
      - { t: 0.55, color: "#ff4500" }
      - { t: 0.70, color: "#ff8c00" }
      - { t: 0.85, color: "#ffd700" }
      - { t: 1.0, color: "#ffffee" }

ai_context:
  description: "Fire simulation: Navier-Stokes combustion with fuel, smoke, and buoyancy"
  hints:
    - "Temperature drives color via multi-stop ramp (black → red → orange → white)"
    - "Fuel is consumed during burning, generating heat and smoke"
    - "Buoyancy adds upward velocity proportional to temperature"
    - "Smoke rises, diffuses, and fades over time"
    - "Alpha = temperature + smoke blend (empty cells are transparent)"
    - "Paint fuel with draw tool, click to ignite"
```

## Multi-Type Extension (Future)

The single-type fire preset above proves the system works. The architecture extends to multi-type scenarios with no new engine features — just a more sophisticated YAML:

### Wood + Air + Water

```yaml
cell_types:
  - id: "air"
    name: "Air"
    properties:
      - { name: "temperature", type: "float", default: 0.0, role: "input_output" }
      - { name: "smoke", type: "float", default: 0.0, role: "input_output" }
      - { name: "vx", type: "float", default: 0.0, role: "input_output" }
      - { name: "vy", type: "float", default: 0.0, role: "input_output" }
      - { name: "pressure", type: "float", default: 0.0, role: "input_output" }
  - id: "wood"
    name: "Wood"
    parent: "air"
    properties:
      - { name: "fuel", type: "float", default: 1.0, role: "input_output" }
  - id: "water"
    name: "Water"
    parent: "air"
    properties:
      - { name: "density", type: "float", default: 1.0, role: "input_output" }
```

The rule branches on `_cellType` to apply different physics:
- **Air**: N-S fluid + combustion (same as single-type preset)
- **Wood**: Conducts heat, consumes fuel, transitions to air when depleted
- **Water**: Falls due to gravity, douses adjacent fire, evaporates at high temperature

Visual mappings branch per type:
- **Air**: temperature → fire color ramp
- **Wood**: fuel → brown/coal/ash ramp (high fuel = fresh wood, low = ash)
- **Water**: density → blue gradient

This is all expressible in the current engine + the RampCompiler's per-cell-type branching.
