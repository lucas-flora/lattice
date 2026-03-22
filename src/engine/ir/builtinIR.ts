/**
 * Built-in IR programs for the standard presets.
 *
 * Hand-built IR representations that are known-correct.
 * Used by GPURuleRunner to compile presets to GPU compute shaders.
 */

import { IR } from './IRBuilder';
import type { IRProgram } from './types';
import type { PresetConfig } from '../preset/types';

/**
 * Conway's Game of Life.
 * Rule: alive = (neighbors == 3) || (alive && neighbors == 2)
 */
function conwayGol(_preset: PresetConfig): IRProgram {
  return IR.program([
    IR.declareVar('n', 'f32', IR.neighborSum('alive')),
    IR.declareVar('is_alive', 'bool', IR.gt(IR.readCell('alive'), IR.f32(0.5))),
    IR.declareVar('birth', 'bool', IR.eq(IR.varRef('n'), IR.f32(3))),
    IR.declareVar('survive', 'bool',
      IR.and(
        IR.boolRef('is_alive'),
        IR.or(IR.eq(IR.varRef('n'), IR.f32(2)), IR.eq(IR.varRef('n'), IR.f32(3))),
      )),
    IR.writeProperty('alive',
      IR.select(IR.or(IR.boolRef('birth'), IR.boolRef('survive')), IR.f32(1), IR.f32(0))),
  ], {
    inputs: [{ property: 'alive', scope: 'cell', type: 'f32' }],
    outputs: [{ property: 'alive', scope: 'cell', type: 'f32' }],
    neighborhoodAccess: true,
    metadata: { sourceType: 'builtin' },
  });
}

/**
 * Gray-Scott reaction-diffusion.
 *
 * Uses von Neumann neighborhood (4 neighbors) for the Laplacian via neighbor_at.
 * lap_u = u(up) + u(down) + u(left) + u(right) - 4*u
 * newU = u + dt * (Du * lap_u - u*v*v + F*(1-u))
 * newV = v + dt * (Dv * lap_v + u*v*v - (F+k)*v)
 */
function grayScott(_preset: PresetConfig): IRProgram {
  const u = IR.readCell('u');
  const v = IR.readCell('v');
  const Du = IR.readEnv('Du');
  const Dv = IR.readEnv('Dv');
  const F = IR.readEnv('F');
  const k = IR.readEnv('k');
  const dt = IR.readEnv('dt');

  return IR.program([
    // Von Neumann Laplacian: sum of 4 orthogonal neighbors minus 4 * center
    IR.declareVar('lap_u', 'f32',
      IR.sub(
        IR.add(
          IR.add(IR.neighborAt(0, -1, 'u'), IR.neighborAt(0, 1, 'u')),
          IR.add(IR.neighborAt(-1, 0, 'u'), IR.neighborAt(1, 0, 'u')),
        ),
        IR.mul(u, IR.f32(4)),
      )),
    IR.declareVar('lap_v', 'f32',
      IR.sub(
        IR.add(
          IR.add(IR.neighborAt(0, -1, 'v'), IR.neighborAt(0, 1, 'v')),
          IR.add(IR.neighborAt(-1, 0, 'v'), IR.neighborAt(1, 0, 'v')),
        ),
        IR.mul(v, IR.f32(4)),
      )),
    IR.declareVar('uvv', 'f32', IR.mul(IR.mul(u, v), v)),
    IR.declareVar('new_u', 'f32',
      IR.clamp(
        IR.add(u, IR.mul(dt, IR.add(
          IR.mul(Du, IR.varRef('lap_u')),
          IR.sub(IR.mul(F, IR.sub(IR.f32(1), u)), IR.varRef('uvv')),
        ))),
        IR.f32(0), IR.f32(1),
      )),
    IR.declareVar('new_v', 'f32',
      IR.clamp(
        IR.add(v, IR.mul(dt, IR.add(
          IR.mul(Dv, IR.varRef('lap_v')),
          IR.sub(IR.varRef('uvv'), IR.mul(IR.add(F, k), v)),
        ))),
        IR.f32(0), IR.f32(1),
      )),
    IR.writeProperty('u', IR.varRef('new_u')),
    IR.writeProperty('v', IR.varRef('new_v')),
  ], {
    inputs: [
      { property: 'u', scope: 'cell', type: 'f32' },
      { property: 'v', scope: 'cell', type: 'f32' },
      { property: 'Du', scope: 'env', type: 'f32' },
      { property: 'Dv', scope: 'env', type: 'f32' },
      { property: 'F', scope: 'env', type: 'f32' },
      { property: 'k', scope: 'env', type: 'f32' },
      { property: 'dt', scope: 'env', type: 'f32' },
    ],
    outputs: [
      { property: 'u', scope: 'cell', type: 'f32' },
      { property: 'v', scope: 'cell', type: 'f32' },
    ],
    neighborhoodAccess: true,
    metadata: { sourceType: 'builtin' },
  });
}

