/**
 * Debug logging for the simulation pipeline.
 *
 * Set env var to enable:
 *   NEXT_PUBLIC_LATTICE_LOG=1   minimal (preset load, play/pause, compute-ahead start/end)
 *   NEXT_PUBLIC_LATTICE_LOG=2   verbose (every tick, snapshot restore, frame cache ops)
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
