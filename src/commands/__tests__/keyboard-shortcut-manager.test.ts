/**
 * Unit tests for KeyboardShortcutManager.
 *
 * GUIP-04: Keyboard shortcuts mapped to CommandRegistry commands.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyboardShortcutManager, DEFAULT_SHORTCUTS, type ShortcutBinding } from '../KeyboardShortcutManager';
import { CommandRegistry } from '../CommandRegistry';
import { z } from 'zod';

const NoParams = z.object({}).describe('none');

function makeKeyEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: ' ',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    target: { tagName: 'BODY' } as HTMLElement,
    ...overrides,
  } as unknown as KeyboardEvent;
}

describe('KeyboardShortcutManager', () => {
  let registry: CommandRegistry;
  let manager: KeyboardShortcutManager;

  beforeEach(() => {
    registry = new CommandRegistry();
    // Register mock commands for all default shortcuts
    for (const s of DEFAULT_SHORTCUTS) {
      if (!registry.has(s.commandName)) {
        registry.register({
          name: s.commandName,
          description: s.description,
          category: 'test',
          params: NoParams,
          execute: vi.fn(async () => ({ success: true })),
        });
      }
    }
    manager = new KeyboardShortcutManager(registry);
  });

  it('TestKeyboardShortcutManager_DefaultShortcutsExist', () => {
    const shortcuts = manager.getShortcuts();
    expect(shortcuts.length).toBeGreaterThanOrEqual(10);
    expect(shortcuts.some((s) => s.key === ' ')).toBe(true); // Space
    expect(shortcuts.some((s) => s.key === 'n')).toBe(true); // Step
    expect(shortcuts.some((s) => s.key === 'b')).toBe(true); // Step Back
    expect(shortcuts.some((s) => s.key === 'r')).toBe(true); // Reset
    expect(shortcuts.some((s) => s.key === 'c')).toBe(true); // Clear
    expect(shortcuts.some((s) => s.key === 't')).toBe(true); // Terminal
    expect(shortcuts.some((s) => s.key === 'p')).toBe(true); // Params
    expect(shortcuts.some((s) => s.key === 'f')).toBe(true); // Fullscreen
    expect(shortcuts.some((s) => s.key === 's')).toBe(true); // Split
    expect(shortcuts.some((s) => s.key === '?')).toBe(true); // Help
  });

  it('TestKeyboardShortcutManager_MatchesSimpleKey', () => {
    const binding: ShortcutBinding = {
      keyLabel: 'N', key: 'n', commandName: 'sim.step', description: 'Step',
    };
    expect(manager.matchesEvent(makeKeyEvent({ key: 'n' }), binding)).toBe(true);
    expect(manager.matchesEvent(makeKeyEvent({ key: 'N' }), binding)).toBe(true);
    expect(manager.matchesEvent(makeKeyEvent({ key: 'x' }), binding)).toBe(false);
  });

  it('TestKeyboardShortcutManager_MatchesCtrlKey', () => {
    const binding: ShortcutBinding = {
      keyLabel: 'Ctrl+Z', key: 'z', ctrlOrMeta: true, commandName: 'edit.undo', description: 'Undo',
    };
    expect(manager.matchesEvent(makeKeyEvent({ key: 'z', ctrlKey: true }), binding)).toBe(true);
    expect(manager.matchesEvent(makeKeyEvent({ key: 'z', metaKey: true }), binding)).toBe(true);
    expect(manager.matchesEvent(makeKeyEvent({ key: 'z' }), binding)).toBe(false);
  });

  it('TestKeyboardShortcutManager_MatchesShiftKey', () => {
    const binding: ShortcutBinding = {
      keyLabel: 'Ctrl+Shift+Z', key: 'z', ctrlOrMeta: true, shift: true, commandName: 'edit.redo', description: 'Redo',
    };
    expect(manager.matchesEvent(
      makeKeyEvent({ key: 'z', ctrlKey: true, shiftKey: true }), binding
    )).toBe(true);
    expect(manager.matchesEvent(
      makeKeyEvent({ key: 'z', ctrlKey: true }), binding
    )).toBe(false);
  });

  it('TestKeyboardShortcutManager_GetShortcutForCommand', () => {
    const shortcut = manager.getShortcutForCommand('sim.step');
    expect(shortcut).toBeDefined();
    expect(shortcut?.key).toBe('n');
    expect(shortcut?.keyLabel).toBe('N');
  });

  it('TestKeyboardShortcutManager_EnableDisable', () => {
    expect(manager.isEnabled()).toBe(true);
    manager.setEnabled(false);
    expect(manager.isEnabled()).toBe(false);
    manager.setEnabled(true);
    expect(manager.isEnabled()).toBe(true);
  });

  it('TestKeyboardShortcutManager_AttachAndDetach', () => {
    const target = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    manager.attach(target);
    expect(target.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));

    manager.detach(target);
    expect(target.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('TestKeyboardShortcutManager_ExecutesCommandOnMatch', async () => {
    const executeSpy = vi.spyOn(registry, 'execute');
    const listeners: Record<string, (e: KeyboardEvent) => void> = {};
    const target = {
      addEventListener: vi.fn((type: string, handler: (e: KeyboardEvent) => void) => {
        listeners[type] = handler;
      }),
      removeEventListener: vi.fn(),
    };

    manager.attach(target);
    expect(listeners['keydown']).toBeDefined();

    // Simulate pressing 'n' (step forward)
    listeners['keydown'](makeKeyEvent({ key: 'n' }));

    expect(executeSpy).toHaveBeenCalledWith('sim.step', {});
  });

  it('TestKeyboardShortcutManager_SkipsInputElements', () => {
    const executeSpy = vi.spyOn(registry, 'execute');
    const listeners: Record<string, (e: KeyboardEvent) => void> = {};
    const target = {
      addEventListener: vi.fn((type: string, handler: (e: KeyboardEvent) => void) => {
        listeners[type] = handler;
      }),
      removeEventListener: vi.fn(),
    };

    manager.attach(target);

    // Simulate pressing 'n' inside an INPUT
    listeners['keydown'](makeKeyEvent({ key: 'n', target: { tagName: 'INPUT' } as HTMLElement }));
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('TestKeyboardShortcutManager_SkipsWhenDisabled', () => {
    const executeSpy = vi.spyOn(registry, 'execute');
    const listeners: Record<string, (e: KeyboardEvent) => void> = {};
    const target = {
      addEventListener: vi.fn((type: string, handler: (e: KeyboardEvent) => void) => {
        listeners[type] = handler;
      }),
      removeEventListener: vi.fn(),
    };

    manager.attach(target);
    manager.setEnabled(false);

    listeners['keydown'](makeKeyEvent({ key: 'n' }));
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('TestKeyboardShortcutManager_AllDefaultShortcutsHaveCommands', () => {
    for (const shortcut of DEFAULT_SHORTCUTS) {
      expect(registry.has(shortcut.commandName)).toBe(true);
    }
  });
});
