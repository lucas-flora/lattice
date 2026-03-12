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
      const requestedMode = p?.docked ? 'docked' : 'floating';

      if (isTerminalOpen && terminalMode === requestedMode) {
        useUiStore.setState({ isTerminalOpen: false });
      } else {
        useUiStore.setState({ isTerminalOpen: true, terminalMode: requestedMode });
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
      const requestedMode = p?.docked ? 'docked' : 'floating';

      if (isParamPanelOpen && paramPanelMode === requestedMode) {
        useUiStore.setState({ isParamPanelOpen: false });
      } else {
        useUiStore.setState({ isParamPanelOpen: true, paramPanelMode: requestedMode });
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
}
