/**
 * Unit tests for UnifiedTagsSection data flow.
 *
 * Tests that expression store state correctly reflects tag operations:
 * empty state, grouping by owner, filtering by source, and add propagation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../../engine/core/EventBus';
import { CommandRegistry } from '../../../commands/CommandRegistry';
import { SimulationController } from '../../../commands/SimulationController';
import { registerAllCommands } from '../../../commands/definitions';
import { wireStores } from '../../../commands/wireStores';
import { useExpressionStore } from '../../../store/expressionStore';
import { _resetTagIdCounter } from '../../../engine/expression/ExpressionTagRegistry';

describe('UnifiedTagsSection', () => {
  let bus: EventBus;
  let registry: CommandRegistry;
  let controller: SimulationController;
  let cleanup: () => void;

  beforeEach(() => {
    _resetTagIdCounter();
    bus = new EventBus();
    registry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(registry, controller, bus);
    cleanup = wireStores(bus);
    controller.loadPreset('conways-gol');
  });

  afterEach(() => {
    controller.dispose();
    cleanup();
    registry.clear();
    bus.clear();
  });

  it('TestUnifiedTagsSection_Empty_NoTags', () => {
    // When no user tags have been added, store should only have the auto-created rule tag
    const tags = useExpressionStore.getState().tags;
    const nonRuleTags = tags.filter(t => t.phase !== 'rule');
    expect(nonRuleTags).toEqual([]);
    expect(nonRuleTags.length).toBe(0);
    // The rule tag should exist
    const ruleTags = tags.filter(t => t.phase === 'rule');
    expect(ruleTags.length).toBe(1);
  });

  it('TestUnifiedTagsSection_GroupsByOwner', async () => {
    // Add a code tag (default owner: cell-type)
    await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });

    // Add a link tag (default owner: root)
    await registry.execute('tag.add', {
      source: 'link',
      sourceAddress: 'cell.age',
      targetAddress: 'cell.alive',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'linear',
    });

    // Add a code tag with explicit environment owner
    await registry.execute('tag.add', {
      source: 'code',
      property: 'age',
      code: '0',
      owner: { type: 'environment' },
    });

    const tagRegistry = controller.getTagRegistry()!;

    // Group by owner via registry queries
    const cellTypeTags = tagRegistry.getByOwner({ type: 'cell-type' });
    const rootTags = tagRegistry.getByOwner({ type: 'root' });
    const envTags = tagRegistry.getByOwner({ type: 'environment' });

    expect(cellTypeTags.length).toBe(1);
    expect(cellTypeTags[0].source).toBe('code');
    expect(cellTypeTags[0].outputs).toContain('cell.alpha');

    // Root tags include the auto-created rule tag + the link tag
    const nonRuleRootTags = rootTags.filter(t => t.phase !== 'rule');
    expect(nonRuleRootTags.length).toBe(1);
    expect(nonRuleRootTags[0].source).toBe('code');
    expect(nonRuleRootTags[0].linkMeta).toBeDefined();

    expect(envTags.length).toBe(1);
    expect(envTags[0].owner.type).toBe('environment');
  });

  it('TestUnifiedTagsSection_FilterBySource', async () => {
    // Add a code tag
    await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });

    // Add a link tag
    await registry.execute('tag.add', {
      source: 'link',
      sourceAddress: 'cell.age',
      targetAddress: 'cell.alive',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'linear',
    });

    // getAll() returns both user tags + the auto-created rule tag
    const allTags = controller.getTagRegistry()!.getAll();
    const userTags = allTags.filter(t => t.phase !== 'rule');
    expect(userTags.length).toBe(2);

    // Filter by source in test (as the UI component would)
    // Link-created tags now have source: 'code' with linkMeta present
    const codeTags = userTags.filter((t) => t.source === 'code');
    const linkCreatedTags = userTags.filter((t) => t.linkMeta !== undefined);
    const scriptTags = userTags.filter((t) => t.source === 'script');

    // Both user tags have source: 'code' (one from expr, one from link wizard)
    expect(codeTags.length).toBe(2);

    expect(linkCreatedTags.length).toBe(1);
    expect(linkCreatedTags[0].linkMeta).toBeDefined();
    expect(linkCreatedTags[0].linkMeta!.sourceAddress).toBe('cell.age');

    expect(scriptTags.length).toBe(0);
  });

  it('TestUnifiedTagsSection_AddTag_AppearsInStore', async () => {
    // Store starts with only the auto-created rule tag
    const initialNonRuleTags = useExpressionStore.getState().tags.filter(t => t.phase !== 'rule');
    expect(initialNonRuleTags.length).toBe(0);

    // Add a tag via command
    const result = await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });
    expect(result.success).toBe(true);

    // tag.add emits tag:added, wireStores routes it to expressionStore
    const storeTags = useExpressionStore.getState().tags;
    const nonRuleTags = storeTags.filter(t => t.phase !== 'rule');
    expect(nonRuleTags.length).toBe(1);
    expect(nonRuleTags[0].source).toBe('code');
    expect(nonRuleTags[0].outputs).toContain('cell.alpha');
    expect(nonRuleTags[0].code).toBe('age / 100');
    expect(nonRuleTags[0].enabled).toBe(true);
    expect(nonRuleTags[0].id).toBe(result.data.id);
  });
});
