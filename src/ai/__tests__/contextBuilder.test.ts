/**
 * Unit tests for ContextBuilder.
 *
 * Verifies that the context payload contains ONLY scalar metadata
 * and never includes raw grid state (Float32Array).
 */

import { describe, it, expect } from 'vitest';
import { buildAiContext } from '../contextBuilder';
import type { SimState } from '@/store/simStore';
import type { CommandCatalogEntry } from '@/commands/types';

function makeSimState(overrides: Partial<SimState> = {}): SimState {
  return {
    generation: 42,
    isRunning: true,
    activePreset: "Conway's Game of Life",
    gridWidth: 128,
    gridHeight: 128,
    liveCellCount: 500,
    speed: 10,
    maxGeneration: 42,
    paramDefs: [],
    params: {},
    ...overrides,
  };
}

function makeCommands(): CommandCatalogEntry[] {
  return [
    { name: 'sim.play', description: 'Start simulation', category: 'sim', paramsDescription: 'none' },
    { name: 'sim.pause', description: 'Pause simulation', category: 'sim', paramsDescription: 'none' },
    { name: 'preset.load', description: 'Load a preset', category: 'preset', paramsDescription: '{ name: string }' },
  ];
}

describe('ContextBuilder', () => {
  it('TestContextBuilder_BuildsMetadataFromSimState', () => {
    const state = makeSimState();
    const commands = makeCommands();
    const context = buildAiContext(state, commands, ['sim play', 'sim step']);

    expect(context.presetName).toBe("Conway's Game of Life");
    expect(context.generation).toBe(42);
    expect(context.gridWidth).toBe(128);
    expect(context.gridHeight).toBe(128);
    expect(context.liveCellCount).toBe(500);
    expect(context.isRunning).toBe(true);
    expect(context.speed).toBe(10);
    expect(context.recentActions).toEqual(['sim play', 'sim step']);
    expect(context.availableCommands).toHaveLength(3);
  });

  it('TestContextBuilder_NeverIncludesGridBuffers', () => {
    const state = makeSimState();
    const commands = makeCommands();
    const context = buildAiContext(state, commands);

    // Serialize and check for any typed array or buffer references
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain('Float32Array');
    expect(serialized).not.toContain('ArrayBuffer');

    // Verify all values are scalar or array of scalars
    for (const [key, value] of Object.entries(context)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          expect(item).not.toBeInstanceOf(Float32Array);
          expect(item).not.toBeInstanceOf(ArrayBuffer);
          if (typeof item === 'object' && item !== null) {
            for (const v of Object.values(item)) {
              expect(typeof v).toMatch(/^(string|number|boolean)$/);
            }
          }
        }
      } else {
        expect(value).not.toBeInstanceOf(Float32Array);
        expect(value).not.toBeInstanceOf(ArrayBuffer);
        expect(['string', 'number', 'boolean', 'object'].includes(typeof value)).toBe(true);
        if (value === null) continue;
        if (typeof value === 'object') {
          // Should not happen for top-level scalars
          expect(key).toBe('this should not match any key'); // fail if reached
        }
      }
    }
  });

  it('TestContextBuilder_MapsPresetNameCorrectly', () => {
    const context = buildAiContext(
      makeSimState({ activePreset: 'Gray-Scott Reaction-Diffusion' }),
      makeCommands(),
    );
    expect(context.presetName).toBe('Gray-Scott Reaction-Diffusion');
  });

  it('TestContextBuilder_MapsNullPreset', () => {
    const context = buildAiContext(
      makeSimState({ activePreset: null }),
      makeCommands(),
    );
    expect(context.presetName).toBeNull();
  });

  it('TestContextBuilder_IncludesAvailableCommands', () => {
    const commands = makeCommands();
    const context = buildAiContext(makeSimState(), commands);

    expect(context.availableCommands).toHaveLength(3);
    expect(context.availableCommands[0]).toEqual({
      name: 'sim.play',
      description: 'Start simulation',
    });
    // Should only include name and description, not paramsDescription or category
    expect(context.availableCommands[0]).not.toHaveProperty('category');
    expect(context.availableCommands[0]).not.toHaveProperty('paramsDescription');
  });

  it('TestContextBuilder_DefaultsRecentActionsToEmpty', () => {
    const context = buildAiContext(makeSimState(), makeCommands());
    expect(context.recentActions).toEqual([]);
  });

  it('TestContextBuilder_TrimsRecentActionsToTen', () => {
    const actions = Array.from({ length: 15 }, (_, i) => `action-${i}`);
    const context = buildAiContext(makeSimState(), makeCommands(), actions);
    expect(context.recentActions).toHaveLength(10);
    expect(context.recentActions[0]).toBe('action-5');
    expect(context.recentActions[9]).toBe('action-14');
  });
});
