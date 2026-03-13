/**
 * Layout commands: drawer toggling, layout reset.
 *
 * Controls the modular panel layout through the CommandRegistry.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import { useLayoutStore, layoutStoreActions } from '../../store/layoutStore';

const NoParams = z.object({}).describe('none');

const DrawerParams = z.object({
  position: z.enum(['left', 'right', 'bottom']),
}).describe('{ position: "left" | "right" | "bottom" }');

export function registerLayoutCommands(
  registry: CommandRegistry,
): void {
  registry.register({
    name: 'layout.toggleDrawer',
    description: 'Toggle a drawer open/closed',
    category: 'layout',
    params: DrawerParams,
    execute: async (params) => {
      const { position } = params as z.infer<typeof DrawerParams>;
      if (position === 'bottom') {
        const { isTerminalOpen } = useLayoutStore.getState();
        layoutStoreActions.setTerminalOpen(!isTerminalOpen);
        return { success: true, data: { position, open: !isTerminalOpen } };
      }
      if (position === 'right') {
        const { isParamPanelOpen } = useLayoutStore.getState();
        layoutStoreActions.setParamPanelOpen(!isParamPanelOpen);
        return { success: true, data: { position, open: !isParamPanelOpen } };
      }
      // Left drawer — future use
      return { success: true, data: { position, open: false } };
    },
  });

  registry.register({
    name: 'layout.reset',
    description: 'Reset layout to default configuration',
    category: 'layout',
    params: NoParams,
    execute: async () => {
      layoutStoreActions.resetLayout();
      return { success: true };
    },
  });
}
