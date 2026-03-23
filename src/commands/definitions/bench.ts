/**
 * Benchmark commands: bench.run, bench.results.
 *
 * bench.run — Run GPU benchmark suite (all rules execute on GPU).
 * bench.results — Query and display recent results from Supabase.
 *
 * CPU benchmarks removed — all rule execution is GPU-native now.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { EventBus } from '../../engine/core/EventBus';
import { BENCHMARK_SUITE } from '../../lib/benchmarkSuite';
import { runBenchmarkGPU, canRunGPU, submitResults, queryResults, type BenchmarkResult } from '../../lib/benchmarkRunner';

const RunParams = z.object({
  test: z.string().optional(),
}).describe('{ test?: string }');

const ResultsParams = z.object({
  limit: z.number().int().min(1).optional(),
}).describe('{ limit?: number }');

function progressBar(current: number, total: number, width: number = 20): string {
  const pct = Math.min(1, current / total);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${Math.round(pct * 100)}%`;
}

function formatSummaryTable(results: BenchmarkResult[]): string {
  const lines: string[] = [];
  const col = (s: string, w: number) => s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
  const rCol = (s: string, w: number) => s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s;

  lines.push('┌' + '─'.repeat(27) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(11) + '┬' + '─'.repeat(10) + '┐');
  lines.push('│ ' + col('Test', 25) + '│' + rCol('Tick(ms)', 9) + ' │' + rCol('P95(ms)', 9) + ' │' + rCol('FPS', 10) + ' │' + rCol('Heap(MB)', 9) + ' │');
  lines.push('├' + '─'.repeat(27) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(11) + '┼' + '─'.repeat(10) + '┤');

  for (const r of results) {
    const tick = r.metrics.tick_ms?.toFixed(1) ?? '-';
    const p95 = r.metrics.tick_p95_ms?.toFixed(1) ?? '-';
    const fps = r.metrics.fps?.toFixed(1) ?? '-';
    const heap = r.metrics.heap_mb?.toFixed(0) ?? '-';
    lines.push(
      '│ ' + col(r.testName, 25) + '│' +
      rCol(tick, 9) + ' │' +
      rCol(p95, 9) + ' │' +
      rCol(fps, 10) + ' │' +
      rCol(heap, 9) + ' │'
    );
  }

  lines.push('└' + '─'.repeat(27) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(11) + '┴' + '─'.repeat(10) + '┘');
  return lines.join('\n');
}

function formatQueryResults(rows: Record<string, unknown>[]): string {
  const byArch = new Map<string, Map<string, Map<string, number>>>();

  for (const row of rows) {
    const arch = row.architecture_tag as string;
    const test = row.test_name as string;
    const metric = row.metric_name as string;
    const value = row.metric_value as number;

    if (!byArch.has(arch)) byArch.set(arch, new Map());
    const archMap = byArch.get(arch)!;
    if (!archMap.has(test)) archMap.set(test, new Map());
    archMap.get(test)!.set(metric, value);
  }

  const lines: string[] = [];
  for (const [arch, tests] of byArch) {
    lines.push(`\n── ${arch} ──`);
    const col = (s: string, w: number) => s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
    const rCol = (s: string, w: number) => s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s;

    lines.push('  ' + col('Test', 26) + rCol('Tick(ms)', 10) + rCol('FPS', 10) + rCol('Heap(MB)', 10));
    lines.push('  ' + '─'.repeat(56));
    for (const [test, metrics] of tests) {
      const tick = metrics.get('tick_ms')?.toFixed(1) ?? '-';
      const fps = metrics.get('fps')?.toFixed(1) ?? '-';
      const heap = metrics.get('heap_mb')?.toFixed(0) ?? '-';
      lines.push('  ' + col(test, 26) + rCol(tick, 10) + rCol(fps, 10) + rCol(heap, 10));
    }
  }

  return lines.join('\n');
}

/** Resolve test filter and return matching suite configs */
function resolveSuite(test?: string): { suite: typeof BENCHMARK_SUITE; error?: string } {
  if (!test) return { suite: BENCHMARK_SUITE };
  const suite = BENCHMARK_SUITE.filter(t => t.testName === test);
  if (suite.length === 0) {
    const names = BENCHMARK_SUITE.map(t => t.testName).join(', ');
    return { suite: [], error: `Unknown test "${test}". Available: ${names}` };
  }
  return { suite };
}

/** Run GPU benchmarks for the given suite */
async function runGPU(suite: typeof BENCHMARK_SUITE, eventBus: EventBus): Promise<BenchmarkResult[]> {
  const gpuSuite = suite.filter(canRunGPU);
  const total = gpuSuite.length;
  const results: BenchmarkResult[] = [];
  for (let idx = 0; idx < gpuSuite.length; idx++) {
    const config = gpuSuite[idx];
    const label = `[${idx + 1}/${total}] ${config.testName}`;
    eventBus.emit('bench:progress', { message: `${label}  warming up (GPU)...`, testIndex: idx, totalTests: total });

    const result = await runBenchmarkGPU(config, (_tn, tick, tickTotal, phase) => {
      eventBus.emit('bench:progress', { message: `${label}  ${phase} ${progressBar(tick, tickTotal)}  (${tick}/${tickTotal})`, testIndex: idx, totalTests: total });
    });
    if (result) {
      results.push(result);
      eventBus.emit('bench:progress', { message: `${label}  done — ${result.metrics.tick_ms}ms/tick, ${result.metrics.fps} fps`, testIndex: idx, totalTests: total });
      await submitResults(result);
    }
  }
  return results;
}

/** Format the Supabase note */
async function supabaseNote(results: BenchmarkResult[]): Promise<string> {
  const { supabase: sb } = await import('../../lib/supabaseClient');
  const tags = [...new Set(results.map(r => r.architectureTag))].join(', ');
  return sb ? `Results saved to Supabase (tags: ${tags})` : 'Results logged to console (Supabase not configured)';
}

export function registerBenchCommands(registry: CommandRegistry, eventBus: EventBus): void {
  // bench.run — GPU benchmarks
  registry.register({
    name: 'bench.run',
    description: 'Run GPU benchmark suite',
    category: 'bench',
    params: RunParams,
    execute: async (params) => {
      const { test } = params as z.infer<typeof RunParams>;
      const { suite, error } = resolveSuite(test);
      if (error) return { success: false, error };

      const gpuSuite = suite.filter(canRunGPU);
      if (gpuSuite.length === 0) return { success: false, error: 'No GPU-compatible tests (WebGPU unavailable?)' };

      const results = await runGPU(suite, eventBus);
      return { success: true, data: { summary: formatSummaryTable(results) + '\n' + await supabaseNote(results), results } };
    },
  });

  // bench.gpu — alias for bench.run (backward compat)
  registry.register({
    name: 'bench.gpu',
    description: 'Run GPU benchmark suite',
    category: 'bench',
    params: RunParams,
    execute: async (params) => {
      return registry.execute('bench.run', params);
    },
  });

  // bench.results — query Supabase
  registry.register({
    name: 'bench.results',
    description: 'Query and display recent benchmark results from Supabase',
    category: 'bench',
    params: ResultsParams,
    execute: async (params) => {
      const { limit } = params as z.infer<typeof ResultsParams>;
      const rows = await queryResults(limit ?? 200);
      if (rows === null) return { success: false, error: 'Supabase not configured — cannot query results' };
      if (rows.length === 0) return { success: true, data: { summary: 'No benchmark results found.' } };
      return { success: true, data: { summary: formatQueryResults(rows), rowCount: rows.length } };
    },
  });
}
