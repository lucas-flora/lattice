/**
 * Scenario tests for Python Game of Life via Pyodide.
 *
 * These tests load real Pyodide + numpy and run a Python GoL rule
 * through the full engine pipeline. They verify end-to-end correctness
 * of the grid transfer, harness, and PythonRuleRunner.
 *
 * Timeout: 60s (Pyodide first load can be slow in CI).
 *
 * To run only these tests: pnpm vitest run src/engine/scripting/__tests__/python-gol.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadPyodide, type PyodideInterface } from 'pyodide';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Grid } from '../../grid/Grid';
import { buildPythonHarness } from '../pythonHarness';
import { extractGridBuffers, applyResultBuffers } from '../gridTransfer';

// Resolve Pyodide's asset directory for Node.js testing
const require_ = createRequire(import.meta.url);
const pyodideDir = path.dirname(require_.resolve('pyodide/pyodide.mjs'));
const PYODIDE_INDEX_URL = pyodideDir + '/';

// Real Pyodide instance shared across tests
let pyodide: PyodideInterface;

const PYTHON_GOL_CODE = `
alive_count = np.zeros_like(grid['alive'])
for dy in [-1, 0, 1]:
    for dx in [-1, 0, 1]:
        if dx == 0 and dy == 0:
            continue
        alive_count += np.roll(np.roll(grid['alive'], dy, axis=0), dx, axis=1)
result['alive'] = np.where(grid['alive'] > 0,
    np.where((alive_count == 2) | (alive_count == 3), 1.0, 0.0),
    np.where(alive_count == 3, 1.0, 0.0))
`;

/**
 * Run a Python rule on a grid using the real Pyodide runtime.
 * This simulates what the worker does, but in-process for testing.
 */
async function runPythonRule(
  py: PyodideInterface,
  grid: Grid,
  code: string,
): Promise<void> {
  const { width, height, depth } = grid.config;
  const buffers = extractGridBuffers(grid);
  const propertyNames = Object.keys(buffers);
  const harness = buildPythonHarness(code, propertyNames, width, height, depth);

  // Inject input buffers
  const inputBuffers = py.toPy(
    Object.fromEntries(
      Object.entries(buffers).map(([k, v]) => [k, Array.from(v)]),
    ),
  );
  py.globals.set('_input_buffers', inputBuffers);
  py.globals.set('_input_params', py.toPy({}));

  await py.runPythonAsync(harness);

  // Extract output
  const outputProxy = py.globals.get('_output_buffers');
  const resultBuffers: Record<string, Float32Array> = {};
  for (const name of propertyNames) {
    if (outputProxy.has(name)) {
      const pyArray = outputProxy.get(name);
      const jsArray = pyArray.toJs();
      resultBuffers[name] = new Float32Array(jsArray);
      pyArray.destroy();
    }
  }
  outputProxy.destroy();
  inputBuffers.destroy();
  py.globals.delete('_input_buffers');
  py.globals.delete('_input_params');
  py.globals.delete('_output_buffers');

  applyResultBuffers(grid, resultBuffers);
  grid.swap();
}

beforeAll(async () => {
  pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
  await pyodide.loadPackage('numpy');
}, 60_000);

afterAll(() => {
  // @ts-expect-error cleanup
  pyodide = null;
});

