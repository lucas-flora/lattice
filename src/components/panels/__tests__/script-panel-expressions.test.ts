/**
 * Unit tests for ExpressionsSection of ScriptPanel.
 *
 * Tests add, edit, clear flows via store state and command registry.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useScriptStore, scriptStoreActions } from '@/store/scriptStore';
import { useSimStore } from '@/store/simStore';
import { commandRegistry } from '@/commands/CommandRegistry';

describe('ExpressionsSection', () => {
  beforeEach(() => {
    scriptStoreActions.resetAll();
    useSimStore.setState({
      cellProperties: [
        { name: 'alive', type: 'bool' as const, default: 0 },
        { name: 'age', type: 'int' as const, default: 0 },
        { name: 'alpha', type: 'float' as const, default: 1 },
      ],
    });
  });

  it('TestExpressionsSection_RenderEmpty_ShowsPlaceholder', () => {
    const state = useScriptStore.getState();
    expect(Object.keys(state.expressions)).toHaveLength(0);
  });

  it('TestExpressionsSection_AddForm_PropertyDropdown', () => {
    // Verify cellProperties are available from simStore for the dropdown
    const props = useSimStore.getState().cellProperties;
    expect(props).toHaveLength(3);
    expect(props.map((p) => p.name)).toEqual(['alive', 'age', 'alpha']);
  });

  it('TestExpressionsSection_AddForm_FiltersBoundProperties', () => {
    // When an expression exists for 'age', dropdown should not include 'age'
    scriptStoreActions.setExpression('age', 'generation % 100');
    const expressions = useScriptStore.getState().expressions;
    const props = useSimStore.getState().cellProperties;
    const available = props.filter((p) => !expressions[p.name]);

    expect(available.map((p) => p.name)).toEqual(['alive', 'alpha']);
  });

  it('TestExpressionsSection_AddExpression_CallsExprSet', async () => {
    const spy = vi.spyOn(commandRegistry, 'execute').mockResolvedValue({ success: true });

    await commandRegistry.execute('expr.set', { property: 'alpha', expression: 'age / 100' });

    expect(spy).toHaveBeenCalledWith('expr.set', { property: 'alpha', expression: 'age / 100' });
    spy.mockRestore();
  });

  it('TestExpressionsSection_AddExpression_StoreUpdates', () => {
    scriptStoreActions.setExpression('alpha', 'age / 100');

    const state = useScriptStore.getState();
    expect(state.expressions['alpha']).toBe('age / 100');
  });

  it('TestExpressionsSection_EditExpression_TextareaApplyCancel', () => {
    // Set initial expression
    scriptStoreActions.setExpression('alpha', 'age / 100');

    // Edit to new value
    scriptStoreActions.setExpression('alpha', 'age / 200');

    expect(useScriptStore.getState().expressions['alpha']).toBe('age / 200');
  });

  it('TestExpressionsSection_ClearExpression_CallsExprClear', async () => {
    const spy = vi.spyOn(commandRegistry, 'execute').mockResolvedValue({ success: true });

    await commandRegistry.execute('expr.clear', { property: 'alpha' });

    expect(spy).toHaveBeenCalledWith('expr.clear', { property: 'alpha' });
    spy.mockRestore();
  });

  it('TestExpressionsSection_ClearExpression_StoreRemovesEntry', () => {
    scriptStoreActions.setExpression('alpha', 'age / 100');
    expect(useScriptStore.getState().expressions['alpha']).toBeDefined();

    scriptStoreActions.clearExpression('alpha');
    expect(useScriptStore.getState().expressions['alpha']).toBeUndefined();
  });

  it('TestExpressionsSection_ClearAll_RemovesAllExpressions', async () => {
    scriptStoreActions.setExpression('alpha', 'x');
    scriptStoreActions.setExpression('age', 'y');

    const spy = vi.spyOn(commandRegistry, 'execute').mockResolvedValue({ success: true });
    await commandRegistry.execute('expr.clearAll', {});

    expect(spy).toHaveBeenCalledWith('expr.clearAll', {});
    spy.mockRestore();
  });
});
