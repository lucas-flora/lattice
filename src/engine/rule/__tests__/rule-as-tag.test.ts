/**
 * Tests for SG-6: Rule-as-Tag — the simulation rule represented as an ExpressionTag.
 *
 * Verifies:
 *   - Loading a preset creates a rule tag with phase: 'rule'
 *   - The rule tag contains correct metadata (name, code, phase, owner)
 *   - Disabling the rule tag causes the simulation to skip rule execution (no-op tick)
 *   - Re-enabling the rule tag restores normal behavior
 *   - tickN respects rule tag enabled state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadPresetOrThrow } from '../../preset/loader';
import { Simulation } from '../Simulation';
import { _resetTagIdCounter } from '../../expression/ExpressionTagRegistry';

const PRESET_YAML = `
schema_version: "1"
meta:
  name: "Rule Tag Test"
grid:
  dimensionality: "2d"
  width: 4
  height: 4
  topology: "toroidal"
cell_properties:
  - name: "alive"
    type: "bool"
    default: 0
    role: "input_output"
rule:
  type: "typescript"
  compute: |
    const alive = ctx.cell.alive;
    const liveNeighbors = ctx.neighbors.filter(n => n.alive === 1).length;
    if (alive === 1) {
      return { alive: (liveNeighbors === 2 || liveNeighbors === 3) ? 1 : 0 };
    }
    return { alive: liveNeighbors === 3 ? 1 : 0 };
`;

const SIMPLE_PRESET_YAML = `
schema_version: "1"
meta:
  name: "Simple Setter"
grid:
  dimensionality: "2d"
  width: 4
  height: 4
  topology: "toroidal"
cell_properties:
  - name: "state"
    type: "float"
    default: 0
rule:
  type: "typescript"
  compute: |
    return { state: 1 };
`;

describe('SG-6: Rule-as-Tag', () => {
  beforeEach(() => {
    _resetTagIdCounter();
  });

  it('TestSimulation_PresetLoadCreatesRuleTag', () => {
    const preset = loadPresetOrThrow(PRESET_YAML);
    const sim = new Simulation(preset);

    const allTags = sim.tagRegistry.getAll();
    const ruleTags = allTags.filter(t => t.phase === 'rule');

    expect(ruleTags.length).toBe(1);
  });

  it('TestSimulation_RuleTagHasCorrectMetadata', () => {
    const preset = loadPresetOrThrow(PRESET_YAML);
    const sim = new Simulation(preset);

    const ruleTag = sim.tagRegistry.getRuleTag();
    expect(ruleTag).toBeDefined();
    expect(ruleTag!.phase).toBe('rule');
    expect(ruleTag!.name).toBe('Rule Tag Test Rule');
    expect(ruleTag!.owner.type).toBe('root');
    expect(ruleTag!.enabled).toBe(true);
    expect(ruleTag!.source).toBe('code');
    expect(ruleTag!.inputs).toEqual(['cell.*']);
    expect(ruleTag!.outputs).toEqual(['cell.*']);
    expect(ruleTag!.code).toContain('ctx.cell.alive');
    expect(ruleTag!.code).toContain('ctx.neighbors');
  });

  it('TestSimulation_RuleTagEnabledRunsNormally', () => {
    const preset = loadPresetOrThrow(SIMPLE_PRESET_YAML);
    const sim = new Simulation(preset);

    // Rule sets all cells to state=1
    sim.tick();

    // All cells should be 1 after the rule runs
    for (let i = 0; i < sim.grid.cellCount; i++) {
      expect(sim.getCellDirect('state', i)).toBe(1);
    }
  });

  it('TestSimulation_DisabledRuleTagSkipsRule', () => {
    const preset = loadPresetOrThrow(SIMPLE_PRESET_YAML);
    const sim = new Simulation(preset);

    // Disable the rule tag
    const ruleTag = sim.tagRegistry.getRuleTag();
    expect(ruleTag).toBeDefined();
    sim.tagRegistry.disable(ruleTag!.id);

    // Tick should be a no-op for the rule (state stays 0)
    const result = sim.tick();
    expect(result.generation).toBe(1);

    // All cells should still be 0 (rule didn't run)
    for (let i = 0; i < sim.grid.cellCount; i++) {
      expect(sim.getCellDirect('state', i)).toBe(0);
    }
  });

  it('TestSimulation_ReEnablingRuleTagRestoresBehavior', () => {
    const preset = loadPresetOrThrow(SIMPLE_PRESET_YAML);
    const sim = new Simulation(preset);

    // Disable rule tag
    const ruleTag = sim.tagRegistry.getRuleTag();
    sim.tagRegistry.disable(ruleTag!.id);

    // Tick with disabled rule
    sim.tick();
    expect(sim.getCellDirect('state', 0)).toBe(0);

    // Re-enable rule tag
    sim.tagRegistry.enable(ruleTag!.id);

    // Tick again — rule should now run
    sim.tick();
    for (let i = 0; i < sim.grid.cellCount; i++) {
      expect(sim.getCellDirect('state', i)).toBe(1);
    }
  });

  it('TestSimulation_DisabledRuleTagAdvancesGeneration', () => {
    const preset = loadPresetOrThrow(SIMPLE_PRESET_YAML);
    const sim = new Simulation(preset);

    const ruleTag = sim.tagRegistry.getRuleTag();
    sim.tagRegistry.disable(ruleTag!.id);

    expect(sim.getGeneration()).toBe(0);
    sim.tick();
    expect(sim.getGeneration()).toBe(1);
    sim.tick();
    expect(sim.getGeneration()).toBe(2);
  });

  it('TestSimulation_TickNRespectsDisabledRuleTag', () => {
    const preset = loadPresetOrThrow(SIMPLE_PRESET_YAML);
    const sim = new Simulation(preset);

    const ruleTag = sim.tagRegistry.getRuleTag();
    sim.tagRegistry.disable(ruleTag!.id);

    sim.tickN(5);
    expect(sim.getGeneration()).toBe(5);

    // State should still be 0 (rule never ran)
    for (let i = 0; i < sim.grid.cellCount; i++) {
      expect(sim.getCellDirect('state', i)).toBe(0);
    }
  });

  it('TestSimulation_RuleTagCodeMatchesPresetComputeBody', () => {
    const preset = loadPresetOrThrow(PRESET_YAML);
    const sim = new Simulation(preset);

    const ruleTag = sim.tagRegistry.getRuleTag();
    // The rule tag's code should be the preset's compute body
    expect(ruleTag!.code).toBe(preset.rule.compute);
  });

  it('TestSimulation_NoRuleTagFallsBackToLegacy', () => {
    const preset = loadPresetOrThrow(SIMPLE_PRESET_YAML);
    const sim = new Simulation(preset);

    // Remove the rule tag to simulate legacy behavior
    const ruleTag = sim.tagRegistry.getRuleTag();
    sim.tagRegistry.remove(ruleTag!.id);

    // With no rule tag, rule should still run (legacy path)
    sim.tick();
    for (let i = 0; i < sim.grid.cellCount; i++) {
      expect(sim.getCellDirect('state', i)).toBe(1);
    }
  });

  it('TestSimulation_PresetWithLinksCreatesRuleTagToo', () => {
    const yamlWithLinks = `
schema_version: "1"
meta:
  name: "Links + Rule"
grid:
  dimensionality: "2d"
  width: 4
  height: 4
  topology: "toroidal"
cell_properties:
  - name: "state"
    type: "float"
    default: 0
rule:
  type: "typescript"
  compute: |
    return { state: 1 };
parameter_links:
  - source: "env.feedRate"
    target: "env.killRate"
    sourceRange: [0, 1]
    targetRange: [0, 1]
    easing: "linear"
params:
  - name: "feedRate"
    type: "float"
    default: 0.5
    min: 0
    max: 1
  - name: "killRate"
    type: "float"
    default: 0.5
    min: 0
    max: 1
`;
    const preset = loadPresetOrThrow(yamlWithLinks);
    const sim = new Simulation(preset);

    const allTags = sim.tagRegistry.getAll();
    // Should have both link tags and the rule tag
    const ruleTags = allTags.filter(t => t.phase === 'rule');
    const linkTags = allTags.filter(t => t.phase === 'pre-rule');

    expect(ruleTags.length).toBe(1);
    expect(linkTags.length).toBe(1);
    expect(ruleTags[0].name).toBe('Links + Rule Rule');
  });
});
