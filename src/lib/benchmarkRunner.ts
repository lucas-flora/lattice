/**
 * Benchmark runner for measuring GPU simulation performance.
 *
 * Creates isolated Simulation + GPURuleRunner instances, seeds random
 * initial state, and collects timing data with onSubmittedWorkDone()
 * for accurate GPU execution time.
 *
 * Results are submitted to Supabase for cross-architecture comparison.
 */

import { Simulation } from '../engine/rule/Simulation';
import { loadBuiltinPresetClient, type BuiltinPresetNameClient } from '../engine/preset/builtinPresetsClient';
import type { PresetConfig } from '../engine/preset/types';
import { supabase } from './supabaseClient';
import type { BenchmarkConfig } from './benchmarkSuite';
import { GPURuleRunner } from '../engine/rule/GPURuleRunner';
import { GPUContext } from '../engine/gpu/GPUContext';

/** Architecture tag for GPU measurements */
const GPU_TAG = 'phase-6-final';

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

function detectBrowser(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  const match = ua.match(/(Chrome|Firefox|Safari|Edge)\/(\d+[\d.]*)/);
  if (match) return `${match[1]}/${match[2]}`;
  return ua.slice(0, 100);
}

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

function getGitCommit(): string {
  return process.env.NEXT_PUBLIC_GIT_COMMIT ?? 'unknown';
}

function getHeapMB(): number | null {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  if (!mem) return null;
  return Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 100) / 100;
}

/**
 * Create a Simulation from a preset with overridden grid dimensions.
 */
function createBenchmarkSimulation(config: BenchmarkConfig): Simulation {
  const presetConfig = loadBuiltinPresetClient(config.presetName as BuiltinPresetNameClient);

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
  const colorMapping = presetConfig.visual_mappings?.find(m => m.channel === 'color');
  const primaryProp = colorMapping?.property
    ?? presetConfig.cell_properties?.[0]?.name ?? 'alive';

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

const yieldFrame = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const YIELD_INTERVAL = 10;

/**
 * Check if a benchmark config can run on GPU.
 */
export function canRunGPU(config: BenchmarkConfig): boolean {
  if (!GPUContext.isAvailable()) return false;
  if (config.testName.startsWith('render-only')) return false;
  const presetConfig = loadBuiltinPresetClient(config.presetName as BuiltinPresetNameClient);
  return !!presetConfig.rule.compute;
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
      onProgress?.(config.testName, i + 1, config.warmupTicks, 'warmup');
      await yieldFrame();
    }
  }
  await ctx.device.queue.onSubmittedWorkDone();

  // Measurement phase
  const tickTimes: number[] = [];
  const heapBefore = getHeapMB();

  for (let i = 0; i < config.measureTicks; i++) {
    const start = performance.now();
    runner.tick();
    await ctx.device.queue.onSubmittedWorkDone();
    const end = performance.now();
    tickTimes.push(end - start);

    if ((i + 1) % YIELD_INTERVAL === 0) {
      onProgress?.(config.testName, i + 1, config.measureTicks, 'measure');
      await yieldFrame();
    }
  }

  const heapAfter = getHeapMB();
  runner.destroy();

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
    testName: config.testName,
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
 * Query recent benchmark results from Supabase.
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
