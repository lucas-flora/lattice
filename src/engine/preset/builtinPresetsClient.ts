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
initial_state:
  type: "script"
  code: |
    const buf = buffers.alive;
    for (let i = 0; i < width * height; i++) {
      if (Math.random() < 0.2) buf[i] = 1;
    }
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
  - name: "death-by-age"
    owner: { type: "cell-type", id: "default" }
    code: "self.alive = np.where(self.age > env_maxAge, 0.0, self.alive)"
    phase: "post-rule"
    source: "code"
    outputs: ["cell.alive"]
    inputs: ["cell.age"]
visual_mappings:
  - type: "script"
    code: |
      self.colorR = float(x) / float(width) * alive
      self.colorG = max(0.0, 1.0 - age / 100.0) * alive
      self.colorB = float(y) / float(height) * alive
      self.alpha = max(0.1, 1.0 - age / env_fadeDuration) * alive
initial_state:
  type: "script"
  code: |
    const buf = buffers.alive;
    for (let i = 0; i < width * height; i++) {
      if (Math.random() < 0.2) buf[i] = 1;
    }
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
initial_state:
  type: "script"
  code: |
    buffers.state[Math.floor(width / 2)] = 1;
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
initial_state:
  type: "script"
  code: |
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    buffers.ant[cy * width + cx] = 1;
    buffers.ant_dir[cy * width + cx] = 0;
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
    elif state > 1.5:
        self.state = 0.0
    else:
        if n == 2:
            self.state = 1.0
        else:
            self.state = 0.0
visual_mappings:
  - type: "script"
    code: |
      on = step(0.5, state) * step(state, 1.5)
      dying = step(1.5, state)
      self.colorR = on
      self.colorG = on
      self.colorB = on + dying * 0.4
      self.alpha = on + dying
initial_state:
  type: "script"
  code: |
    const buf = buffers.state;
    for (let i = 0; i < width * height; i++) {
      if (Math.random() < 0.2) buf[i] = 1;
    }
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
initial_state:
  type: "script"
  code: |
    const u = buffers.u;
    const v = buffers.v;
    u.fill(1.0);
    v.fill(0.0);
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    const r = Math.max(4, Math.floor(width / 16));
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = y * width + x;
          u[idx] = 0.5 + (Math.random() - 0.5) * 0.1;
          v[idx] = 0.25 + (Math.random() - 0.5) * 0.1;
        }
      }
    }
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
draw_property: "density"
visual_mappings:
  - type: "script"
    code: |
      d = clamp(density, 0.0, 2.0) * 0.5
      spd = clamp(sqrt(vx * vx + vy * vy) * 3.0, 0.0, 1.0)
      self.colorR = d * spd * 0.6
      self.colorG = d * (0.7 + spd * 0.3)
      self.colorB = d
      self.alpha = clamp(d * 2.0, 0.0, 1.0)
initial_state:
  type: "script"
  code: |
    const d = buffers.density;
    const vx = buffers.vx;
    const vy = buffers.vy;
    d.fill(0.0);
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    const r = Math.max(3, Math.floor(width / 8));
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = y * width + x;
          d[idx] = 1.0;
          vx[idx] = (Math.random() - 0.5) * 0.1;
          vy[idx] = (Math.random() - 0.5) * 0.1;
        }
      }
    }
`,
  'fire': `
schema_version: "1"
meta:
  name: "Fire"
  author: "Lattice Engine"
  description: "Combustion simulation with velocity field, buoyancy, vorticity confinement, and GPU-compiled visual mapping."
  tags: ["2d", "continuous", "fire", "combustion", "fluid"]
grid:
  dimensionality: "2d"
  width: 512
  height: 512
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
  - { name: "smoke_generation", label: "Smoke Generation", type: "float", default: 1.5, min: 0.0, max: 5.0, step: 0.1 }
  - { name: "buoyancy_factor", label: "Buoyancy", type: "float", default: 1.5, min: 0.0, max: 5.0, step: 0.1 }
  - { name: "cooling_rate", label: "Cooling Rate", type: "float", default: 1.2, min: 0.1, max: 5.0, step: 0.1 }
  - { name: "smoke_dissipation", label: "Smoke Dissipation", type: "float", default: 0.15, min: 0.01, max: 2.0, step: 0.05 }
  - { name: "ignition_threshold", label: "Ignition Temp", type: "float", default: 0.5, min: 0.1, max: 2.0, step: 0.1 }
  - { name: "vorticity_strength", label: "Vorticity", type: "float", default: 15.0, min: 0.0, max: 40.0, step: 0.5 }
  - { name: "max_temp", label: "Max Temperature", type: "float", default: 5.0, min: 1.0, max: 20.0, step: 0.5 }
