/**
 * Integration tests for the tag-centric UI.
 *
 * Verifies that tag commands (tag.add, tag.remove) and legacy commands
 * (link.add, expr.set, script.add) correctly update the expressionStore
 * via the EventBus wiring.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../engine/core/EventBus';
import { CommandRegistry } from '../CommandRegistry';
import { SimulationController } from '../SimulationController';
import { registerAllCommands } from '../definitions';
import { wireStores } from '../wireStores';
import { useExpressionStore } from '../../store/expressionStore';
import { _resetTagIdCounter } from '../../engine/expression/ExpressionTagRegistry';

describe('Tag UI Integration', () => {
  let bus: EventBus;
  let registry: CommandRegistry;
  let controller: SimulationController;
  let unsubscribe: () => void;

  beforeEach(() => {
    _resetTagIdCounter();
    bus = new EventBus();
    registry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(registry, controller, bus);
    controller.loadPreset('conways-gol');
    unsubscribe = wireStores(bus);
  });

  afterEach(() => {
    unsubscribe();
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestTagUI_AddViaTagAdd_AppearsInStore', async () => {
    // Create a code-source tag via tag.add
    const result = await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });
    expect(result.success).toBe(true);

    // Verify the tag appeared in the expressionStore (rule tag also present)
    const tags = useExpressionStore.getState().tags;
    const nonRuleTags = tags.filter(t => t.phase !== 'rule');
    expect(nonRuleTags.length).toBe(1);

    const tag = nonRuleTags[0];
    expect(tag.source).toBe('code');
    expect(tag.code).toBe('age / 100');
    expect(tag.outputs).toContain('cell.alpha');
    expect(tag.enabled).toBe(true);
    expect(tag.phase).toBe('post-rule');
  });

  it('TestTagUI_RemoveViaTagRemove_DisappearsFromStore', async () => {
    // Add a tag first
    const addResult = await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });
    expect(addResult.success).toBe(true);

    // Verify it is in the store (rule tag + new tag)
    let tags = useExpressionStore.getState().tags;
    let nonRuleTags = tags.filter(t => t.phase !== 'rule');
    expect(nonRuleTags.length).toBe(1);
    const tagId = nonRuleTags[0].id;

    // Remove it
    const removeResult = await registry.execute('tag.remove', { id: tagId });
    expect(removeResult.success).toBe(true);

    // Verify only the rule tag remains
    tags = useExpressionStore.getState().tags;
    nonRuleTags = tags.filter(t => t.phase !== 'rule');
    expect(nonRuleTags.length).toBe(0);
  });

  it('TestTagUI_LegacyLinkAdd_StillCreatesTag', async () => {
    // Use the legacy link.add command
    const result = await registry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'linear',
    });
    expect(result.success).toBe(true);

    // Verify a tag was created in expressionStore
    const tags = useExpressionStore.getState().tags;
    expect(tags.length).toBeGreaterThanOrEqual(1);

    const linkTag = tags.find((t) => t.linkMeta !== undefined);
    expect(linkTag).toBeDefined();
    expect(linkTag!.source).toBe('code');
    expect(linkTag!.inputs).toContain('cell.age');
    expect(linkTag!.outputs).toContain('cell.alpha');
    expect(linkTag!.linkMeta).toBeDefined();
    expect(linkTag!.linkMeta!.sourceAddress).toBe('cell.age');
    expect(linkTag!.linkMeta!.sourceRange).toEqual([0, 100]);
    expect(linkTag!.linkMeta!.targetRange).toEqual([0, 1]);
    expect(linkTag!.linkMeta!.easing).toBe('linear');
    expect(linkTag!.phase).toBe('pre-rule');
    expect(linkTag!.enabled).toBe(true);
  });

  it('TestTagUI_LegacyExprSet_StillCreatesTag', async () => {
    // Use the legacy expr.set command
    const result = await registry.execute('expr.set', {
      property: 'alpha',
      expression: 'age / 100',
    });
    expect(result.success).toBe(true);

    // Verify a tag was created in expressionStore
    const tags = useExpressionStore.getState().tags;
    expect(tags.length).toBeGreaterThanOrEqual(1);

    const codeTag = tags.find((t) => t.source === 'code' && t.phase !== 'rule');
    expect(codeTag).toBeDefined();
    expect(codeTag!.outputs).toContain('cell.alpha');
    expect(codeTag!.code).toBe('age / 100');
    expect(codeTag!.phase).toBe('post-rule');
    expect(codeTag!.enabled).toBe(true);
  });

  it('TestTagUI_LegacyScriptAdd_NowCreatesTag', async () => {
    // Use the legacy script.add command
    // Note: inputs and outputs must not overlap to avoid cycle detection
    const result = await registry.execute('script.add', {
      name: 'decay',
      code: 'grid["alpha"] *= 0.99',
      inputs: ['cell.age'],
      outputs: ['cell.alpha'],
    });
    expect(result.success).toBe(true);

    // Verify a tag was created in expressionStore
    const tags = useExpressionStore.getState().tags;
    expect(tags.length).toBeGreaterThanOrEqual(1);

    const scriptTag = tags.find((t) => t.source === 'script');
    expect(scriptTag).toBeDefined();
    expect(scriptTag!.name).toBe('decay');
    expect(scriptTag!.code).toBe('grid["alpha"] *= 0.99');
    expect(scriptTag!.inputs).toContain('cell.age');
    expect(scriptTag!.outputs).toContain('cell.alpha');
    expect(scriptTag!.phase).toBe('post-rule');
    expect(scriptTag!.enabled).toBe(true);
  });
});
