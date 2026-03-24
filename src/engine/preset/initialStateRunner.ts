/**
 * Initial state runner: executes JS scripts from YAML initial_state sections.
 *
 * Scripts run on the CPU (not GPU) once at preset load time. They have access
 * to grid property buffers via a `buffers` object, plus `width`, `height`,
 * and `Math` for randomness.
 */

import type { Simulation } from '../rule/Simulation';

/**
 * Execute an initial_state script against the simulation's grid buffers.
 * The script is plain JS with access to: width, height, buffers, Math.
 *
 * Example script:
 *   const fuel = buffers.fuel;
 *   for (let y = 0; y < height * 0.3; y++) {
 *     for (let x = 0; x < width; x++) {
 *       fuel[y * width + x] = 0.8;
 *     }
 *   }
 */
export function runInitialStateScript(sim: Simulation, code: string): void {
  const grid = sim.grid;
  const w = grid.config.width;
  const h = grid.config.height;

  // Build buffers dict: { fuel: Float32Array, temperature: Float32Array, ... }
  const buffers: Record<string, Float32Array> = {};
  for (const name of grid.getPropertyNames()) {
    buffers[name] = grid.getCurrentBuffer(name);
  }

  try {
    const fn = new Function('width', 'height', 'buffers', 'Math', code);
    fn(w, h, buffers, Math);
  } catch (e) {
    console.error(`Initial state script failed:`, e);
  }
}
