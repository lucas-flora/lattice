/**
 * Standard benchmark suite for GPU performance tracking.
 *
 * Each config defines a test scenario: which preset to load, grid dimensions,
 * and how many ticks to warm up / measure. All tests run on GPU via the
 * generic transpiler pipeline.
 */

export interface BenchmarkConfig {
  /** Unique test identifier, e.g. 'conway-512' */
  testName: string;
  /** Which built-in preset to load */
  presetName: string;
  /** Grid width in cells */
  gridWidth: number;
  /** Grid height in cells */
  gridHeight: number;
  /** Ticks to run before measuring (lets caches warm, shader compile, etc.) */
  warmupTicks: number;
  /** Ticks to measure (timing data collected for these) */
  measureTicks: number;
  /** Whether to also measure render update cost (reserved for future use) */
  measureRender: boolean;
}

export const BENCHMARK_SUITE: BenchmarkConfig[] = [
  // Conway's GoL — scaling test
  { testName: 'conway-128',  presetName: 'conways-gol', gridWidth: 128,  gridHeight: 128,  warmupTicks: 10, measureTicks: 100, measureRender: false },
  { testName: 'conway-256',  presetName: 'conways-gol', gridWidth: 256,  gridHeight: 256,  warmupTicks: 10, measureTicks: 100, measureRender: false },
  { testName: 'conway-512',  presetName: 'conways-gol', gridWidth: 512,  gridHeight: 512,  warmupTicks: 10, measureTicks: 50,  measureRender: false },
  { testName: 'conway-1024', presetName: 'conways-gol', gridWidth: 1024, gridHeight: 512,  warmupTicks: 5,  measureTicks: 20,  measureRender: false },

  // Gray-Scott — reaction-diffusion
  { testName: 'gray-scott-256', presetName: 'gray-scott', gridWidth: 256, gridHeight: 256, warmupTicks: 10, measureTicks: 50, measureRender: false },
  { testName: 'gray-scott-512', presetName: 'gray-scott', gridWidth: 512, gridHeight: 512, warmupTicks: 5,  measureTicks: 20, measureRender: false },

  // Navier-Stokes — fluid dynamics
  { testName: 'navier-stokes-128', presetName: 'navier-stokes', gridWidth: 128, gridHeight: 128, warmupTicks: 10, measureTicks: 50, measureRender: false },

  // Brian's Brain — 3-state automaton
  { testName: 'brians-brain-256', presetName: 'brians-brain', gridWidth: 256, gridHeight: 256, warmupTicks: 10, measureTicks: 50, measureRender: false },
];
