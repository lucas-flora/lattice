/**
 * Unit tests for Phase 5 scripting: GlobalVariableStore, ExpressionEngine,
 * GlobalScriptRunner, expression/script harnesses.
 *
 * No Pyodide runtime needed — tests pure TypeScript logic only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalVariableStore } from '../GlobalVariableStore';
import { ExpressionEngine } from '../ExpressionEngine';
import { GlobalScriptRunner } from '../GlobalScriptRunner';
import { buildExpressionHarness } from '../expressionHarness';
import { buildScriptHarness } from '../scriptHarness';
import { EventBus, eventBus } from '../../core/EventBus';

// --- GlobalVariableStore ---

describe('GlobalVariableStore', () => {
  let store: GlobalVariableStore;

  beforeEach(() => {
    store = new GlobalVariableStore();
    eventBus.clear();
  });

  it('TestGlobalVariableStore_SetGet', () => {
    store.set('myVar', 42);
    expect(store.get('myVar')).toBe(42);
  });

  it('TestGlobalVariableStore_SetGet_String', () => {
    store.set('label', 'hello');
    expect(store.get('label')).toBe('hello');
  });

  it('TestGlobalVariableStore_Delete', () => {
    store.set('x', 10);
    expect(store.has('x')).toBe(true);
    const deleted = store.delete('x');
    expect(deleted).toBe(true);
    expect(store.has('x')).toBe(false);
    expect(store.get('x')).toBeUndefined();
  });

  it('TestGlobalVariableStore_Delete_NonExistent', () => {
    const deleted = store.delete('nope');
    expect(deleted).toBe(false);
  });

  it('TestGlobalVariableStore_LoadFromConfig', () => {
    store.loadFromConfig([
      { name: 'feedRate', type: 'float', default: 0.055 },
      { name: 'killRate', type: 'float', default: 0.062 },
      { name: 'mode', type: 'string', default: 'auto' },
    ]);
    expect(store.get('feedRate')).toBe(0.055);
    expect(store.get('killRate')).toBe(0.062);
    expect(store.get('mode')).toBe('auto');
  });

  it('TestGlobalVariableStore_GetNumericAll', () => {
    store.set('a', 1);
    store.set('b', 2);
    store.set('name', 'text');
    const numeric = store.getNumericAll();
    expect(numeric).toEqual({ a: 1, b: 2 });
    expect(numeric['name']).toBeUndefined();
  });

  it('TestGlobalVariableStore_GetAll', () => {
    store.set('x', 5);
    store.set('label', 'hello');
    const all = store.getAll();
    expect(all['x']).toEqual({ value: 5, type: 'float' });
    expect(all['label']).toEqual({ value: 'hello', type: 'string' });
  });

  it('TestGlobalVariableStore_Clear', () => {
    store.set('a', 1);
    store.set('b', 2);
    store.clear();
    expect(store.has('a')).toBe(false);
    expect(store.has('b')).toBe(false);
  });

  it('TestGlobalVariableStore_EmitsEventOnSet', () => {
    const handler = vi.fn();
    eventBus.on('script:variableChanged', handler);
    store.set('x', 42);
    expect(handler).toHaveBeenCalledWith({ name: 'x', value: 42 });
  });

  it('TestGlobalVariableStore_EmitsEventOnClear', () => {
    const handler = vi.fn();
    eventBus.on('script:variablesReset', handler);
    store.clear();
    expect(handler).toHaveBeenCalledOnce();
  });
});

// --- ExpressionEngine ---

describe('ExpressionEngine', () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    // Mock bridge — we don't test actual execution here
    const mockBridge = {} as any;
    engine = new ExpressionEngine(mockBridge);
    eventBus.clear();
  });

  it('TestExpressionEngine_SetClearExpression', () => {
    engine.setExpression('alpha', 'clamp(cell["age"] / 100.0)');
    expect(engine.getExpression('alpha')).toBe('clamp(cell["age"] / 100.0)');

    engine.clearExpression('alpha');
    expect(engine.getExpression('alpha')).toBeUndefined();
  });

  it('TestExpressionEngine_HasExpressions', () => {
    expect(engine.hasExpressions()).toBe(false);
    engine.setExpression('alpha', '0.5');
    expect(engine.hasExpressions()).toBe(true);
    engine.clearExpression('alpha');
    expect(engine.hasExpressions()).toBe(false);
  });

  it('TestExpressionEngine_GetAllExpressions', () => {
    engine.setExpression('alpha', '0.5');
    engine.setExpression('age', 'cell["age"] + 1');
    const all = engine.getAllExpressions();
    expect(all).toEqual({
      alpha: '0.5',
      age: 'cell["age"] + 1',
    });
  });

  it('TestExpressionEngine_LoadFromProperties', () => {
    engine.loadFromProperties([
      { name: 'alive', expression: undefined },
      { name: 'alpha', expression: 'clamp(cell["age"] / 50.0)' },
      { name: 'age' },
    ]);
    expect(engine.hasExpressions()).toBe(true);
    expect(engine.getExpression('alpha')).toBe('clamp(cell["age"] / 50.0)');
    expect(engine.getExpression('alive')).toBeUndefined();
  });

  it('TestExpressionEngine_EmitsEventOnSet', () => {
    const handler = vi.fn();
    eventBus.on('script:expressionSet', handler);
    engine.setExpression('alpha', '0.5');
    expect(handler).toHaveBeenCalledWith({ property: 'alpha', expression: '0.5' });
  });

  it('TestExpressionEngine_EmitsEventOnClear', () => {
    engine.setExpression('alpha', '0.5');
    const handler = vi.fn();
    eventBus.on('script:expressionCleared', handler);
    engine.clearExpression('alpha');
    expect(handler).toHaveBeenCalledWith({ property: 'alpha' });
  });
});

// --- ExpressionHarness ---

describe('ExpressionHarness', () => {
  it('TestExpressionHarness_ContainsBuiltinFunctions', () => {
    const code = buildExpressionHarness(
      { alpha: 'clamp(value, 0, 1)' },
      ['alive', 'alpha'],
      8,
      8,
      1,
    );
    expect(code).toContain('def clamp');
    expect(code).toContain('def smoothstep');
    expect(code).toContain('def linear');
    expect(code).toContain('def wiggle');
  });

  it('TestExpressionHarness_ContainsPropertyArrays', () => {
    const code = buildExpressionHarness(
      { alpha: '0.5' },
      ['alive', 'alpha', 'age'],
      16,
      16,
      1,
    );
    expect(code).toContain("'alive'");
    expect(code).toContain("'alpha'");
    expect(code).toContain("'age'");
    expect(code).toContain('width = 16');
    expect(code).toContain('height = 16');
  });

  it('TestExpressionHarness_ContainsExpressionBlocks', () => {
    const code = buildExpressionHarness(
      { alpha: 'clamp(cell["age"] / 50.0)', age: 'cell["age"] + 1' },
      ['alive', 'alpha', 'age'],
      8,
      8,
      1,
    );
    expect(code).toContain("Expression for 'alpha'");
    expect(code).toContain("Expression for 'age'");
    expect(code).toContain('clamp(cell["age"] / 50.0)');
  });

  it('TestExpressionHarness_ContainsEnvAndGlob', () => {
    const code = buildExpressionHarness({ alpha: '0.5' }, ['alpha'], 8, 8, 1);
    expect(code).toContain('env = dict(_input_params)');
    expect(code).toContain('glob = dict(_input_globals)');
    expect(code).toContain('_output_buffers');
  });
});

// --- GlobalScriptRunner ---

describe('GlobalScriptRunner', () => {
  let runner: GlobalScriptRunner;

  beforeEach(() => {
    const mockBridge = {} as any;
    runner = new GlobalScriptRunner(mockBridge);
    eventBus.clear();
  });

  it('TestGlobalScriptRunner_AddRemoveScript', () => {
    runner.addScript({ name: 'entropy', enabled: true, code: 'pass' });
    expect(runner.getScript('entropy')).toBeDefined();
    expect(runner.getScript('entropy')!.name).toBe('entropy');

    const removed = runner.removeScript('entropy');
    expect(removed).toBe(true);
    expect(runner.getScript('entropy')).toBeUndefined();
  });

  it('TestGlobalScriptRunner_RemoveNonexistent', () => {
    const removed = runner.removeScript('nope');
    expect(removed).toBe(false);
  });

  it('TestGlobalScriptRunner_EnableDisable', () => {
    runner.addScript({ name: 's1', enabled: true, code: 'pass' });
    expect(runner.getScript('s1')!.enabled).toBe(true);

    runner.disableScript('s1');
    expect(runner.getScript('s1')!.enabled).toBe(false);

    runner.enableScript('s1');
    expect(runner.getScript('s1')!.enabled).toBe(true);
  });

  it('TestGlobalScriptRunner_GetEnabledScripts', () => {
    runner.addScript({ name: 's1', enabled: true, code: 'pass' });
    runner.addScript({ name: 's2', enabled: false, code: 'pass' });
    runner.addScript({ name: 's3', enabled: true, code: 'pass' });

    const enabled = runner.getEnabledScripts();
    expect(enabled.length).toBe(2);
    expect(enabled.map((s) => s.name)).toEqual(['s1', 's3']);
  });

  it('TestGlobalScriptRunner_HasEnabledScripts', () => {
    expect(runner.hasEnabledScripts()).toBe(false);
    runner.addScript({ name: 's1', enabled: false, code: 'pass' });
    expect(runner.hasEnabledScripts()).toBe(false);
    runner.enableScript('s1');
    expect(runner.hasEnabledScripts()).toBe(true);
  });

  it('TestGlobalScriptRunner_GetAllScripts', () => {
    runner.addScript({ name: 's1', enabled: true, code: 'a' });
    runner.addScript({ name: 's2', enabled: false, code: 'b' });
    const all = runner.getAllScripts();
    expect(all.length).toBe(2);
  });

  it('TestGlobalScriptRunner_LoadFromConfig', () => {
    runner.loadFromConfig([
      { name: 'entropy', enabled: true, code: 'pass' },
      { name: 'logger', enabled: false, code: 'pass' },
    ]);
    expect(runner.getAllScripts().length).toBe(2);
    expect(runner.getScript('entropy')!.enabled).toBe(true);
    expect(runner.getScript('logger')!.enabled).toBe(false);
  });

  it('TestGlobalScriptRunner_EmitsEventOnAdd', () => {
    const handler = vi.fn();
    eventBus.on('script:scriptAdded', handler);
    runner.addScript({ name: 's1', enabled: true, code: 'pass' });
    expect(handler).toHaveBeenCalledWith({
      name: 's1',
      enabled: true,
      code: 'pass',
      inputs: undefined,
      outputs: undefined,
    });
  });

  it('TestGlobalScriptRunner_EmitsEventOnRemove', () => {
    runner.addScript({ name: 's1', enabled: true, code: 'pass' });
    const handler = vi.fn();
    eventBus.on('script:scriptRemoved', handler);
    runner.removeScript('s1');
    expect(handler).toHaveBeenCalledWith({ name: 's1' });
  });

  it('TestGlobalScriptRunner_EmitsEventOnToggle', () => {
    runner.addScript({ name: 's1', enabled: true, code: 'pass' });
    const handler = vi.fn();
    eventBus.on('script:scriptToggled', handler);
    runner.disableScript('s1');
    expect(handler).toHaveBeenCalledWith({ name: 's1', enabled: false });
  });
});

// --- ScriptHarness ---

describe('ScriptHarness', () => {
  it('TestScriptHarness_ContainsUserCode', () => {
    const code = buildScriptHarness(
      'glob["entropy"] = 0.5',
      [],
      ['entropy'],
      8,
      8,
      1,
    );
    expect(code).toContain('glob["entropy"] = 0.5');
    expect(code).toContain('import numpy as np');
    expect(code).toContain('env = dict(_input_params)');
    expect(code).toContain('glob = dict(_input_globals)');
  });

  it('TestScriptHarness_ExtractsChanges', () => {
    const code = buildScriptHarness('pass', [], [], 8, 8, 1);
    expect(code).toContain('_env_changes');
    expect(code).toContain('_var_changes');
  });

  it('TestScriptHarness_ContainsDimensions', () => {
    const code = buildScriptHarness('pass', [], [], 32, 64, 1);
    expect(code).toContain('width = 32');
    expect(code).toContain('height = 64');
  });
});
