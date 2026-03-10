/**
 * Factory function to create a simulation Web Worker.
 *
 * Uses the `new URL('./worker.ts', import.meta.url)` pattern
 * which is supported by both Turbopack and webpack for bundling workers.
 */
export function createSimulationWorker(): Worker {
  return new Worker(new URL('./simulation.worker.ts', import.meta.url));
}
