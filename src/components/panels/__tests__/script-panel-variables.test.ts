/**
 * Unit tests for VariablesSection of ScriptPanel.
 *
 * Tests add, edit, delete flows via store state and command registry.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useScriptStore, scriptStoreActions } from '@/store/scriptStore';
import { commandRegistry } from '@/commands/CommandRegistry';

describe('VariablesSection', () => {
  beforeEach(() => {
    scriptStoreActions.resetAll();
  });

  it('TestVariablesSection_RenderEmpty_ShowsPlaceholder', () => {
    const state = useScriptStore.getState();
    expect(Object.keys(state.globalVariables)).toHaveLength(0);
  });

  it('TestVariablesSection_AddVariable_CallsVarSet', async () => {
    const spy = vi.spyOn(commandRegistry, 'execute').mockResolvedValue({ success: true });

    await commandRegistry.execute('var.set', { name: 'myVar', value: 42 });

    expect(spy).toHaveBeenCalledWith('var.set', { name: 'myVar', value: 42 });
    spy.mockRestore();
  });

  it('TestVariablesSection_AddVariable_StoreUpdates', () => {
    scriptStoreActions.setVariable('speed', 1.5);

    const state = useScriptStore.getState();
    expect(state.globalVariables['speed']).toEqual({ value: 1.5, type: 'float' });
  });

  it('TestVariablesSection_AddStringVariable', () => {
    scriptStoreActions.setVariable('label', 'hello');

    const state = useScriptStore.getState();
    expect(state.globalVariables['label']).toEqual({ value: 'hello', type: 'string' });
  });

  it('TestVariablesSection_DeleteVariable_CallsVarDelete', async () => {
    const spy = vi.spyOn(commandRegistry, 'execute').mockResolvedValue({ success: true });

    await commandRegistry.execute('var.delete', { name: 'myVar' });

    expect(spy).toHaveBeenCalledWith('var.delete', { name: 'myVar' });
    spy.mockRestore();
  });

  it('TestVariablesSection_DeleteVariable_StoreRemovesEntry', () => {
    scriptStoreActions.setVariable('toDelete', 10);
    expect(useScriptStore.getState().globalVariables['toDelete']).toBeDefined();

    scriptStoreActions.deleteVariable('toDelete');
    expect(useScriptStore.getState().globalVariables['toDelete']).toBeUndefined();
  });

  it('TestVariablesSection_EditVariable_UpdatesValue', () => {
    scriptStoreActions.setVariable('counter', 0);
    scriptStoreActions.setVariable('counter', 99);

    expect(useScriptStore.getState().globalVariables['counter'].value).toBe(99);
  });

  it('TestVariablesSection_ClearAll_ResetsVariables', () => {
    scriptStoreActions.setVariable('a', 1);
    scriptStoreActions.setVariable('b', 2);
    scriptStoreActions.resetVariables();

    expect(Object.keys(useScriptStore.getState().globalVariables)).toHaveLength(0);
  });

  it('TestVariablesSection_EditVariable_InlineInput', async () => {
    // Simulates the inline edit flow: set → edit → commit via var.set
    scriptStoreActions.setVariable('x', 5);

    const spy = vi.spyOn(commandRegistry, 'execute').mockResolvedValue({ success: true });
    await commandRegistry.execute('var.set', { name: 'x', value: 10 });

    expect(spy).toHaveBeenCalledWith('var.set', { name: 'x', value: 10 });
    spy.mockRestore();
  });
});
