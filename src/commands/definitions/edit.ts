/**
 * Edit commands: undo, redo, draw, erase, brushSize.
 *
 * Delegates to CommandHistory for sparse-diff undo/redo.
 * Draw and erase modify cells through CommandHistory for undoability.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';
import { useUiStore } from '../../store/uiStore';

const NoParams = z.object({}).describe('none');

const DrawParams = z.object({
  x: z.number().int(),
  y: z.number().int(),
}).describe('{ x: number, y: number }');

const EraseParams = z.object({
  x: z.number().int(),
  y: z.number().int(),
}).describe('{ x: number, y: number }');

const BrushSizeParams = z.object({
  size: z.number().int().min(1).max(7),
}).describe('{ size: number }');

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
        controller.onGridEdited();
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
        controller.onGridEdited();
        eventBus.emit('edit:redo', {});
      }
      return { success: redone, error: redone ? undefined : 'Nothing to redo' };
    },
  });

  registry.register({
    name: 'edit.draw',
    description: 'Draw a cell at (x, y)',
    category: 'edit',
    params: DrawParams,
    execute: async (params) => {
      const { x, y } = params as z.infer<typeof DrawParams>;
      const sim = controller.getSimulation();
      const history = controller.getCommandHistory();
      if (!sim || !history) {
        return { success: false, error: 'No simulation loaded' };
      }

      // Auto-pause if running
      if (controller.isPlaying()) {
        controller.pause();
      }

      const firstProp = sim.preset.cell_properties?.[0]?.name
        ?? sim.typeRegistry.getPropertyUnion()[0].name;
      const brushSize = useUiStore.getState().brushSize;
      const halfBrush = Math.floor(brushSize / 2);

      history.beginCommand('Draw cell');
      for (let dy = -halfBrush; dy <= halfBrush; dy++) {
        for (let dx = -halfBrush; dx <= halfBrush; dx++) {
          const cx = x + dx;
          const cy = y + dy;
          if (cx >= 0 && cx < sim.grid.config.width && cy >= 0 && cy < sim.grid.config.height) {
            const index = sim.grid.coordToIndex(cx, cy, 0);
            history.editCell(firstProp, index, 1);
          }
        }
      }
      history.commitCommand();

      // Invalidate cache and restart compute-ahead with the edited grid
      controller.onGridEdited();

      eventBus.emit('edit:draw', { x, y });
      return { success: true };
    },
  });

  registry.register({
    name: 'edit.erase',
    description: 'Erase a cell at (x, y)',
    category: 'edit',
    params: EraseParams,
    execute: async (params) => {
      const { x, y } = params as z.infer<typeof EraseParams>;
      const sim = controller.getSimulation();
      const history = controller.getCommandHistory();
      if (!sim || !history) {
        return { success: false, error: 'No simulation loaded' };
      }

      // Auto-pause if running
      if (controller.isPlaying()) {
        controller.pause();
      }

      const firstProp = sim.preset.cell_properties?.[0]?.name
        ?? sim.typeRegistry.getPropertyUnion()[0].name;
      const brushSize = useUiStore.getState().brushSize;
      const halfBrush = Math.floor(brushSize / 2);

      history.beginCommand('Erase cell');
      for (let dy = -halfBrush; dy <= halfBrush; dy++) {
        for (let dx = -halfBrush; dx <= halfBrush; dx++) {
          const cx = x + dx;
          const cy = y + dy;
          if (cx >= 0 && cx < sim.grid.config.width && cy >= 0 && cy < sim.grid.config.height) {
            const index = sim.grid.coordToIndex(cx, cy, 0);
            history.editCell(firstProp, index, 0);
          }
        }
      }
      history.commitCommand();

      // Invalidate cache and restart compute-ahead with the edited grid
      controller.onGridEdited();

      eventBus.emit('edit:erase', { x, y });
      return { success: true };
    },
  });

  registry.register({
    name: 'edit.brushSize',
    description: 'Set brush size for drawing (1, 3, 5, or 7)',
    category: 'edit',
    params: BrushSizeParams,
    execute: async (params) => {
      const { size } = params as z.infer<typeof BrushSizeParams>;
      useUiStore.setState({ brushSize: size });
      return { success: true, data: { size } };
    },
  });
}
