/**
 * Simulation commands: play, pause, step, stepBack, reset, clear, speed, seek, status.
 *
 * All simulation control flows through these commands via the CommandRegistry.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';

const NoParams = z.object({}).describe('none');

const SpeedParams = z.object({
  fps: z.number(),
}).describe('{ fps: number }');

const SeekParams = z.object({
  generation: z.number().int().min(0),
}).describe('{ generation: number }');

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
    name: 'sim.stepBack',
    description: 'Step back one generation (reverse-step)',
    category: 'sim',
    params: NoParams,
    execute: async () => {
      controller.stepBack();
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

  registry.register({
    name: 'sim.clear',
    description: 'Clear all cells (set to zero)',
    category: 'sim',
    params: NoParams,
    execute: async () => {
      controller.clear();
      return { success: true };
    },
  });

  registry.register({
    name: 'sim.speed',
    description: 'Set simulation speed in FPS (0 = max)',
    category: 'sim',
    params: SpeedParams,
    execute: async (params) => {
      const { fps } = params as z.infer<typeof SpeedParams>;
      controller.setSpeed(fps);
      return { success: true, data: { fps } };
    },
  });

  registry.register({
    name: 'sim.seek',
    description: 'Seek to a specific generation',
    category: 'sim',
    params: SeekParams,
    execute: async (params) => {
      const { generation } = params as z.infer<typeof SeekParams>;
      controller.seek(generation);
      return { success: true, data: { generation: controller.getGeneration() } };
    },
  });

  registry.register({
    name: 'sim.status',
    description: 'Get current simulation status',
    category: 'sim',
    params: NoParams,
    execute: async () => {
      const status = controller.getStatus();
      return { success: true, data: status };
    },
  });

  registry.register({
    name: 'sim.playToggle',
    description: 'Toggle play/pause',
    category: 'sim',
    params: NoParams,
    execute: async () => {
      if (controller.isPlaying()) {
        controller.pause();
      } else {
        controller.play();
      }
      return { success: true, data: { isRunning: controller.isPlaying() } };
    },
  });
}
