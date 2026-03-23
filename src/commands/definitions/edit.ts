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
import type { Simulation } from '../../engine/rule/Simulation';
import { useUiStore } from '../../store/uiStore';

/** Internal/velocity properties that shouldn't be the draw target */
const INTERNAL_PROPS = new Set(['vx', 'vy', 'pressure', 'curl']);

/** Resolve which cell property the draw tool should paint. */
function resolveDrawProperty(sim: Simulation): string {
  // 1. Explicit draw_property in preset YAML
  if (sim.preset.draw_property) return sim.preset.draw_property;
  // 2. Ramp-type mapping with explicit property
  const colorMapping = sim.preset.visual_mappings?.find(m => m.channel === 'color' && m.property);
  if (colorMapping?.property) return colorMapping.property;
  // 3. First non-internal cell property (skip velocity, pressure, curl)
  const userProp = sim.preset.cell_properties?.find(p => !INTERNAL_PROPS.has(p.name));
  if (userProp) return userProp.name;
  // 4. Absolute fallback
  return sim.preset.cell_properties?.[0]?.name
    ?? sim.typeRegistry.getPropertyUnion()[0].name;
}

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

      // Auto-pause if running (don't await sync — write directly to GPU)
      if (controller.isPlaying()) {
        controller.pause();
      }

      // Determine draw target: use the visual-mapped color property if available,
      // otherwise the first non-internal cell property.
      const drawProp = resolveDrawProperty(sim);
      const brushSize = useUiStore.getState().brushSize;
      const halfBrush = Math.floor(brushSize / 2);
      const gpuRunner = controller.getGPURuleRunner();

      history.beginCommand('Draw cell');
      for (let dy = -halfBrush; dy <= halfBrush; dy++) {
        for (let dx = -halfBrush; dx <= halfBrush; dx++) {
          const cx = x + dx;
          const cy = y + dy;
          if (cx >= 0 && cx < sim.grid.config.width && cy >= 0 && cy < sim.grid.config.height) {
            const index = sim.grid.coordToIndex(cx, cy, 0);
            gpuRunner?.writeCellDirect(drawProp, index, 1);
            gpuRunner?.writeCellDirect('alpha', index, 1);
            history.editCell(drawProp, index, 1);
            sim.setCellDirect('alpha', index, 1);
          }
        }
      }
      history.commitCommand();

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

      // Auto-pause if running (don't await sync — write directly to GPU)
      if (controller.isPlaying()) {
        controller.pause();
      }

      const drawProp = resolveDrawProperty(sim);
      const brushSize = useUiStore.getState().brushSize;
      const halfBrush = Math.floor(brushSize / 2);
      const gpuRunner = controller.getGPURuleRunner();

      history.beginCommand('Erase cell');
      for (let dy = -halfBrush; dy <= halfBrush; dy++) {
        for (let dx = -halfBrush; dx <= halfBrush; dx++) {
          const cx = x + dx;
          const cy = y + dy;
          if (cx >= 0 && cx < sim.grid.config.width && cy >= 0 && cy < sim.grid.config.height) {
            const index = sim.grid.coordToIndex(cx, cy, 0);
            gpuRunner?.writeCellDirect(drawProp, index, 0);
            gpuRunner?.writeCellDirect('alpha', index, 0);
            history.editCell(drawProp, index, 0);
            sim.setCellDirect('alpha', index, 0);
          }
        }
      }
      history.commitCommand();

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
