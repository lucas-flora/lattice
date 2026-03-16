/**
 * Integration tests for ScriptPanel commands → engine → eventBus → store.
 *
 * Tests the full reactive pipeline: command execution through EventBus to store updates.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../engine/core/EventBus';
import { wireStores } from '../wireStores';
import { useScriptStore } from '../../store/scriptStore';
import { useLinkStore } from '../../store/linkStore';
import { LinkRegistry, _resetIdCounter } from '../../engine/linking/LinkRegistry';

describe('ScriptPanel Integration', () => {
  let bus: EventBus;
  let unsubscribe: () => void;

  beforeEach(() => {
    bus = new EventBus();
    unsubscribe = wireStores(bus);
    useScriptStore.setState({
      globalVariables: {},
      globalScripts: [],
      expressions: {},
      pyodideStatus: 'idle',
      pyodideProgress: 0,
    });
    useLinkStore.setState({ links: [] });
    _resetIdCounter();
  });

  afterEach(() => {
    unsubscribe();
    bus.clear();
  });

  it('TestIntegration_AddVariable_StoreUpdates', () => {
    bus.emit('script:variableChanged', { name: 'speed', value: 2.5 });

    const vars = useScriptStore.getState().globalVariables;
    expect(vars['speed']).toEqual({ value: 2.5, type: 'float' });
  });

  it('TestIntegration_DeleteVariable_StoreRemovesEntry', () => {
    // First add the variable
    bus.emit('script:variableChanged', { name: 'toRemove', value: 10 });
    expect(useScriptStore.getState().globalVariables['toRemove']).toBeDefined();

    // Delete it
    bus.emit('script:variableDeleted', { name: 'toRemove' });
    expect(useScriptStore.getState().globalVariables['toRemove']).toBeUndefined();
  });

  it('TestIntegration_DeleteVariable_DoesNotSetToZero', () => {
    // Regression: old bug set value to 0 instead of removing
    bus.emit('script:variableChanged', { name: 'counter', value: 42 });
    bus.emit('script:variableDeleted', { name: 'counter' });

    const vars = useScriptStore.getState().globalVariables;
    expect(vars['counter']).toBeUndefined();
    // Should NOT be { value: 0, ... }
  });

  it('TestIntegration_AddExpression_StoreUpdates', () => {
    bus.emit('script:expressionSet', { property: 'alpha', expression: 'age / 100' });

    const state = useScriptStore.getState();
    expect(state.expressions['alpha']).toBe('age / 100');
  });

  it('TestIntegration_ClearExpression_StoreUpdates', () => {
    bus.emit('script:expressionSet', { property: 'alpha', expression: 'x' });
    bus.emit('script:expressionCleared', { property: 'alpha' });

    expect(useScriptStore.getState().expressions['alpha']).toBeUndefined();
  });

  it('TestIntegration_AddScript_StoreUpdates', () => {
    bus.emit('script:scriptAdded', {
      name: 'decay',
      enabled: true,
      code: 'grid["alpha"] *= 0.99',
      inputs: ['alpha'],
      outputs: ['alpha'],
    });

    const scripts = useScriptStore.getState().globalScripts;
    expect(scripts).toHaveLength(1);
    expect(scripts[0].name).toBe('decay');
  });

  it('TestIntegration_ToggleScript_StoreUpdates', () => {
    bus.emit('script:scriptAdded', { name: 'test', enabled: true, code: 'pass' });
    bus.emit('script:scriptToggled', { name: 'test', enabled: false });

    expect(useScriptStore.getState().globalScripts[0].enabled).toBe(false);
  });

  it('TestIntegration_RemoveScript_StoreUpdates', () => {
    bus.emit('script:scriptAdded', { name: 'test', enabled: true, code: 'pass' });
    bus.emit('script:scriptRemoved', { name: 'test' });

    expect(useScriptStore.getState().globalScripts).toHaveLength(0);
  });

  it('TestIntegration_AddLink_StoreUpdates', () => {
    bus.emit('link:added', {
      id: 'link_1',
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100] as [number, number],
      targetRange: [0, 1] as [number, number],
      easing: 'linear',
      enabled: true,
    });

    const links = useLinkStore.getState().links;
    expect(links).toHaveLength(1);
    expect(links[0].source).toBe('cell.age');
  });

  it('TestIntegration_EditLink_StoreReflectsChanges', () => {
    bus.emit('link:added', {
      id: 'link_1',
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100] as [number, number],
      targetRange: [0, 1] as [number, number],
      easing: 'linear',
      enabled: true,
    });

    bus.emit('link:updated', {
      id: 'link_1',
      sourceRange: [0, 200] as [number, number],
      easing: 'smoothstep',
    });

    const link = useLinkStore.getState().links[0];
    expect(link.sourceRange).toEqual([0, 200]);
    expect(link.easing).toBe('smoothstep');
    // targetRange should remain unchanged
    expect(link.targetRange).toEqual([0, 1]);
  });

  it('TestIntegration_LinkRegistry_Update', () => {
    const registry = new LinkRegistry();
    const link = registry.add({
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 1],
      targetRange: [0, 1],
      easing: 'linear',
    });

    const updated = registry.update(link.id, {
      sourceRange: [0, 200],
      easing: 'smoothstep',
    });

    expect(updated).not.toBeNull();
    expect(updated!.sourceRange).toEqual([0, 200]);
    expect(updated!.easing).toBe('smoothstep');
    expect(updated!.targetRange).toEqual([0, 1]); // unchanged
  });

  it('TestIntegration_LinkRegistry_UpdateNonexistent', () => {
    const registry = new LinkRegistry();
    const result = registry.update('nonexistent', { easing: 'smoothstep' });
    expect(result).toBeNull();
  });
});
