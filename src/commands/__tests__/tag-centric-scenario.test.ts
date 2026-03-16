/**
 * Scenario tests for tag-centric UI: full user workflows end-to-end.
 *
 * Each test simulates a realistic multi-step user session: creating tags,
 * editing them, toggling them, and removing them — verifying the
 * expressionStore reflects each mutation correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../engine/core/EventBus';
import { CommandRegistry } from '../CommandRegistry';
import { SimulationController } from '../SimulationController';
import { registerAllCommands } from '../definitions';
import { wireStores } from '../wireStores';
import { useExpressionStore } from '../../store/expressionStore';
import { _resetTagIdCounter } from '../../engine/expression/ExpressionTagRegistry';

describe('Tag-Centric Scenarios', () => {
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

  it('TestTagWorkflow_CreateEditToggleRemove', async () => {
    // Step 1: Create a code tag via tag.add
    const addResult = await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });
    expect(addResult.success).toBe(true);

    let tags = useExpressionStore.getState().tags;
    const nonRuleTags = tags.filter(t => t.phase !== 'rule');
    expect(nonRuleTags.length).toBe(1);
    const tagId = nonRuleTags[0].id;
    expect(nonRuleTags[0].code).toBe('age / 100');
    expect(nonRuleTags[0].enabled).toBe(true);

    // Step 2: Edit the tag's code
    const editResult = await registry.execute('tag.edit', {
      id: tagId,
      code: 'age / 200',
    });
    expect(editResult.success).toBe(true);

    tags = useExpressionStore.getState().tags;
    expect(tags.filter(t => t.phase !== 'rule').length).toBe(1);
    const editedTag = tags.find((t) => t.id === tagId);
    expect(editedTag).toBeDefined();
    expect(editedTag!.code).toBe('age / 200');

    // Step 3: Disable the tag
    const disableResult = await registry.execute('tag.disable', { id: tagId });
    expect(disableResult.success).toBe(true);

    tags = useExpressionStore.getState().tags;
    const disabledTag = tags.find((t) => t.id === tagId);
    expect(disabledTag).toBeDefined();
    expect(disabledTag!.enabled).toBe(false);

    // Step 4: Re-enable the tag
    const enableResult = await registry.execute('tag.enable', { id: tagId });
    expect(enableResult.success).toBe(true);

    tags = useExpressionStore.getState().tags;
    const enabledTag = tags.find((t) => t.id === tagId);
    expect(enabledTag).toBeDefined();
    expect(enabledTag!.enabled).toBe(true);

    // Step 5: Remove the tag
    const removeResult = await registry.execute('tag.remove', { id: tagId });
    expect(removeResult.success).toBe(true);

    tags = useExpressionStore.getState().tags;
    expect(tags.filter(t => t.phase !== 'rule').length).toBe(0);
  });

  it('TestTagWorkflow_AllLegacyCommandsStillWork', async () => {
    // Step 1: link.add creates a tag
    const linkResult = await registry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'linear',
    });
    expect(linkResult.success).toBe(true);

    let tags = useExpressionStore.getState().tags;
    const linkTag = tags.find((t) => t.linkMeta !== undefined);
    expect(linkTag).toBeDefined();
    expect(linkTag!.source).toBe('code');
    expect(linkTag!.outputs).toContain('cell.alpha');

    // Step 2: expr.set creates a tag
    const exprResult = await registry.execute('expr.set', {
      property: 'alive',
      expression: 'int(age > 0)',
    });
    expect(exprResult.success).toBe(true);

    tags = useExpressionStore.getState().tags;
    const codeTag = tags.find((t) => t.source === 'code' && t.linkMeta === undefined && t.phase !== 'rule');
    expect(codeTag).toBeDefined();
    expect(codeTag!.outputs).toContain('cell.alive');

    // Step 3: script.add creates a tag
    // Note: inputs and outputs must not overlap to avoid cycle detection
    const scriptResult = await registry.execute('script.add', {
      name: 'decay',
      code: 'grid["alpha"] *= 0.99',
      inputs: ['cell.age'],
      outputs: ['cell.alpha'],
    });
    expect(scriptResult.success).toBe(true);

    tags = useExpressionStore.getState().tags;
    const scriptTag = tags.find((t) => t.source === 'script');
    expect(scriptTag).toBeDefined();
    expect(scriptTag!.name).toBe('decay');

    // Verify all three tags coexist
    expect(tags.length).toBeGreaterThanOrEqual(3);
    // Link-created tags now have source: 'code' with linkMeta
    expect(tags.some((t) => t.linkMeta !== undefined)).toBe(true);
    expect(tags.some((t) => t.source === 'code')).toBe(true);
    expect(tags.some((t) => t.source === 'script')).toBe(true);

    // Step 4: Remove the link via link.remove — should remove the tag too
    const linkId = linkResult.data.id;
    const linkRemoveResult = await registry.execute('link.remove', { id: linkId });
    expect(linkRemoveResult.success).toBe(true);

    tags = useExpressionStore.getState().tags;
    expect(tags.find((t) => t.linkMeta !== undefined)).toBeUndefined();

    // Step 5: Clear the expression via expr.clear — should remove the tag too
    const exprClearResult = await registry.execute('expr.clear', { property: 'alive' });
    expect(exprClearResult.success).toBe(true);

    tags = useExpressionStore.getState().tags;
    expect(tags.find((t) => t.source === 'code' && t.outputs.includes('cell.alive'))).toBeUndefined();

    // Step 6: Remove the script via script.remove — should remove the tag too
    const scriptRemoveResult = await registry.execute('script.remove', { name: 'decay' });
    expect(scriptRemoveResult.success).toBe(true);

    tags = useExpressionStore.getState().tags;
    expect(tags.find((t) => t.source === 'script' && t.name === 'decay')).toBeUndefined();

    // All user tags should be cleaned up (rule tag remains)
    expect(tags.filter(t => t.phase !== 'rule').length).toBe(0);
  });
});
