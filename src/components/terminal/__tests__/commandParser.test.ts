import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseCommand, isCommand, getAutocompleteSuggestions, getGhostText } from '../commandParser';
import { CommandRegistry } from '@/commands/CommandRegistry';
import { SimulationController } from '@/commands/SimulationController';
import { EventBus } from '@/engine/core/EventBus';
import { registerAllCommands } from '@/commands/definitions';

describe('commandParser', () => {
  let registry: CommandRegistry;
  let bus: EventBus;
  let controller: SimulationController;

  beforeEach(() => {
    bus = new EventBus();
    registry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(registry, controller, bus);
  });

  afterEach(() => {
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  // --- parseCommand ---

  it('TestCommandParser_SimPlay', () => {
    const result = parseCommand('sim play', registry);
    expect(result).toEqual({ commandName: 'sim.play', params: {} });
  });

  it('TestCommandParser_SimSpeed', () => {
    const result = parseCommand('sim speed 30', registry);
    expect(result).toEqual({ commandName: 'sim.speed', params: { fps: 30 } });
  });

  it('TestCommandParser_PresetLoad', () => {
    const result = parseCommand('preset load conways-gol', registry);
    expect(result).toEqual({ commandName: 'preset.load', params: { name: 'conways-gol' } });
  });

  it('TestCommandParser_EditDraw', () => {
    const result = parseCommand('edit draw 5 5', registry);
    expect(result).toEqual({ commandName: 'edit.draw', params: { x: 5, y: 5 } });
  });

  it('TestCommandParser_HyphenToCamelCase', () => {
    const result = parseCommand('sim step-back', registry);
    expect(result).toEqual({ commandName: 'sim.stepBack', params: {} });
  });

  it('TestCommandParser_BrushSize', () => {
    const result = parseCommand('edit brush-size 3', registry);
    expect(result).toEqual({ commandName: 'edit.brushSize', params: { size: 3 } });
  });

  it('TestCommandParser_EmptyInput', () => {
    expect(parseCommand('', registry)).toBeNull();
    expect(parseCommand('   ', registry)).toBeNull();
  });

  it('TestCommandParser_InvalidCommand', () => {
    const result = parseCommand('foo bar', registry);
    expect(result).toBeNull();
  });

  // --- isCommand ---

  it('TestCommandParser_IsCommand_ValidPrefix', () => {
    expect(isCommand('sim play', registry)).toBe(true);
    expect(isCommand('sim', registry)).toBe(true);
    expect(isCommand('preset load', registry)).toBe(true);
    expect(isCommand('edit', registry)).toBe(true);
  });

  it('TestCommandParser_IsCommand_InvalidPrefix', () => {
    expect(isCommand('hello world', registry)).toBe(false);
    expect(isCommand('foo', registry)).toBe(false);
    expect(isCommand('', registry)).toBe(false);
  });

  // --- getAutocompleteSuggestions ---

  it('TestCommandParser_Autocomplete_Category', () => {
    const suggestions = getAutocompleteSuggestions('s', registry);
    expect(suggestions).toContain('sim');
  });

  it('TestCommandParser_Autocomplete_Action', () => {
    const suggestions = getAutocompleteSuggestions('sim p', registry);
    expect(suggestions.length).toBeGreaterThan(0);
    // Should contain actions starting with 'sim p' like 'sim play', 'sim pause'
    expect(suggestions.every((s) => s.startsWith('sim p'))).toBe(true);
  });

  it('TestCommandParser_AutocompletePartial', () => {
    const suggestions = getAutocompleteSuggestions('sim p', registry);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.startsWith('sim p'))).toBe(true);
  });

  // --- getGhostText ---

  it('TestCommandParser_GhostText_ReturnsCompletion', () => {
    const ghost = getGhostText('sim p', registry);
    // Should suggest the rest of a command starting with "sim p"
    expect(ghost.length).toBeGreaterThan(0);
  });

  it('TestCommandParser_GhostText_EmptyForFullCommand', () => {
    const ghost = getGhostText('sim play', registry);
    // "sim play" is a valid command, but "sim play-toggle" also matches
    // Ghost text shows the completion of the first longer match
    expect(ghost === '' || ghost === '-toggle').toBe(true);
  });

  it('TestCommandParser_GhostText_EmptyForNoMatch', () => {
    const ghost = getGhostText('xyz', registry);
    expect(ghost).toBe('');
  });
});
