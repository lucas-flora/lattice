/**
 * Factory function to create a Pyodide Web Worker.
 *
 * Uses the `new URL('./worker.ts', import.meta.url)` pattern
 * which is supported by both Turbopack and webpack for bundling workers.
 */
export function createPyodideWorker(): Worker {
  return new Worker(new URL('./pyodide.worker.ts', import.meta.url));
}
