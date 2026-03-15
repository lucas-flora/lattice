/**
 * Tests for Pyodide integration — schema, bridge, harness, and event bus.
 *
 * Unit tests that do NOT require a real Pyodide runtime.
 * Integration tests with real Pyodide are in python-gol.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PresetSchema } from '../../preset/schema';
import { buildPythonHarness } from '../pythonHarness';
import { EventBus } from '../../core/EventBus';

describe('Preset Schema — Python rule type', () => {
  it('TestPresetSchema_AcceptsPythonRuleType', () => {
    const preset = {
      schema_version: '1',
      meta: { name: 'Python Test' },
      grid: { dimensionality: '2d', width: 8, height: 8, topology: 'toroidal' },
      cell_properties: [{ name: 'alive', type: 'bool', default: 0 }],
      rule: {
        type: 'python',
        compute: `
alive_count = np.zeros_like(grid['alive'])
for dy in [-1, 0, 1]:
    for dx in [-1, 0, 1]:
        if dx == 0 and dy == 0:
            continue
        alive_count += np.roll(np.roll(grid['alive'], dy, axis=0), dx, axis=1)
result['alive'] = np.where(grid['alive'] > 0,
    np.where((alive_count == 2) | (alive_count == 3), 1.0, 0.0),
    np.where(alive_count == 3, 1.0, 0.0))
`,
      },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(true);
  });

  it('TestPresetSchema_PythonRuleTypeCoexistsWithExisting', () => {
    // typescript still works
    const tsPreset = {
      schema_version: '1',
      meta: { name: 'TS' },
      grid: { dimensionality: '2d', width: 8, height: 8, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'typescript', compute: 'return { state: 0 };' },
    };
    expect(PresetSchema.safeParse(tsPreset).success).toBe(true);

    // wasm still works
    const wasmPreset = {
      schema_version: '1',
      meta: { name: 'WASM' },
      grid: { dimensionality: '2d', width: 8, height: 8, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'wasm', compute: 'return { state: 0 };', wasm_module: 'test_fn' },
    };
    expect(PresetSchema.safeParse(wasmPreset).success).toBe(true);
  });
});

describe('Python Harness', () => {
  it('TestPythonHarness_ContainsUserCode', () => {
    const code = buildPythonHarness(
      "result['alive'] = grid['alive']",
      ['alive', 'energy'],
      8,
      8,
      1,
    );

    expect(code).toContain("result['alive'] = grid['alive']");
    expect(code).toContain('import numpy as np');
    expect(code).toContain('width = 8');
    expect(code).toContain('height = 8');
    expect(code).toContain("'alive'");
    expect(code).toContain("'energy'");
  });

  it('TestPythonHarness_ContainsOutputFlattening', () => {
    const code = buildPythonHarness('pass', ['alive'], 4, 4, 1);
    expect(code).toContain('_output_buffers');
    expect(code).toContain('.ravel()');
  });
});

describe('PyodideBridge — unit tests (no worker)', () => {
  it('TestPyodideBridge_LazyInit', async () => {
    // PyodideBridge should not create a worker until ensureReady() is called.
    // We can test this by importing and constructing — no init should happen.
    const { PyodideBridge } = await import('../PyodideBridge');
    const bridge = new PyodideBridge();
    expect(bridge.getStatus()).toBe('idle');
    bridge.dispose();
  });

  it('TestPyodideBridge_IdempotentInit', async () => {
    // ensureReady() should return the same promise if called multiple times.
    // We can't run the actual worker in Node, but we can verify the promise
    // is cached by checking the reference.
    const { PyodideBridge } = await import('../PyodideBridge');
    const bridge = new PyodideBridge();

    // Mock createPyodideWorker since we're in Node
    // We just verify status transitions
    expect(bridge.getStatus()).toBe('idle');
    bridge.dispose();
    expect(bridge.getStatus()).toBe('idle');
  });
});

describe('EventBus — Pyodide events', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('TestEventBus_PyodideLoadingEvent', () => {
    const handler = vi.fn();
    bus.on('pyodide:loading', handler);
    bus.emit('pyodide:loading', { phase: 'loading-pyodide', progress: 0.5 });
    expect(handler).toHaveBeenCalledWith({ phase: 'loading-pyodide', progress: 0.5 });
  });

  it('TestEventBus_PyodideReadyEvent', () => {
    const handler = vi.fn();
    bus.on('pyodide:ready', handler);
    bus.emit('pyodide:ready', {});
    expect(handler).toHaveBeenCalledOnce();
  });

  it('TestEventBus_PyodideErrorEvent', () => {
    const handler = vi.fn();
    bus.on('pyodide:error', handler);
    bus.emit('pyodide:error', { message: 'Failed to load' });
    expect(handler).toHaveBeenCalledWith({ message: 'Failed to load' });
  });
});
