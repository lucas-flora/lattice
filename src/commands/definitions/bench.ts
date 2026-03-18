/**
 * Benchmark commands: bench.run, bench.results.
 *
 * bench.run — Execute the benchmark suite (or a single test by name).
 *   Runs each test headlessly via direct Simulation.tick() calls,
 *   submits results to Supabase, and prints a summary table.
 *   Emits bench:progress events on the EventBus for live terminal feedback.
 *
 * bench.results — Query and display recent results from Supabase,
 *   grouped by architecture tag for cross-phase comparison.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { EventBus } from '../../engine/core/EventBus';
import { BENCHMARK_SUITE } from '../../lib/benchmarkSuite';
import { runBenchmark, submitResults, queryResults, type BenchmarkResult } from '../../lib/benchmarkRunner';

const RunParams = z.object({
  test: z.string().optional(),
}).describe('{ test?: string }');

const ResultsParams = z.object({
  limit: z.number().int().min(1).optional(),
}).describe('{ limit?: number }');

/**
 * Build an ASCII progress bar: [████████░░░░░░░░] 45%
 */
function progressBar(current: number, total: number, width: number = 20): string {
  const pct = Math.min(1, current / total);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${Math.round(pct * 100)}%`;
}

/**
 * Format a results summary as an ASCII table for terminal display.
 */
function formatSummaryTable(results: BenchmarkResult[]): string {
  const lines: string[] = [];
  const col = (s: string, w: number) => s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
  const rCol = (s: string, w: number) => s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s;

  lines.push('┌' + '─'.repeat(23) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(11) + '┬' + '─'.repeat(10) + '┐');
  lines.push('│ ' + col('Test', 21) + '│' + rCol('Tick(ms)', 9) + ' │' + rCol('P95(ms)', 9) + ' │' + rCol('FPS', 10) + ' │' + rCol('Heap(MB)', 9) + ' │');
  lines.push('├' + '─'.repeat(23) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(11) + '┼' + '─'.repeat(10) + '┤');

  for (const r of results) {
    const tick = r.metrics.tick_ms?.toFixed(1) ?? '-';
    const p95 = r.metrics.tick_p95_ms?.toFixed(1) ?? '-';
    const fps = r.metrics.fps?.toFixed(1) ?? '-';
    const heap = r.metrics.heap_mb?.toFixed(0) ?? '-';
    lines.push(
      '│ ' + col(r.testName, 21) + '│' +
      rCol(tick, 9) + ' │' +
      rCol(p95, 9) + ' │' +
      rCol(fps, 10) + ' │' +
      rCol(heap, 9) + ' │'
    );
  }

  lines.push('└' + '─'.repeat(23) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(11) + '┴' + '─'.repeat(10) + '┘');
  return lines.join('\n');
}

/**
 * Format queried Supabase results grouped by architecture tag.
 */
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

    lines.push('  ' + col('Test', 22) + rCol('Tick(ms)', 10) + rCol('FPS', 10) + rCol('Heap(MB)', 10));
    lines.push('  ' + '─'.repeat(52));
    for (const [test, metrics] of tests) {
      const tick = metrics.get('tick_ms')?.toFixed(1) ?? '-';
      const fps = metrics.get('fps')?.toFixed(1) ?? '-';
      const heap = metrics.get('heap_mb')?.toFixed(0) ?? '-';
      lines.push('  ' + col(test, 22) + rCol(tick, 10) + rCol(fps, 10) + rCol(heap, 10));
    }
  }

  return lines.join('\n');
}

export function registerBenchCommands(registry: CommandRegistry, eventBus: EventBus): void {
  registry.register({
    name: 'bench.run',
    description: 'Run performance benchmark suite (or a single test by name)',
    category: 'bench',
    params: RunParams,
    execute: async (params) => {
      const { test } = params as z.infer<typeof RunParams>;

      // Select tests to run
      let suite = BENCHMARK_SUITE;
      if (test) {
        suite = BENCHMARK_SUITE.filter(t => t.testName === test);
        if (suite.length === 0) {
          const names = BENCHMARK_SUITE.map(t => t.testName).join(', ');
          return { success: false, error: `Unknown test "${test}". Available: ${names}` };
        }
      }

      const results: BenchmarkResult[] = [];

      for (let idx = 0; idx < suite.length; idx++) {
        const config = suite[idx];
        const label = `[${idx + 1}/${suite.length}] ${config.testName}`;

        // Emit test start
        eventBus.emit('bench:progress', {
          message: `${label}  warming up...`,
          testIndex: idx,
          totalTests: suite.length,
        });

        const result = await runBenchmark(config, (testName, tick, total, phase) => {
          const bar = progressBar(tick, total);
          eventBus.emit('bench:progress', {
            message: `${label}  ${phase} ${bar}  (${tick}/${total})`,
            testIndex: idx,
            totalTests: suite.length,
          });
        });

        results.push(result);

        // Emit test complete with inline result
        eventBus.emit('bench:progress', {
          message: `${label}  done — ${result.metrics.tick_ms}ms/tick, ${result.metrics.fps} fps`,
          testIndex: idx,
          totalTests: suite.length,
        });

        // Submit each test as it completes
        await submitResults(result);
      }

      const table = formatSummaryTable(results);
      const archTag = results[0]?.architectureTag ?? 'baseline-cpu';
      const supabaseNote = (await import('../../lib/supabaseClient')).supabase
        ? `Results saved to Supabase (architecture: ${archTag})`
        : 'Results logged to console (Supabase not configured)';

      return {
        success: true,
        data: {
          summary: table + '\n' + supabaseNote,
          results,
        },
      };
    },
  });

  registry.register({
    name: 'bench.results',
    description: 'Query and display recent benchmark results from Supabase',
    category: 'bench',
    params: ResultsParams,
    execute: async (params) => {
      const { limit } = params as z.infer<typeof ResultsParams>;
      const rows = await queryResults(limit ?? 200);

      if (rows === null) {
        return { success: false, error: 'Supabase not configured — cannot query results' };
      }

      if (rows.length === 0) {
        return { success: true, data: { summary: 'No benchmark results found.' } };
      }

      const formatted = formatQueryResults(rows);
      return {
        success: true,
        data: { summary: formatted, rowCount: rows.length },
      };
    },
  });
}
