/**
 * Scenario tests for ScriptPanel: full user workflows across all scripting subsystems.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../../engine/core/EventBus';
import { wireStores } from '../../../commands/wireStores';
import { useScriptStore } from '../../../store/scriptStore';
import { useExpressionStore } from '../../../store/expressionStore';
import { _resetTagIdCounter } from '../../../engine/expression/ExpressionTagRegistry';

describe('ScriptPanel Scenarios', () => {
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

  it('TestScenario_FullScriptingWorkflow', () => {
    // 1. Add a variable
    bus.emit('script:variableChanged', { name: 'threshold', value: 0.5 });
    expect(useScriptStore.getState().globalVariables['threshold']).toBeDefined();

    // 2. Add an expression tag (post-rule code tag)
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
    const exprTags = useExpressionStore.getState().tags.filter(t => t.phase === 'post-rule' && t.source === 'code');
    expect(exprTags).toHaveLength(1);

    // 3. Add a script tag
    bus.emit('tag:added', {
      id: 'tag_2',
      name: 'decay',
      source: 'script',
      phase: 'post-rule',
      enabled: true,
      owner: { type: 'root' },
      inputs: ['cell.alpha'],
      outputs: ['cell.alpha'],
      code: 'grid["alpha"] *= 0.99',
    });
    const scriptTags = useExpressionStore.getState().tags.filter(t => t.source === 'script');
    expect(scriptTags).toHaveLength(1);
    expect(scriptTags[0].name).toBe('decay');

    // 4. Add a link tag
    bus.emit('tag:added', {
      id: 'tag_3',
      name: 'cell.age → cell.alpha',
      source: 'code',
      phase: 'pre-rule',
      enabled: true,
      owner: { type: 'root' },
      inputs: ['cell.age'],
      outputs: ['cell.alpha'],
      code: 'rangeMap(age, 0, 100, 0, 1, "linear")',
      linkMeta: {
        sourceAddress: 'cell.age',
        sourceRange: [0, 100] as [number, number],
        targetRange: [0, 1] as [number, number],
        easing: 'linear',
      },
    });
    const linkTags = useExpressionStore.getState().tags.filter(t => t.linkMeta !== undefined);
    expect(linkTags).toHaveLength(1);

    // All subsystems populated
    const scriptState = useScriptStore.getState();
    const allTags = useExpressionStore.getState().tags;
    expect(Object.keys(scriptState.globalVariables)).toHaveLength(1);
    expect(allTags).toHaveLength(3);
  });

  it('TestScenario_EditAndDeleteCycle', () => {
    // Add items across all sections
    bus.emit('script:variableChanged', { name: 'speed', value: 1.0 });
    bus.emit('tag:added', {
      id: 'tag_expr',
      name: 'expr: alpha',
      source: 'code',
      phase: 'post-rule',
      enabled: true,
      owner: { type: 'cell-type' },
      inputs: [],
      outputs: ['cell.alpha'],
      code: 'x',
    });
    bus.emit('tag:added', {
      id: 'tag_script',
      name: 'myscript',
      source: 'script',
      phase: 'post-rule',
      enabled: true,
      owner: { type: 'root' },
      inputs: [],
      outputs: [],
      code: 'pass',
    });
    bus.emit('tag:added', {
      id: 'tag_link',
      name: 'cell.age → cell.alpha',
      source: 'code',
      phase: 'pre-rule',
      enabled: true,
      owner: { type: 'root' },
      inputs: ['cell.age'],
      outputs: ['cell.alpha'],
      code: 'rangeMap(age, 0, 1, 0, 1, "linear")',
      linkMeta: {
        sourceAddress: 'cell.age',
        sourceRange: [0, 1] as [number, number],
        targetRange: [0, 1] as [number, number],
        easing: 'linear',
      },
    });

    // Edit variable
    bus.emit('script:variableChanged', { name: 'speed', value: 2.0 });
    expect(useScriptStore.getState().globalVariables['speed'].value).toBe(2.0);

    // Edit expression tag code
    bus.emit('tag:updated', { id: 'tag_expr', code: 'y * 2' });
    expect(useExpressionStore.getState().tags.find(t => t.id === 'tag_expr')?.code).toBe('y * 2');

    // Disable link tag
    bus.emit('tag:updated', { id: 'tag_link', enabled: false });
    expect(useExpressionStore.getState().tags.find(t => t.id === 'tag_link')?.enabled).toBe(false);

    // Toggle script off
    bus.emit('tag:updated', { id: 'tag_script', enabled: false });
    expect(useExpressionStore.getState().tags.find(t => t.id === 'tag_script')?.enabled).toBe(false);

    // Delete all items
    bus.emit('script:variableDeleted', { name: 'speed' });
    bus.emit('tag:removed', { id: 'tag_expr' });
    bus.emit('tag:removed', { id: 'tag_script' });
    bus.emit('tag:removed', { id: 'tag_link' });

    // Everything should be empty
    const scriptState = useScriptStore.getState();
    const allTags = useExpressionStore.getState().tags;
    expect(Object.keys(scriptState.globalVariables)).toHaveLength(0);
    expect(allTags).toHaveLength(0);
  });

  it('TestScenario_MultipleVariables_IndependentLifecycles', () => {
    bus.emit('script:variableChanged', { name: 'a', value: 1 });
    bus.emit('script:variableChanged', { name: 'b', value: 2 });
    bus.emit('script:variableChanged', { name: 'c', value: 3 });

    // Delete middle one
    bus.emit('script:variableDeleted', { name: 'b' });

    const vars = useScriptStore.getState().globalVariables;
    expect(vars['a']).toBeDefined();
    expect(vars['b']).toBeUndefined();
    expect(vars['c']).toBeDefined();
  });

  it('TestScenario_LinkTagEditPreservesUnchangedFields', () => {
    bus.emit('tag:added', {
      id: 'tag_link',
      name: 'env.feedRate → global.mappedFeed',
      source: 'code',
      phase: 'pre-rule',
      enabled: true,
      owner: { type: 'root' },
      inputs: ['env.feedRate'],
      outputs: ['global.mappedFeed'],
      code: 'rangeMap(feedRate, 0.01, 0.1, 0, 1, "smoothstep")',
      linkMeta: {
        sourceAddress: 'env.feedRate',
        sourceRange: [0.01, 0.1] as [number, number],
        targetRange: [0, 1] as [number, number],
        easing: 'smoothstep',
      },
    });

    // Edit only the enabled flag
    bus.emit('tag:updated', { id: 'tag_link', enabled: false });

    const tag = useExpressionStore.getState().tags[0];
    expect(tag.inputs).toContain('env.feedRate');
    expect(tag.outputs).toContain('global.mappedFeed');
    expect(tag.linkMeta!.sourceRange).toEqual([0.01, 0.1]);
    expect(tag.linkMeta!.targetRange).toEqual([0, 1]);
    expect(tag.linkMeta!.easing).toBe('smoothstep');
    expect(tag.enabled).toBe(false);
  });
});
