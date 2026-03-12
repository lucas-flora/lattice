/**
 * Grid commands: resize, info.
 *
 * Controls grid dimensions through the CommandRegistry.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';

const ResizeParams = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive().optional(),
}).describe('{ width: number, height?: number }');

const NoParams = z.object({}).describe('none');

export function registerGridCommands(
  registry: CommandRegistry,
  controller: SimulationController,
): void {
  registry.register({
    name: 'grid.resize',
    description: 'Resize the grid (recreates simulation)',
    category: 'grid',
    params: ResizeParams,
    execute: async (params) => {
      const { width, height } = params as z.infer<typeof ResizeParams>;
      controller.resizeGrid(width, height);
      return { success: true, data: { width, height: height ?? width } };
    },
  });

  registry.register({
    name: 'grid.info',
    description: 'Display current grid dimensions and topology',
    category: 'grid',
    params: NoParams,
    execute: async () => {
      const preset = controller.getPresetConfig();
      if (!preset) {
        return { success: false, error: 'No simulation loaded' };
      }
      return {
        success: true,
        data: {
          width: preset.grid.width,
          height: preset.grid.height ?? 1,
          dimensionality: preset.grid.dimensionality,
          topology: preset.grid.topology,
          cellCount: preset.grid.width * (preset.grid.height ?? 1) * (preset.grid.depth ?? 1),
        },
      };
    },
  });
}
