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
  'link-testbed',
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
    mapping:
      min: "#000000"
      max: "#ff6600"
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
    default: 0.0001
    min: 0.0
    max: 0.01
    step: 0.0001
  - name: "dt"
    label: "Time Step"
    type: "float"
    default: 0.1
    min: 0.01
    max: 1.0
    step: 0.01
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
    t = clamp(new_d * 0.1, 0.0, 1.0)
    self.colorR = t * 0.0
    self.colorG = t * 0.8
    self.colorB = 0.2 + t * 0.8
visual_mappings:
  - property: "density"
    channel: "color"
    mapping:
      min: "#000033"
      max: "#00ccff"
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
