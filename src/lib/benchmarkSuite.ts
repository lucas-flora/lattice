/**
 * Standard benchmark suite for WebGPU migration performance tracking.
 *
 * Each config defines a test scenario: which preset to load, grid dimensions,
 * and how many ticks to warm up / measure. The suite covers scaling behavior
 * across grid sizes, different rule types (TS vs WASM), and render-only cost.
 */

export interface BenchmarkConfig {
  /** Unique test identifier, e.g. 'conway-ts-512' */
  testName: string;
  /** Which built-in preset to load */
  presetName: string;
  /** Grid width in cells */
  gridWidth: number;
  /** Grid height in cells */
  gridHeight: number;
  /** Ticks to run before measuring (lets caches warm, JIT compile, etc.) */
  warmupTicks: number;
  /** Ticks to measure (timing data collected for these) */
  measureTicks: number;
  /** Whether to also measure render update cost via LatticeRenderer.update() */
  measureRender: boolean;
}

export const BENCHMARK_SUITE: BenchmarkConfig[] = [
  // Conway's GoL — TS path — scaling test
  { testName: 'conway-ts-128',  presetName: 'conways-gol', gridWidth: 128,  gridHeight: 128,  warmupTicks: 10, measureTicks: 100, measureRender: true },
  { testName: 'conway-ts-256',  presetName: 'conways-gol', gridWidth: 256,  gridHeight: 256,  warmupTicks: 10, measureTicks: 100, measureRender: true },
  { testName: 'conway-ts-512',  presetName: 'conways-gol', gridWidth: 512,  gridHeight: 512,  warmupTicks: 10, measureTicks: 50,  measureRender: true },
  { testName: 'conway-ts-1024', presetName: 'conways-gol', gridWidth: 1024, gridHeight: 512,  warmupTicks: 5,  measureTicks: 20,  measureRender: true },

  // Gray-Scott — TS path (WASM path requires async init, measured separately if needed)
  { testName: 'gray-scott-256', presetName: 'gray-scott', gridWidth: 256, gridHeight: 256, warmupTicks: 10, measureTicks: 50, measureRender: true },
  { testName: 'gray-scott-512', presetName: 'gray-scott', gridWidth: 512, gridHeight: 512, warmupTicks: 5,  measureTicks: 20, measureRender: true },

  // Render-only (sim paused, pure render cost — warmup=0 means no sim ticks, just render)
  { testName: 'render-only-512',  presetName: 'conways-gol', gridWidth: 512,  gridHeight: 512,  warmupTicks: 0, measureTicks: 100, measureRender: true },
  { testName: 'render-only-1024', presetName: 'conways-gol', gridWidth: 1024, gridHeight: 1024, warmupTicks: 0, measureTicks: 100, measureRender: true },
];
