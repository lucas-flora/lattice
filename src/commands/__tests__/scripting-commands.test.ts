/**
 * Tests for scripting commands: var.*, expr.*, script.*
 *
 * Unit tests verifying command registration and basic execution.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../engine/core/EventBus';
import { CommandRegistry } from '../CommandRegistry';
import { SimulationController } from '../SimulationController';
import { registerAllCommands } from '../definitions';

describe('Variable Commands', () => {
  let bus: EventBus;
  let registry: CommandRegistry;
  let controller: SimulationController;

  beforeEach(() => {
    bus = new EventBus();
    registry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(registry, controller, bus);
    controller.loadPreset('conways-gol');
  });

  afterEach(() => {
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestVariableCommands_SetAndGet', async () => {
    const setResult = await registry.execute('var.set', { name: 'myVar', value: 42 });
    expect(setResult.success).toBe(true);

    const getResult = await registry.execute('var.get', { name: 'myVar' });
    expect(getResult.success).toBe(true);
    expect(getResult.data).toEqual({ name: 'myVar', value: 42 });
  });

  it('TestVariableCommands_ListAll', async () => {
    await registry.execute('var.set', { name: 'a', value: 1 });
    await registry.execute('var.set', { name: 'b', value: 2 });

    const result = await registry.execute('var.list', {});
    expect(result.success).toBe(true);
    expect(Object.keys(result.data.variables)).toContain('a');
    expect(Object.keys(result.data.variables)).toContain('b');
  });

  it('TestVariableCommands_DeleteExisting', async () => {
    await registry.execute('var.set', { name: 'temp', value: 99 });
    const delResult = await registry.execute('var.delete', { name: 'temp' });
    expect(delResult.success).toBe(true);

    const getResult = await registry.execute('var.get', { name: 'temp' });
    expect(getResult.success).toBe(false);
  });

  it('TestVariableCommands_DeleteNonexistent', async () => {
    const result = await registry.execute('var.delete', { name: 'nope' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('TestVariableCommands_GetNonexistent', async () => {
    const result = await registry.execute('var.get', { name: 'nope' });
    expect(result.success).toBe(false);
  });
});

describe('Expression Commands', () => {
  let bus: EventBus;
  let registry: CommandRegistry;
  let controller: SimulationController;

  beforeEach(() => {
    bus = new EventBus();
    registry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(registry, controller, bus);
    controller.loadPreset('conways-gol');
  });

  afterEach(() => {
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestExpressionCommands_SetAndList', async () => {
    // expr.set lazily creates PyodideBridge + ExpressionEngine
    const result = await registry.execute('expr.set', { property: 'alpha', expression: '0.5' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ property: 'alpha', expression: '0.5' });

    // Verify it shows in list
    const listResult = await registry.execute('expr.list', {});
    expect(listResult.success).toBe(true);
    expect(listResult.data.expressions['alpha']).toBe('0.5');
  });

  it('TestExpressionCommands_InvalidProperty', async () => {
    const result = await registry.execute('expr.set', { property: 'nonexistent', expression: '0.5' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown property');
  });

  it('TestExpressionCommands_ListEmpty', async () => {
    const result = await registry.execute('expr.list', {});
    expect(result.success).toBe(true);
    expect(result.data.expressions).toEqual({});
  });
});

describe('Script Commands', () => {
  let bus: EventBus;
  let registry: CommandRegistry;
  let controller: SimulationController;

  beforeEach(() => {
    bus = new EventBus();
    registry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(registry, controller, bus);
    controller.loadPreset('conways-gol');
  });

  afterEach(() => {
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestScriptCommands_ListEmpty', async () => {
    const result = await registry.execute('script.list', {});
    expect(result.success).toBe(true);
    expect(result.data.scripts).toEqual([]);
  });

  it('TestScriptCommands_AddAndList', async () => {
    // script.add lazily creates PyodideBridge + GlobalScriptRunner
    const addResult = await registry.execute('script.add', {
      name: 'test',
      code: 'pass',
    });
    expect(addResult.success).toBe(true);

    const listResult = await registry.execute('script.list', {});
    expect(listResult.success).toBe(true);
    expect(listResult.data.scripts.length).toBe(1);
    expect(listResult.data.scripts[0].name).toBe('test');
  });

  it('TestScriptCommands_RemoveNonexistent', async () => {
    const result = await registry.execute('script.remove', { name: 'nope' });
    expect(result.success).toBe(false);
  });
});
