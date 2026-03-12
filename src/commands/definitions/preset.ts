/**
 * Preset commands: load, list.
 *
 * Loads built-in or user presets through the CommandRegistry.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import { BUILTIN_PRESET_NAMES_CLIENT as BUILTIN_PRESET_NAMES } from '../../engine/preset/builtinPresetsClient';

const NoParams = z.object({}).describe('none');

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

  registry.register({
    name: 'preset.list',
    description: 'List all available built-in presets',
    category: 'preset',
    params: NoParams,
    execute: async () => {
      return {
        success: true,
        data: { presets: [...BUILTIN_PRESET_NAMES] },
      };
    },
  });
}