rule:
  type: "webgpu"
  stages:
    - name: "advection"
      compute: |
        up_t = mix(neighbor_at(0, -1, temperature), neighbor_at(0, 1, temperature), step(0.0, vy))
        lr_t = mix(neighbor_at(-1, 0, temperature), neighbor_at(1, 0, temperature), step(0.0, vx))
        up_s = mix(neighbor_at(0, -1, smoke), neighbor_at(0, 1, smoke), step(0.0, vy))
        lr_s = mix(neighbor_at(-1, 0, smoke), neighbor_at(1, 0, smoke), step(0.0, vx))
        spd = clamp((abs(vx) + abs(vy)) * env_dt, 0.0, 0.45)
        self.temperature = mix(temperature, (up_t + lr_t) * 0.5, spd)
        self.fuel = fuel
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
        self.temperature = clamp(new_temp, 0.0, env_max_temp)
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
    - name: "vorticity_compute"
      compute: |
        self.curl = (neighbor_at(1,0,vy) - neighbor_at(-1,0,vy)) * 0.5 - (neighbor_at(0,1,vx) - neighbor_at(0,-1,vx)) * 0.5
    - name: "vorticity_apply"
      compute: |
        eta_x = abs(neighbor_at(1,0,curl)) - abs(neighbor_at(-1,0,curl))
        eta_y = abs(neighbor_at(0,1,curl)) - abs(neighbor_at(0,-1,curl))
        eta_len = sqrt(eta_x * eta_x + eta_y * eta_y) + 0.00001
        nx = eta_x / eta_len
        ny = eta_y / eta_len
        self.vx = vx + env_vorticity_strength * ny * curl * env_dt
        self.vy = vy + env_vorticity_strength * (0.0 - nx) * curl * env_dt
    - name: "cooling"
      compute: |
        self.temperature = clamp(temperature * (1.0 - env_cooling_rate * env_dt), 0.0, env_max_temp)
        self.smoke = clamp(smoke * (1.0 - env_smoke_dissipation * env_dt), 0.0, 1.0)
        self.vx = clamp(vx * 0.998, -5.0, 5.0)
        self.vy = clamp(vy * 0.998, -5.0, 5.0)
visual_mappings:
  - type: "script"
    code: |
      t = clamp(temperature / env_max_temp, 0.0, 1.0)
      fr = smoothstep(0.0, 0.15, t)
      fg = t * t * 0.7
      fb = pow(t, 4.0) * 0.5
      fuel_show = step(0.01, fuel) * (1.0 - smoothstep(0.0, 0.2, t))
      smoke_show = clamp(smoke, 0.0, 1.0) * (1.0 - t)
      gray = 0.3 + smoke * 0.1
      self.colorR = fr + fuel_show * 0.22 + smoke_show * gray
      self.colorG = fg + fuel_show * 0.11 + smoke_show * gray
      self.colorB = fb + fuel_show * 0.03 + smoke_show * (gray + 0.02)
      self.alpha = clamp(t * 4.0 + smoke_show + fuel_show, 0.0, 1.0)
initial_state:
  type: "script"
  code: |
    const fuel = buffers.fuel;
    const temp = buffers.temperature;
    fuel.fill(0.0);
    temp.fill(0.0);
    const bedTop = Math.floor(height * 0.30);
    for (let y = 0; y < bedTop; y++) {
      for (let x = 0; x < width; x++) {
        const edgeNoise = Math.sin(x * 0.15) * 3 + Math.sin(x * 0.07) * 5;
        if (y < bedTop + edgeNoise - 4) {
          fuel[y * width + x] = 0.6 + Math.random() * 0.4;
        }
      }
    }
    const numPiles = 6 + Math.floor(width / 80);
    for (let p = 0; p < numPiles; p++) {
      const px = Math.floor(width * 0.05 + Math.random() * width * 0.9);
      const py = Math.floor(Math.random() * bedTop * 0.7);
      const pw = Math.floor(8 + Math.random() * (width * 0.08));
      const ph = Math.floor(4 + Math.random() * (height * 0.04));
      for (let by = 0; by < ph; by++) {
        for (let bx = 0; bx < pw; bx++) {
          const gx = px + bx - Math.floor(pw / 2);
          const gy = py + by;
          if (gx >= 0 && gx < width && gy >= 0 && gy < height) {
            fuel[gy * width + gx] = Math.min(1.0, fuel[gy * width + gx] + 0.3 + Math.random() * 0.2);
          }
        }
      }
    }
    const numIgnitions = 3 + Math.floor(width / 100);
    for (let i = 0; i < numIgnitions; i++) {
      const ix = Math.floor(width * 0.1 + (width * 0.8) * (i / (numIgnitions - 1)));
      const iy = bedTop - 2;
      const igRadius = Math.max(2, Math.floor(width / 100));
      for (let dy = -igRadius; dy <= igRadius; dy++) {
        for (let dx = -igRadius; dx <= igRadius; dx++) {
          if (dx * dx + dy * dy <= igRadius * igRadius) {
            const gx = ix + dx;
            const gy = iy + dy;
            if (gx >= 0 && gx < width && gy >= 0 && gy < height) {
              temp[gy * width + gx] = 0.4 + Math.random() * 0.2;
            }
          }
        }
      }
    }
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
initial_state:
  type: "script"
  code: |
    const buf = buffers.alive;
    for (let i = 0; i < width * height; i++) {
      if (Math.random() < 0.2) buf[i] = 1;
    }
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
initial_state:
  type: "script"
  code: |
    const buf = buffers.alive;
    for (let i = 0; i < width * height; i++) {
      if (Math.random() < 0.2) buf[i] = 1;
    }
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
