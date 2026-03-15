/**
 * Scenario tests for Phase 5 scripting workflows.
 *
 * Tests complete user workflows: loading presets with scripting features,
 * managing variables/expressions/scripts via commands, and verifying
 * store sync through wireStores.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eventBus } from '../../src/engine/core/EventBus';
import { CommandRegistry } from '../../src/commands/CommandRegistry';
import { SimulationController } from '../../src/commands/SimulationController';
import { registerAllCommands } from '../../src/commands/definitions';
import { wireStores } from '../../src/commands/wireStores';
import { useScriptStore } from '../../src/store/scriptStore';
import { useLayoutStore } from '../../src/store/layoutStore';

describe('Scripting Workflow Scenarios', () => {
  let registry: CommandRegistry;
  let controller: SimulationController;
  let unwire: () => void;

  beforeEach(() => {
    eventBus.clear();
    registry = new CommandRegistry();
    controller = new SimulationController(eventBus, 10000);
    registerAllCommands(registry, controller, eventBus);
    unwire = wireStores(eventBus);

    useScriptStore.setState({
      globalVariables: {},
      globalScripts: [],
      expressions: {},
      pyodideStatus: 'idle',
      pyodideProgress: 0,
    });
    useLayoutStore.setState({ isScriptPanelOpen: false });
  });

  afterEach(() => {
    unwire();
    controller.dispose();
    registry.clear();
    eventBus.clear();
  });

  it('TestScenario_CommandDrivenScripting_Variables', async () => {
    // Load preset
    await registry.execute('preset.load', { name: 'conways-gol' });

    // Set variables via commands
    await registry.execute('var.set', { name: 'entropy', value: 0 });
    await registry.execute('var.set', { name: 'density', value: 0.5 });

    // Verify via store (wireStores propagation)
    const state = useScriptStore.getState();
    expect(state.globalVariables['entropy']).toBeDefined();
    expect(state.globalVariables['entropy'].value).toBe(0);
    expect(state.globalVariables['density'].value).toBe(0.5);

    // List variables
    const listResult = await registry.execute('var.list', {});
    expect(listResult.success).toBe(true);
    expect(Object.keys(listResult.data.variables).length).toBe(2);

    // Delete variable
    await registry.execute('var.delete', { name: 'entropy' });
    const afterDelete = await registry.execute('var.list', {});
    expect(Object.keys(afterDelete.data.variables).length).toBe(1);
  });

  it('TestScenario_ScriptPanelToggle', async () => {
    expect(useLayoutStore.getState().isScriptPanelOpen).toBe(false);

    await registry.execute('ui.toggleScriptPanel', {});
    expect(useLayoutStore.getState().isScriptPanelOpen).toBe(true);

    await registry.execute('ui.toggleScriptPanel', {});
    expect(useLayoutStore.getState().isScriptPanelOpen).toBe(false);
  });

  it('TestScenario_SyncTickPreserved', async () => {
    // Load TS preset — no async features
    await registry.execute('preset.load', { name: 'conways-gol' });
    expect(controller.needsAsyncTick()).toBe(false);

    // Step should work synchronously
    await registry.execute('sim.step', {});
    expect(controller.getGeneration()).toBe(1);

    // Multiple steps
    await registry.execute('sim.step', {});
    await registry.execute('sim.step', {});
    expect(controller.getGeneration()).toBe(3);
  });

  it('TestScenario_VariableStore_PersistsAcrossOperations', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });

    // Set, step, verify variable still exists
    await registry.execute('var.set', { name: 'counter', value: 0 });
    await registry.execute('sim.step', {});

    const result = await registry.execute('var.get', { name: 'counter' });
    expect(result.success).toBe(true);
    expect(result.data.value).toBe(0);
  });

  it('TestScenario_PyodideStatusPropagation', async () => {
    // Simulate Pyodide events flowing through wireStores to scriptStore
    expect(useScriptStore.getState().pyodideStatus).toBe('idle');

    eventBus.emit('pyodide:loading', { phase: 'loading-pyodide', progress: 0.3 });
    expect(useScriptStore.getState().pyodideStatus).toBe('loading');
    expect(useScriptStore.getState().pyodideProgress).toBe(0.3);

    eventBus.emit('pyodide:ready', {});
    expect(useScriptStore.getState().pyodideStatus).toBe('ready');
    expect(useScriptStore.getState().pyodideProgress).toBe(1);
  });

  it('TestScenario_ExpressionEventPropagation', async () => {
    // Simulate expression events
    eventBus.emit('script:expressionSet', { property: 'alpha', expression: '0.5' });
    expect(useScriptStore.getState().expressions['alpha']).toBe('0.5');

    eventBus.emit('script:expressionCleared', { property: 'alpha' });
    expect(useScriptStore.getState().expressions['alpha']).toBeUndefined();
  });

  it('TestScenario_ScriptEventPropagation', async () => {
    // Simulate script toggle event
    // First add a script to the store directly for toggle testing
    useScriptStore.setState({
      globalScripts: [{ name: 's1', enabled: true, code: 'pass' }],
    });

    eventBus.emit('script:scriptToggled', { name: 's1', enabled: false });
    expect(useScriptStore.getState().globalScripts[0].enabled).toBe(false);

    eventBus.emit('script:scriptRemoved', { name: 's1' });
    expect(useScriptStore.getState().globalScripts.length).toBe(0);
  });
});
