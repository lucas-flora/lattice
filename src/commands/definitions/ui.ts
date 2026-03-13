/**
 * UI commands: toggle terminal, toggle param panel.
 *
 * Controls UI panel visibility through the CommandRegistry.
 * Supports floating (overlay) and docked (takes layout space) modes.
 * Panel visibility/mode state lives in layoutStore.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import { useLayoutStore } from '../../store/layoutStore';
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
      const { isTerminalOpen, terminalMode } = useLayoutStore.getState();

      if (p?.docked !== undefined) {
        // Explicit mode request: switch mode or toggle off if already in that mode
        const requestedMode = p.docked ? 'docked' : 'floating';
        if (isTerminalOpen && terminalMode === requestedMode) {
          useLayoutStore.setState({ isTerminalOpen: false });
        } else {
          useLayoutStore.setState({ isTerminalOpen: true, terminalMode: requestedMode });
        }
      } else {
        // No mode specified: just toggle visibility, keep current mode
        useLayoutStore.setState({ isTerminalOpen: !isTerminalOpen });
      }
      return { success: true, data: { isTerminalOpen: useLayoutStore.getState().isTerminalOpen } };
    },
  });

  registry.register({
    name: 'ui.toggleParamPanel',
    description: 'Toggle parameter panel visibility',
    category: 'ui',
    params: ToggleParams,
    execute: async (params: unknown) => {
      const p = params as { docked?: boolean } | undefined;
      const { isParamPanelOpen, paramPanelMode } = useLayoutStore.getState();

      if (p?.docked !== undefined) {
        const requestedMode = p.docked ? 'docked' : 'floating';
        if (isParamPanelOpen && paramPanelMode === requestedMode) {
          useLayoutStore.setState({ isParamPanelOpen: false });
        } else {
          useLayoutStore.setState({ isParamPanelOpen: true, paramPanelMode: requestedMode });
        }
      } else {
        useLayoutStore.setState({ isParamPanelOpen: !isParamPanelOpen });
      }
      return { success: true, data: { isParamPanelOpen: useLayoutStore.getState().isParamPanelOpen } };
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
