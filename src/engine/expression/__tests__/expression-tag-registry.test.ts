import { describe, it, expect, beforeEach } from 'vitest';
import { ExpressionTagRegistry, _resetTagIdCounter } from '../ExpressionTagRegistry';
import type { ExpressionTagDef, TagOwner } from '../types';
import { GlobalVariableStore } from '../../scripting/GlobalVariableStore';

// --- Mock Grid ---

class MockGrid {
  private buffers = new Map<string, Float32Array>();
  constructor(size: number, props: string[]) {
    for (const p of props) {
      this.buffers.set(p, new Float32Array(size));
    }
  }
  getCurrentBuffer(name: string) {
    return this.buffers.get(name)!;
  }
  getPropertyNames() {
    return [...this.buffers.keys()];
  }
  get config() {
    return { width: 4, height: 4, depth: 1 };
  }
}

// --- Helpers ---

function makeTagDef(overrides: Partial<ExpressionTagDef> = {}): ExpressionTagDef {
  return {
    name: 'test-tag',
    owner: { type: 'root' },
    code: 'pass',
    phase: 'pre-rule',
    enabled: true,
    source: 'code',
    inputs: ['env.feedRate'],
    outputs: ['cell.alive'],
    ...overrides,
  };
}

describe('ExpressionTagRegistry', () => {
  let registry: ExpressionTagRegistry;

  beforeEach(() => {
    _resetTagIdCounter();
    registry = new ExpressionTagRegistry();
  });

  // 1
  it('TestExpressionTagRegistry_Add_CreatesTag', () => {
    const def = makeTagDef({
      name: 'myTag',
      code: 'self.alive = 1',
      phase: 'post-rule',
      enabled: false,
      source: 'code',
      inputs: ['env.feedRate'],
      outputs: ['cell.alive'],
    });

    const tag = registry.add(def);

    expect(tag.id).toBe('tag_1');
    expect(tag.name).toBe('myTag');
    expect(tag.owner).toEqual({ type: 'root' });
    expect(tag.code).toBe('self.alive = 1');
    expect(tag.phase).toBe('post-rule');
    expect(tag.enabled).toBe(false);
    expect(tag.source).toBe('code');
    expect(tag.inputs).toEqual(['env.feedRate']);
    expect(tag.outputs).toEqual(['cell.alive']);
    expect(tag.linkMeta).toBeUndefined();

    // Verify it is retrievable
    expect(registry.get('tag_1')).toBe(tag);
    expect(registry.getAll()).toHaveLength(1);
  });

  // 2
  it('TestExpressionTagRegistry_AddLink_GeneratesCode', () => {
    const tag = registry.addFromLink(
      'env.feedRate',
      'cell.alive',
      [0, 1],
      [0, 255],
      'smoothstep',
      true,
    );

    expect(tag.source).toBe('code');
    expect(tag.phase).toBe('pre-rule');
    expect(tag.linkMeta).toBeDefined();
    expect(tag.linkMeta!.sourceAddress).toBe('env.feedRate');
    expect(tag.linkMeta!.sourceRange).toEqual([0, 1]);
    expect(tag.linkMeta!.targetRange).toEqual([0, 255]);
    expect(tag.linkMeta!.easing).toBe('smoothstep');
    expect(tag.code).toContain('rangeMap');
    expect(tag.inputs).toEqual(['env.feedRate']);
    expect(tag.outputs).toEqual(['cell.alive']);
    expect(tag.name).toBe('env.feedRate \u2192 cell.alive');
  });

  // 3
  it('TestExpressionTagRegistry_AddExpression_SetsPostRule', () => {
    const tag = registry.addFromExpression('age', 'cell.age + 1');

    expect(tag.source).toBe('code');
    expect(tag.phase).toBe('post-rule');
    expect(tag.code).toBe('cell.age + 1');
    expect(tag.outputs).toEqual(['cell.age']);
    expect(tag.owner).toEqual({ type: 'cell-type' });
    expect(tag.enabled).toBe(true);
    expect(tag.name).toBe('expr: age');
  });

  // 4
  it('TestExpressionTagRegistry_Remove_DeletesTag', () => {
    const tag = registry.add(makeTagDef());
    expect(registry.getAll()).toHaveLength(1);

    const removed = registry.remove(tag.id);
    expect(removed).toBe(true);
    expect(registry.getAll()).toHaveLength(0);
    expect(registry.get(tag.id)).toBeUndefined();

    // Removing non-existent returns false
    expect(registry.remove('nonexistent')).toBe(false);
  });

  // 5
  it('TestExpressionTagRegistry_Update_ModifiesFields', () => {
    const tag = registry.add(makeTagDef({ name: 'original', phase: 'pre-rule' }));

    const updated = registry.update(tag.id, { name: 'renamed', phase: 'post-rule' });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('renamed');
    expect(updated!.phase).toBe('post-rule');

    // Verify the stored tag is also updated
    expect(registry.get(tag.id)!.name).toBe('renamed');
    expect(registry.get(tag.id)!.phase).toBe('post-rule');

    // Non-existent returns null
    expect(registry.update('missing', { name: 'x' })).toBeNull();
  });

  // 6
  it('TestExpressionTagRegistry_Enable_Disable', () => {
    const tag = registry.add(makeTagDef({ enabled: false }));
    expect(registry.getEnabled()).toHaveLength(0);

    registry.enable(tag.id);
    expect(registry.getEnabled()).toHaveLength(1);
    expect(registry.get(tag.id)!.enabled).toBe(true);

    registry.disable(tag.id);
    expect(registry.getEnabled()).toHaveLength(0);
    expect(registry.get(tag.id)!.enabled).toBe(false);
  });

  // 7
  it('TestExpressionTagRegistry_SelfReference_ResolvesToOwner', () => {
    const owner: TagOwner = { type: 'cell-type', id: 'BaseCell' };
    const tag = registry.add(
      makeTagDef({
        owner,
        name: 'self-ref',
      }),
    );

    expect(tag.owner.type).toBe('cell-type');
    expect(tag.owner.id).toBe('BaseCell');

    // Verify it appears in the correct owner index
    const byOwner = registry.getByOwner({ type: 'cell-type', id: 'BaseCell' });
    expect(byOwner).toHaveLength(1);
    expect(byOwner[0].id).toBe(tag.id);
  });

  // 8
  it('TestExpressionTagRegistry_CopyToOwner_UpdatesSelf', () => {
    const originalOwner: TagOwner = { type: 'root' };
    const newOwner: TagOwner = { type: 'cell-type', id: 'FireCell' };

    const original = registry.add(
      makeTagDef({
        name: 'myLink',
        owner: originalOwner,
      }),
    );

    const copy = registry.copyToOwner(original.id, newOwner);

    // Copy has a different ID
    expect(copy.id).not.toBe(original.id);
    // Copy has the new owner
    expect(copy.owner).toEqual(newOwner);
    // Copy has the "(copy)" suffix
    expect(copy.name).toBe('myLink (copy)');
    // Original unchanged
    expect(registry.get(original.id)!.owner).toEqual(originalOwner);
    // Both exist
    expect(registry.getAll()).toHaveLength(2);

    // Copying non-existent throws
    expect(() => registry.copyToOwner('nonexistent', newOwner)).toThrow('not found');
  });

  // 9
  it('TestExpressionTagRegistry_CycleDetection', () => {
    // A -> B
    registry.add(
      makeTagDef({
        name: 'A->B',
        inputs: ['env.feedRate'],
        outputs: ['env.killRate'],
      }),
    );

    // B -> C
    registry.add(
      makeTagDef({
        name: 'B->C',
        inputs: ['env.killRate'],
        outputs: ['env.diffusionA'],
      }),
    );

    // C -> A would create a cycle
    expect(() =>
      registry.add(
        makeTagDef({
          name: 'C->A',
          inputs: ['env.diffusionA'],
          outputs: ['env.feedRate'],
        }),
      ),
    ).toThrow(/cycle/i);

    // Self-referencing (input === output) is also a cycle
    expect(() =>
      registry.add(
        makeTagDef({
          name: 'self-loop',
          inputs: ['cell.alpha'],
          outputs: ['cell.alpha'],
        }),
      ),
    ).toThrow(/cycle/i);
  });

  // 10
  it('TestExpressionTagRegistry_TopologicalSort', () => {
    // Tag B depends on A: A outputs cell.alive, B inputs cell.alive
    const tagA = registry.add(
      makeTagDef({
        name: 'tagA',
        inputs: ['env.feedRate'],
        outputs: ['cell.alive'],
      }),
    );

    const tagB = registry.add(
      makeTagDef({
        name: 'tagB',
        inputs: ['cell.alive'],
        outputs: ['cell.age'],
      }),
    );

    // Add a third independent tag
    const tagC = registry.add(
      makeTagDef({
        name: 'tagC',
        inputs: ['env.killRate'],
        outputs: ['cell.alpha'],
      }),
    );

    const sorted = registry.topologicalSort([tagB, tagC, tagA]);

    // tagA must come before tagB (tagB depends on tagA's output)
    const idxA = sorted.findIndex((t) => t.id === tagA.id);
    const idxB = sorted.findIndex((t) => t.id === tagB.id);
    expect(idxA).toBeLessThan(idxB);

    // All three tags present
    expect(sorted).toHaveLength(3);
  });

  // 11
  it('TestExpressionTagRegistry_FastPathDetection', () => {
    const linkTag = registry.addFromLink(
      'env.feedRate',
      'cell.alive',
      [0, 1],
      [0, 1],
      'linear',
    );

    const codeTag = registry.addFromExpression('age', 'cell.age + 1');

    expect(registry.isSimpleRangeMap(linkTag)).toBe(true);
    expect(registry.isSimpleRangeMap(codeTag)).toBe(false);

    // Script tag also not a simple range map
    const scriptTag = registry.addFromScript(
      'myScript',
      'global.x = 1',
      ['env.feedRate'],
      ['global.x'],
    );
    expect(registry.isSimpleRangeMap(scriptTag)).toBe(false);
  });

  // 12
  it('TestExpressionTagRegistry_PreRuleResolve_MatchesOldLinkBehavior', () => {
    // env.feedRate [0,1] -> cell.alive [0,255], linear
    registry.addFromLink(
      'env.feedRate',
      'cell.alive',
      [0, 1],
      [0, 255],
      'linear',
    );

    const grid = new MockGrid(16, ['alive']);
    const params = new Map<string, number>([['feedRate', 0.5]]);
    const varStore = new GlobalVariableStore();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry.resolvePreRule(grid as any, params, varStore);

    // feedRate=0.5 maps linearly from [0,1] to [0,255] => 127.5
    const buffer = grid.getCurrentBuffer('alive');
    // Scalar -> cell: broadcast to entire buffer
    for (let i = 0; i < buffer.length; i++) {
      expect(buffer[i]).toBeCloseTo(127.5, 3);
    }
  });

  it('TestExpressionTagRegistry_PreRuleResolve_CellToCell', () => {
    // cell.alive [0,1] -> cell.age [0,100], linear
    registry.addFromLink(
      'cell.alive',
      'cell.age',
      [0, 1],
      [0, 100],
      'linear',
    );

    const grid = new MockGrid(4, ['alive', 'age']);
    const aliveBuf = grid.getCurrentBuffer('alive');
    aliveBuf[0] = 0.0;
    aliveBuf[1] = 0.25;
    aliveBuf[2] = 0.5;
    aliveBuf[3] = 1.0;

    const params = new Map<string, number>();
    const varStore = new GlobalVariableStore();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry.resolvePreRule(grid as any, params, varStore);

    const ageBuf = grid.getCurrentBuffer('age');
    expect(ageBuf[0]).toBeCloseTo(0, 3);
    expect(ageBuf[1]).toBeCloseTo(25, 3);
    expect(ageBuf[2]).toBeCloseTo(50, 3);
    expect(ageBuf[3]).toBeCloseTo(100, 3);
  });

  it('TestExpressionTagRegistry_PreRuleResolve_EnvToEnv', () => {
    // env.feedRate [0,1] -> env.killRate [0,0.1], linear
    registry.addFromLink(
      'env.feedRate',
      'env.killRate',
      [0, 1],
      [0, 0.1],
      'linear',
    );

    const grid = new MockGrid(4, ['alive']);
    const params = new Map<string, number>([
      ['feedRate', 0.5],
      ['killRate', 0],
    ]);
    const varStore = new GlobalVariableStore();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry.resolvePreRule(grid as any, params, varStore);

    // 0.5 mapped from [0,1] to [0,0.1] => 0.05
    expect(params.get('killRate')).toBeCloseTo(0.05, 5);
  });

  // 13
  it('TestExpressionTagRegistry_PostRuleExpressions', () => {
    registry.addFromExpression('age', 'cell.age + 1');
    registry.addFromExpression('alpha', 'cell.alive * 0.5');

    // A link tag should NOT appear in post-rule expressions
    registry.addFromLink('env.feedRate', 'cell.alive', [0, 1], [0, 1], 'linear');

    const exprs = registry.getPostRuleExpressions();

    expect(exprs['age']).toBe('cell.age + 1');
    expect(exprs['alpha']).toBe('cell.alive * 0.5');
    // link tag output should not be here
    expect(exprs['alive']).toBeUndefined();
    expect(Object.keys(exprs)).toHaveLength(2);
  });

  it('TestExpressionTagRegistry_PostRuleExpressions_SkipsDisabled', () => {
    const tag = registry.addFromExpression('age', 'cell.age + 1');
    registry.disable(tag.id);

    const exprs = registry.getPostRuleExpressions();
    expect(Object.keys(exprs)).toHaveLength(0);
  });

  // 14
  it('TestExpressionTagRegistry_FullWriteAccess', () => {
    // A root-level tag can write to cell properties
    const tag = registry.add(
      makeTagDef({
        owner: { type: 'root' },
        inputs: ['env.feedRate'],
        outputs: ['cell.alive'],
        source: 'code',
        linkMeta: {
          sourceAddress: 'env.feedRate',
          sourceRange: [0, 1],
          targetRange: [0, 1],
          easing: 'linear',
        },
        code: 'self.alive = rangeMap(env.feedRate, [0,1], [0,1], "linear")',
      }),
    );

    // Verify the tag was created successfully with root owner writing to cell
    expect(tag.owner.type).toBe('root');
    expect(tag.outputs).toContain('cell.alive');

    // Also verify it runs in resolvePreRule without error
    const grid = new MockGrid(4, ['alive']);
    const params = new Map<string, number>([['feedRate', 1.0]]);
    const varStore = new GlobalVariableStore();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry.resolvePreRule(grid as any, params, varStore);

    const buffer = grid.getCurrentBuffer('alive');
    for (let i = 0; i < buffer.length; i++) {
      expect(buffer[i]).toBeCloseTo(1.0, 5);
    }
  });

  // 15
  it('TestExpressionTagRegistry_GetByOwner', () => {
    const rootOwner: TagOwner = { type: 'root' };
    const cellOwner: TagOwner = { type: 'cell-type', id: 'BaseCell' };
    const envOwner: TagOwner = { type: 'environment' };

    registry.add(makeTagDef({ name: 'root-tag', owner: rootOwner }));
    registry.add(makeTagDef({ name: 'cell-tag-1', owner: cellOwner, inputs: ['env.killRate'], outputs: ['cell.age'] }));
    registry.add(makeTagDef({ name: 'cell-tag-2', owner: cellOwner, inputs: ['env.diffusionA'], outputs: ['cell.alpha'] }));
    registry.add(makeTagDef({ name: 'env-tag', owner: envOwner, inputs: ['global.myVar'], outputs: ['env.killRate'] }));

    expect(registry.getByOwner(rootOwner)).toHaveLength(1);
    expect(registry.getByOwner(cellOwner)).toHaveLength(2);
    expect(registry.getByOwner(envOwner)).toHaveLength(1);
    expect(registry.getByOwner({ type: 'global' })).toHaveLength(0);

    // Cell-type without ID returns separate group
    expect(registry.getByOwner({ type: 'cell-type' })).toHaveLength(0);
  });

  // 16
  it('TestExpressionTagRegistry_GetByTarget', () => {
    registry.add(makeTagDef({ name: 'tag-a', outputs: ['cell.alive'] }));
    registry.add(makeTagDef({ name: 'tag-b', inputs: ['cell.alive'], outputs: ['cell.age'] }));
    registry.add(makeTagDef({ name: 'tag-c', inputs: ['cell.age'], outputs: ['cell.alpha'] }));

    const aliveTargets = registry.getByTarget('cell.alive');
    expect(aliveTargets).toHaveLength(1);
    expect(aliveTargets[0].name).toBe('tag-a');

    const ageTargets = registry.getByTarget('cell.age');
    expect(ageTargets).toHaveLength(1);
    expect(ageTargets[0].name).toBe('tag-b');

    expect(registry.getByTarget('cell.nonexistent')).toHaveLength(0);
  });

  // 17
  it('TestExpressionTagRegistry_Clear', () => {
    registry.add(makeTagDef({ name: 't1', outputs: ['cell.alive'] }));
    registry.add(makeTagDef({ name: 't2', inputs: ['cell.alive'], outputs: ['cell.age'] }));
    registry.add(makeTagDef({ name: 't3', inputs: ['cell.age'], outputs: ['cell.alpha'] }));

    expect(registry.getAll()).toHaveLength(3);
    expect(registry.hasTags()).toBe(true);

    registry.clear();

    expect(registry.getAll()).toHaveLength(0);
    expect(registry.hasTags()).toBe(false);
    expect(registry.hasPreRuleTags()).toBe(false);
    expect(registry.hasPostRuleTags()).toBe(false);
  });

  // 18
  it('TestExpressionTagRegistry_LoadLinksFromConfig', () => {
    const defs = [
      { source: 'env.feedRate', target: 'cell.alive' },
      {
        source: 'env.killRate',
        target: 'cell.age',
        sourceRange: [0, 0.1] as [number, number],
        targetRange: [0, 100] as [number, number],
        easing: 'easeIn' as const,
        enabled: false,
      },
      {
        source: 'cell.alive',
        target: 'cell.alpha',
      },
    ];

    registry.loadLinksFromConfig(defs);

    const all = registry.getAll();
    expect(all).toHaveLength(3);

    // First link uses defaults
    const link1 = all.find((t) => t.inputs.includes('env.feedRate'))!;
    expect(link1.linkMeta!.sourceRange).toEqual([0, 1]);
    expect(link1.linkMeta!.targetRange).toEqual([0, 1]);
    expect(link1.linkMeta!.easing).toBe('linear');
    expect(link1.enabled).toBe(true);

    // Second link uses explicit values
    const link2 = all.find((t) => t.inputs.includes('env.killRate'))!;
    expect(link2.linkMeta!.sourceRange).toEqual([0, 0.1]);
    expect(link2.linkMeta!.targetRange).toEqual([0, 100]);
    expect(link2.linkMeta!.easing).toBe('easeIn');
    expect(link2.enabled).toBe(false);

    // All are code-sourced (via link wizard) pre-rule tags with linkMeta
    for (const tag of all) {
      expect(tag.source).toBe('code');
      expect(tag.phase).toBe('pre-rule');
      expect(tag.linkMeta).toBeDefined();
    }
  });

  // --- Additional edge case tests ---

  it('TestExpressionTagRegistry_HasPreRuleTags_FiltersCorrectly', () => {
    expect(registry.hasPreRuleTags()).toBe(false);

    // Disabled pre-rule tag should not count
    const tag = registry.add(makeTagDef({ phase: 'pre-rule', enabled: false }));
    expect(registry.hasPreRuleTags()).toBe(false);

    registry.enable(tag.id);
    expect(registry.hasPreRuleTags()).toBe(true);
  });

  it('TestExpressionTagRegistry_HasPostRuleTags_FiltersCorrectly', () => {
    expect(registry.hasPostRuleTags()).toBe(false);

    registry.add(makeTagDef({ phase: 'pre-rule', enabled: true }));
    expect(registry.hasPostRuleTags()).toBe(false);

    registry.addFromExpression('alpha', 'cell.alive * 0.5');
    expect(registry.hasPostRuleTags()).toBe(true);
  });

  it('TestExpressionTagRegistry_AddFromScript_SetsFields', () => {
    const tag = registry.addFromScript(
      'globalController',
      'global.x = env.feedRate * 2',
      ['env.feedRate'],
      ['global.x'],
      false,
    );

    expect(tag.source).toBe('script');
    expect(tag.phase).toBe('post-rule');
    expect(tag.name).toBe('globalController');
    expect(tag.code).toBe('global.x = env.feedRate * 2');
    expect(tag.inputs).toEqual(['env.feedRate']);
    expect(tag.outputs).toEqual(['global.x']);
    expect(tag.enabled).toBe(false);
    expect(tag.owner).toEqual({ type: 'root' });
  });

  it('TestExpressionTagRegistry_Update_RebuildsDependencyGraph', () => {
    // A -> B
    const tagA = registry.add(
      makeTagDef({
        name: 'A',
        inputs: ['env.feedRate'],
        outputs: ['env.killRate'],
      }),
    );

    // B -> C
    registry.add(
      makeTagDef({
        name: 'B',
        inputs: ['env.killRate'],
        outputs: ['env.diffusionA'],
      }),
    );

    // Now update A to output env.diffusionA instead. This would not create a
    // cycle because the graph edges from A are rebuilt.
    // But first confirm the cycle scenario:
    // If we added C -> feedRate it would cycle (existing test covers this).
    // Here we update A's output which removes old edges and adds new ones.
    const updated = registry.update(tagA.id, {
      inputs: ['env.diffusionB'],
      outputs: ['env.feedRate'],
    });
    expect(updated).not.toBeNull();
    expect(updated!.inputs).toEqual(['env.diffusionB']);
    expect(updated!.outputs).toEqual(['env.feedRate']);
  });

  it('TestExpressionTagRegistry_Update_DetectsCycleOnUpdate', () => {
    // A: feedRate -> killRate
    registry.add(
      makeTagDef({
        name: 'A',
        inputs: ['env.feedRate'],
        outputs: ['env.killRate'],
      }),
    );

    // B: killRate -> diffusionA
    const tagB = registry.add(
      makeTagDef({
        name: 'B',
        inputs: ['env.killRate'],
        outputs: ['env.diffusionA'],
      }),
    );

    // Update B to output feedRate (which A reads indirectly):
    // A reads feedRate -> writes killRate, B reads killRate -> writes feedRate => cycle
    expect(() =>
      registry.update(tagB.id, {
        outputs: ['env.feedRate'],
      }),
    ).toThrow(/cycle/i);
  });

  it('TestExpressionTagRegistry_Remove_CleansUpOwnerIndex', () => {
    const owner: TagOwner = { type: 'cell-type', id: 'TestCell' };
    const tag = registry.add(makeTagDef({ owner }));

    expect(registry.getByOwner(owner)).toHaveLength(1);

    registry.remove(tag.id);
    expect(registry.getByOwner(owner)).toHaveLength(0);
  });

  it('TestExpressionTagRegistry_IdGeneration_Increments', () => {
    const t1 = registry.add(makeTagDef({ outputs: ['cell.alive'] }));
    const t2 = registry.add(makeTagDef({ inputs: ['cell.alive'], outputs: ['cell.age'] }));
    const t3 = registry.add(makeTagDef({ inputs: ['cell.age'], outputs: ['cell.alpha'] }));

    expect(t1.id).toBe('tag_1');
    expect(t2.id).toBe('tag_2');
    expect(t3.id).toBe('tag_3');
  });

  it('TestExpressionTagRegistry_PreRuleResolve_SkipsDisabledTags', () => {
    const tag = registry.addFromLink(
      'env.feedRate',
      'cell.alive',
      [0, 1],
      [0, 255],
      'linear',
      false, // disabled
    );

    const grid = new MockGrid(4, ['alive']);
    const params = new Map<string, number>([['feedRate', 0.5]]);
    const varStore = new GlobalVariableStore();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry.resolvePreRule(grid as any, params, varStore);

    // Buffer should remain all zeros because the tag is disabled
    const buffer = grid.getCurrentBuffer('alive');
    for (let i = 0; i < buffer.length; i++) {
      expect(buffer[i]).toBe(0);
    }
  });

  it('TestExpressionTagRegistry_PreRuleResolve_SkipsPostRuleTags', () => {
    // A post-rule code tag should not be resolved during pre-rule
    registry.addFromExpression('alive', 'cell.alive + 1');

    const grid = new MockGrid(4, ['alive']);
    const params = new Map<string, number>();
    const varStore = new GlobalVariableStore();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry.resolvePreRule(grid as any, params, varStore);

    // Buffer untouched
    const buffer = grid.getCurrentBuffer('alive');
    for (let i = 0; i < buffer.length; i++) {
      expect(buffer[i]).toBe(0);
    }
  });

  it('TestExpressionTagRegistry_PreRuleResolve_WithEasing', () => {
    // easeIn: t^2
    registry.addFromLink(
      'env.feedRate',
      'cell.alive',
      [0, 1],
      [0, 100],
      'easeIn',
    );

    const grid = new MockGrid(4, ['alive']);
    const params = new Map<string, number>([['feedRate', 0.5]]);
    const varStore = new GlobalVariableStore();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry.resolvePreRule(grid as any, params, varStore);

    // easeIn(0.5) = 0.5^2 = 0.25, mapped to [0,100] => 25
    const buffer = grid.getCurrentBuffer('alive');
    for (let i = 0; i < buffer.length; i++) {
      expect(buffer[i]).toBeCloseTo(25, 3);
    }
  });

  it('TestExpressionTagRegistry_InvalidAddress_Throws', () => {
    expect(() =>
      registry.add(
        makeTagDef({
          outputs: ['invalidAddress'], // no dot
        }),
      ),
    ).toThrow(/missing namespace/i);

    expect(() =>
      registry.add(
        makeTagDef({
          outputs: ['badns.prop'], // invalid namespace
        }),
      ),
    ).toThrow(/invalid namespace/i);
  });
});
