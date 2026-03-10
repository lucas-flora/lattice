/**
 * Preset commands: load.
 *
 * Loads built-in or user presets through the CommandRegistry.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';

const LoadPresetParams = z.object({
  name: z.string(),
}).describe('{ name: string }');

export function registerPresetCommands(
  registry: CommandRegistry,
  controller: SimulationController,
): void {
  registry.register({
    name: 'preset.load',
    description: 'Load a simulation preset by name',
    category: 'preset',
    params: LoadPresetParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof LoadPresetParams>;
      controller.loadPreset(name);
      return { success: true, data: { name } };
    },
  });
}
