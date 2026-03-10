/**
 * Client-safe built-in preset registry.
 *
 * Provides YAML strings inlined as template literals instead of reading from fs.
 * This module is safe for browser/Next.js client-side use.
 *
 * Maintains the same BUILTIN_PRESET_NAMES and PresetConfig interface as builtinPresets.ts.
 */

import { loadPresetOrThrow } from './loader';
import type { PresetConfig } from './types';

/** Names of all built-in presets (same as server-side) */
export const BUILTIN_PRESET_NAMES_CLIENT = [
  'conways-gol',
  'rule-110',
  'langtons-ant',
  'brians-brain',
  'gray-scott',
  'navier-stokes',
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
rule:
  type: "typescript"
  compute: |
    const alive = ctx.cell.alive;
    const liveNeighbors = ctx.neighbors.filter(n => n.alive === 1).length;
    if (alive === 1) {
      return { alive: (liveNeighbors === 2 || liveNeighbors === 3) ? 1 : 0 };
    }
    return { alive: liveNeighbors === 3 ? 1 : 0 };
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
rule:
  type: "typescript"
  compute: |
    const c = ctx.cell.state ? 1 : 0;
    const left = ctx.neighbors.length > 0 ? (ctx.neighbors[0].state ? 1 : 0) : 0;
    const right = ctx.neighbors.length > 1 ? (ctx.neighbors[1].state ? 1 : 0) : 0;
    const pattern = (left << 2) | (c << 1) | right;
    const rule110 = 0b01101110;
    return { state: (rule110 >> pattern) & 1 };
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
  type: "typescript"
  compute: |
    const hasAnt = ctx.cell.ant === 1;
    if (!hasAnt) {
      let newColor = ctx.cell.color;
      let newAnt = 0;
      let newDir = 0;
      for (const n of ctx.neighbors) {
        if (n.ant !== 1) continue;
        const nDir = n.ant_dir;
        const nColor = n.color;
        let nextDir;
        if (nColor === 0) { nextDir = (nDir + 1) % 4; }
        else { nextDir = (nDir + 3) % 4; }
        const dx = [0, 1, 0, -1];
        const dy = [-1, 0, 1, 0];
        const targetX = (ctx.x - dx[nextDir] + ctx.grid.width) % ctx.grid.width;
        const targetY = (ctx.y - dy[nextDir] + ctx.grid.height) % ctx.grid.height;
        if (targetX === ctx.x && targetY === ctx.y) {
          return { color: ctx.cell.color, ant: 1, ant_dir: nextDir };
        }
      }
      return { color: newColor, ant: 0, ant_dir: 0 };
    }
    const color = ctx.cell.color;
    const dir = ctx.cell.ant_dir;
    let nextDir;
    if (color === 0) { nextDir = (dir + 1) % 4; }
    else { nextDir = (dir + 3) % 4; }
    const newColor = color === 0 ? 1 : 0;
    const dx = [0, 1, 0, -1];
    const dy = [-1, 0, 1, 0];
    const targetX = (ctx.x + dx[nextDir] + ctx.grid.width) % ctx.grid.width;
    const targetY = (ctx.y + dy[nextDir] + ctx.grid.height) % ctx.grid.height;
    return { color: newColor, ant: 0, ant_dir: 0 };
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
  type: "typescript"
  compute: |
    const state = ctx.cell.state;
    if (state === 1) { return { state: 2 }; }
    if (state === 2) { return { state: 0 }; }
    const onNeighbors = ctx.neighbors.filter(n => n.state === 1).length;
    return { state: onNeighbors === 2 ? 1 : 0 };
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
rule:
  type: "typescript"
  compute: |
    const Du = 0.2097; const Dv = 0.105; const F = 0.037; const k = 0.06; const dt = 1.0;
    const u = ctx.cell.u; const v = ctx.cell.v;
    let lapU = 0; let lapV = 0;
    const nc = ctx.neighbors.length;
    for (const n of ctx.neighbors) { lapU += n.u - u; lapV += n.v - v; }
    if (nc > 0) { lapU = lapU * (4.0 / nc); lapV = lapV * (4.0 / nc); }
    const uvv = u * v * v;
    const newU = u + dt * (Du * lapU - uvv + F * (1.0 - u));
    const newV = v + dt * (Dv * lapV + uvv - (F + k) * v);
    return { u: Math.max(0, Math.min(1, newU)), v: Math.max(0, Math.min(1, newV)) };
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
rule:
  type: "typescript"
  compute: |
    const viscosity = 0.1; const diffusion = 0.0001; const dt = 0.1;
    const vx = ctx.cell.vx; const vy = ctx.cell.vy;
    const density = ctx.cell.density; const pressure = ctx.cell.pressure;
    let lapVx = 0; let lapVy = 0; let lapDensity = 0;
    let dpdx = 0; let dpdy = 0; let divV = 0;
    const nc = ctx.neighbors.length;
    for (const n of ctx.neighbors) {
      lapVx += n.vx - vx; lapVy += n.vy - vy; lapDensity += n.density - density;
      dpdx += n.pressure - pressure; dpdy += n.pressure - pressure;
      divV += n.vx + n.vy;
    }
    if (nc > 0) {
      const scale = 4.0 / nc;
      lapVx *= scale; lapVy *= scale; lapDensity *= scale;
      dpdx *= scale / 2.0; dpdy *= scale / 2.0;
      divV = divV * scale - 4.0 * (vx + vy);
    }
    let newVx = vx + dt * (viscosity * lapVx - dpdx);
    let newVy = vy + dt * (viscosity * lapVy - dpdy);
    const newDensity = Math.max(0, density + dt * (diffusion * lapDensity - density * divV * 0.01));
    const newPressure = pressure + dt * (-divV * 0.5);
    newVx *= 0.999; newVy *= 0.999;
    return {
      vx: Math.max(-10, Math.min(10, newVx)),
      vy: Math.max(-10, Math.min(10, newVy)),
      density: Math.min(10, newDensity),
      pressure: Math.max(-10, Math.min(10, newPressure))
    };
visual_mappings:
  - property: "density"
    channel: "color"
    mapping:
      min: "#000033"
      max: "#00ccff"
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
