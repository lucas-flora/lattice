/**
 * Integration tests for ExpressionTag system: commands -> engine -> EventBus -> store.
 *
 * Verifies that link.add, expr.set, and tag.* commands correctly create/update
 * ExpressionTags in the unified registry and propagate state to the expressionStore.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../engine/core/EventBus';
import { CommandRegistry } from '../CommandRegistry';
import { SimulationController } from '../SimulationController';
import { registerAllCommands } from '../definitions';
import { wireStores } from '../wireStores';
import { useExpressionStore } from '../../store/expressionStore';
import { _resetTagIdCounter } from '../../engine/expression/ExpressionTagRegistry';

describe('ExpressionTag Integration', () => {
  let bus: EventBus;
  let registry: CommandRegistry;
  let controller: SimulationController;
  let cleanup: () => void;

  beforeEach(() => {
    bus = new EventBus();
    registry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(registry, controller, bus);
    cleanup = wireStores(bus);
    controller.loadPreset('conways-gol');
    _resetTagIdCounter();
  });

  afterEach(() => {
    controller.dispose();
    cleanup();
    registry.clear();
    bus.clear();
  });

  it('TestIntegration_LinkAdd_CreatesTag_StoreUpdates', async () => {
    const result = await registry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'linear',
    });
    expect(result.success).toBe(true);

    const tags = useExpressionStore.getState().tags;
    expect(tags.length).toBeGreaterThanOrEqual(1);

    const linkTag = tags.find((t) => t.source === 'link');
    expect(linkTag).toBeDefined();
    expect(linkTag!.outputs).toContain('cell.alpha');
    expect(linkTag!.inputs).toContain('cell.age');
    expect(linkTag!.linkMeta).toBeDefined();
    expect(linkTag!.linkMeta!.sourceAddress).toBe('cell.age');
    expect(linkTag!.linkMeta!.sourceRange).toEqual([0, 100]);
    expect(linkTag!.linkMeta!.targetRange).toEqual([0, 1]);
    expect(linkTag!.linkMeta!.easing).toBe('linear');
    expect(linkTag!.enabled).toBe(true);
    expect(linkTag!.phase).toBe('pre-rule');
  });

  it('TestIntegration_ExprSet_CreatesTag_StoreUpdates', async () => {
    const result = await registry.execute('expr.set', {
      property: 'alpha',
      expression: 'age / 100',
    });
    expect(result.success).toBe(true);

    const tags = useExpressionStore.getState().tags;
    expect(tags.length).toBeGreaterThanOrEqual(1);

    const codeTag = tags.find((t) => t.source === 'code');
    expect(codeTag).toBeDefined();
    expect(codeTag!.outputs).toContain('cell.alpha');
    expect(codeTag!.code).toBe('age / 100');
    expect(codeTag!.enabled).toBe(true);
    expect(codeTag!.phase).toBe('post-rule');
  });

  it('TestIntegration_TagList_ReturnsAllTags', async () => {
    // Add a link tag
    await registry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'linear',
    });

    // Add an expression tag
    await registry.execute('expr.set', {
      property: 'alive',
      expression: 'int(age > 0)',
    });

    // List tags via command
    const result = await registry.execute('tag.list', {});
    expect(result.success).toBe(true);
    expect(result.data.tags.length).toBeGreaterThanOrEqual(2);

    const sources = result.data.tags.map((t: { source: string }) => t.source);
    expect(sources).toContain('link');
    expect(sources).toContain('code');
  });

  it('TestIntegration_TagShow_ReturnsFullDetails', async () => {
    // Add a link
    await registry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 50],
      targetRange: [0, 1],
      easing: 'smoothstep',
    });

    // Get the tag ID from the store
    const tags = useExpressionStore.getState().tags;
    const linkTag = tags.find((t) => t.source === 'link');
    expect(linkTag).toBeDefined();

    // Show full details via command
    const result = await registry.execute('tag.show', { id: linkTag!.id });
    expect(result.success).toBe(true);
    expect(result.data.id).toBe(linkTag!.id);
    expect(result.data.source).toBe('link');
    expect(result.data.linkMeta).toBeDefined();
    expect(result.data.linkMeta.sourceAddress).toBe('cell.age');
    expect(result.data.linkMeta.easing).toBe('smoothstep');
    expect(result.data.outputs).toContain('cell.alpha');
    expect(result.data.code).toBeDefined();
    expect(result.data.enabled).toBe(true);
  });

  it('TestIntegration_TagSetPhase_ChangesPhase', async () => {
    // Add an expression tag (defaults to post-rule)
    await registry.execute('expr.set', {
      property: 'alpha',
      expression: 'age / 100',
    });

    const tags = useExpressionStore.getState().tags;
    const codeTag = tags.find((t) => t.source === 'code');
    expect(codeTag).toBeDefined();
    expect(codeTag!.phase).toBe('post-rule');

    // Change phase via command
    const result = await registry.execute('tag.setPhase', {
      id: codeTag!.id,
      phase: 'pre-rule',
    });
    expect(result.success).toBe(true);

    // Verify store reflects the phase change
    const updatedTags = useExpressionStore.getState().tags;
    const updatedTag = updatedTags.find((t) => t.id === codeTag!.id);
    expect(updatedTag).toBeDefined();
    expect(updatedTag!.phase).toBe('pre-rule');
  });

  it('TestIntegration_TagEnableDisable_UpdatesStore', async () => {
    // Add a link tag (starts enabled)
    await registry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'linear',
    });

    const tags = useExpressionStore.getState().tags;
    const linkTag = tags.find((t) => t.source === 'link');
    expect(linkTag).toBeDefined();
    expect(linkTag!.enabled).toBe(true);

    // Disable via command
    const disableResult = await registry.execute('tag.disable', { id: linkTag!.id });
    expect(disableResult.success).toBe(true);

    // Verify store reflects disabled
    const afterDisable = useExpressionStore.getState().tags.find((t) => t.id === linkTag!.id);
    expect(afterDisable).toBeDefined();
    expect(afterDisable!.enabled).toBe(false);

    // Enable again via command
    const enableResult = await registry.execute('tag.enable', { id: linkTag!.id });
    expect(enableResult.success).toBe(true);

    // Verify store reflects re-enabled
    const afterEnable = useExpressionStore.getState().tags.find((t) => t.id === linkTag!.id);
    expect(afterEnable).toBeDefined();
    expect(afterEnable!.enabled).toBe(true);
  });
});
