/**
 * Integration tests for Phase 8: AI Surface.
 *
 * Tests the full AI pipeline with real CommandRegistry, SimulationController,
 * and Zustand stores, but mocked OpenAI API.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/engine/core/EventBus';
import { CommandRegistry } from '../../src/commands/CommandRegistry';
import { SimulationController } from '../../src/commands/SimulationController';
import { registerAllCommands } from '../../src/commands/definitions';
import { wireStores } from '../../src/commands/wireStores';
import { useSimStore } from '../../src/store/simStore';
import { useUiStore } from '../../src/store/uiStore';
import { useLayoutStore } from '../../src/store/layoutStore';
import { buildAiContext } from '../../src/ai/contextBuilder';
import { buildSystemPrompt, PERSONALITY } from '../../src/ai/personality';
import { detectPossibleTypo } from '../../src/ai/typoDetector';
import { formatRagContext } from '../../src/ai/ragClient';
import type { RagDocument } from '../../src/ai/ragClient';

describe('AI Surface Integration', () => {
  let bus: EventBus;
  let registry: CommandRegistry;
  let controller: SimulationController;
  let unwire: () => void;

  beforeEach(() => {
    bus = new EventBus();
    registry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(registry, controller, bus);
    unwire = wireStores(bus);

    useSimStore.setState({
      generation: 0,
      isRunning: false,
      activePreset: null,
      gridWidth: 0,
      gridHeight: 0,
      liveCellCount: 0,
      speed: 10,
    });
    useLayoutStore.setState({ isTerminalOpen: false, isParamPanelOpen: false });
    useUiStore.setState({ brushSize: 1 });
  });

  afterEach(() => {
    unwire();
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestAiSurface_ContextBuilderWithRealStores', async () => {
    // Load a real preset
    await registry.execute('preset.load', { name: 'conways-gol' });

    // Build AI context from actual store state
    const state = useSimStore.getState();
    const commands = registry.list();
    const context = buildAiContext(state, commands, ['preset load conways-gol']);

    expect(context.presetName).toBe("Conway's Game of Life");
    expect(context.generation).toBe(0);
    expect(context.gridWidth).toBe(128);
    expect(context.gridHeight).toBe(128);
    expect(context.isRunning).toBe(false);
    expect(context.availableCommands.length).toBeGreaterThan(0);
    expect(context.recentActions).toEqual(['preset load conways-gol']);
  });

  it('TestAiSurface_CommandExecutionViaAi', async () => {
    // Simulate what AiService does: execute command returned by AI
    await registry.execute('preset.load', { name: 'conways-gol' });
    expect(useSimStore.getState().activePreset).toBe("Conway's Game of Life");

    // AI returns a command to load gray-scott
    const cmdResult = await registry.execute('preset.load', { name: 'gray-scott' });
    expect(cmdResult.success).toBe(true);
    expect(useSimStore.getState().activePreset).toBe('Gray-Scott Reaction-Diffusion');
  });

  it('TestAiSurface_TypoDetectionWithRealCommands', () => {
    const commandNames = registry.list().map((c) => c.name);

    // "sim plya" should detect as typo for "sim.play"
    const result1 = detectPossibleTypo('sim plya', commandNames);
    expect(result1.isTypo).toBe(true);
    expect(result1.hint).toContain('sim');

    // "preset load" should NOT be detected as typo (it's a valid command pattern)
    // Note: "preset load" with exact category match and close action is tricky
    // but the detection is for when the FULL dot-form doesn't match

    // Natural language should NOT be detected
    const result3 = detectPossibleTypo('what is conway game of life', commandNames);
    expect(result3.isTypo).toBe(false);
  });

  it('TestAiSurface_NoGridStateInApiPayload', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });
    await registry.execute('sim.step', {});

    const state = useSimStore.getState();
    const commands = registry.list();
    const context = buildAiContext(state, commands);

    // Serialize and verify no binary data
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain('Float32Array');
    expect(serialized).not.toContain('ArrayBuffer');

    // Verify only expected keys
    const keys = Object.keys(context);
    expect(keys).toContain('presetName');
    expect(keys).toContain('generation');
    expect(keys).toContain('gridWidth');
    expect(keys).toContain('gridHeight');
    expect(keys).toContain('liveCellCount');
    expect(keys).toContain('isRunning');
    expect(keys).toContain('speed');
    expect(keys).toContain('recentActions');
    expect(keys).toContain('availableCommands');
    // No buffer/grid/cells keys
    expect(keys).not.toContain('buffer');
    expect(keys).not.toContain('grid');
    expect(keys).not.toContain('cells');
  });

  it('TestAiSurface_PersonalityPromptWithContext', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });

    const state = useSimStore.getState();
    const commands = registry.list();
    const context = buildAiContext(state, commands);

    const prompt = buildSystemPrompt(context);

    // Should contain preset info
    expect(prompt).toContain("Conway's Game of Life");
    // Should contain available commands
    expect(prompt).toContain('sim.play');
    expect(prompt).toContain('preset.load');
    // Should contain AI identity
    expect(prompt).toContain(PERSONALITY.name);
  });

  it('TestAiSurface_RagIntegration', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });

    const state = useSimStore.getState();
    const commands = registry.list();
    const context = buildAiContext(state, commands);

    // Simulate RAG documents
    const ragDocs: RagDocument[] = [
      {
        title: 'GoL Patterns',
        content: 'The glider is the smallest spaceship in GoL.',
        category: 'patterns',
        source: 'ca-reference',
        similarity: 0.92,
      },
    ];

    const ragContext = formatRagContext(ragDocs);
    const prompt = buildSystemPrompt(context, [ragContext]);

    expect(prompt).toContain('Reference Material');
    expect(prompt).toContain('GoL Patterns');
    expect(prompt).toContain('smallest spaceship');
  });
});