describe('Python GoL — real Pyodide', () => {
  it('TestPyodide_LoadsAndRunsSimplePython', async () => {
    const result = await pyodide.runPythonAsync('1 + 1');
    expect(result).toBe(2);
  }, 30_000);

  it('TestPyodide_NumpyArrayRoundTrip', async () => {
    // Float32Array → numpy → Float32Array preserves values
    const input = new Float32Array([1.0, 2.5, 3.7, 0.0]);
    const pyInput = pyodide.toPy({ data: Array.from(input) });
    pyodide.globals.set('_test_input', pyInput);

    await pyodide.runPythonAsync(`
import numpy as np
arr = np.array(_test_input['data'], dtype=np.float32)
_test_output = arr.tolist()
`);

    const output = pyodide.globals.get('_test_output').toJs();
    pyInput.destroy();

    expect(output.length).toBe(4);
    expect(output[0]).toBeCloseTo(1.0);
    expect(output[1]).toBeCloseTo(2.5);
    expect(output[2]).toBeCloseTo(3.7);
    expect(output[3]).toBeCloseTo(0.0);
  }, 30_000);

  it('TestPyodide_HandlesImportError', async () => {
    // Bad code returns error, not crash
    await expect(
      pyodide.runPythonAsync('import nonexistent_module_xyz'),
    ).rejects.toThrow();

    // Pyodide should still work after the error
    const result = await pyodide.runPythonAsync('2 + 2');
    expect(result).toBe(4);
  }, 30_000);

  it('TestPythonGoL_BlinkerOscillates', async () => {
    // Blinker: horizontal line of 3 should become vertical, then back
    const grid = new Grid({
      dimensionality: '2d',
      width: 8,
      height: 8,
      depth: 1,
      topology: 'toroidal',
    });
    grid.addProperty('alive', 1, 0);

    // Set up horizontal blinker at row 4, cols 3-5
    const w = 8;
    const buf = grid.getCurrentBuffer('alive');
    buf[3 + 4 * w] = 1; // (3,4)
    buf[4 + 4 * w] = 1; // (4,4)
    buf[5 + 4 * w] = 1; // (5,4)

    // Tick 1: horizontal → vertical
    await runPythonRule(pyodide, grid, PYTHON_GOL_CODE);

    const afterTick1 = grid.getCurrentBuffer('alive');
    // Center should stay alive
    expect(afterTick1[4 + 4 * w]).toBe(1); // (4,4) center
    // Vertical neighbors should be alive
    expect(afterTick1[4 + 3 * w]).toBe(1); // (4,3) above
    expect(afterTick1[4 + 5 * w]).toBe(1); // (4,5) below
    // Horizontal ends should be dead
    expect(afterTick1[3 + 4 * w]).toBe(0); // (3,4)
    expect(afterTick1[5 + 4 * w]).toBe(0); // (5,4)

    // Tick 2: vertical → horizontal (back to original)
    await runPythonRule(pyodide, grid, PYTHON_GOL_CODE);

    const afterTick2 = grid.getCurrentBuffer('alive');
    expect(afterTick2[3 + 4 * w]).toBe(1); // (3,4)
    expect(afterTick2[4 + 4 * w]).toBe(1); // (4,4)
    expect(afterTick2[5 + 4 * w]).toBe(1); // (5,4)
    expect(afterTick2[4 + 3 * w]).toBe(0); // (4,3)
    expect(afterTick2[4 + 5 * w]).toBe(0); // (4,5)
  }, 30_000);

  it('TestPythonGoL_StillLifeStable', async () => {
    // 2x2 block is a still life — should remain unchanged
    const grid = new Grid({
      dimensionality: '2d',
      width: 8,
      height: 8,
      depth: 1,
      topology: 'toroidal',
    });
    grid.addProperty('alive', 1, 0);

    const w = 8;
    const buf = grid.getCurrentBuffer('alive');
    buf[3 + 3 * w] = 1; // (3,3)
    buf[4 + 3 * w] = 1; // (4,3)
    buf[3 + 4 * w] = 1; // (3,4)
    buf[4 + 4 * w] = 1; // (4,4)

    await runPythonRule(pyodide, grid, PYTHON_GOL_CODE);

    const after = grid.getCurrentBuffer('alive');
    expect(after[3 + 3 * w]).toBe(1);
    expect(after[4 + 3 * w]).toBe(1);
    expect(after[3 + 4 * w]).toBe(1);
    expect(after[4 + 4 * w]).toBe(1);

    // Count total alive — should be exactly 4
    let count = 0;
    for (let i = 0; i < after.length; i++) {
      if (after[i] > 0) count++;
    }
    expect(count).toBe(4);
  }, 30_000);

  it('TestPythonRule_CoexistsWithTypeScriptPresets', async () => {
    // Verify that after running Python rules, we can still create and run
    // a TypeScript-based Simulation without interference.
    const { Simulation } = await import('../../rule/Simulation');
    const { loadPresetOrThrow } = await import('../../preset/loader');

    const tsPresetYaml = `
schema_version: "1"
meta:
  name: "TS After Python"
grid:
  dimensionality: "2d"
  width: 8
  height: 8
  topology: "toroidal"
cell_properties:
  - name: "alive"
    type: "bool"
    default: 0
    role: "input_output"
rule:
  type: "typescript"
  compute: |
    const liveNeighbors = ctx.neighbors.filter(n => n.alive === 1).length;
    const alive = ctx.cell.alive;
    let newAlive;
    if (alive === 1) {
      newAlive = (liveNeighbors === 2 || liveNeighbors === 3) ? 1 : 0;
    } else {
      newAlive = liveNeighbors === 3 ? 1 : 0;
    }
    return { alive: newAlive };
`;

    const preset = loadPresetOrThrow(tsPresetYaml);
    const sim = new Simulation(preset);
    sim.setCellDirect('alive', 3 + 4 * 8, 1);
    sim.setCellDirect('alive', 4 + 4 * 8, 1);
    sim.setCellDirect('alive', 5 + 4 * 8, 1);
    sim.tick();
    expect(sim.getGeneration()).toBe(1);

    // Blinker check
    expect(sim.getCellDirect('alive', 4 + 4 * 8)).toBe(1);
    expect(sim.getCellDirect('alive', 4 + 3 * 8)).toBe(1);
    expect(sim.getCellDirect('alive', 4 + 5 * 8)).toBe(1);
  }, 30_000);
});
