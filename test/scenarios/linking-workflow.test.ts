/**
 * Scenario tests for Phase 6: Parameter Linking.
 *
 * Full user workflow tests covering:
 * - GoL with age→alpha link (cells fade with age)
 * - Preset with parameter_links loads and runs correctly
 * - Command-driven linking workflow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/engine/core/EventBus';
import { CommandRegistry } from '../../src/commands/CommandRegistry';
import { SimulationController } from '../../src/commands/SimulationController';
import { registerAllCommands } from '../../src/commands/definitions';
import { wireStores } from '../../src/commands/wireStores';
import { useExpressionStore } from '../../src/store/expressionStore';
import { PresetSchema } from '../../src/engine/preset/schema';

describe('Linking Workflow Scenarios', () => {
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
    useExpressionStore.setState({ tags: [] });
  });

  afterEach(() => {
    unwire();
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestScenario_GoLWithAgeAlphaLink', async () => {
    // Load a preset with alive + age + alpha
    const preset = PresetSchema.parse({
      schema_version: '1',
      meta: { name: 'GoL Age Alpha' },
      grid: { dimensionality: '2d', width: 8, height: 8, topology: 'toroidal' },
      cell_properties: [
        { name: 'alive', type: 'bool', default: 0 },
        { name: 'age', type: 'int', default: 0 },
        { name: 'alpha', type: 'float', default: 1 },
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

    controller.loadPresetConfig(preset);
    const sim = controller.getSimulation()!;

    // Set some cells alive
    const aliveBuf = sim.grid.getCurrentBuffer('alive');
    aliveBuf[0] = 1;
    aliveBuf[1] = 1;
    aliveBuf[2] = 1;

    // Add age→alpha link with smoothstep easing
    const result = await registry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 50],
      targetRange: [1, 0],
      easing: 'smoothstep',
    });
    expect(result.success).toBe(true);

    // Run several ticks
    for (let i = 0; i < 10; i++) {
      sim.tick();
    }

    // After 10 ticks, alive cells should have age=10
    const ageBuf = sim.grid.getCurrentBuffer('age');
    expect(ageBuf[0]).toBe(10);

    // Alpha should be less than 1 (fading), mapped from age 10 in range [0,50]
    const alphaBuf = sim.grid.getCurrentBuffer('alpha');
    expect(alphaBuf[0]).toBeLessThan(1);
    expect(alphaBuf[0]).toBeGreaterThan(0);

    // Dead cells should still have alpha at the mapped value for age=0 (which is 1.0)
    // Dead cells have age=0, mapped to alpha=1
    expect(alphaBuf[10]).toBeCloseTo(1);
  });

  it('TestScenario_PresetWithLinks_LoadAndRun', () => {
    const preset = PresetSchema.parse({
      schema_version: '1',
      meta: { name: 'Linked Preset' },
      grid: { dimensionality: '2d', width: 4, height: 4, topology: 'toroidal' },
      cell_properties: [
        { name: 'alive', type: 'bool', default: 0 },
        { name: 'age', type: 'int', default: 0 },
        { name: 'alpha', type: 'float', default: 1 },
      ],
      params: [
        { name: 'feedRate', type: 'float', default: 0.5, min: 0, max: 1 },
        { name: 'killRate', type: 'float', default: 0.1, min: 0, max: 1 },
      ],
      parameter_links: [
        {
          source: 'env.feedRate',
          target: 'env.killRate',
          sourceRange: [0, 1],
          targetRange: [0, 0.5],
          easing: 'linear',
        },
      ],
      rule: {
        type: 'typescript',
        compute: `
          return { alive: ctx.cell.alive, age: ctx.cell.age, alpha: ctx.cell.alpha };
        `,
      },
    });

    controller.loadPresetConfig(preset);
    const sim = controller.getSimulation()!;

    // Links should be loaded from config into the tag registry
    const linkTags = controller.getTagRegistry()!.getAll().filter(t => t.linkMeta !== undefined);
    expect(linkTags).toHaveLength(1);

    // Tick — link should resolve feedRate→killRate
    sim.tick();

    // feedRate=0.5 mapped from [0,1] to [0,0.5] = 0.25
    expect(sim.getParam('killRate')).toBeCloseTo(0.25);
  });

  it('TestScenario_CommandDrivenLinking', async () => {
    const preset = PresetSchema.parse({
      schema_version: '1',
      meta: { name: 'Command Link Test' },
      grid: { dimensionality: '2d', width: 4, height: 4, topology: 'toroidal' },
      cell_properties: [
        { name: 'alive', type: 'bool', default: 0 },
        { name: 'age', type: 'int', default: 0 },
        { name: 'alpha', type: 'float', default: 1 },
      ],
      global_variables: [
        { name: 'density', type: 'float', default: 0 },
      ],
      rule: {
        type: 'typescript',
        compute: `
          return { alive: ctx.cell.alive, age: ctx.cell.age, alpha: ctx.cell.alpha };
        `,
      },
    });

    controller.loadPresetConfig(preset);

    // Full command-driven workflow
    // 1. Add link via command
    const add1 = await registry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [1, 0],
    });
    expect(add1.success).toBe(true);

    // 2. Verify store updated — expressionStore now holds link tags
    const linkTagsAfterAdd1 = useExpressionStore.getState().tags.filter(t => t.linkMeta !== undefined);
    expect(linkTagsAfterAdd1).toHaveLength(1);

    // 3. Add second link
    const add2 = await registry.execute('link.add', {
      source: 'cell.alive',
      target: 'global.density',
      sourceRange: [0, 1],
      targetRange: [0, 1],
    });
    expect(add2.success).toBe(true);
    const linkTagsAfterAdd2 = useExpressionStore.getState().tags.filter(t => t.linkMeta !== undefined);
    expect(linkTagsAfterAdd2).toHaveLength(2);

    // 4. List links
    const list = await registry.execute('link.list', {});
    expect((list.data as { links: unknown[] }).links).toHaveLength(2);

    // 5. Disable first link
    const id1 = (add1.data as { id: string }).id;
    await registry.execute('link.disable', { id: id1 });
    expect(useExpressionStore.getState().tags.find(t => t.id === id1)?.enabled).toBe(false);

    // 6. Re-enable
    await registry.execute('link.enable', { id: id1 });
    expect(useExpressionStore.getState().tags.find(t => t.id === id1)?.enabled).toBe(true);

    // 7. Remove second link
    const id2 = (add2.data as { id: string }).id;
    await registry.execute('link.remove', { id: id2 });
    const linkTagsAfterRemove = useExpressionStore.getState().tags.filter(t => t.linkMeta !== undefined);
    expect(linkTagsAfterRemove).toHaveLength(1);

    // 8. Clear all
    await registry.execute('link.clear', {});
    const linkTagsAfterClear = useExpressionStore.getState().tags.filter(t => t.linkMeta !== undefined);
    expect(linkTagsAfterClear).toHaveLength(0);
  });
});
