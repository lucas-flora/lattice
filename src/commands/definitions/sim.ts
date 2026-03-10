/**
 * Simulation commands: play, pause, step, reset.
 *
 * All simulation control flows through these commands via the CommandRegistry.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';

const NoParams = z.object({}).describe('none');

export function registerSimCommands(
  registry: CommandRegistry,
  controller: SimulationController,
): void {
  registry.register({
    name: 'sim.play',
    description: 'Start the simulation',
    category: 'sim',
    params: NoParams,
    execute: async () => {
      controller.play();
      return { success: true };
    },
  });

  registry.register({
    name: 'sim.pause',
    description: 'Pause the simulation',
    category: 'sim',
    params: NoParams,
    execute: async () => {
      controller.pause();
      return { success: true };
    },
  });

  registry.register({
    name: 'sim.step',
    description: 'Step forward one generation',
    category: 'sim',
    params: NoParams,
    execute: async () => {
      controller.step();
      return { success: true, data: { generation: controller.getGeneration() } };
    },
  });

  registry.register({
    name: 'sim.reset',
    description: 'Reset simulation to initial state',
    category: 'sim',
    params: NoParams,
    execute: async () => {
      controller.reset();
      return { success: true };
    },
  });
}
