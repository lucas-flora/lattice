/**
 * Edit commands: undo, redo, draw, erase, brushSize.
 *
 * Delegates to CommandHistory for sparse-diff undo/redo.
 * Draw and erase modify cells through CommandHistory for undoability.
 *
 * M2: Property-aware brush system. When live, brush state is set on GPURuleRunner
 * and the GPU compute shader applies the brush. When paused, CPU-side per-cell
 * writes with undo support.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';
import { brushStoreActions } from '../../store/brushStore';

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
  size: z.number().int().min(1).max(100),
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
    description: 'Draw with active brush at (x, y)',
    category: 'edit',
    params: DrawParams,
    execute: async (params) => {
      const { x, y } = params as z.infer<typeof DrawParams>;
      const sim = controller.getSimulation();
      const history = controller.getCommandHistory();
      if (!sim || !history) {
        return { success: false, error: 'No simulation loaded' };
      }

      const isLive = controller.isPlaying();
      const gpuRunner = controller.getGPURuleRunner();
      const brush = brushStoreActions.getEffectiveBrush();
      if (!brush) return { success: false, error: 'No brush available' };
      const radius = brushStoreActions.getEffectiveRadius();

      if (isLive && gpuRunner) {
        // Live mode: set brush state on GPU runner, shader handles it in next tick
        gpuRunner.setBrushState(true, x, y, brush, radius);
      } else if (gpuRunner) {
        // Paused mode: CPU-side writes with undo support
        history.beginCommand('Draw');
        const propEntries = Object.entries(brush.properties);
        const halfR = Math.floor(radius);

        for (let dy = -halfR; dy <= halfR; dy++) {
          for (let dx = -halfR; dx <= halfR; dx++) {
            const cx = x + dx;
            const cy = y + dy;
            if (cx < 0 || cx >= sim.grid.config.width || cy < 0 || cy >= sim.grid.config.height) continue;

            // Check shape/distance
            const dist = brush.shape === 'circle'
              ? Math.sqrt(dx * dx + dy * dy)
              : Math.max(Math.abs(dx), Math.abs(dy));
            if (dist > radius) continue;

            // Compute falloff strength
            let strength = 1.0;
            const norm = dist / Math.max(radius, 0.001);
            if (brush.falloff === 'linear') {
              strength = 1.0 - norm;
            } else if (brush.falloff === 'smooth') {
              // Approximate smoothstep
              const t = Math.max(0, Math.min(1, norm));
              strength = 1.0 - (t * t * (3 - 2 * t));
            }

            const index = sim.grid.coordToIndex(cx, cy, 0);
            for (const [propName, action] of propEntries) {
              const layout = gpuRunner.getPropertyLayout().find(p => p.name === propName);
              if (!layout) continue;
              const currentBuf = sim.grid.hasProperty(propName) ? sim.grid.getCurrentBuffer(propName) : null;
              const current = currentBuf ? currentBuf[index] : 0;
              let newVal: number;
              if (action.mode === 'set') {
                newVal = current + (action.value - current) * strength;
              } else if (action.mode === 'add') {
                newVal = current + action.value * strength;
              } else if (action.mode === 'multiply') {
                newVal = current * (1 + (action.value - 1) * strength);
              } else {
                // random: random value in [0, action.value], lerped by strength
                const r = Math.random() * action.value;
                newVal = current + (r - current) * strength;
              }
              gpuRunner.writeCellDirect(propName, index, newVal);
              history.editCell(propName, index, newVal);
            }
          }
        }
        history.commitCommand();
        controller.onGridEdited();
      }

      eventBus.emit('edit:draw', { x, y });
      return { success: true };
    },
  });

  registry.register({
    name: 'edit.erase',
    description: 'Erase with active brush at (x, y) — sets all brush properties to 0',
    category: 'edit',
    params: EraseParams,
    execute: async (params) => {
      const { x, y } = params as z.infer<typeof EraseParams>;
      const sim = controller.getSimulation();
      const history = controller.getCommandHistory();
      if (!sim || !history) {
        return { success: false, error: 'No simulation loaded' };
      }

      const isLive = controller.isPlaying();
      const gpuRunner = controller.getGPURuleRunner();
      const brush = brushStoreActions.getEffectiveBrush();
      if (!brush) return { success: false, error: 'No brush available' };
      const radius = brushStoreActions.getEffectiveRadius();

      // Build an eraser brush: same properties as active brush, but all set to 0
      const eraserProps: Record<string, { value: number; mode: 'set' }> = {};
      for (const propName of Object.keys(brush.properties)) {
        eraserProps[propName] = { value: 0, mode: 'set' };
      }
      const eraserBrush = { ...brush, properties: eraserProps, falloff: 'hard' as const };

      if (isLive && gpuRunner) {
        gpuRunner.setBrushState(true, x, y, eraserBrush, radius);
      } else if (gpuRunner) {
        history.beginCommand('Erase');
        const halfR = Math.floor(radius);

        for (let dy = -halfR; dy <= halfR; dy++) {
          for (let dx = -halfR; dx <= halfR; dx++) {
            const cx = x + dx;
            const cy = y + dy;
            if (cx < 0 || cx >= sim.grid.config.width || cy < 0 || cy >= sim.grid.config.height) continue;

            const dist = eraserBrush.shape === 'circle'
              ? Math.sqrt(dx * dx + dy * dy)
              : Math.max(Math.abs(dx), Math.abs(dy));
            if (dist > radius) continue;

            const index = sim.grid.coordToIndex(cx, cy, 0);
            for (const propName of Object.keys(eraserProps)) {
              gpuRunner.writeCellDirect(propName, index, 0);
              history.editCell(propName, index, 0);
            }
          }
        }
        history.commitCommand();
        controller.onGridEdited();
      }

      eventBus.emit('edit:erase', { x, y });
      return { success: true };
    },
  });

  registry.register({
    name: 'edit.brushSize',
    description: 'Set brush radius (1-100)',
    category: 'edit',
    params: BrushSizeParams,
    execute: async (params) => {
      const { size } = params as z.infer<typeof BrushSizeParams>;
      brushStoreActions.setRadiusOverride(size);
      return { success: true, data: { size } };
    },
  });
}
