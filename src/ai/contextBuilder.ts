/**
 * ContextBuilder: assembles app state metadata for AI calls.
 *
 * ASST-02: Full app state context — preset, generation, parameters, recent actions.
 * ASST-07/Success Criterion #5: NEVER includes raw grid state (Float32Array).
 * Only scalar metadata: preset name, generation, grid dimensions, live cell count,
 * running state, speed, recent actions, available commands.
 *
 * Pure function — no side effects, no store subscriptions.
 */

import type { AiContext } from './types';
import type { SimState } from '@/store/simStore';
import type { CommandCatalogEntry } from '@/commands/types';

/**
 * Build the AI context payload from current app state.
 *
 * This function extracts ONLY scalar metadata from the simulation state
 * and command registry. It never touches grid buffers or typed arrays.
 *
 * @param state - Current simStore state snapshot
 * @param commands - Command catalog entries from CommandRegistry.list()
 * @param recentActions - Optional array of recent terminal actions
 * @returns AiContext with metadata only — safe to send to OpenAI
 */
export function buildAiContext(
  state: SimState,
  commands: CommandCatalogEntry[],
  recentActions?: string[],
): AiContext {
  const trimmedActions = recentActions
    ? recentActions.slice(-10)
    : [];

  return {
    presetName: state.activePreset,
    generation: state.generation,
    gridWidth: state.gridWidth,
    gridHeight: state.gridHeight,
    liveCellCount: state.liveCellCount,
    isRunning: state.isRunning,
    speed: state.speed,
    recentActions: trimmedActions,
    availableCommands: commands.map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
    })),
  };
}
