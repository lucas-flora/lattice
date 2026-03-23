/**
 * Client-safe built-in preset registry.
 *
 * Provides YAML strings inlined as template literals instead of reading from fs.
 * This module is safe for browser/Next.js client-side use.
 *
 * All presets use rule.type: "webgpu" — rules are Python-subset code that
 * transpiles to IR → WGSL and runs as GPU compute shaders.
 */

import { loadPresetOrThrow } from './loader';
import type { PresetConfig } from './types';

/** Names of all built-in presets (same as server-side) */
export const BUILTIN_PRESET_NAMES_CLIENT = [
  'conways-gol',
  'conways-advanced',
  'rule-110',
  'langtons-ant',
  'brians-brain',
  'gray-scott',
  'navier-stokes',
  'fire',
  'link-testbed',
  'seeds',
] as const;

export type BuiltinPresetNameClient = (typeof BUILTIN_PRESET_NAMES_CLIENT)[number];

/** Inlined YAML strings for each preset */
const PRESET_YAMLS: Record<BuiltinPresetNameClient, string> = {
  'conways-gol': `
schema_version: "1"
meta:
  name: "Conway's Game of Life"
  author: "John Conway"
  description: "The classic cellular automaton."
  tags: ["classic", "2d", "binary"]
grid:
  dimensionality: "2d"
  width: 128
  height: 128
  topology: "toroidal"
cell_properties:
  - name: "alive"
    type: "bool"
    default: 0
    role: "input_output"
params:
  - name: "surviveMin"
    label: "Survive Min"
    type: "int"
    default: 2
    min: 0
    max: 8
    step: 1
  - name: "surviveMax"
    label: "Survive Max"
    type: "int"
    default: 3
    min: 0
    max: 8
    step: 1
  - name: "birthCount"
    label: "Birth Count"
    type: "int"
    default: 3
    min: 0
    max: 8
    step: 1
rule:
  type: "webgpu"
  compute: |
    n = neighbor_sum_alive
    if (alive > 0.5 and n >= env_surviveMin and n <= env_surviveMax) or n == env_birthCount:
        self.alive = 1.0
    else:
        self.alive = 0.0
visual_mappings:
  - property: "alive"
    channel: "color"
    mapping:
      "0": "#000000"
      "1": "#00ff00"
`,
  'conways-advanced': `
schema_version: "1"
meta:
  name: "Conway's Advanced"
  author: "Lattice Engine"
  description: "GoL with age-fading, position-based color, and death-by-age tags."
  tags: ["2d", "tags", "visual", "advanced"]
grid:
  dimensionality: "2d"
  width: 128
  height: 128
  topology: "toroidal"
cell_properties:
  - name: "alive"
    type: "bool"
    default: 0
    role: "input_output"
params:
  - name: "maxAge"
    label: "Max Age"
    type: "int"
    default: 200
    min: 20
    max: 1000
    step: 10
  - name: "fadeDuration"
    label: "Fade Duration"
    type: "int"
    default: 50
    min: 5
    max: 200
    step: 5
rule:
  type: "webgpu"
  compute: |
    n = neighbor_sum_alive
    if n == 3 or (alive > 0.5 and n >= 2 and n < 4):
        self.alive = 1.0
        self.age = age + 1.0
    else:
        self.alive = 0.0
        self.age = 0.0
expression_tags:
  - name: "fade-on-age"
    owner: { type: "cell-type", id: "default" }
    code: "self.alpha = max(0.1, 1.0 - self.age / env_fadeDuration) * self.alive"
    phase: "post-rule"
    source: "code"
    outputs: ["cell.alpha"]
    inputs: ["cell.age", "cell.alive"]
  - name: "position-color"
    owner: { type: "cell-type", id: "default" }
    code: |
      self.colorR = float(x) / float(width) * self.alive
      self.colorG = max(0.0, 1.0 - self.age / 100.0) * self.alive
      self.colorB = float(y) / float(height) * self.alive
    phase: "post-rule"
    source: "code"
    outputs: ["cell.colorR", "cell.colorG", "cell.colorB"]
    inputs: ["cell.age", "cell.alive"]
  - name: "death-by-age"
    owner: { type: "cell-type", id: "default" }
    code: "self.alive = np.where(self.age > env_maxAge, 0.0, self.alive)"
    phase: "post-rule"
    source: "code"
    outputs: ["cell.alive"]
    inputs: ["cell.age"]
visual_mappings:
  - property: "alive"
    channel: "color"
    mapping:
      "0": "#000000"
      "1": "#00ff00"
`,
  'rule-110': `
schema_version: "1"
meta:
  name: "Rule 110"
  author: "Stephen Wolfram"
  description: "1D elementary cellular automaton Rule 110."
  tags: ["1d", "elementary", "turing-complete"]
grid:
  dimensionality: "1d"
  width: 256
  topology: "finite"
cell_properties:
  - name: "state"
    type: "bool"
    default: 0
    role: "input_output"
params:
  - name: "ruleNumber"
    label: "Rule Number"
    type: "int"
    default: 110
    min: 0
    max: 255
    step: 1
rule:
  type: "webgpu"
  compute: |
    left = neighbor_at(-1, 0, state)
    right = neighbor_at(1, 0, state)
    pattern = left * 4.0 + state * 2.0 + right
    self.state = floor(env_ruleNumber / pow(2.0, pattern)) % 2.0
visual_mappings:
  - property: "state"
    channel: "color"
    mapping:
      "0": "#ffffff"
      "1": "#000000"
`,
  'langtons-ant': `
schema_version: "1"
meta:
  name: "Langton's Ant"
  author: "Chris Langton"
  description: "A 2D Turing machine."
  tags: ["2d", "ant", "turing-machine"]
grid:
  dimensionality: "2d"
  width: 128
  height: 128
  topology: "toroidal"
cell_properties:
  - name: "color"
    type: "bool"
    default: 0
    role: "input_output"
  - name: "ant"
    type: "bool"
    default: 0
    role: "input_output"
  - name: "ant_dir"
    type: "int"
    default: 0
    role: "input_output"
rule:
  type: "webgpu"
  compute: |
    new_color = color
    new_ant = 0.0
    new_dir = 0.0
    if ant > 0.5:
        new_color = 1.0 - color
    na = neighbor_at(0, -1, ant)
    if na > 0.5:
        d0 = (neighbor_at(0, -1, ant_dir) + 1.0 + 2.0 * neighbor_at(0, -1, color)) % 4.0
        if d0 > 1.5 and d0 < 2.5:
            new_ant = 1.0
            new_dir = d0
    nb = neighbor_at(1, 0, ant)
    if nb > 0.5:
        d1 = (neighbor_at(1, 0, ant_dir) + 1.0 + 2.0 * neighbor_at(1, 0, color)) % 4.0
        if d1 > 2.5 and d1 < 3.5:
            new_ant = 1.0
            new_dir = d1
    nc = neighbor_at(0, 1, ant)
    if nc > 0.5:
        d2 = (neighbor_at(0, 1, ant_dir) + 1.0 + 2.0 * neighbor_at(0, 1, color)) % 4.0
        if d2 < 0.5:
            new_ant = 1.0
            new_dir = d2
    nl = neighbor_at(-1, 0, ant)
    if nl > 0.5:
        d3 = (neighbor_at(-1, 0, ant_dir) + 1.0 + 2.0 * neighbor_at(-1, 0, color)) % 4.0
        if d3 > 0.5 and d3 < 1.5:
            new_ant = 1.0
            new_dir = d3
    self.color = new_color
    self.ant = new_ant
    self.ant_dir = new_dir
visual_mappings:
  - property: "color"
    channel: "color"
    mapping:
      "0": "#ffffff"
      "1": "#000000"
  - property: "ant"
    channel: "color"
    mapping:
      "1": "#ff0000"
`,
  'brians-brain': `
schema_version: "1"
meta:
  name: "Brian's Brain"
  author: "Brian Silverman"
  description: "A 3-state cellular automaton."
  tags: ["2d", "3-state", "chaotic"]
grid:
  dimensionality: "2d"
  width: 128
  height: 128
  topology: "toroidal"
cell_properties:
  - name: "state"
    type: "int"
    default: 0
    role: "input_output"
rule:
  type: "webgpu"
  compute: |
    n = neighbor_count(state, 1)
    if state > 0.5 and state < 1.5:
        self.state = 2.0
        self.colorR = 0.0
        self.colorG = 0.4
        self.colorB = 1.0
    elif state > 1.5:
        self.state = 0.0
        self.colorR = 0.0
        self.colorG = 0.0
        self.colorB = 0.0
    else:
        if n == 2:
            self.state = 1.0
            self.colorR = 1.0
            self.colorG = 1.0
            self.colorB = 1.0
        else:
            self.state = 0.0
            self.colorR = 0.0
            self.colorG = 0.0
            self.colorB = 0.0
visual_mappings:
  - property: "state"
    channel: "color"
    mapping:
      "0": "#000000"
      "1": "#ffffff"
      "2": "#0066ff"
`,
  'gray-scott': `
schema_version: "1"
meta:
  name: "Gray-Scott Reaction-Diffusion"
  author: "Peter Gray & Stephen Scott"
  description: "Reaction-diffusion system."
  tags: ["2d", "continuous", "reaction-diffusion"]
grid:
  dimensionality: "2d"
  width: 128
  height: 128
  topology: "toroidal"
cell_properties:
  - name: "u"
    type: "float"
    default: 1.0
    role: "input_output"
  - name: "v"
    type: "float"
    default: 0.0
    role: "input_output"
params:
  - name: "Du"
    label: "Diffusion U"
    type: "float"
    default: 0.2097
    min: 0.0
    max: 1.0
    step: 0.001
  - name: "Dv"
    label: "Diffusion V"
    type: "float"
    default: 0.105
    min: 0.0
    max: 1.0
    step: 0.001
  - name: "F"
    label: "Feed Rate"
    type: "float"
    default: 0.037
    min: 0.0
    max: 0.1
    step: 0.001
  - name: "k"
    label: "Kill Rate"
    type: "float"
    default: 0.06
    min: 0.0
    max: 0.1
    step: 0.001
  - name: "dt"
    label: "Time Step"
    type: "float"
    default: 1.0
    min: 0.1
    max: 2.0
    step: 0.1
rule:
  type: "webgpu"
  compute: |
    lap_u = neighbor_at(0, -1, u) + neighbor_at(0, 1, u) + neighbor_at(-1, 0, u) + neighbor_at(1, 0, u) - 4.0 * u
    lap_v = neighbor_at(0, -1, v) + neighbor_at(0, 1, v) + neighbor_at(-1, 0, v) + neighbor_at(1, 0, v) - 4.0 * v
    uvv = u * v * v
    self.u = clamp(u + env_dt * (env_Du * lap_u - uvv + env_F * (1.0 - u)), 0.0, 1.0)
    self.v = clamp(v + env_dt * (env_Dv * lap_v + uvv - (env_F + env_k) * v), 0.0, 1.0)
visual_mappings:
  - property: "v"
    channel: "color"
    type: "ramp"
    range: [0.0, 1.0]
    stops:
      - { t: 0.0, color: "#000033" }
      - { t: 0.15, color: "#000066" }
      - { t: 0.3, color: "#0066ff" }
      - { t: 0.5, color: "#00ccff" }
      - { t: 0.7, color: "#ffffff" }
      - { t: 0.85, color: "#ff6600" }
      - { t: 1.0, color: "#ff3300" }
`,
  'navier-stokes': `
schema_version: "1"
meta:
  name: "Navier-Stokes Fluid Dynamics"
  author: "Lattice Engine"
  description: "Simplified 2D Navier-Stokes fluid simulation."
  tags: ["2d", "continuous", "fluid"]
grid:
  dimensionality: "2d"
  width: 64
  height: 64
  topology: "toroidal"
cell_properties:
  - name: "vx"
    type: "float"
    default: 0.0
    role: "input_output"
  - name: "vy"
    type: "float"
    default: 0.0
    role: "input_output"
  - name: "density"
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
    min: 0.0
    max: 1.0
    step: 0.01
  - name: "diffusion"
    label: "Diffusion"
    type: "float"
    default: 0.05
    min: 0.0
    max: 0.5
    step: 0.01
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
    lap_d = neighbor_at(0,-1,density) + neighbor_at(0,1,density) + neighbor_at(-1,0,density) + neighbor_at(1,0,density) - 4.0 * density
    dpdx = (neighbor_at(1,0,pressure) - neighbor_at(-1,0,pressure)) * 0.5
    dpdy = (neighbor_at(0,1,pressure) - neighbor_at(0,-1,pressure)) * 0.5
    n_vx = neighbor_at(0,-1,vx) + neighbor_at(0,1,vx) + neighbor_at(-1,0,vx) + neighbor_at(1,0,vx)
    n_vy = neighbor_at(0,-1,vy) + neighbor_at(0,1,vy) + neighbor_at(-1,0,vy) + neighbor_at(1,0,vy)
    div_v = (n_vx - 4.0 * vx) + (n_vy - 4.0 * vy)
    new_vx = clamp((vx + env_dt * (env_viscosity * lap_vx - dpdx)) * 0.999, -10.0, 10.0)
    new_vy = clamp((vy + env_dt * (env_viscosity * lap_vy - dpdy)) * 0.999, -10.0, 10.0)
    self.vx = new_vx
    self.vy = new_vy
    new_d = clamp(density + env_dt * (env_diffusion * lap_d - density * div_v * 0.01), 0.0, 10.0)
    self.density = new_d
    self.pressure = clamp(pressure + env_dt * (-div_v * 0.5), -10.0, 10.0)
    d = clamp(new_d, 0.0, 2.0) * 0.5
    spd = clamp(sqrt(new_vx * new_vx + new_vy * new_vy) * 3.0, 0.0, 1.0)
    self.colorR = d * spd * 0.6
    self.colorG = d * (0.7 + spd * 0.3)
    self.colorB = d
visual_mappings:
  - property: "density"
    channel: "color"
    mapping:
      min: "#000033"
      max: "#00ccff"
`,
  'fire': `
schema_version: "1"
meta:
  name: "Fire"
  author: "Lattice Engine"
  description: "Combustion simulation with velocity field, buoyancy, and GPU-compiled visual mapping."
  tags: ["2d", "continuous", "fire", "combustion", "fluid"]
grid:
  dimensionality: "2d"
  width: 256
  height: 256
  topology: "finite"
draw_property: "fuel"
cell_properties:
  - { name: "vx", type: "float", default: 0.0, role: "input_output" }
  - { name: "vy", type: "float", default: 0.0, role: "input_output" }
  - { name: "temperature", type: "float", default: 0.0, role: "input_output" }
  - { name: "fuel", type: "float", default: 0.0, role: "input_output" }
  - { name: "smoke", type: "float", default: 0.0, role: "input_output" }
  - { name: "pressure", type: "float", default: 0.0, role: "input_output" }
  - { name: "curl", type: "float", default: 0.0, role: "input_output" }
params:
  - { name: "dt", label: "Time Step", type: "float", default: 0.1, min: 0.01, max: 0.5, step: 0.01 }
  - { name: "diffusion_rate", label: "Diffusion", type: "float", default: 0.0002, min: 0.0, max: 0.01, step: 0.0001 }
  - { name: "burn_rate", label: "Burn Rate", type: "float", default: 3.0, min: 0.1, max: 10.0, step: 0.1 }
  - { name: "heat_generation", label: "Heat Generation", type: "float", default: 15.0, min: 1.0, max: 50.0, step: 1.0 }
  - { name: "smoke_generation", label: "Smoke Generation", type: "float", default: 0.5, min: 0.0, max: 2.0, step: 0.05 }
  - { name: "buoyancy_factor", label: "Buoyancy", type: "float", default: 1.5, min: 0.0, max: 5.0, step: 0.1 }
  - { name: "cooling_rate", label: "Cooling Rate", type: "float", default: 1.2, min: 0.1, max: 5.0, step: 0.1 }
  - { name: "smoke_dissipation", label: "Smoke Dissipation", type: "float", default: 0.3, min: 0.01, max: 2.0, step: 0.05 }
  - { name: "ignition_threshold", label: "Ignition Temp", type: "float", default: 0.5, min: 0.1, max: 2.0, step: 0.1 }
  - { name: "max_temp", label: "Max Temperature", type: "float", default: 5.0, min: 1.0, max: 20.0, step: 0.5 }
rule:
  type: "webgpu"
  stages:
    - name: "advection"
      compute: |
        up_t = mix(neighbor_at(0, -1, temperature), neighbor_at(0, 1, temperature), step(0.0, vy))
        lr_t = mix(neighbor_at(-1, 0, temperature), neighbor_at(1, 0, temperature), step(0.0, vx))
        up_f = mix(neighbor_at(0, -1, fuel), neighbor_at(0, 1, fuel), step(0.0, vy))
        lr_f = mix(neighbor_at(-1, 0, fuel), neighbor_at(1, 0, fuel), step(0.0, vx))
        up_s = mix(neighbor_at(0, -1, smoke), neighbor_at(0, 1, smoke), step(0.0, vy))
        lr_s = mix(neighbor_at(-1, 0, smoke), neighbor_at(1, 0, smoke), step(0.0, vx))
        spd = clamp((abs(vx) + abs(vy)) * env_dt, 0.0, 0.45)
        self.temperature = mix(temperature, (up_t + lr_t) * 0.5, spd)
        self.fuel = mix(fuel, (up_f + lr_f) * 0.5, spd)
        self.smoke = mix(smoke, (up_s + lr_s) * 0.5, spd)
        up_vx = mix(neighbor_at(0, -1, vx), neighbor_at(0, 1, vx), step(0.0, vy))
        lr_vx = mix(neighbor_at(-1, 0, vx), neighbor_at(1, 0, vx), step(0.0, vx))
        up_vy = mix(neighbor_at(0, -1, vy), neighbor_at(0, 1, vy), step(0.0, vy))
        lr_vy = mix(neighbor_at(-1, 0, vy), neighbor_at(1, 0, vy), step(0.0, vx))
        self.vx = mix(vx, (up_vx + lr_vx) * 0.5, spd)
        self.vy = mix(vy, (up_vy + lr_vy) * 0.5, spd)
    - name: "forces"
      compute: |
        lap_t = neighbor_at(1,0,temperature) + neighbor_at(-1,0,temperature) + neighbor_at(0,1,temperature) + neighbor_at(0,-1,temperature) - 4.0 * temperature
        lap_s = neighbor_at(1,0,smoke) + neighbor_at(-1,0,smoke) + neighbor_at(0,1,smoke) + neighbor_at(0,-1,smoke) - 4.0 * smoke
        new_temp = temperature + env_diffusion_rate * lap_t
        new_smoke = smoke + env_diffusion_rate * lap_s * 0.5
        burning = step(env_ignition_threshold, new_temp) * step(0.001, fuel)
        burn_amount = min(fuel, env_burn_rate * env_dt) * burning
        new_temp = new_temp + burn_amount * env_heat_generation
        new_smoke = new_smoke + burn_amount * env_smoke_generation
        new_fuel = fuel - burn_amount
        self.vy = vy - env_buoyancy_factor * new_temp * env_dt
        self.vx = vx
        self.temperature = new_temp
        self.fuel = clamp(new_fuel, 0.0, 1.0)
        self.smoke = clamp(new_smoke, 0.0, 1.0)
    - name: "pressure_setup"
      compute: |
        self.curl = (neighbor_at(1,0,vx) - neighbor_at(-1,0,vx) + neighbor_at(0,1,vy) - neighbor_at(0,-1,vy)) * 0.5
        self.pressure = 0.0
    - name: "pressure_jacobi"
      iterations: 10
      compute: |
        p_sum = neighbor_at(1,0,pressure) + neighbor_at(-1,0,pressure) + neighbor_at(0,1,pressure) + neighbor_at(0,-1,pressure)
        self.pressure = (p_sum - curl) * 0.25
    - name: "pressure_project"
      compute: |
        grad_px = (neighbor_at(1,0,pressure) - neighbor_at(-1,0,pressure)) * 0.5
        grad_py = (neighbor_at(0,1,pressure) - neighbor_at(0,-1,pressure)) * 0.5
        self.vx = vx - grad_px
        self.vy = vy - grad_py
    - name: "cooling"
      compute: |
        self.temperature = temperature * (1.0 - env_cooling_rate * env_dt)
        self.smoke = smoke * (1.0 - env_smoke_dissipation * env_dt)
        self.vx = vx * 0.999
        self.vy = vy * 0.999
visual_mappings:
  - type: "script"
    code: |
      t = clamp(temperature / env_max_temp, 0.0, 1.0)
      fuel_vis = step(0.001, fuel) * (1.0 - t)
      fire_r = smoothstep(0.0, 0.4, t)
      fire_g = smoothstep(0.2, 0.7, t) * 0.8
      fire_b = smoothstep(0.6, 1.0, t) * 0.4
      smoke_gray = 0.4 + smoke * 0.2
      smoke_vis = clamp(smoke * 2.0, 0.0, 0.8) * (1.0 - t)
      self.colorR = fire_r * t + fuel_vis * 0.35 + smoke_vis * smoke_gray
      self.colorG = fire_g * t + fuel_vis * 0.18 + smoke_vis * smoke_gray
      self.colorB = fire_b * t + fuel_vis * 0.05 + smoke_vis * (smoke_gray + 0.05)
      self.alpha = clamp(t * 3.0 + smoke * 2.0 + step(0.001, fuel), 0.0, 1.0)
`,
  'link-testbed': `
schema_version: "1"
meta:
  name: "Link Testbed"
  author: "Lattice Engine"
  description: "Test preset for parameter linking. GoL with age tracking, alpha fading, and linked params."
  tags: ["test", "linking", "2d"]
grid:
  dimensionality: "2d"
  width: 64
  height: 64
  topology: "toroidal"
cell_properties:
  - name: "alive"
    type: "bool"
    default: 0
    role: "input_output"
  - name: "age"
    type: "int"
    default: 0
    role: "output"
  - name: "alpha"
    type: "float"
    default: 1.0
    role: "output"
params:
  - name: "surviveMin"
    label: "Survive Min"
    type: "int"
    default: 2
    min: 0
    max: 8
    step: 1
  - name: "surviveMax"
    label: "Survive Max"
    type: "int"
    default: 3
    min: 0
    max: 8
    step: 1
  - name: "birthCount"
    label: "Birth Count"
    type: "int"
    default: 3
    min: 0
    max: 8
    step: 1
  - name: "fadeSpeed"
    label: "Fade Speed"
    type: "float"
    default: 50.0
    min: 5.0
    max: 200.0
    step: 5.0
parameter_links:
  - source: "cell.age"
    target: "cell.alpha"
    sourceRange: [0, 50]
    targetRange: [1, 0]
    easing: "smoothstep"
rule:
  type: "webgpu"
  compute: |
    n = neighbor_sum_alive
    if (alive > 0.5 and n >= env_surviveMin and n <= env_surviveMax) or (alive < 0.5 and n == env_birthCount):
        self.alive = 1.0
        self.age = age + 1.0
    else:
        self.alive = 0.0
        self.age = 0.0
visual_mappings:
  - property: "alive"
    channel: "color"
    mapping:
      "0": "#000000"
      "1": "#00ff00"
`,
  'seeds': `
schema_version: "1"
meta:
  name: "Seeds"
  author: "Brian Silverman"
  description: "Explosive 2-state automaton. Cells are born with exactly 2 neighbors but never survive."
  tags: ["2d", "explosive", "binary"]
grid:
  dimensionality: "2d"
  width: 256
  height: 256
  topology: "toroidal"
cell_properties:
  - name: "alive"
    type: "bool"
    default: 0
    role: "input_output"
rule:
  type: "webgpu"
  compute: |
    n = neighbor_sum_alive
    if alive < 0.5 and n > 1.5 and n < 2.5:
        self.alive = 1.0
    else:
        self.alive = 0.0
visual_mappings:
  - property: "alive"
    channel: "color"
    mapping:
      "0": "#0a0a1a"
      "1": "#ff6633"
`,
};

/**
 * Load a built-in preset by name (client-safe, no fs dependency).
 */
export function loadBuiltinPresetClient(name: BuiltinPresetNameClient): PresetConfig {
  const yaml = PRESET_YAMLS[name];
  if (!yaml) {
    throw new Error(`Unknown built-in preset: ${name}`);
  }
  return loadPresetOrThrow(yaml);
}
