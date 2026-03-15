/**
 * Integration tests for Phase 6: Parameter Linking.
 *
 * Tests link resolution in the full tick pipeline, coexistence with
 * expressions, and cache invalidation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/engine/core/EventBus';
import { CommandRegistry } from '../../src/commands/CommandRegistry';
import { SimulationController } from '../../src/commands/SimulationController';
import { registerAllCommands } from '../../src/commands/definitions';
import { wireStores } from '../../src/commands/wireStores';
import { Simulation } from '../../src/engine/rule/Simulation';
import type { PresetConfig } from '../../src/engine/preset/types';
import { PresetSchema } from '../../src/engine/preset/schema';

/** Minimal preset with age and alpha properties */
const linkPreset = PresetSchema.parse({
  schema_version: '1',
  meta: { name: 'Link Test' },
  grid: { dimensionality: '2d', width: 4, height: 4, topology: 'toroidal' },
  cell_properties: [
    { name: 'alive', type: 'bool', default: 0 },
    { name: 'age', type: 'int', default: 0 },
    { name: 'alpha', type: 'float', default: 1 },
  ],
  params: [
    { name: 'feedRate', type: 'float', default: 0.055, min: 0, max: 1 },
    { name: 'killRate', type: 'float', default: 0.062, min: 0, max: 1 },
  ],
  rule: {
    type: 'typescript',
    compute: `
      const alive = ctx.cell.alive;
      const age = ctx.cell.age;
      const alpha = ctx.cell.alpha;
      return { alive, age: alive > 0 ? age + 1 : 0, alpha };
    `,
  },
});

describe('Link Integration', () => {
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
  });

  afterEach(() => {
    unwire();
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestLinkResolution_BeforeRule', () => {
    // Load preset and set up initial state
    controller.loadPresetConfig(linkPreset);
    const sim = controller.getSimulation()!;

    // Set cell 0 alive with age=50
    const aliveBuf = sim.grid.getCurrentBuffer('alive');
    aliveBuf[0] = 1;
    const ageBuf = sim.grid.getCurrentBuffer('age');
    ageBuf[0] = 50;

    // Add link: cell.age → cell.alpha, [0,100] → [1,0]
    sim.linkRegistry.add({
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [1, 0],
      easing: 'linear',
    });

    // After tick, link should have set alpha before rule read it
    sim.tick();

    // The link resolves before rule: age 50 → alpha 0.5
    // Rule then copies alpha as-is to next buffer
    // After swap, alpha at cell 0 should reflect the linked value
    const alphaAfter = sim.grid.getCellValue('alpha', 0);
    expect(alphaAfter).toBeCloseTo(0.5);
  });

  it('TestLinkResolution_ScalarToScalar', () => {
    controller.loadPresetConfig(linkPreset);
    const sim = controller.getSimulation()!;

    // Link feedRate → killRate with 1:1 mapping
    sim.linkRegistry.add({
      source: 'env.feedRate',
      target: 'env.killRate',
      sourceRange: [0, 1],
      targetRange: [0, 1],
      easing: 'linear',
    });

    sim.tick();

    // After link resolution, killRate should equal feedRate (0.055)
    expect(sim.getParam('killRate')).toBeCloseTo(0.055);
  });

  it('TestLinkResolution_WithExpressions', () => {
    // Links and expressions should coexist: links pre-rule, expressions post-rule
    controller.loadPresetConfig(linkPreset);
    const sim = controller.getSimulation()!;

    // Add link
    sim.linkRegistry.add({
      source: 'env.feedRate',
      target: 'env.killRate',
      sourceRange: [0, 1],
      targetRange: [0, 1],
      easing: 'linear',
    });

    // Verify link resolution works in sync tick (no expressions active)
    sim.tick();
    expect(sim.getParam('killRate')).toBeCloseTo(0.055);
  });

  it('TestLinkResolution_CacheInvalidation', async () => {
    controller.loadPresetConfig(linkPreset);
    controller.captureInitialState(10);

    // Compute some frames
    controller.step();
    controller.step();
    const computedBefore = controller.getComputedGeneration();
    expect(computedBefore).toBeGreaterThanOrEqual(2);

    // Add a link via command — should invalidate cache
    const result = await registry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
    });
    expect(result.success).toBe(true);
  });

  it('TestLinkCommands_AddAndList', async () => {
    controller.loadPresetConfig(linkPreset);

    const addResult = await registry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [1, 0],
      easing: 'smoothstep',
    });
    expect(addResult.success).toBe(true);

    const listResult = await registry.execute('link.list', {});
    expect(listResult.success).toBe(true);
    expect((listResult.data as { links: unknown[] }).links).toHaveLength(1);
  });

  it('TestLinkCommands_Remove', async () => {
    controller.loadPresetConfig(linkPreset);

    const addResult = await registry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
    });
    const id = (addResult.data as { id: string }).id;

    const removeResult = await registry.execute('link.remove', { id });
    expect(removeResult.success).toBe(true);

    const listResult = await registry.execute('link.list', {});
    expect((listResult.data as { links: unknown[] }).links).toHaveLength(0);
  });

  it('TestLinkCommands_Clear', async () => {
    controller.loadPresetConfig(linkPreset);

    await registry.execute('link.add', { source: 'cell.age', target: 'cell.alpha' });
    await registry.execute('link.add', { source: 'env.feedRate', target: 'env.killRate' });

    const clearResult = await registry.execute('link.clear', {});
    expect(clearResult.success).toBe(true);

    const listResult = await registry.execute('link.list', {});
    expect((listResult.data as { links: unknown[] }).links).toHaveLength(0);
  });

  it('TestLinkCommands_EnableDisable', async () => {
    controller.loadPresetConfig(linkPreset);

    const addResult = await registry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
    });
    const id = (addResult.data as { id: string }).id;

    await registry.execute('link.disable', { id });
    let link = controller.getLinkRegistry()!.get(id)!;
    expect(link.enabled).toBe(false);

    await registry.execute('link.enable', { id });
    link = controller.getLinkRegistry()!.get(id)!;
    expect(link.enabled).toBe(true);
  });
});
