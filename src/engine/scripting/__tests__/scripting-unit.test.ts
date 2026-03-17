/**
 * Unit tests for Phase 5 scripting: GlobalVariableStore,
 * expression/script harnesses.
 *
 * No Pyodide runtime needed — tests pure TypeScript logic only.
 *
 * NOTE: ExpressionEngine and GlobalScriptRunner have been removed.
 * Their functionality is now managed by ExpressionTagRegistry.
 * See src/engine/expression/__tests__/ for tag registry tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalVariableStore } from '../GlobalVariableStore';
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

  it('TestExpressionHarness_ContainsMaxMinOverrides', () => {
    const code = buildExpressionHarness({ alpha: 'max(0.1, age)' }, ['alpha', 'age'], 8, 8, 1);
    expect(code).toContain('_builtin_max = max');
    expect(code).toContain('_builtin_min = min');
    expect(code).toContain('np.maximum');
    expect(code).toContain('np.minimum');
  });

  it('TestExpressionHarness_ContainsSelfProxy', () => {
    const code = buildExpressionHarness({ alpha: 'self.alpha = 0.5' }, ['alpha'], 8, 8, 1);
    expect(code).toContain('class _SelfProxy');
    expect(code).toContain('_self_writes');
    expect(code).toContain('def __getattr__');
    expect(code).toContain('def __setattr__');
  });

  it('TestExpressionHarness_ContainsCoordinateArrays', () => {
    const code = buildExpressionHarness({ colorR: 'x / width' }, ['colorR'], 16, 16, 1);
    expect(code).toContain('np.mgrid');
    expect(code).toContain('x = _x_grid');
    expect(code).toContain('y = _y_grid');
  });

  it('TestExpressionHarness_StatementModeClearsSelfWrites', () => {
    const code = buildExpressionHarness(
      { colorR: 'self.colorR = x / width\nself.colorG = 0.5' },
      ['colorR', 'colorG'],
      8, 8, 1,
    );
    expect(code).toContain('_self_writes.clear()');
    expect(code).toContain("(statement mode)");
  });

  it('TestExpressionHarness_ContainsEnvShortcuts', () => {
    const code = buildExpressionHarness({ alpha: '0.5' }, ['alpha'], 8, 8, 1);
    expect(code).toContain("globals()['env_' + _k]");
  });

  it('TestExpressionHarness_ContainsRangeMapHelper', () => {
    const code = buildExpressionHarness({ alpha: '0.5' }, ['alpha'], 8, 8, 1);
    expect(code).toContain('def rangeMap');
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
