import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseCommand, isCommand, getAutocompleteSuggestions, getGhostText, getCycleCandidates, learningModel } from '../commandParser';
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

  // --- dot notation ---

  it('TestCommandParser_DotNotation_GridResize', () => {
    const result = parseCommand('grid.resize 128 128', registry);
    expect(result).toEqual({ commandName: 'grid.resize', params: { width: 128, height: 128 } });
  });

  it('TestCommandParser_DotNotation_SimPlay', () => {
    const result = parseCommand('sim.play', registry);
    expect(result).toEqual({ commandName: 'sim.play', params: {} });
  });

  it('TestCommandParser_DotNotation_ParamSet', () => {
    const result = parseCommand('param.set F 0.05', registry);
    expect(result).toEqual({ commandName: 'param.set', params: { name: 'F', value: 0.05 } });
  });

  it('TestCommandParser_DotNotation_Invalid', () => {
    const result = parseCommand('foo.bar', registry);
    expect(result).toBeNull();
  });

  // --- new param/grid/rule commands ---

  it('TestCommandParser_ParamSet', () => {
    const result = parseCommand('param set F 0.05', registry);
    expect(result).toEqual({ commandName: 'param.set', params: { name: 'F', value: 0.05 } });
  });

  it('TestCommandParser_GridResize', () => {
    const result = parseCommand('grid resize 256 256', registry);
    expect(result).toEqual({ commandName: 'grid.resize', params: { width: 256, height: 256 } });
  });

  it('TestCommandParser_GridResizeWidthOnly', () => {
    const result = parseCommand('grid resize 64', registry);
    expect(result).toEqual({ commandName: 'grid.resize', params: { width: 64 } });
  });

  it('TestCommandParser_ParamList', () => {
    const result = parseCommand('param list', registry);
    expect(result).toEqual({ commandName: 'param.list', params: {} });
  });

  it('TestCommandParser_RuleShow', () => {
    const result = parseCommand('rule show', registry);
    expect(result).toEqual({ commandName: 'rule.show', params: {} });
  });

  // --- isCommand ---

  it('TestCommandParser_IsCommand_ValidPrefix', () => {
    expect(isCommand('sim play', registry)).toBe(true);
    expect(isCommand('sim', registry)).toBe(true);
    expect(isCommand('preset load', registry)).toBe(true);
    expect(isCommand('edit', registry)).toBe(true);
    expect(isCommand('grid', registry)).toBe(true);
    expect(isCommand('param', registry)).toBe(true);
    expect(isCommand('rule', registry)).toBe(true);
  });

  it('TestCommandParser_IsCommand_DotNotation', () => {
    expect(isCommand('sim.play', registry)).toBe(true);
    expect(isCommand('grid.resize', registry)).toBe(true);
    expect(isCommand('param.set F 0.05', registry)).toBe(true);
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

  it('TestCommandParser_Autocomplete_NewCategories', () => {
    const suggestions = getAutocompleteSuggestions('g', registry);
    expect(suggestions).toContain('grid');
    const pSuggestions = getAutocompleteSuggestions('p', registry);
    expect(pSuggestions).toContain('param');
    expect(pSuggestions).toContain('preset');
    const rSuggestions = getAutocompleteSuggestions('r', registry);
    expect(rSuggestions).toContain('rule');
  });

  it('TestCommandParser_Autocomplete_Action', () => {
    const suggestions = getAutocompleteSuggestions('sim p', registry);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.startsWith('sim p'))).toBe(true);
  });

  it('TestCommandParser_Autocomplete_GridSubcommands', () => {
    const suggestions = getAutocompleteSuggestions('grid ', registry);
    expect(suggestions).toContain('grid info');
    expect(suggestions).toContain('grid resize');
  });

  it('TestCommandParser_Autocomplete_ParamSubcommands', () => {
    const suggestions = getAutocompleteSuggestions('param ', registry);
    expect(suggestions).toContain('param set');
    expect(suggestions).toContain('param get');
    expect(suggestions).toContain('param list');
    expect(suggestions).toContain('param reset');
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

  it('TestCommandParser_GhostText_CategoryToSubcommand', () => {
    // After typing "grid " with trailing space, ghost should show a subcommand
    const ghost = getGhostText('grid ', registry);
    expect(ghost.length).toBeGreaterThan(0);
  });

  it('TestCommandParser_GhostText_ArgHints', () => {
    // After completing "grid resize ", ghost should show arg hints
    const ghost = getGhostText('grid resize ', registry);
    expect(ghost).toBe('<width> [height]');
  });

  it('TestCommandParser_GhostText_ParamSetArgHints', () => {
    const ghost = getGhostText('param set ', registry);
    expect(ghost).toBe('<name> <value>');
  });

  it('TestCommandParser_GhostText_PartialArgHints', () => {
    // After typing one arg, show remaining hints
    const ghost = getGhostText('grid resize 128 ', registry);
    expect(ghost).toBe('[height]');
  });

  it('TestCommandParser_GhostText_EmptyForNoMatch', () => {
    const ghost = getGhostText('xyz', registry);
    expect(ghost).toBe('');
  });

  // --- getCycleCandidates ---

  it('TestCommandParser_CycleCandidates_CategoryReturnsSubcommands', () => {
    const candidates = getCycleCandidates('grid', registry);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.startsWith('grid '))).toBe(true);
    // Should contain both grid subcommands
    expect(candidates).toContain('grid info');
    expect(candidates).toContain('grid resize');
  });

  it('TestCommandParser_CycleCandidates_SubcommandReturnsSiblings', () => {
    const candidates = getCycleCandidates('grid info', registry);
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates).toContain('grid info');
    expect(candidates).toContain('grid resize');
  });

  it('TestCommandParser_CycleCandidates_EmptyForUnknown', () => {
    const candidates = getCycleCandidates('xyz', registry);
    expect(candidates).toEqual([]);
  });

  // --- learningModel ---

  it('TestCommandParser_LearningModel_RanksRecentHigher', () => {
    // Record usage of grid.resize
    learningModel.record('grid.resize');

    const candidates = getCycleCandidates('grid', registry);
    // grid resize should now be ranked first
    expect(candidates[0]).toBe('grid resize');
  });

  it('TestCommandParser_LearningModel_AffectsGhostText', () => {
    // Record usage of param.reset so it ranks above default ordering
    learningModel.record('param.reset');
    learningModel.record('param.reset');
    learningModel.record('param.reset');

    const ghost = getGhostText('param ', registry);
    expect(ghost).toBe('reset');
  });
});