/**
 * Brian's Brain — three-state cellular automaton.
 *
 * States: 0=off, 1=on, 2=dying
 * Rules: off→on if exactly 2 on neighbors; on→dying; dying→off
 */
function briansBrain(_preset: PresetConfig): IRProgram {
  return IR.program([
    IR.declareVar('s', 'f32', IR.readCell('state')),
    IR.declareVar('n', 'f32', IR.neighborCount('state', '==', 1)),
    // off (0) → on (1) if exactly 2 on neighbors
    // on (1) → dying (2)
    // dying (2) → off (0)
    IR.declareVar('is_off', 'bool', IR.lt(IR.varRef('s'), IR.f32(0.5))),
    IR.declareVar('is_on', 'bool',
      IR.and(
        IR.gt(IR.varRef('s'), IR.f32(0.5)),
        IR.lt(IR.varRef('s'), IR.f32(1.5)),
      )),
    IR.declareVar('new_state', 'f32',
      IR.select(IR.boolRef('is_off'),
        IR.select(IR.eq(IR.varRef('n'), IR.f32(2)), IR.f32(1), IR.f32(0)),
        IR.select(IR.boolRef('is_on'), IR.f32(2), IR.f32(0)),
      )),
    IR.writeProperty('state', IR.varRef('new_state')),
  ], {
    inputs: [{ property: 'state', scope: 'cell', type: 'f32' }],
    outputs: [{ property: 'state', scope: 'cell', type: 'f32' }],
    neighborhoodAccess: true,
    metadata: { sourceType: 'builtin' },
  });
}

/**
 * Conway's Advanced — GoL with age tracking.
 * The age property auto-increments for alive cells, resets for dead.
 */
function conwayAdvanced(_preset: PresetConfig): IRProgram {
  return IR.program([
    IR.declareVar('n', 'f32', IR.neighborSum('alive')),
    IR.declareVar('is_alive', 'bool', IR.gt(IR.readCell('alive'), IR.f32(0.5))),
    IR.declareVar('birth', 'bool', IR.eq(IR.varRef('n'), IR.f32(3))),
    IR.declareVar('survive', 'bool',
      IR.and(
        IR.boolRef('is_alive'),
        IR.or(IR.eq(IR.varRef('n'), IR.f32(2)), IR.eq(IR.varRef('n'), IR.f32(3))),
      )),
    IR.declareVar('next_alive', 'bool', IR.or(IR.boolRef('birth'), IR.boolRef('survive'))),
    IR.writeProperty('alive',
      IR.select(IR.boolRef('next_alive'), IR.f32(1), IR.f32(0))),
    // Age: increment if alive, reset if dead
    IR.writeProperty('age',
      IR.select(IR.boolRef('next_alive'),
        IR.add(IR.readCell('age'), IR.f32(1)),
        IR.f32(0))),
  ], {
    inputs: [
      { property: 'alive', scope: 'cell', type: 'f32' },
      { property: 'age', scope: 'cell', type: 'f32' },
    ],
    outputs: [
      { property: 'alive', scope: 'cell', type: 'f32' },
      { property: 'age', scope: 'cell', type: 'f32' },
    ],
    neighborhoodAccess: true,
    metadata: { sourceType: 'builtin' },
  });
}

/**
 * Registry of built-in IR programs, keyed by YAML meta.name (display name).
 * Returns null if no GPU IR available for this preset.
 */
export const BUILTIN_IR: Record<string, (preset: PresetConfig) => IRProgram | null> = {
  "Conway's Game of Life": conwayGol,
  'Gray-Scott Reaction-Diffusion': grayScott,
  "Brian's Brain": briansBrain,
  "Conway's Advanced": conwayAdvanced,
  // These fall back to CPU for now
  'Rule 110': () => null,
  "Langton's Ant": () => null,
  'Navier-Stokes Fluid Dynamics': () => null,
  'Link Testbed': () => null,
};
