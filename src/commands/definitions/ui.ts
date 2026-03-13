/**
 * UI commands: toggle terminal, toggle param panel.
 *
 * Controls UI panel visibility through the CommandRegistry.
 * Supports floating (overlay) and docked (takes layout space) modes.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import { useUiStore } from '../../store/uiStore';

const NoParams = z.object({}).describe('none');
const ToggleParams = z.object({ docked: z.boolean().optional() }).describe('optional docked flag');

export function registerUiCommands(
  registry: CommandRegistry,
  _eventBus: unknown,
): void {
  registry.register({
    name: 'ui.toggleTerminal',
    description: 'Toggle terminal panel visibility',
    category: 'ui',
    params: ToggleParams,
    execute: async (params: unknown) => {
      const p = params as { docked?: boolean } | undefined;
      const { isTerminalOpen, terminalMode } = useUiStore.getState();

      if (p?.docked !== undefined) {
        // Explicit mode request: switch mode or toggle off if already in that mode
        const requestedMode = p.docked ? 'docked' : 'floating';
        if (isTerminalOpen && terminalMode === requestedMode) {
          useUiStore.setState({ isTerminalOpen: false });
        } else {
          useUiStore.setState({ isTerminalOpen: true, terminalMode: requestedMode });
        }
      } else {
        // No mode specified: just toggle visibility, keep current mode
        useUiStore.setState({ isTerminalOpen: !isTerminalOpen });
      }
      return { success: true, data: { isTerminalOpen: useUiStore.getState().isTerminalOpen } };
    },
  });

  registry.register({
    name: 'ui.toggleParamPanel',
    description: 'Toggle parameter panel visibility',
    category: 'ui',
    params: ToggleParams,
    execute: async (params: unknown) => {
      const p = params as { docked?: boolean } | undefined;
      const { isParamPanelOpen, paramPanelMode } = useUiStore.getState();

      if (p?.docked !== undefined) {
        const requestedMode = p.docked ? 'docked' : 'floating';
        if (isParamPanelOpen && paramPanelMode === requestedMode) {
          useUiStore.setState({ isParamPanelOpen: false });
        } else {
          useUiStore.setState({ isParamPanelOpen: true, paramPanelMode: requestedMode });
        }
      } else {
        useUiStore.setState({ isParamPanelOpen: !isParamPanelOpen });
      }
      return { success: true, data: { isParamPanelOpen: useUiStore.getState().isParamPanelOpen } };
    },
  });

  registry.register({
    name: 'ui.toggleHotkeyHelp',
    description: 'Toggle keyboard shortcut help overlay',
    category: 'ui',
    params: NoParams,
    execute: async () => {
      const current = useUiStore.getState().isHotkeyHelpOpen;
      const next = !current;
      useUiStore.setState({ isHotkeyHelpOpen: next });
      return { success: true, data: { isHotkeyHelpOpen: next } };
    },
  });

  registry.register({
    name: 'ui.focusToggle',
    description: 'Switch focus between terminal and simulation',
    category: 'ui',
    params: NoParams,
    execute: async () => {
      const terminalInput = document.querySelector('[data-testid="terminal-input"]') as HTMLElement | null;
      const active = document.activeElement;
      if (active === terminalInput) {
        // Terminal focused → blur to sim area
        (active as HTMLElement).blur();
        return { success: true, data: { focus: 'simulation' } };
      } else if (terminalInput) {
        // Sim area → focus terminal input
        terminalInput.focus();
        return { success: true, data: { focus: 'terminal' } };
      }
      return { success: true, data: { focus: 'unchanged' } };
    },
  });
}
