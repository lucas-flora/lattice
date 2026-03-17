/**
 * Integration tests for ScriptPanel commands → engine → eventBus → store.
 *
 * Tests the full reactive pipeline: command execution through EventBus to store updates.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../engine/core/EventBus';
import { wireStores } from '../wireStores';
import { useScriptStore } from '../../store/scriptStore';
import { useExpressionStore } from '../../store/expressionStore';
import { ExpressionTagRegistry, _resetTagIdCounter } from '../../engine/expression/ExpressionTagRegistry';

describe('ScriptPanel Integration', () => {
  let bus: EventBus;
  let unsubscribe: () => void;

  beforeEach(() => {
    bus = new EventBus();
    unsubscribe = wireStores(bus);
    useScriptStore.setState({
      globalVariables: {},
      pyodideStatus: 'idle',
      pyodideProgress: 0,
    });
    useExpressionStore.setState({ tags: [] });
    _resetTagIdCounter();
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

  it('TestIntegration_AddTag_ExpressionStoreUpdates', () => {
    // Tags (expressions/scripts/links) now live in expressionStore
    bus.emit('tag:added', {
      id: 'tag_1',
      name: 'expr: alpha',
      source: 'code',
      phase: 'post-rule',
      enabled: true,
      owner: { type: 'cell-type' },
      inputs: [],
      outputs: ['cell.alpha'],
      code: 'age / 100',
    });

    const tags = useExpressionStore.getState().tags;
    expect(tags).toHaveLength(1);
    expect(tags[0].outputs).toContain('cell.alpha');
    expect(tags[0].code).toBe('age / 100');
  });

  it('TestIntegration_RemoveTag_ExpressionStoreUpdates', () => {
    bus.emit('tag:added', {
      id: 'tag_1',
      name: 'expr: alpha',
      source: 'code',
      phase: 'post-rule',
      enabled: true,
      owner: { type: 'cell-type' },
      inputs: [],
      outputs: ['cell.alpha'],
      code: 'age / 100',
    });
    expect(useExpressionStore.getState().tags).toHaveLength(1);

    bus.emit('tag:removed', { id: 'tag_1' });
    expect(useExpressionStore.getState().tags).toHaveLength(0);
  });

  it('TestIntegration_AddLinkTag_ExpressionStoreUpdates', () => {
    bus.emit('tag:added', {
      id: 'tag_1',
      name: 'cell.age → cell.alpha',
      source: 'code',
      phase: 'pre-rule',
      enabled: true,
      owner: { type: 'root' },
      inputs: ['cell.age'],
      outputs: ['cell.alpha'],
      code: 'rangeMap(cell_age, 0, 100, 0, 1, "linear")',
      linkMeta: {
        sourceAddress: 'cell.age',
        sourceRange: [0, 100] as [number, number],
        targetRange: [0, 1] as [number, number],
        easing: 'linear',
      },
    });

    const tags = useExpressionStore.getState().tags;
    expect(tags).toHaveLength(1);
    expect(tags[0].inputs).toContain('cell.age');
    expect(tags[0].outputs).toContain('cell.alpha');
    expect(tags[0].linkMeta).toBeDefined();
  });

  it('TestIntegration_UpdateTag_ExpressionStoreReflectsChanges', () => {
    bus.emit('tag:added', {
      id: 'tag_1',
      name: 'cell.age → cell.alpha',
      source: 'code',
      phase: 'pre-rule',
      enabled: true,
      owner: { type: 'root' },
      inputs: ['cell.age'],
      outputs: ['cell.alpha'],
      code: 'rangeMap(cell_age, 0, 100, 0, 1, "linear")',
      linkMeta: {
        sourceAddress: 'cell.age',
        sourceRange: [0, 100] as [number, number],
        targetRange: [0, 1] as [number, number],
        easing: 'linear',
      },
    });

    bus.emit('tag:updated', {
      id: 'tag_1',
      enabled: false,
    });

    const tag = useExpressionStore.getState().tags[0];
    expect(tag.enabled).toBe(false);
  });

  it('TestIntegration_ExpressionTagRegistry_Update', () => {
    const registry = new ExpressionTagRegistry();
    const tag = registry.add({
      name: 'cell.age → cell.alpha',
      owner: { type: 'root' },
      code: 'rangeMap(age, 0, 100, 0, 1, "linear")',
      phase: 'pre-rule',
      enabled: true,
      source: 'code',
      inputs: ['cell.age'],
      outputs: ['cell.alpha'],
      linkMeta: {
        sourceAddress: 'cell.age',
        sourceRange: [0, 1],
        targetRange: [0, 1],
        easing: 'linear',
      },
    });

    const updated = registry.update(tag.id, {
      linkMeta: {
        sourceAddress: 'cell.age',
        sourceRange: [0, 200],
        targetRange: [0, 1],
        easing: 'smoothstep',
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.linkMeta!.sourceRange).toEqual([0, 200]);
    expect(updated!.linkMeta!.easing).toBe('smoothstep');
    expect(updated!.linkMeta!.targetRange).toEqual([0, 1]); // unchanged
  });

  it('TestIntegration_ExpressionTagRegistry_UpdateNonexistent', () => {
    const registry = new ExpressionTagRegistry();
    const result = registry.update('nonexistent', { enabled: false });
    expect(result).toBeNull();
  });
});
