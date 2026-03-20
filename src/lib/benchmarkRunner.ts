/**
 * Benchmark runner for measuring simulation and render performance.
 *
 * Creates isolated Simulation instances from preset configs with overridden
 * grid dimensions, seeds random initial state, and collects timing data.
 * Results are submitted to Supabase for cross-architecture comparison.
 *
 * All timing uses performance.now() for sub-millisecond precision.
 * Memory uses performance.memory.usedJSHeapSize (Chrome only, gracefully degrades).
 */

import { Simulation } from '../engine/rule/Simulation';
import { loadBuiltinPresetClient, type BuiltinPresetNameClient } from '../engine/preset/builtinPresetsClient';
import type { PresetConfig } from '../engine/preset/types';
import { supabase } from './supabaseClient';
import type { BenchmarkConfig } from './benchmarkSuite';
import { GPURuleRunner } from '../engine/rule/GPURuleRunner';
import { GPUContext } from '../engine/gpu/GPUContext';
import { BUILTIN_IR } from '../engine/ir/builtinIR';

/** Architecture tag for CPU measurements */
const CPU_TAG = 'baseline-cpu';
/** Architecture tag for GPU measurements */
const GPU_TAG = 'phase-3-gpu-sim';

export interface BenchmarkResult {
  gitCommit: string;
  architectureTag: string;
  browser: string;
  gpu: string | null;
  testName: string;
  gridWidth: number;
  gridHeight: number;
  /** metric_name → metric_value */
  metrics: Record<string, number>;
  /** Extra context (num_properties, rule_type, num_ticks, etc.) */
  metadata: Record<string, unknown>;
}

/** Progress callback for UI/terminal updates */
export type BenchmarkProgressFn = (testName: string, tick: number, total: number, phase: 'warmup' | 'measure') => void;

/**
 * Detect browser user agent string.
 */
function detectBrowser(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  // Extract browser name and version
  const match = ua.match(/(Chrome|Firefox|Safari|Edge)\/(\d+[\d.]*)/);
  if (match) return `${match[1]}/${match[2]}`;
  return ua.slice(0, 100);
}

/**
 * Detect GPU via WebGL debug renderer info extension.
 * Returns the unmasked renderer string (e.g. 'Apple M4 Max') or null.
 */
function detectGPU(): string | null {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return null;
    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
  } catch {
    return null;
  }
}

/**
 * Get the git commit hash injected at build time via next.config.ts.
 */
function getGitCommit(): string {
  return process.env.NEXT_PUBLIC_GIT_COMMIT ?? 'unknown';
}

/**
 * Get current JS heap usage in MB. Chrome only — returns null on other browsers.
 */
function getHeapMB(): number | null {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  if (!mem) return null;
  return Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 100) / 100;
}

/**
 * Create a Simulation from a preset with overridden grid dimensions.
 * Seeds ~25% of cells as alive/active for TS-path presets.
 */
function createBenchmarkSimulation(config: BenchmarkConfig): Simulation {
  const presetConfig = loadBuiltinPresetClient(config.presetName as BuiltinPresetNameClient);

  // Override grid dimensions
  const overridden: PresetConfig = {
    ...presetConfig,
    grid: {
      ...presetConfig.grid,
      width: config.gridWidth,
      height: config.gridHeight,
    },
  };

  const sim = new Simulation(overridden);

  // Seed random initial state (~25% density)
  const cellCount = config.gridWidth * config.gridHeight;
  const primaryProp = presetConfig.cell_properties?.[0]?.name ?? 'alive';

  if (sim.grid.hasProperty(primaryProp)) {
    for (let i = 0; i < cellCount; i++) {
      if (Math.random() < 0.25) {
        sim.setCellDirect(primaryProp, i, 1);
      }
    }
  }

  // For Gray-Scott, seed a central square of V concentration
  if (config.presetName === 'gray-scott' && sim.grid.hasProperty('v')) {
    const w = config.gridWidth;
    const h = config.gridHeight;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const r = Math.floor(Math.min(w, h) / 8);
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const idx = y * w + x;
        sim.setCellDirect('u', idx, 0.5 + Math.random() * 0.02);
        sim.setCellDirect('v', idx, 0.25 + Math.random() * 0.02);
      }
    }
  }

  return sim;
}

