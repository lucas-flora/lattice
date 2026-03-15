/**
 * Grid transfer helpers for copying buffers to/from the Pyodide worker.
 *
 * Python/numpy needs its own WASM memory, so data must be copied (not shared).
 * Copy cost is ~1-2ms for 512x512 per property — acceptable.
 */

import type { Grid } from '../grid/Grid';

/**
 * Extract copies of all current grid buffers for posting to the worker.
 * Returns a record of property name → Float32Array copy.
 */
export function extractGridBuffers(grid: Grid): Record<string, Float32Array> {
  const result: Record<string, Float32Array> = {};
  for (const name of grid.getPropertyNames()) {
    const current = grid.getCurrentBuffer(name);
    result[name] = new Float32Array(current);
  }
  return result;
}

/**
 * Apply result buffers from the worker to the grid's next (write) buffers.
 * Unknown property names are silently ignored.
 */
export function applyResultBuffers(
  grid: Grid,
  results: Record<string, Float32Array>,
): void {
  for (const [name, data] of Object.entries(results)) {
    if (!grid.hasProperty(name)) continue;
    const nextBuf = grid.getNextBuffer(name);
    // Only copy if lengths match (guard against malformed results)
    if (data.length === nextBuf.length) {
      nextBuf.set(data);
    }
  }
}
