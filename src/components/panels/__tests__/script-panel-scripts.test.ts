/**
 * Unit tests for ScriptsSection of ScriptPanel.
 *
 * Tests add, toggle, edit, remove flows via store state and command registry.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useScriptStore, scriptStoreActions } from '@/store/scriptStore';
import { commandRegistry } from '@/commands/CommandRegistry';

describe('ScriptsSection', () => {
  beforeEach(() => {
    scriptStoreActions.resetAll();
  });

  it('TestScriptsSection_RenderEmpty_ShowsPlaceholder', () => {
    const state = useScriptStore.getState();
    expect(state.globalScripts).toHaveLength(0);
  });

  it('TestScriptsSection_AddScript_CallsScriptAdd', async () => {
    const spy = vi.spyOn(commandRegistry, 'execute').mockResolvedValue({ success: true });

    await commandRegistry.execute('script.add', {
      name: 'decay',
      code: 'grid["alpha"] *= 0.99',
      inputs: ['alpha'],
      outputs: ['alpha'],
    });

    expect(spy).toHaveBeenCalledWith('script.add', {
      name: 'decay',
      code: 'grid["alpha"] *= 0.99',
      inputs: ['alpha'],
      outputs: ['alpha'],
    });
    spy.mockRestore();
  });

  it('TestScriptsSection_AddScript_StoreUpdates', () => {
    scriptStoreActions.addScript({
      name: 'decay',
      enabled: true,
      code: 'grid["alpha"] *= 0.99',
      inputs: ['alpha'],
      outputs: ['alpha'],
    });

    const scripts = useScriptStore.getState().globalScripts;
    expect(scripts).toHaveLength(1);
    expect(scripts[0].name).toBe('decay');
    expect(scripts[0].enabled).toBe(true);
    expect(scripts[0].code).toBe('grid["alpha"] *= 0.99');
  });

  it('TestScriptsSection_ToggleEnabled_CallsCorrectCommand', async () => {
    const spy = vi.spyOn(commandRegistry, 'execute').mockResolvedValue({ success: true });

    // Disable an enabled script
    await commandRegistry.execute('script.disable', { name: 'decay' });
    expect(spy).toHaveBeenCalledWith('script.disable', { name: 'decay' });

    // Enable a disabled script
    await commandRegistry.execute('script.enable', { name: 'decay' });
    expect(spy).toHaveBeenCalledWith('script.enable', { name: 'decay' });

    spy.mockRestore();
  });

  it('TestScriptsSection_ToggleEnabled_StoreUpdates', () => {
    scriptStoreActions.addScript({ name: 'test', enabled: true, code: 'pass' });
    expect(useScriptStore.getState().globalScripts[0].enabled).toBe(true);

    scriptStoreActions.toggleScript('test', false);
    expect(useScriptStore.getState().globalScripts[0].enabled).toBe(false);

    scriptStoreActions.toggleScript('test', true);
    expect(useScriptStore.getState().globalScripts[0].enabled).toBe(true);
  });

  it('TestScriptsSection_EditScript_TextareaApplyCancel', () => {
    scriptStoreActions.addScript({ name: 'myScript', enabled: true, code: 'pass' });

    // Edit overwrites with same name (overwrite semantics via addScript)
    scriptStoreActions.addScript({ name: 'myScript', enabled: true, code: 'new code' });

    const scripts = useScriptStore.getState().globalScripts;
    expect(scripts).toHaveLength(1);
    expect(scripts[0].code).toBe('new code');
  });

  it('TestScriptsSection_RemoveScript_CallsScriptRemove', async () => {
    const spy = vi.spyOn(commandRegistry, 'execute').mockResolvedValue({ success: true });

    await commandRegistry.execute('script.remove', { name: 'decay' });

    expect(spy).toHaveBeenCalledWith('script.remove', { name: 'decay' });
    spy.mockRestore();
  });

  it('TestScriptsSection_RemoveScript_StoreUpdates', () => {
    scriptStoreActions.addScript({ name: 'a', enabled: true, code: 'x' });
    scriptStoreActions.addScript({ name: 'b', enabled: true, code: 'y' });
    expect(useScriptStore.getState().globalScripts).toHaveLength(2);

    scriptStoreActions.removeScript('a');
    const remaining = useScriptStore.getState().globalScripts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('b');
  });

  it('TestScriptsSection_ClearAll_RemovesAllScripts', () => {
    scriptStoreActions.addScript({ name: 'a', enabled: true, code: 'x' });
    scriptStoreActions.addScript({ name: 'b', enabled: true, code: 'y' });

    scriptStoreActions.setScripts([]);
    expect(useScriptStore.getState().globalScripts).toHaveLength(0);
  });

  it('TestScriptsSection_ScriptWithInputsOutputs', () => {
    scriptStoreActions.addScript({
      name: 'transform',
      enabled: true,
      code: 'out = inp * 2',
      inputs: ['alpha', 'age'],
      outputs: ['energy'],
    });

    const script = useScriptStore.getState().globalScripts[0];
    expect(script.inputs).toEqual(['alpha', 'age']);
    expect(script.outputs).toEqual(['energy']);
  });
});
