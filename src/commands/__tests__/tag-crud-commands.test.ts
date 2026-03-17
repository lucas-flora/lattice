/**
 * Unit tests for tag CRUD commands (tag.add, tag.remove, tag.edit)
 * and the script.add tag integration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../engine/core/EventBus';
import { CommandRegistry } from '../CommandRegistry';
import { SimulationController } from '../SimulationController';
import { registerAllCommands } from '../definitions';
import { _resetTagIdCounter } from '../../engine/expression/ExpressionTagRegistry';

describe('Tag CRUD Commands', () => {
  let bus: EventBus;
  let registry: CommandRegistry;
  let controller: SimulationController;

  beforeEach(() => {
    _resetTagIdCounter();
    bus = new EventBus();
    registry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(registry, controller, bus);
    // Load a preset so we have a simulation
    controller.loadPreset('conways-gol');
  });

  afterEach(() => {
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  // --- tag.add ---

  it('TestTagAdd_CodeSource_CreatesTagAndExpression', async () => {
    const result = await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });

    expect(result.success).toBe(true);

    const tags = controller.getTagRegistry()!.getAll();
    const codeTag = tags.find((t) => t.source === 'code' && t.phase !== 'rule');
    expect(codeTag).toBeDefined();
    expect(codeTag!.outputs).toContain('cell.alpha');
    expect(codeTag!.code).toBe('age / 100');
    expect(codeTag!.enabled).toBe(true);
  });

  it('TestTagAdd_LinkSource_CreatesTagAndLink', async () => {
    const result = await registry.execute('tag.add', {
      source: 'link',
      sourceAddress: 'cell.age',
      targetAddress: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'linear',
    });

    expect(result.success).toBe(true);

    // Verify tag exists in tag registry (link wizard creates code-source tags with linkMeta)
    const tags = controller.getTagRegistry()!.getAll();
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

    // Verify link is reflected in the tag registry (no separate link registry)
    const allTags = controller.getTagRegistry()!.getAll();
    const linkTagMatch = allTags.find((t) => t.linkMeta?.sourceAddress === 'cell.age' && t.outputs.includes('cell.alpha'));
    expect(linkTagMatch).toBeDefined();
  });

  it('TestTagAdd_ScriptSource_CreatesTagAndScript', async () => {
    const result = await registry.execute('tag.add', {
      source: 'script',
      name: 'monitor',
      code: 'pass',
      inputs: ['cell.age'],
      outputs: [],
    });

    expect(result.success).toBe(true);

    const tags = controller.getTagRegistry()!.getAll();
    const scriptTag = tags.find((t) => t.source === 'script');
    expect(scriptTag).toBeDefined();
    expect(scriptTag!.name).toBe('monitor');
    expect(scriptTag!.code).toBe('pass');
    expect(scriptTag!.inputs).toContain('cell.age');
    expect(scriptTag!.enabled).toBe(true);
  });

  // --- tag.remove ---

  it('TestTagRemove_CodeSource_ClearsExpression', async () => {
    const addResult = await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });
    expect(addResult.success).toBe(true);

    const tagId = (addResult.data as any).id;
    expect(tagId).toBeDefined();

    const removeResult = await registry.execute('tag.remove', { id: tagId });
    expect(removeResult.success).toBe(true);

    // Verify tag is gone
    const tags = controller.getTagRegistry()!.getAll();
    const match = tags.find((t) => t.id === tagId);
    expect(match).toBeUndefined();
  });

  it('TestTagRemove_LinkSource_ClearsLink', async () => {
    const addResult = await registry.execute('tag.add', {
      source: 'link',
      sourceAddress: 'cell.age',
      targetAddress: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'linear',
    });
    expect(addResult.success).toBe(true);

    const tagId = (addResult.data as any).id;

    const removeResult = await registry.execute('tag.remove', { id: tagId });
    expect(removeResult.success).toBe(true);

    // Verify tag is gone
    const tags = controller.getTagRegistry()!.getAll();
    const tagMatch = tags.find((t) => t.id === tagId);
    expect(tagMatch).toBeUndefined();

    // Verify link tag is also gone from tag registry
    const allTags = controller.getTagRegistry()!.getAll();
    const linkTagMatch = allTags.find((t) => t.linkMeta?.sourceAddress === 'cell.age' && t.outputs.includes('cell.alpha'));
    expect(linkTagMatch).toBeUndefined();
  });

  it('TestTagRemove_ScriptSource_ClearsScript', async () => {
    const addResult = await registry.execute('tag.add', {
      source: 'script',
      name: 'monitor',
      code: 'pass',
      inputs: ['cell.age'],
      outputs: [],
    });
    expect(addResult.success).toBe(true);

    const tagId = (addResult.data as any).id;

    const removeResult = await registry.execute('tag.remove', { id: tagId });
    expect(removeResult.success).toBe(true);

    // Verify tag is gone
    const tags = controller.getTagRegistry()!.getAll();
    const match = tags.find((t) => t.id === tagId);
    expect(match).toBeUndefined();
  });

  // --- tag.edit ---

  it('TestTagEdit_CodeSource_UpdatesCode', async () => {
    const addResult = await registry.execute('tag.add', {
      source: 'code',
      property: 'alpha',
      code: 'age / 100',
    });
    expect(addResult.success).toBe(true);

    const tagId = (addResult.data as any).id;

    const editResult = await registry.execute('tag.edit', {
      id: tagId,
      code: 'age / 200',
    });
    expect(editResult.success).toBe(true);

    // Verify the tag's code was updated
    const tag = controller.getTagRegistry()!.get(tagId);
    expect(tag).toBeDefined();
    expect(tag!.code).toBe('age / 200');
  });

  it('TestTagEdit_LinkSource_UpdatesRanges', async () => {
    const addResult = await registry.execute('tag.add', {
      source: 'link',
      sourceAddress: 'cell.age',
      targetAddress: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'linear',
    });
    expect(addResult.success).toBe(true);

    const tagId = (addResult.data as any).id;

    const editResult = await registry.execute('tag.edit', {
      id: tagId,
      sourceRange: [10, 90],
      targetRange: [0.1, 0.9],
    });
    expect(editResult.success).toBe(true);

    // Verify the tag's linkMeta was updated
    const tag = controller.getTagRegistry()!.get(tagId);
    expect(tag).toBeDefined();
    expect(tag!.linkMeta).toBeDefined();
    expect(tag!.linkMeta!.sourceRange).toEqual([10, 90]);
    expect(tag!.linkMeta!.targetRange).toEqual([0.1, 0.9]);
  });

  // --- script.add tag integration ---

  it('TestScriptAdd_NowCreatesTag', async () => {
    const result = await registry.execute('script.add', {
      name: 'test',
      code: 'pass',
    });
    expect(result.success).toBe(true);

    // Verify tag registry has a script-sourced tag
    const tags = controller.getTagRegistry()!.getAll();
    const scriptTag = tags.find((t) => t.source === 'script' && t.name === 'test');
    expect(scriptTag).toBeDefined();
    expect(scriptTag!.code).toBe('pass');
    expect(scriptTag!.enabled).toBe(true);
  });
});
