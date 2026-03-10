/**
 * UI commands: toggle terminal, toggle param panel.
 *
 * Controls UI panel visibility through the CommandRegistry.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { EventBus } from '../../engine/core/EventBus';
import { useUiStore } from '../../store/uiStore';

const NoParams = z.object({}).describe('none');

export function registerUiCommands(
  registry: CommandRegistry,
  eventBus: EventBus,
): void {
  registry.register({
    name: 'ui.toggleTerminal',
    description: 'Toggle terminal panel visibility',
    category: 'ui',
    params: NoParams,
    execute: async () => {
      const current = useUiStore.getState().isTerminalOpen;
      const next = !current;
      useUiStore.setState({ isTerminalOpen: next });
      eventBus.emit('ui:change', { isTerminalOpen: next });
      return { success: true, data: { isTerminalOpen: next } };
    },
  });

  registry.register({
    name: 'ui.toggleParamPanel',
    description: 'Toggle parameter panel visibility',
    category: 'ui',
    params: NoParams,
    execute: async () => {
      const current = useUiStore.getState().isParamPanelOpen;
      const next = !current;
      useUiStore.setState({ isParamPanelOpen: next });
      eventBus.emit('ui:change', { isParamPanelOpen: next });
      return { success: true, data: { isParamPanelOpen: next } };
    },
  });
}
