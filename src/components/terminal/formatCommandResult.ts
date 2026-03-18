/**
 * Maps command results to structured terminal output.
 *
 * Replaces raw JSON.stringify with readable formats per command.
 */

import type { StructuredData } from './useTerminal';

interface FormattedResult {
  message: string;
  structured?: StructuredData;
}

type Formatter = (data: unknown) => FormattedResult;

function formatRuleShow(data: unknown): FormattedResult {
  const d = data as { body?: string };
  if (d.body) {
    return {
      message: 'Rule body:',
      structured: { kind: 'code', language: 'javascript', content: d.body },
    };
  }
  return fallback(data);
}

function formatParamList(data: unknown): FormattedResult {
  const d = data as { params?: Array<{ name: string; value: number; default: number; min?: number; max?: number }> };
  if (Array.isArray(d.params)) {
    const columns = ['Name', 'Value', 'Default', 'Range'];
    const rows = d.params.map((p) => [
      p.name,
      String(p.value),
      String(p.default),
      p.min != null && p.max != null ? `${p.min}–${p.max}` : '—',
    ]);
    return {
      message: `${d.params.length} parameter${d.params.length === 1 ? '' : 's'}:`,
      structured: { kind: 'table', columns, rows },
    };
  }
  return fallback(data);
}

function formatKeyValue(data: unknown): FormattedResult {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const pairs: [string, string][] = Object.entries(data as Record<string, unknown>).map(
      ([k, v]) => [k, String(v)],
    );
    return {
      message: '',
      structured: { kind: 'kv', pairs },
    };
  }
  return fallback(data);
}

function formatParamGetSet(data: unknown): FormattedResult {
  const d = data as { name?: string; value?: unknown };
  if (d.name !== undefined && d.value !== undefined) {
    return {
      message: '',
      structured: { kind: 'kv', pairs: [[d.name, String(d.value)]] },
    };
  }
  return fallback(data);
}

function fallback(data: unknown): FormattedResult {
  return {
    message: '',
    structured: { kind: 'json', content: data },
  };
}

function formatBenchSummary(data: unknown): FormattedResult {
  const d = data as { summary?: string };
  if (d.summary) {
    return {
      message: d.summary,
      structured: { kind: 'code', language: 'text', content: d.summary },
    };
  }
  return fallback(data);
}

const FORMATTERS: Record<string, Formatter> = {
  'rule.show': formatRuleShow,
  'param.list': formatParamList,
  'grid.info': formatKeyValue,
  'param.get': formatParamGetSet,
  'param.set': formatParamGetSet,
  'sim.status': formatKeyValue,
  'bench.run': formatBenchSummary,
  'bench.results': formatBenchSummary,
  'gpu.test': formatBenchSummary,
  'gpu.info': formatBenchSummary,
  'ir.test': formatBenchSummary,
  'ir.show': formatBenchSummary,
};

export function formatCommandResult(commandName: string, data: unknown): FormattedResult {
  const formatter = FORMATTERS[commandName];
  if (formatter) {
    return formatter(data);
  }
  return fallback(data);
}
