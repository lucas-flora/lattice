/**
 * KeyboardShortcutManager: maps keyboard shortcuts to CommandRegistry commands.
 *
 * GUIP-04: Every major action has a keyboard shortcut that invokes the same
 * CommandRegistry entry as the GUI button and CLI command.
 *
 * Shortcuts are defined as a static map and can be queried for HUD display.
 */

import type { CommandRegistry } from './CommandRegistry';

export interface ShortcutBinding {
  /** Display label for the key (e.g., "Space", "N", "Ctrl+Z") */
  keyLabel: string;
  /** The keyboard event key value(s) to match */
  key: string;
  /** Whether Ctrl/Cmd is required */
  ctrlOrMeta?: boolean;
  /** Whether Shift is required */
  shift?: boolean;
  /** Command to execute via CommandRegistry */
  commandName: string;
  /** Params to pass to the command */
  commandParams?: unknown;
  /** Human description of the action */
  description: string;
}

/**
 * Default keyboard shortcuts for all major actions.
 */
export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  { keyLabel: 'Space', key: ' ', commandName: 'sim.playToggle', description: 'Play / Pause' },
  { keyLabel: 'N', key: 'n', commandName: 'sim.step', description: 'Step forward' },
  { keyLabel: 'B', key: 'b', commandName: 'sim.stepBack', description: 'Step back' },
  { keyLabel: 'R', key: 'r', commandName: 'sim.reset', description: 'Reset simulation' },
  { keyLabel: 'C', key: 'c', commandName: 'sim.clear', description: 'Clear grid' },
  { keyLabel: '`', key: '`', commandName: 'ui.toggleTerminal', description: 'Toggle terminal' },
  { keyLabel: 'Ctrl+`', key: '`', ctrlOrMeta: true, commandName: 'ui.toggleTerminal', commandParams: { docked: true }, description: 'Dock terminal' },
  { keyLabel: '1', key: '1', commandName: 'ui.toggleLeftDrawer', description: 'Toggle cells panel' },
  { keyLabel: 'Ctrl+1', key: '1', ctrlOrMeta: true, commandName: 'ui.toggleLeftDrawer', commandParams: { docked: true }, description: 'Dock cells panel' },
  { keyLabel: '2', key: '2', commandName: 'ui.toggleParamPanel', description: 'Toggle parameters' },
  { keyLabel: 'Ctrl+2', key: '2', ctrlOrMeta: true, commandName: 'ui.toggleParamPanel', commandParams: { docked: true }, description: 'Dock parameters' },
  { keyLabel: '3', key: '3', commandName: 'ui.toggleScriptPanel', description: 'Toggle scripts' },
  { keyLabel: 'Ctrl+3', key: '3', ctrlOrMeta: true, commandName: 'ui.toggleScriptPanel', commandParams: { docked: true }, description: 'Dock scripts' },
  { keyLabel: 'F', key: 'f', commandName: 'view.fullscreen', description: 'Toggle fullscreen' },
  { keyLabel: 'S', key: 's', commandName: 'view.split', description: 'Toggle split view' },
  { keyLabel: 'G', key: 'g', commandName: 'view.gridLines', description: 'Toggle grid lines' },
  { keyLabel: '?', key: '?', commandName: 'ui.toggleHotkeyHelp', description: 'Show keyboard shortcuts' },
  { keyLabel: 'Ctrl+Z', key: 'z', ctrlOrMeta: true, commandName: 'edit.undo', description: 'Undo' },
  { keyLabel: 'Ctrl+Shift+Z', key: 'z', ctrlOrMeta: true, shift: true, commandName: 'edit.redo', description: 'Redo' },
  { keyLabel: 'Shift+Tab', key: 'Tab', shift: true, commandName: 'ui.focusToggle', description: 'Switch focus' },
];

export class KeyboardShortcutManager {
  private shortcuts: ShortcutBinding[];
  private registry: CommandRegistry;
  private handler: ((e: KeyboardEvent) => void) | null = null;
  private enabled: boolean = true;

  constructor(registry: CommandRegistry, shortcuts: ShortcutBinding[] = DEFAULT_SHORTCUTS) {
    this.registry = registry;
    this.shortcuts = [...shortcuts];
  }

  /**
   * Get all registered shortcuts for HUD display.
   */
  getShortcuts(): ReadonlyArray<ShortcutBinding> {
    return this.shortcuts;
  }

  /**
   * Find the shortcut for a given command name.
   */
  getShortcutForCommand(commandName: string): ShortcutBinding | undefined {
    return this.shortcuts.find((s) => s.commandName === commandName);
  }

  /**
   * Check if a keyboard event matches a shortcut binding.
   */
  matchesEvent(event: KeyboardEvent, binding: ShortcutBinding): boolean {
    const keyMatch = event.key === binding.key || event.key.toLowerCase() === binding.key.toLowerCase();
    if (!keyMatch) return false;

    if (binding.ctrlOrMeta && !(event.ctrlKey || event.metaKey)) return false;
    if (!binding.ctrlOrMeta && (event.ctrlKey || event.metaKey)) return false;

    if (binding.shift && !event.shiftKey) return false;
    if (!binding.shift && event.shiftKey && binding.key !== '?') return false;

    return true;
  }

  /**
   * Attach the keyboard listener to the window.
   */
  attach(target: { addEventListener: (type: string, handler: (e: KeyboardEvent) => void) => void }): void {
    this.handler = (e: KeyboardEvent) => {
      if (!this.enabled) return;

      // Skip if user is typing in an input field, unless it's a
      // Ctrl/Cmd shortcut (e.g. Ctrl+` to close terminal from its input)
      // or Shift+Tab (focus switching always works)
      const tag = (e.target as HTMLElement)?.tagName;
      if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') &&
          !(e.ctrlKey || e.metaKey) &&
          !(e.key === 'Tab' && e.shiftKey)) return;

      for (const binding of this.shortcuts) {
        if (this.matchesEvent(e, binding)) {
          e.preventDefault();
          this.registry.execute(binding.commandName, binding.commandParams ?? {});
          return;
        }
      }
    };

    target.addEventListener('keydown', this.handler as (e: Event) => void);
  }

  /**
   * Detach the keyboard listener.
   */
  detach(target: { removeEventListener: (type: string, handler: (e: KeyboardEvent) => void) => void }): void {
    if (this.handler) {
      target.removeEventListener('keydown', this.handler as (e: Event) => void);
      this.handler = null;
    }
  }

  /**
   * Enable or disable shortcut handling (e.g., when terminal is focused).
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Whether shortcut handling is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
