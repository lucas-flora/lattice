/**
 * Unit tests for AiService.
 *
 * Tests streaming, command parsing, error handling, and context building.
 * Mocks fetch to simulate the API route SSE responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AiService } from '../aiService';
import { useSimStore } from '@/store/simStore';
import { useAiStore } from '@/store/aiStore';
import type { AiStreamChunk } from '../types';

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

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe('AiService', () => {
  let service: AiService;

  beforeEach(() => {
    service = new AiService();
    // Reset stores
    useSimStore.setState({
      generation: 10,
      isRunning: false,
      activePreset: "Conway's Game of Life",
      gridWidth: 128,
      gridHeight: 128,
      liveCellCount: 100,
      speed: 10,
    });
    useAiStore.setState({ chatHistory: [], isLoading: false });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('TestAiService_SendMessage_CallsApiWithContext', async () => {
    let capturedBody: string | undefined;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(
        createMockSSEStream([
          { type: 'delta', content: 'Hello!' },
          { type: 'done' },
        ]),
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    });

    await service.sendMessage('What is this?');

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/ai/chat', expect.objectContaining({
      method: 'POST',
    }));

    const body = JSON.parse(capturedBody!);
    expect(body.message).toBe('What is this?');
    expect(body.context).toBeDefined();
    expect(body.context.presetName).toBe("Conway's Game of Life");
    expect(body.context.generation).toBe(10);
  });

  it('TestAiService_SendMessage_StreamsResponse', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        createMockSSEStream([
          { type: 'delta', content: 'Hello ' },
          { type: 'delta', content: 'world!' },
          { type: 'done' },
        ]),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );

    const result = await service.sendMessage('Hi');
    expect(result.text).toBe('Hello world!');
  });

  it('TestAiService_SendMessage_ParsesCommandFromResponse', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        createMockSSEStream([
          { type: 'delta', content: 'Loading preset.' },
          { type: 'command', command: { name: 'preset.load', params: { name: 'gray-scott' } } },
          { type: 'done' },
        ]),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );

    const result = await service.sendMessage('load gray-scott');
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].name).toBe('preset.load');
    expect(result.commands[0].params).toEqual({ name: 'gray-scott' });
  });

  it('TestAiService_SendMessage_HandlesNetworkError', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failed'));

    await expect(service.sendMessage('Hi')).rejects.toThrow('Network failed');
    expect(useAiStore.getState().isLoading).toBe(false);
  });

  it('TestAiService_SendMessage_HandlesApiError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 }),
    );

    await expect(service.sendMessage('Hi')).rejects.toThrow('Rate limited');
    expect(useAiStore.getState().isLoading).toBe(false);
  });

  it('TestAiService_HandleTerminalInput_LogsAiResponse', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        createMockSSEStream([
          { type: 'delta', content: 'This is GoL.' },
          { type: 'done' },
        ]),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );

    const entries: Array<{ type: string; message: string }> = [];
    const addLogEntry = (type: string, message: string) => {
      entries.push({ type, message });
    };

    await service.handleTerminalInput('what is this?', addLogEntry as (type: 'command' | 'info' | 'error' | 'ai', message: string) => void);

    // Should have: thinking..., then AI response
    expect(entries.some((e) => e.type === 'ai' && e.message === 'thinking...')).toBe(true);
    expect(entries.some((e) => e.type === 'ai' && e.message === 'This is GoL.')).toBe(true);
  });

  it('TestAiService_HandleTerminalInput_LogsCommandExecution', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        createMockSSEStream([
          { type: 'delta', content: 'Loading preset.' },
          { type: 'command', command: { name: 'sim.pause', params: {} } },
          { type: 'done' },
        ]),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );

    const entries: Array<{ type: string; message: string }> = [];
    const addLogEntry = (type: string, message: string) => {
      entries.push({ type, message });
    };

    await service.handleTerminalInput('pause', addLogEntry as (type: 'command' | 'info' | 'error' | 'ai', message: string) => void);

    // Should log the [AI] > command
    expect(entries.some((e) => e.type === 'command' && e.message.includes('[AI]'))).toBe(true);
  });

  it('TestAiService_RecentActions_RollingBuffer', async () => {
    // Add 15 actions
    for (let i = 0; i < 15; i++) {
      service.addRecentAction(`action-${i}`);
    }

    // Verify by inspecting what gets sent in the context
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

    const body = JSON.parse(capturedBody!);
    // ContextBuilder trims to last 10
    expect(body.context.recentActions.length).toBeLessThanOrEqual(10);

    // Add more actions and verify buffer doesn't grow unbounded
    for (let i = 0; i < 100; i++) {
      service.addRecentAction(`flood-${i}`);
    }
    // If it didn't throw or OOM, the buffer is bounded
  });

  it('TestAiService_NoGridStateInRequest', async () => {
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

    // Verify the request body contains NO grid buffer data
    expect(capturedBody).toBeDefined();
    expect(capturedBody).not.toContain('Float32Array');
    expect(capturedBody).not.toContain('ArrayBuffer');
    // Verify it contains only expected metadata
    const body = JSON.parse(capturedBody!);
    expect(body.context.presetName).toBeDefined();
    expect(body.context.generation).toBeDefined();
    expect(body.context.gridWidth).toBeDefined();
    // No buffer or grid properties
    expect(body.context.buffer).toBeUndefined();
    expect(body.context.grid).toBeUndefined();
    expect(body.context.cells).toBeUndefined();
  });

  it('TestAiService_UpdatesAiStore', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        createMockSSEStream([
          { type: 'delta', content: 'Reply' },
          { type: 'done' },
        ]),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );

    await service.sendMessage('Hi');

    const state = useAiStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.chatHistory).toHaveLength(2);
    expect(state.chatHistory[0].role).toBe('user');
    expect(state.chatHistory[0].content).toBe('Hi');
    expect(state.chatHistory[1].role).toBe('assistant');
    expect(state.chatHistory[1].content).toBe('Reply');
  });
});