/** Yield to the event loop so the UI can repaint */
const yieldFrame = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** How often to yield during tick loops (every N ticks) */
const YIELD_INTERVAL = 10;

/**
 * Run a single benchmark test and return results.
 * Async to yield periodically, allowing the UI to update progress.
 *
 * @param config - Test configuration
 * @param onProgress - Optional progress callback (called every YIELD_INTERVAL ticks)
 * @returns Benchmark result with all collected metrics
 */
export async function runBenchmark(
  config: BenchmarkConfig,
  onProgress?: BenchmarkProgressFn,
): Promise<BenchmarkResult> {
  const sim = createBenchmarkSimulation(config);
  const isRenderOnly = config.testName.startsWith('render-only');

  // Warmup phase
  for (let i = 0; i < config.warmupTicks; i++) {
    if (!isRenderOnly) sim.tick();
    if ((i + 1) % YIELD_INTERVAL === 0) {
      onProgress?.(config.testName, i + 1, config.warmupTicks, 'warmup');
      await yieldFrame();
    }
  }

  // Measurement phase — timing is per-tick so yields don't affect measurements
  const tickTimes: number[] = [];
  const heapBefore = getHeapMB();

  for (let i = 0; i < config.measureTicks; i++) {
    if (isRenderOnly) {
      const start = performance.now();
      sim.grid.swap();
      const end = performance.now();
      tickTimes.push(end - start);
    } else {
      const start = performance.now();
      sim.tick();
      const end = performance.now();
      tickTimes.push(end - start);
    }
    if ((i + 1) % YIELD_INTERVAL === 0) {
      onProgress?.(config.testName, i + 1, config.measureTicks, 'measure');
      await yieldFrame();
    }
  }

  const heapAfter = getHeapMB();

  // Compute statistics
  const sorted = [...tickTimes].sort((a, b) => a - b);
  const avgMs = tickTimes.reduce((s, t) => s + t, 0) / tickTimes.length;
  const p95Ms = sorted[Math.floor(sorted.length * 0.95)];
  const fps = 1000 / avgMs;

  const metrics: Record<string, number> = {
    tick_ms: round2(avgMs),
    tick_p95_ms: round2(p95Ms),
    fps: round2(fps),
  };

  if (heapAfter !== null) {
    metrics.heap_mb = heapAfter;
  }
  if (heapBefore !== null && heapAfter !== null) {
    metrics.heap_delta_mb = round2(heapAfter - heapBefore);
  }

  return {
    gitCommit: getGitCommit(),
    architectureTag: CPU_TAG,
    browser: detectBrowser(),
    gpu: detectGPU(),
    testName: config.testName,
    gridWidth: config.gridWidth,
    gridHeight: config.gridHeight,
    metrics,
    metadata: {
      warmupTicks: config.warmupTicks,
      measureTicks: config.measureTicks,
      presetName: config.presetName,
      ruleType: 'typescript',
      numProperties: sim.grid.getPropertyNames().length,
    },
  };
}

/**
 * Check if a benchmark config can run on GPU.
 */
export function canRunGPU(config: BenchmarkConfig): boolean {
  if (!GPUContext.isAvailable()) return false;
  const presetConfig = loadBuiltinPresetClient(config.presetName as BuiltinPresetNameClient);
  const irBuilder = BUILTIN_IR[presetConfig.meta.name];
  return !!irBuilder && !!irBuilder(presetConfig);
}

/**
 * Run a GPU benchmark: create GPURuleRunner, tick on GPU, measure with
 * device.queue.onSubmittedWorkDone() for accurate GPU execution time.
 */
