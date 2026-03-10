/**
 * Scenario tests for Phase 8: AI Surface.
 *
 * End-to-end workflow tests simulating full user interactions
 * with the AI assistant through the terminal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/engine/core/EventBus';
import { commandRegistry } from '../../src/commands/CommandRegistry';
import { SimulationController } from '../../src/commands/SimulationController';
import { registerAllCommands } from '../../src/commands/definitions';
import { wireStores } from '../../src/commands/wireStores';
import { useSimStore } from '../../src/store/simStore';
import { useUiStore } from '../../src/store/uiStore';
import { useAiStore, aiStoreActions } from '../../src/store/aiStore';
import { AiService } from '../../src/ai/aiService';
import { buildAiContext } from '../../src/ai/contextBuilder';
import { detectPossibleTypo } from '../../src/ai/typoDetector';
import { formatRagContext } from '../../src/ai/ragClient';
import { buildSystemPrompt } from '../../src/ai/personality';
import type { AiStreamChunk } from '../../src/ai/types';

const originalFetch = globalThis.fetch;

// Helper to create a mock SSE ReadableStream
function createMockSSEStream(chunks: AiStreamChunk[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        const data = `data: ${JSON.stringify(chunks[index])}\n\n`;
        controller.enqueue(encoder.encode(data));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe('AI Surface Workflow', () => {
  let bus: EventBus;
  let controller: SimulationController;
  let unwire: () => void;
  let service: AiService;

  beforeEach(() => {
    bus = new EventBus();
    commandRegistry.clear();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(commandRegistry, controller, bus);
    unwire = wireStores(bus);
    service = new AiService();

    useSimStore.setState({
      generation: 0,
      isRunning: false,
      activePreset: null,
      gridWidth: 0,
      gridHeight: 0,
      liveCellCount: 0,
      speed: 10,
    });
    useUiStore.setState({ isTerminalOpen: false, isParamPanelOpen: false, brushSize: 1 });
    useAiStore.setState({ chatHistory: [], isLoading: false });
  });

  afterEach(() => {
    unwire();
    controller.dispose();
    commandRegistry.clear();
    bus.clear();
    globalThis.fetch = originalFetch;
  });

  it('TestAiWorkflow_NaturalLanguageGetAiResponse', async () => {
    // Load a preset first
    await commandRegistry.execute('preset.load', { name: 'conways-gol' });

    // Mock the API to return a context-aware response
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        createMockSSEStream([
          { type: 'delta', content: "You're running Conway's Game of Life" },
          { type: 'delta', content: ' on a 128x128 grid.' },
          { type: 'done' },
        ]),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );

    const entries: Array<{ type: string; message: string }> = [];
    const addLogEntry = (type: string, message: string) => {
      entries.push({ type, message });
    };

    await service.handleTerminalInput(
      'what is this simulation?',
      addLogEntry as (type: 'command' | 'info' | 'error' | 'ai', message: string) => void,
    );

    // Should have AI response
    const aiEntries = entries.filter((e) => e.type === 'ai' && e.message !== 'thinking...');
    expect(aiEntries.length).toBeGreaterThan(0);
    expect(aiEntries[0].message).toContain("Conway's Game of Life");

    // Verify fetch was called with context including preset name
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.context.presetName).toBe("Conway's Game of Life");
  });

  it('TestAiWorkflow_CommandExecutionViaAi', async () => {
    await commandRegistry.execute('preset.load', { name: 'conways-gol' });
    expect(useSimStore.getState().activePreset).toBe("Conway's Game of Life");

    // Mock AI returning a command to load gray-scott
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        createMockSSEStream([
          { type: 'delta', content: 'Loading Gray-Scott preset.' },
          { type: 'command', command: { name: 'preset.load', params: { name: 'gray-scott' } } },
          { type: 'done' },
        ]),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );

    const entries: Array<{ type: string; message: string }> = [];
    const addLogEntry = (type: string, message: string) => {
      entries.push({ type, message });
    };

    await service.handleTerminalInput(
      'load gray-scott',
      addLogEntry as (type: 'command' | 'info' | 'error' | 'ai', message: string) => void,
    );

    // Command should have been executed
    expect(useSimStore.getState().activePreset).toBe('Gray-Scott Reaction-Diffusion');

    // Terminal should show the [AI] command
    expect(entries.some((e) => e.type === 'command' && e.message.includes('[AI]'))).toBe(true);
  });

  it('TestAiWorkflow_TypoCorrection', async () => {
    await commandRegistry.execute('preset.load', { name: 'conways-gol' });

    // "sim plya" should be detected as typo
    const commandNames = commandRegistry.list().map((c) => c.name);
    const typoResult = detectPossibleTypo('sim plya', commandNames);
    expect(typoResult.isTypo).toBe(true);

    // Mock AI correcting the typo
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        createMockSSEStream([
          { type: 'delta', content: 'I think you meant "sim play". Starting the simulation.' },
          { type: 'command', command: { name: 'sim.play', params: {} } },
          { type: 'done' },
        ]),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );

    const entries: Array<{ type: string; message: string }> = [];
    const addLogEntry = (type: string, message: string) => {
      entries.push({ type, message });
    };

    await service.handleTerminalInput(
      'sim plya',
      addLogEntry as (type: 'command' | 'info' | 'error' | 'ai', message: string) => void,
    );

    // AI should explain the correction
    const aiEntries = entries.filter((e) => e.type === 'ai' && e.message !== 'thinking...');
    expect(aiEntries.some((e) => e.message.includes('sim play'))).toBe(true);

    // Command should have been executed
    expect(entries.some((e) => e.type === 'command' && e.message.includes('[AI]'))).toBe(true);
  });

  it('TestAiWorkflow_RagCitationInResponse', async () => {
    // Build context with RAG documents
    await commandRegistry.execute('preset.load', { name: 'conways-gol' });
    const state = useSimStore.getState();
    const commands = commandRegistry.list();
    const context = buildAiContext(state, commands);

    const ragDocs = [
      {
        title: "Conway's Game of Life Patterns",
        content: 'The glider is a 5-cell pattern that translates diagonally.',
        category: 'patterns',
        source: 'ca-reference',
        similarity: 0.95,
      },
    ];

    const ragContext = formatRagContext(ragDocs);
    const prompt = buildSystemPrompt(context, [ragContext]);

    // Verify RAG content is in the system prompt
    expect(prompt).toContain('Reference Material');
    expect(prompt).toContain("Conway's Game of Life Patterns");
    expect(prompt).toContain('glider');
    expect(prompt).toContain('ca-reference');
  });

  it('TestAiWorkflow_NoGridStateLeaked', async () => {
    await commandRegistry.execute('preset.load', { name: 'conways-gol' });
    await commandRegistry.execute('sim.step', {});
    await commandRegistry.execute('sim.step', {});

    // Verify the simulation has advanced
    expect(useSimStore.getState().generation).toBe(2);

    // Build context — should be metadata only
    const state = useSimStore.getState();
    const commands = commandRegistry.list();
    const context = buildAiContext(state, commands);

    // Deep inspection: serialize and check for binary data patterns
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain('Float32Array');
    expect(serialized).not.toContain('ArrayBuffer');
    expect(serialized).not.toContain('SharedArrayBuffer');
    expect(serialized).not.toContain('"buffer"');
    expect(serialized).not.toContain('"grid"');
    expect(serialized).not.toContain('"cells"');

    // Verify context has expected structure
    expect(typeof context.generation).toBe('number');
    expect(typeof context.liveCellCount).toBe('number');
    expect(typeof context.gridWidth).toBe('number');
    expect(typeof context.gridHeight).toBe('number');
    expect(typeof context.isRunning).toBe('boolean');
    expect(typeof context.speed).toBe('number');
    expect(Array.isArray(context.recentActions)).toBe(true);
    expect(Array.isArray(context.availableCommands)).toBe(true);

    // Mock fetch and send a message — verify the API payload
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(
        createMockSSEStream([
          { type: 'delta', content: 'OK' },
          { type: 'done' },
        ]),
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    });

    await service.sendMessage('test');

    // Verify the actual API call payload
    const body = JSON.parse(capturedBody!);
    const payloadStr = JSON.stringify(body);
    expect(payloadStr).not.toContain('Float32Array');
    expect(payloadStr).not.toContain('ArrayBuffer');
  });
});
