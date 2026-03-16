/**
 * Scenario tests for ScriptPanel: full user workflows across all 4 scripting subsystems.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../../engine/core/EventBus';
import { wireStores } from '../../../commands/wireStores';
import { useScriptStore } from '../../../store/scriptStore';
import { useLinkStore } from '../../../store/linkStore';
import { _resetIdCounter } from '../../../engine/linking/LinkRegistry';

describe('ScriptPanel Scenarios', () => {
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

  it('TestScenario_FullScriptingWorkflow', () => {
    // 1. Add a variable
    bus.emit('script:variableChanged', { name: 'threshold', value: 0.5 });
    expect(useScriptStore.getState().globalVariables['threshold']).toBeDefined();

    // 2. Add an expression
    bus.emit('script:expressionSet', { property: 'alpha', expression: 'age / 100' });
    expect(useScriptStore.getState().expressions['alpha']).toBe('age / 100');

    // 3. Add a script
    bus.emit('script:scriptAdded', {
      name: 'decay',
      enabled: true,
      code: 'grid["alpha"] *= 0.99',
      inputs: ['alpha'],
      outputs: ['alpha'],
    });
    expect(useScriptStore.getState().globalScripts).toHaveLength(1);

    // 4. Add a link
    bus.emit('link:added', {
      id: 'link_1',
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100] as [number, number],
      targetRange: [0, 1] as [number, number],
      easing: 'linear',
      enabled: true,
    });
    expect(useLinkStore.getState().links).toHaveLength(1);

    // All four subsystems populated
    const scriptState = useScriptStore.getState();
    const linkState = useLinkStore.getState();
    expect(Object.keys(scriptState.globalVariables)).toHaveLength(1);
    expect(Object.keys(scriptState.expressions)).toHaveLength(1);
    expect(scriptState.globalScripts).toHaveLength(1);
    expect(linkState.links).toHaveLength(1);
  });

  it('TestScenario_EditAndDeleteCycle', () => {
    // Add items across all sections
    bus.emit('script:variableChanged', { name: 'speed', value: 1.0 });
    bus.emit('script:expressionSet', { property: 'alpha', expression: 'x' });
    bus.emit('script:scriptAdded', { name: 'myscript', enabled: true, code: 'pass' });
    bus.emit('link:added', {
      id: 'link_1',
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 1] as [number, number],
      targetRange: [0, 1] as [number, number],
      easing: 'linear',
      enabled: true,
    });

    // Edit variable
    bus.emit('script:variableChanged', { name: 'speed', value: 2.0 });
    expect(useScriptStore.getState().globalVariables['speed'].value).toBe(2.0);

    // Edit expression
    bus.emit('script:expressionSet', { property: 'alpha', expression: 'y * 2' });
    expect(useScriptStore.getState().expressions['alpha']).toBe('y * 2');

    // Edit link range
    bus.emit('link:updated', {
      id: 'link_1',
      sourceRange: [0, 200] as [number, number],
      easing: 'easeIn',
    });
    expect(useLinkStore.getState().links[0].sourceRange).toEqual([0, 200]);

    // Toggle script off
    bus.emit('script:scriptToggled', { name: 'myscript', enabled: false });
    expect(useScriptStore.getState().globalScripts[0].enabled).toBe(false);

    // Delete all items
    bus.emit('script:variableDeleted', { name: 'speed' });
    bus.emit('script:expressionCleared', { property: 'alpha' });
    bus.emit('script:scriptRemoved', { name: 'myscript' });
    bus.emit('link:removed', { id: 'link_1' });

    // Everything should be empty
    const scriptState = useScriptStore.getState();
    const linkState = useLinkStore.getState();
    expect(Object.keys(scriptState.globalVariables)).toHaveLength(0);
    expect(Object.keys(scriptState.expressions)).toHaveLength(0);
    expect(scriptState.globalScripts).toHaveLength(0);
    expect(linkState.links).toHaveLength(0);
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

  it('TestScenario_LinkEditPreservesUnchangedFields', () => {
    bus.emit('link:added', {
      id: 'link_1',
      source: 'env.feedRate',
      target: 'global.mappedFeed',
      sourceRange: [0.01, 0.1] as [number, number],
      targetRange: [0, 1] as [number, number],
      easing: 'smoothstep',
      enabled: true,
    });

    // Edit only the easing
    bus.emit('link:updated', { id: 'link_1', easing: 'easeOut' });

    const link = useLinkStore.getState().links[0];
    expect(link.source).toBe('env.feedRate');
    expect(link.target).toBe('global.mappedFeed');
    expect(link.sourceRange).toEqual([0.01, 0.1]);
    expect(link.targetRange).toEqual([0, 1]);
    expect(link.easing).toBe('easeOut');
    expect(link.enabled).toBe(true);
  });
});
