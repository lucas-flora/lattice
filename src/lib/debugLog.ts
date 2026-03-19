/**
 * Debug logging for the simulation pipeline.
 *
 * Log tags and colors (filter console by tag name to isolate):
 *
 * | Tag       | Color   | Level | What it logs                                           |
 * |-----------|---------|-------|--------------------------------------------------------|
 * | [gpu]     | orange  | always| GPU pipeline: adapter, init, shader compile, renderer  |
 * | [ctrl]    | green   | 1+    | Controller lifecycle: preset load, state capture, reset|
 * | [compute] | yellow  | 2+    | Compute-ahead: frame cache, chunk progress              |
 * | [play]    | blue    | 2+    | Playback: tick, seek, step, restore frame              |
 * | [sim]     | purple  | 2+    | Simulation tick pipeline: async steps, rule execution  |
 * | [pyodide] | pink    | 1+    | Pyodide bridge: load, ready, exec                     |
 *
 * Env vars to enable:
 *   NEXT_PUBLIC_LATTICE_LOG=1   minimal (preset load, play/pause, compute-ahead start/end)
 *   NEXT_PUBLIC_LATTICE_LOG=2   verbose (every tick, snapshot restore, frame cache ops)
 *
 * [gpu] logs are ALWAYS visible (no env var needed) because GPU init failures
 * are hard to debug without them.
 */

const level: number = typeof window !== 'undefined'
  ? parseInt((process.env.NEXT_PUBLIC_LATTICE_LOG ?? '0'), 10)
  : 0;

const COLORS: Record<string, string> = {
  ctrl:   'color: #4ade80',  // green — controller lifecycle
  compute:'color: #facc15',  // yellow — compute-ahead
  play:   'color: #38bdf8',  // blue — playback
  pyodide:'color: #f472b6',  // pink — pyodide bridge
  sim:    'color: #a78bfa',  // purple — simulation tick
  gpu:    'color: #fb923c',  // orange — GPU pipeline
};

function ts(): string {
  const d = new Date();
  return `${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}.${d.getMilliseconds().toString().padStart(3,'0')}`;
}

/** Minimal log (level >= 1) */
export function logMin(category: string, msg: string, data?: Record<string, unknown>): void {
  if (level < 1) return;
  const color = COLORS[category] ?? 'color: #a1a1aa';
  if (data) {
    console.log(`%c[${ts()}][${category}] ${msg}`, color, data);
  } else {
    console.log(`%c[${ts()}][${category}] ${msg}`, color);
  }
}

/** Verbose log (level >= 2) */
export function logDbg(category: string, msg: string, data?: Record<string, unknown>): void {
  if (level < 2) return;
  const color = COLORS[category] ?? 'color: #a1a1aa';
  if (data) {
    console.log(`%c[${ts()}][${category}] ${msg}`, color, data);
  } else {
    console.log(`%c[${ts()}][${category}] ${msg}`, color);
  }
}

export function isLogEnabled(): boolean { return level >= 1; }
export function isDbgEnabled(): boolean { return level >= 2; }

/** GPU pipeline log — always visible regardless of log level */
export function logGPU(msg: string): void {
  console.log(`%c[gpu] ${msg}`, COLORS.gpu);
}
