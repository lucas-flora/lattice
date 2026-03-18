/**
 * Reference IR programs for testing the codegen pipeline.
 *
 * Hand-built IR representations of known simulations.
 * Used by unit tests and the ir.test validation command.
 */

import { IR } from '../IRBuilder';
import type { IRProgram } from '../types';

/**
 * Conway's Game of Life.
 *
 * Rule: alive = (neighbors == 3) || (alive && neighbors == 2)
 * Reads: alive (cell)
 * Writes: alive (cell)
 * Neighborhood: Moore (8 neighbors)
 */
export const CONWAY_GOL_IR: IRProgram = IR.program([
  IR.declareVar('n', 'f32', IR.neighborSum('alive')),
  IR.declareVar('is_alive', 'bool',
    IR.gt(IR.readCell('alive'), IR.f32(0.5))),
  IR.declareVar('birth', 'bool',
    IR.eq(IR.varRef('n'), IR.f32(3))),
  IR.declareVar('survive', 'bool',
    IR.and(
      IR.boolRef('is_alive'),
      IR.or(
        IR.eq(IR.varRef('n'), IR.f32(2)),
        IR.eq(IR.varRef('n'), IR.f32(3)),
      ),
    )),
  IR.writeProperty('alive',
    IR.select(
      IR.or(IR.boolRef('birth'), IR.boolRef('survive')),
      IR.f32(1), IR.f32(0),
    )),
], {
  inputs: [{ property: 'alive', scope: 'cell', type: 'f32' }],
  outputs: [{ property: 'alive', scope: 'cell', type: 'f32' }],
  neighborhoodAccess: true,
  metadata: { sourceType: 'builtin' },
});

/**
 * Age fade expression (post-rule).
 *
 * alpha = 1.0 - (age / 20.0)
 * No neighborhood access.
 */
export const AGE_FADE_IR: IRProgram = IR.program([
  IR.writeProperty('alpha',
    IR.sub(IR.f32(1), IR.div(IR.readCell('age'), IR.f32(20)))),
], {
  inputs: [{ property: 'age', scope: 'cell', type: 'f32' }],
  outputs: [{ property: 'alpha', scope: 'cell', type: 'f32' }],
  neighborhoodAccess: false,
  metadata: { sourceType: 'builtin' },
});

/**
 * Gray-Scott reaction-diffusion.
 *
 * Uses env params (Du, Dv, F, k, dt) and Laplacian via neighbor sum.
 * newU = u + dt * (Du * lap_u - u*v*v + F*(1-u))
 * newV = v + dt * (Dv * lap_v + u*v*v - (F+k)*v)
 */
export const GRAY_SCOTT_IR: IRProgram = (() => {
  const u = IR.readCell('u');
  const v = IR.readCell('v');
  const Du = IR.readEnv('Du');
  const Dv = IR.readEnv('Dv');
  const F = IR.readEnv('F');
  const k = IR.readEnv('k');
  const dt = IR.readEnv('dt');

  return IR.program([
    // Laplacian = neighborSum - center * 8, normalized by /8 * 4 = /2
    // Simplified: lap = (neighborSum - center * neighborCount) * (4/neighborCount)
    // For Moore neighborhood (8): lap = (sum - center*8) * 0.5
    // But the standard discrete Laplacian for 8-neighbor is: sum/8 - center, scaled by 4
    // Use: lap = (neighborSum - 8*center) * 0.5
    IR.declareVar('sum_u', 'f32', IR.neighborSum('u')),
    IR.declareVar('sum_v', 'f32', IR.neighborSum('v')),
    IR.declareVar('lap_u', 'f32',
      IR.mul(IR.sub(IR.varRef('sum_u'), IR.mul(u, IR.f32(8))), IR.f32(0.5))),
    IR.declareVar('lap_v', 'f32',
      IR.mul(IR.sub(IR.varRef('sum_v'), IR.mul(v, IR.f32(8))), IR.f32(0.5))),
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
})();
