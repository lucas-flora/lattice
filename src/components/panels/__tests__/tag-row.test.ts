/**
 * Unit tests for TagRow behavior through command calls.
 *
 * Tests that tag operations (delete, toggle disable, edit code) work correctly
 * via the command registry and are reflected in both the tag registry and the
 * expression store.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../../engine/core/EventBus';
import { CommandRegistry } from '../../../commands/CommandRegistry';
import { SimulationController } from '../../../commands/SimulationController';
import { registerAllCommands } from '../../../commands/definitions';
import { wireStores } from '../../../commands/wireStores';
import { useExpressionStore } from '../../../store/expressionStore';
import { _resetTagIdCounter } from '../../../engine/expression/ExpressionTagRegistry';

describe('TagRow', () => {
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

  it('TestTagRow_Delete_CallsTagRemove', async () => {
    // Create a code tag via tag.add
    const addResult = await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });
    expect(addResult.success).toBe(true);

    const tagId = addResult.data.id;
    const tagsBefore = controller.getTagRegistry()!.getAll();
    expect(tagsBefore.filter(t => t.phase !== 'rule').length).toBe(1);

    // Remove via tag.remove — simulates TagRow delete button
    const removeResult = await registry.execute('tag.remove', { id: tagId });
    expect(removeResult.success).toBe(true);

    // Registry should only have the rule tag
    const tagsAfter = controller.getTagRegistry()!.getAll();
    expect(tagsAfter.filter(t => t.phase !== 'rule').length).toBe(0);

    // Store should reflect removal (only rule tag remains)
    const storeTags = useExpressionStore.getState().tags;
    expect(storeTags.filter(t => t.phase !== 'rule').length).toBe(0);
  });

  it('TestTagRow_ToggleDisable_UpdatesEnabled', async () => {
    // Create a code tag (starts enabled)
    const addResult = await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });
    expect(addResult.success).toBe(true);

    const tagId = addResult.data.id;
    expect(addResult.data.enabled).toBe(true);

    // Disable via tag.disable — simulates TagRow toggle
    const disableResult = await registry.execute('tag.disable', { id: tagId });
    expect(disableResult.success).toBe(true);

    // Verify in registry
    const registryTag = controller.getTagRegistry()!.get(tagId);
    expect(registryTag).toBeDefined();
    expect(registryTag!.enabled).toBe(false);

    // Verify in store
    const storeTag = useExpressionStore.getState().tags.find((t) => t.id === tagId);
    expect(storeTag).toBeDefined();
    expect(storeTag!.enabled).toBe(false);
  });

  it('TestTagRow_EditCode_UpdatesTag', async () => {
    // Create a code tag with initial code
    const addResult = await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });
    expect(addResult.success).toBe(true);

    const tagId = addResult.data.id;
    expect(addResult.data.code).toBe('age / 100');

    // Edit via tag.edit — simulates TagRow inline code edit
    const editResult = await registry.execute('tag.edit', {
      id: tagId,
      code: 'age / 200 * 0.5',
    });
    expect(editResult.success).toBe(true);

    // Verify code changed in registry
    const registryTag = controller.getTagRegistry()!.get(tagId);
    expect(registryTag).toBeDefined();
    expect(registryTag!.code).toBe('age / 200 * 0.5');

    // Verify store received the update event
    const storeTag = useExpressionStore.getState().tags.find((t) => t.id === tagId);
    expect(storeTag).toBeDefined();
  });
});