export async function runBenchmarkGPU(
  config: BenchmarkConfig,
  onProgress?: BenchmarkProgressFn,
): Promise<BenchmarkResult | null> {
  if (!canRunGPU(config)) return null;
  if (config.testName.startsWith('render-only')) return null;

  const ctx = GPUContext.tryGet();
  if (!ctx) return null;

  const sim = createBenchmarkSimulation(config);
  const runner = new GPURuleRunner(sim.grid, sim.preset);
  await runner.initialize();

  // Warmup phase
  for (let i = 0; i < config.warmupTicks; i++) {
    runner.tick();
    if ((i + 1) % YIELD_INTERVAL === 0) {
      await ctx.device.queue.onSubmittedWorkDone();
      onProgress?.(config.testName + '-gpu', i + 1, config.warmupTicks, 'warmup');
      await yieldFrame();
    }
  }
  await ctx.device.queue.onSubmittedWorkDone();

  // Measurement phase — time includes GPU execution via onSubmittedWorkDone()
  const tickTimes: number[] = [];
  const heapBefore = getHeapMB();

  for (let i = 0; i < config.measureTicks; i++) {
    const start = performance.now();
    runner.tick();
    await ctx.device.queue.onSubmittedWorkDone();
    const end = performance.now();
    tickTimes.push(end - start);

    if ((i + 1) % YIELD_INTERVAL === 0) {
      onProgress?.(config.testName + '-gpu', i + 1, config.measureTicks, 'measure');
      await yieldFrame();
    }
  }

  const heapAfter = getHeapMB();
  runner.destroy();

  // Compute statistics
  const sorted = [...tickTimes].sort((a, b) => a - b);
  const avgMs = tickTimes.reduce((s, t) => s + t, 0) / tickTimes.length;
  const p95Ms = sorted[Math.floor(sorted.length * 0.95)];
  const fps = 1000 / avgMs;

  const metrics: Record<string, number> = {
    tick_ms: round2(avgMs),
    tick_p95_ms: round2(p95Ms),
    fps: round2(fps),
  };

  if (heapAfter !== null) metrics.heap_mb = heapAfter;
  if (heapBefore !== null && heapAfter !== null) {
    metrics.heap_delta_mb = round2(heapAfter - heapBefore);
  }

  return {
    gitCommit: getGitCommit(),
    architectureTag: GPU_TAG,
    browser: detectBrowser(),
    gpu: detectGPU(),
    testName: config.testName + '-gpu',
    gridWidth: config.gridWidth,
    gridHeight: config.gridHeight,
    metrics,
    metadata: {
      warmupTicks: config.warmupTicks,
      measureTicks: config.measureTicks,
      presetName: config.presetName,
      ruleType: 'webgpu',
      numProperties: sim.grid.getPropertyNames().length,
    },
  };
}

/**
 * Submit benchmark results to Supabase.
 * Each metric becomes a separate row for easy querying/comparison.
 * Falls back to console.log if Supabase is not configured.
 */
export async function submitResults(result: BenchmarkResult): Promise<void> {
  const rows = Object.entries(result.metrics).map(([metricName, metricValue]) => ({
    git_commit: result.gitCommit,
    architecture_tag: result.architectureTag,
    browser: result.browser,
    gpu: result.gpu,
    test_name: result.testName,
    grid_width: result.gridWidth,
    grid_height: result.gridHeight,
    metric_name: metricName,
    metric_value: metricValue,
    metadata: result.metadata,
  }));

  if (!supabase) {
    console.log('[bench] Supabase not configured — results logged to console:');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const { error } = await supabase.from('perf_benchmarks').insert(rows);
  if (error) {
    console.error('[bench] Failed to submit results:', error.message);
    console.log('[bench] Fallback — results:', JSON.stringify(result, null, 2));
  }
}

/**
 * Query recent benchmark results from Supabase, grouped by architecture tag.
 *
 * @param limit - Max rows to fetch (default 200)
 * @returns Array of result rows, or null if Supabase is not configured
 */
export async function queryResults(limit: number = 200): Promise<Record<string, unknown>[] | null> {
  if (!supabase) {
    console.log('[bench] Supabase not configured — cannot query results');
    return null;
  }

  const { data, error } = await supabase
    .from('perf_benchmarks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[bench] Failed to query results:', error.message);
    return null;
  }

  return data;
}

/** Round to 2 decimal places */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
