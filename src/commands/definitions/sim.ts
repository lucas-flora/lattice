/**
 * Simulation commands: play, pause, step, stepBack, reset, clear, speed, seek, status.
 *
 * All simulation control flows through these commands via the CommandRegistry.
 * SG-8: Multi-sim commands (sim.addRoot, sim.removeRoot, sim.setRoot, sim.listRoots).
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import { SimulationManager } from '../SimulationManager';
import { simStoreActions } from '../../store/simStore';
import { useUiStore, uiStoreActions } from '../../store/uiStore';

const NoParams = z.object({}).describe('none');

const SpeedParams = z.object({
  fps: z.number(),
}).describe('{ fps: number }');

const SeekParams = z.object({
  generation: z.number().int().min(0),
}).describe('{ generation: number }');

const PlaybackModeParams = z.object({
  mode: z.enum(['loop', 'endless', 'once']),
}).describe('{ mode: "loop" | "endless" | "once" }');

const DurationParams = z.object({
  frames: z.number().int().min(1),
}).describe('{ frames: number }');

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
      // Sync playback mode and timeline duration to controller before starting
      const { timelineDuration, playbackMode } = useUiStore.getState();
      controller.setPlaybackMode(playbackMode);
      controller.setTimelineDuration(timelineDuration);
      controller.computeAhead(timelineDuration);
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
        const { timelineDuration, playbackMode } = useUiStore.getState();
        controller.setPlaybackMode(playbackMode);
        controller.setTimelineDuration(timelineDuration);
        controller.computeAhead(timelineDuration);
        controller.play();
      }
      return { success: true, data: { isRunning: controller.isPlaying() } };
    },
  });

  registry.register({
    name: 'sim.setPlaybackMode',
    description: 'Set playback end behavior (loop, endless, once)',
    category: 'sim',
    params: PlaybackModeParams,
    execute: async (params) => {
      const { mode } = params as z.infer<typeof PlaybackModeParams>;
      controller.setPlaybackMode(mode);
      useUiStore.setState({ playbackMode: mode });
      return { success: true, data: { mode } };
    },
  });

  registry.register({
    name: 'sim.setDuration',
    description: 'Set timeline duration in frames',
    category: 'sim',
    params: DurationParams,
    execute: async (params) => {
      const { frames } = params as z.infer<typeof DurationParams>;
      controller.setTimelineDuration(frames);
      uiStoreActions.setTimelineDuration(frames);
      return { success: true, data: { duration: frames } };
    },
  });

  // --- SG-8: Multi-sim commands ---
  // These commands are only available when the controller is a SimulationManager.
  // When using a plain SimulationController, they gracefully return errors.

  const RootIdParams = z.object({
    rootId: z.string().min(1),
  }).describe('{ rootId: string }');

  registry.register({
    name: 'sim.addRoot',
    description: 'Add a new simulation root',
    category: 'sim',
    params: RootIdParams,
    execute: async (params) => {
      const { rootId } = params as z.infer<typeof RootIdParams>;
      if (!(controller instanceof SimulationManager)) {
        return { success: false, error: 'Multi-sim not supported (controller is not a SimulationManager)' };
      }
      const instance = controller.addRoot(rootId);
      simStoreActions.addRootId(rootId);
      return { success: true, data: { rootId: instance.rootId, roots: controller.listRoots() } };
    },
  });

  registry.register({
    name: 'sim.removeRoot',
    description: 'Remove a simulation root',
    category: 'sim',
    params: RootIdParams,
    execute: async (params) => {
      const { rootId } = params as z.infer<typeof RootIdParams>;
      if (!(controller instanceof SimulationManager)) {
        return { success: false, error: 'Multi-sim not supported (controller is not a SimulationManager)' };
      }
      const removed = controller.removeRoot(rootId);
      if (!removed) {
        return { success: false, error: `Cannot remove root "${rootId}" (not found or is default)` };
      }
      simStoreActions.removeRootId(rootId);
      simStoreActions.setActiveRootId(controller.activeRootId);
      return { success: true, data: { roots: controller.listRoots() } };
    },
  });

  registry.register({
    name: 'sim.setRoot',
    description: 'Set the active simulation root',
    category: 'sim',
    params: RootIdParams,
    execute: async (params) => {
      const { rootId } = params as z.infer<typeof RootIdParams>;
      if (!(controller instanceof SimulationManager)) {
        return { success: false, error: 'Multi-sim not supported (controller is not a SimulationManager)' };
      }
      if (!controller.getInstance(rootId)) {
        return { success: false, error: `Unknown root: "${rootId}"` };
      }
      controller.setActiveRoot(rootId);
      simStoreActions.setActiveRootId(rootId);
      return { success: true, data: { activeRootId: controller.activeRootId } };
    },
  });

  registry.register({
    name: 'sim.listRoots',
    description: 'List all simulation roots',
    category: 'sim',
    params: NoParams,
    execute: async () => {
      if (!(controller instanceof SimulationManager)) {
        return { success: true, data: { roots: ['default'], activeRootId: 'default' } };
      }
      return {
        success: true,
        data: {
          roots: controller.listRoots(),
          activeRootId: controller.activeRootId,
        },
      };
    },
  });
}
