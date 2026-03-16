/**
 * Scenario tests for ExpressionTag system: full user workflows end-to-end.
 *
 * Each test simulates a realistic user session: creating tags, editing them,
 * and verifying the final state through the unified expressionStore.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../core/EventBus';
import { CommandRegistry } from '../../../commands/CommandRegistry';
import { SimulationController } from '../../../commands/SimulationController';
import { registerAllCommands } from '../../../commands/definitions';
import { wireStores } from '../../../commands/wireStores';
import { useExpressionStore } from '../../../store/expressionStore';
import { _resetTagIdCounter } from '../ExpressionTagRegistry';

describe('ExpressionTag Scenarios', () => {
  let bus: EventBus;
  let commandRegistry: CommandRegistry;
  let controller: SimulationController;
  let cleanup: () => void;

  beforeEach(() => {
    bus = new EventBus();
    commandRegistry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(commandRegistry, controller, bus);
    cleanup = wireStores(bus);
    controller.loadPreset('conways-gol');
    _resetTagIdCounter();
  });

  afterEach(() => {
    controller.dispose();
    cleanup();
    commandRegistry.clear();
    bus.clear();
  });

  it('TestScenario_CreateLinkThenEditRange', async () => {
    // Step 1: User creates a link from age to alpha
    const addResult = await commandRegistry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'linear',
    });
    expect(addResult.success).toBe(true);

    // Step 2: Verify tag appears in store
    let tags = useExpressionStore.getState().tags;
    let linkTag = tags.find((t) => t.source === 'link' && t.outputs.includes('cell.alpha'));
    expect(linkTag).toBeDefined();
    expect(linkTag!.linkMeta!.sourceRange).toEqual([0, 100]);
    expect(linkTag!.linkMeta!.targetRange).toEqual([0, 1]);
    expect(linkTag!.linkMeta!.easing).toBe('linear');

    // Step 3: User edits the link to change range and easing
    const linkId = addResult.data.id;
    const editResult = await commandRegistry.execute('link.edit', {
      id: linkId,
      sourceRange: [0, 200],
      targetRange: [0.5, 1],
      easing: 'smoothstep',
    });
    expect(editResult.success).toBe(true);

    // Step 4: Verify the tag's linkMeta was updated in the store
    tags = useExpressionStore.getState().tags;
    linkTag = tags.find((t) => t.source === 'link' && t.outputs.includes('cell.alpha'));
    expect(linkTag).toBeDefined();
    expect(linkTag!.linkMeta!.sourceRange).toEqual([0, 200]);
    expect(linkTag!.linkMeta!.targetRange).toEqual([0.5, 1]);
    expect(linkTag!.linkMeta!.easing).toBe('smoothstep');
  });

  it('TestScenario_CreateExpressionThenClear', async () => {
    // Step 1: User sets an expression on alpha
    const setResult = await commandRegistry.execute('expr.set', {
      property: 'alpha',
      expression: 'age / 100',
    });
    expect(setResult.success).toBe(true);

    // Step 2: Verify tag exists in store
    let tags = useExpressionStore.getState().tags;
    let codeTag = tags.find((t) => t.source === 'code' && t.outputs.includes('cell.alpha'));
    expect(codeTag).toBeDefined();
    expect(codeTag!.code).toBe('age / 100');

    // Step 3: User clears the expression
    const clearResult = await commandRegistry.execute('expr.clear', {
      property: 'alpha',
    });
    expect(clearResult.success).toBe(true);

    // Step 4: Verify tag is removed from store
    tags = useExpressionStore.getState().tags;
    codeTag = tags.find((t) => t.source === 'code' && t.outputs.includes('cell.alpha'));
    expect(codeTag).toBeUndefined();
  });

  it('TestScenario_MultipleTagsSameProperty_BothVisible', async () => {
    // Step 1: User creates a link writing to cell.alpha
    const linkResult = await commandRegistry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'linear',
    });
    expect(linkResult.success).toBe(true);

    // Step 2: User creates an expression also writing to cell.alpha
    const exprResult = await commandRegistry.execute('expr.set', {
      property: 'alpha',
      expression: 'age / 50',
    });
    expect(exprResult.success).toBe(true);

    // Step 3: Verify both tags exist in the store targeting cell.alpha
    const tags = useExpressionStore.getState().tags;
    const alphaTags = tags.filter((t) => t.outputs.includes('cell.alpha'));
    expect(alphaTags.length).toBeGreaterThanOrEqual(2);

    const linkTag = alphaTags.find((t) => t.source === 'link');
    const codeTag = alphaTags.find((t) => t.source === 'code');
    expect(linkTag).toBeDefined();
    expect(codeTag).toBeDefined();

    // Verify they have different phases (link=pre-rule, code=post-rule)
    expect(linkTag!.phase).toBe('pre-rule');
    expect(codeTag!.phase).toBe('post-rule');

    // Verify they have different IDs
    expect(linkTag!.id).not.toBe(codeTag!.id);
  });
});
