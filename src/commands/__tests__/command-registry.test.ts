import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { CommandRegistry } from '../CommandRegistry';
import type { CommandDefinition } from '../types';

function makeCommand(overrides: Partial<CommandDefinition> = {}): CommandDefinition {
  return {
    name: 'test.command',
    description: 'A test command',
    category: 'test',
    params: z.object({}).describe('none'),
    execute: vi.fn(async () => ({ success: true })),
    ...overrides,
  };
}

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  it('TestCommandRegistry_RegisterAndList', () => {
    const cmd = makeCommand();
    registry.register(cmd);
    const list = registry.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('test.command');
    expect(list[0].description).toBe('A test command');
    expect(list[0].category).toBe('test');
  });

  it('TestCommandRegistry_ListReturnsTypedCatalog', () => {
    registry.register(makeCommand({ name: 'sim.play', category: 'sim', description: 'Start simulation' }));
    registry.register(makeCommand({ name: 'sim.pause', category: 'sim', description: 'Pause simulation' }));
    registry.register(makeCommand({ name: 'preset.load', category: 'preset', description: 'Load preset',
      params: z.object({ name: z.string() }).describe('{ name: string }'),
    }));

    const list = registry.list();
    expect(list).toHaveLength(3);

    // Sorted alphabetically
    expect(list[0].name).toBe('preset.load');
    expect(list[1].name).toBe('sim.pause');
    expect(list[2].name).toBe('sim.play');

    // Each entry has full metadata
    for (const entry of list) {
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('description');
      expect(entry).toHaveProperty('category');
      expect(entry).toHaveProperty('paramsDescription');
    }
  });

  it('TestCommandRegistry_ExecuteCallsHandler', async () => {
    const executeFn = vi.fn(async () => ({ success: true, data: 'ok' }));
    registry.register(makeCommand({ execute: executeFn }));

    const result = await registry.execute('test.command', {});
    expect(executeFn).toHaveBeenCalledWith({});
    expect(result.success).toBe(true);
    expect(result.data).toBe('ok');
  });

  it('TestCommandRegistry_ExecuteValidatesParams', async () => {
    registry.register(makeCommand({
      name: 'needs.params',
      params: z.object({ name: z.string() }).describe('{ name: string }'),
    }));

    // Missing required param
    const result = await registry.execute('needs.params', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid params');
    expect(result.error).toContain('name');
  });

  it('TestCommandRegistry_ExecuteUnknownCommand', async () => {
    const result = await registry.execute('nonexistent.command', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown command');
    expect(result.error).toContain('nonexistent.command');
  });

  it('TestCommandRegistry_GetReturnsDefinition', () => {
    const cmd = makeCommand();
    registry.register(cmd);
    const retrieved = registry.get('test.command');
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('test.command');
    expect(retrieved!.execute).toBe(cmd.execute);
  });

  it('TestCommandRegistry_GetUnknownReturnsUndefined', () => {
    const result = registry.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('TestCommandRegistry_DuplicateRegistrationThrows', () => {
    registry.register(makeCommand());
    expect(() => registry.register(makeCommand())).toThrow('already registered');
  });

  it('TestCommandRegistry_AsyncCommands', async () => {
    let resolved = false;
    registry.register(makeCommand({
      execute: async () => {
        await new Promise((r) => setTimeout(r, 10));
        resolved = true;
        return { success: true };
      },
    }));

    const result = await registry.execute('test.command', {});
    expect(resolved).toBe(true);
    expect(result.success).toBe(true);
  });

  it('TestCommandRegistry_ClearRemovesAll', () => {
    registry.register(makeCommand({ name: 'cmd.a' }));
    registry.register(makeCommand({ name: 'cmd.b' }));
    expect(registry.size).toBe(2);
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.list()).toHaveLength(0);
  });

  it('TestCommandRegistry_ExecuteCatchesErrors', async () => {
    registry.register(makeCommand({
      execute: async () => { throw new Error('Something broke'); },
    }));

    const result = await registry.execute('test.command', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Something broke');
  });

  it('TestCommandRegistry_HasCommand', () => {
    registry.register(makeCommand());
    expect(registry.has('test.command')).toBe(true);
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('TestCommandRegistry_ExecutePassesValidatedParams', async () => {
    const executeFn = vi.fn(async (params: { name: string }) => ({
      success: true,
      data: params.name,
    }));

    registry.register(makeCommand({
      name: 'preset.load',
      params: z.object({ name: z.string() }).describe('{ name: string }'),
      execute: executeFn as CommandDefinition['execute'],
    }));

    const result = await registry.execute('preset.load', { name: 'conways-gol' });
    expect(result.success).toBe(true);
    expect(executeFn).toHaveBeenCalledWith({ name: 'conways-gol' });
  });
});
