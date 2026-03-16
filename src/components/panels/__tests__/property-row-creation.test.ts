/**
 * Unit tests for PropertyRow tag creation flows.
 *
 * Tests that PropertyRow's tag.add calls correctly create tags in the registry
 * and propagate state to the expression store via EventBus wiring.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../../engine/core/EventBus';
import { CommandRegistry } from '../../../commands/CommandRegistry';
import { SimulationController } from '../../../commands/SimulationController';
import { registerAllCommands } from '../../../commands/definitions';
import { wireStores } from '../../../commands/wireStores';
import { useExpressionStore } from '../../../store/expressionStore';
import { _resetTagIdCounter } from '../../../engine/expression/ExpressionTagRegistry';

describe('PropertyRow Creation', () => {
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

  it('TestPropertyRow_TagAdd_CreatesCodeTag', async () => {
    // Simulates PropertyRow form submit: tag.add with source 'code'
    const result = await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });
    expect(result.success).toBe(true);

    // Verify tag exists in registry with correct properties
    // (allTags includes the auto-created rule tag from preset load)
    const allTags = controller.getTagRegistry()!.getAll();
    const nonRuleTags = allTags.filter(t => t.phase !== 'rule');
    expect(nonRuleTags.length).toBe(1);

    const tag = nonRuleTags[0];
    expect(tag.source).toBe('code');
    expect(tag.outputs).toContain('cell.alpha');
    expect(tag.code).toBe('age / 100');
    expect(tag.enabled).toBe(true);
    expect(tag.phase).toBe('post-rule');
  });

  it('TestPropertyRow_HasTag_CanToggle', async () => {
    // Add a tag
    const addResult = await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });
    expect(addResult.success).toBe(true);

    const tagId = addResult.data.id;

    // Toggle via tag.disable — simulates PropertyRow enabled toggle
    const disableResult = await registry.execute('tag.disable', { id: tagId });
    expect(disableResult.success).toBe(true);

    // Verify enabled is false in registry
    const registryTag = controller.getTagRegistry()!.get(tagId);
    expect(registryTag).toBeDefined();
    expect(registryTag!.enabled).toBe(false);

    // Verify store reflects disabled state
    const storeTag = useExpressionStore.getState().tags.find((t) => t.id === tagId);
    expect(storeTag).toBeDefined();
    expect(storeTag!.enabled).toBe(false);
  });

  it('TestPropertyRow_SubmitForm_CallsTagAdd', async () => {
    // Simulates PropertyRow add-expression form submission
    const result = await registry.execute('tag.add', {
      source: 'code',
      property: 'alive',
      code: 'int(age > 50)',
    });
    expect(result.success).toBe(true);

    // Tag appears in store after wireStores event propagation
    // (store includes the auto-created rule tag from preset load)
    const storeTags = useExpressionStore.getState().tags;
    const nonRuleStoreTags = storeTags.filter(t => t.phase !== 'rule');
    expect(nonRuleStoreTags.length).toBe(1);
    expect(nonRuleStoreTags[0].source).toBe('code');
    expect(nonRuleStoreTags[0].outputs).toContain('cell.alive');
    expect(nonRuleStoreTags[0].code).toBe('int(age > 50)');
    expect(nonRuleStoreTags[0].id).toBe(result.data.id);
    expect(nonRuleStoreTags[0].enabled).toBe(true);
  });

  it('TestPropertyRow_HasTag_CanRemove', async () => {
    // Add a tag
    const addResult = await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });
    expect(addResult.success).toBe(true);

    const tagId = addResult.data.id;

    // Verify it's in the store (includes rule tag + the new tag)
    const nonRuleTags = useExpressionStore.getState().tags.filter(t => t.phase !== 'rule');
    expect(nonRuleTags.length).toBe(1);

    // Remove via tag.remove — simulates PropertyRow delete action
    const removeResult = await registry.execute('tag.remove', { id: tagId });
    expect(removeResult.success).toBe(true);

    // Registry should only have the rule tag
    const allTags = controller.getTagRegistry()!.getAll();
    expect(allTags.filter(t => t.phase !== 'rule').length).toBe(0);

    // Store should only have the rule tag
    const storeTags = useExpressionStore.getState().tags;
    expect(storeTags.filter(t => t.phase !== 'rule').length).toBe(0);
  });
});
