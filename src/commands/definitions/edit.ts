/**
 * Edit commands: undo, redo.
 *
 * Delegates to CommandHistory for sparse-diff undo/redo.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';

const NoParams = z.object({}).describe('none');

export function registerEditCommands(
  registry: CommandRegistry,
  controller: SimulationController,
  eventBus: EventBus,
): void {
  registry.register({
    name: 'edit.undo',
    description: 'Undo last cell edit',
    category: 'edit',
    params: NoParams,
    execute: async () => {
      const history = controller.getCommandHistory();
      if (!history) {
        return { success: false, error: 'No simulation loaded' };
      }
      const undone = history.undo();
      if (undone) {
        eventBus.emit('edit:undo', {});
      }
      return { success: undone, error: undone ? undefined : 'Nothing to undo' };
    },
  });

  registry.register({
    name: 'edit.redo',
    description: 'Redo last undone cell edit',
    category: 'edit',
    params: NoParams,
    execute: async () => {
      const history = controller.getCommandHistory();
      if (!history) {
        return { success: false, error: 'No simulation loaded' };
      }
      const redone = history.redo();
      if (redone) {
        eventBus.emit('edit:redo', {});
      }
      return { success: redone, error: redone ? undefined : 'Nothing to redo' };
    },
  });
}
