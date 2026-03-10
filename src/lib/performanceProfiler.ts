/**
 * Performance profiling utilities.
 *
 * GUIP-07: Measures frame times for simulation ticks to identify bottlenecks.
 * Used in performance tests to document Gray-Scott 512x512 frame time.
 */

export interface ProfileResult {
  /** Average tick time in milliseconds */
  avgMs: number;
  /** Minimum tick time in milliseconds */
  minMs: number;
  /** Maximum tick time in milliseconds */
  maxMs: number;
  /** Median tick time in milliseconds */
  medianMs: number;
  /** 95th percentile tick time in milliseconds */
  p95Ms: number;
  /** Total number of ticks profiled */
  tickCount: number;
  /** Total elapsed time in milliseconds */
  totalMs: number;
  /** Effective frames per second */
  fps: number;
}

/**
 * Profile a tick function by running it N times and collecting timing data.
 *
 * @param tickFn - The function to profile (called repeatedly)
 * @param iterations - Number of iterations to run
 * @param warmupIterations - Number of warmup iterations (not counted in results)
 * @returns Profiling results
 */
export function profileTicks(
  tickFn: () => void,
  iterations: number = 100,
  warmupIterations: number = 10,
): ProfileResult {
  // Warmup
  for (let i = 0; i < warmupIterations; i++) {
    tickFn();
  }

  const times: number[] = [];
  const startTotal = performance.now();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    tickFn();
    const end = performance.now();
    times.push(end - start);
  }

  const endTotal = performance.now();
  const totalMs = endTotal - startTotal;

  // Sort for percentile calculations
  const sorted = [...times].sort((a, b) => a - b);

  const avgMs = times.reduce((sum, t) => sum + t, 0) / times.length;
  const minMs = sorted[0];
  const maxMs = sorted[sorted.length - 1];
  const medianMs = sorted[Math.floor(sorted.length / 2)];
  const p95Ms = sorted[Math.floor(sorted.length * 0.95)];
  const fps = iterations / (totalMs / 1000);

  return {
    avgMs: Math.round(avgMs * 100) / 100,
    minMs: Math.round(minMs * 100) / 100,
    maxMs: Math.round(maxMs * 100) / 100,
    medianMs: Math.round(medianMs * 100) / 100,
    p95Ms: Math.round(p95Ms * 100) / 100,
    tickCount: iterations,
    totalMs: Math.round(totalMs * 100) / 100,
    fps: Math.round(fps * 100) / 100,
  };
}

/**
 * Format a ProfileResult as a human-readable string.
 */
export function formatProfileResult(result: ProfileResult, label?: string): string {
  const lines: string[] = [];
  if (label) lines.push(`Performance Profile: ${label}`);
  lines.push(`  Ticks: ${result.tickCount}`);
  lines.push(`  Total: ${result.totalMs}ms`);
  lines.push(`  Avg: ${result.avgMs}ms`);
  lines.push(`  Median: ${result.medianMs}ms`);
  lines.push(`  Min: ${result.minMs}ms`);
  lines.push(`  Max: ${result.maxMs}ms`);
  lines.push(`  P95: ${result.p95Ms}ms`);
  lines.push(`  FPS: ${result.fps}`);
  return lines.join('\n');
}
