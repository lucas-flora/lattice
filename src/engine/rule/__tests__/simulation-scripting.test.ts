/**
 * Tests for Simulation scripting integration: needsAsyncTick, variable store.
 */

import { describe, it, expect } from 'vitest';
import { Simulation } from '../Simulation';
import { loadBuiltinPreset } from '../../preset/builtinPresets';

describe('Simulation — scripting integration', () => {
  it('TestSimulation_NeedsAsyncTick_FalseForTSPreset', () => {
    const config = loadBuiltinPreset('conways-gol');
    const sim = new Simulation(config);
    expect(sim.needsAsyncTick()).toBe(false);
  });

  it('TestSimulation_VariableStore_ExistsOnConstruction', () => {
    const config = loadBuiltinPreset('conways-gol');
    const sim = new Simulation(config);
    expect(sim.variableStore).toBeDefined();
    expect(sim.variableStore.has('anything')).toBe(false);
  });

  it('TestSimulation_VariableStore_SetGetRoundtrip', () => {
    const config = loadBuiltinPreset('conways-gol');
    const sim = new Simulation(config);
    sim.variableStore.set('testVar', 3.14);
    expect(sim.variableStore.get('testVar')).toBe(3.14);
  });

  it('TestSimulation_PyodideBridge_NullWithoutBridge', () => {
    const config = loadBuiltinPreset('conways-gol');
    const sim = new Simulation(config);
    expect(sim.pyodideBridge).toBeNull();
  });

  it('TestSimulation_TagRegistry_ExistsOnConstruction', () => {
    const config = loadBuiltinPreset('conways-gol');
    const sim = new Simulation(config);
    expect(sim.tagRegistry).toBeDefined();
  });

  it('TestSimulation_SyncTickUnaffectedWithoutScripts', () => {
    const config = loadBuiltinPreset('conways-gol');
    const sim = new Simulation(config);
    // Should not throw — sync path preserved
    const result = sim.tick();
    expect(result.generation).toBe(1);
  });

  it('TestSimulation_VariableStore_LoadsFromPreset', () => {
    const config = loadBuiltinPreset('conways-gol');
    // Manually add global_variables to the config
    const configWithVars = {
      ...config,
      global_variables: [
        { name: 'rate', type: 'float' as const, default: 0.5 },
      ],
    };
    const sim = new Simulation(configWithVars);
    expect(sim.variableStore.get('rate')).toBe(0.5);
  });
});
