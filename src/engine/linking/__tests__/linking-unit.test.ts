/**
 * Unit tests for Phase 6: Parameter Linking.
 *
 * Tests PropertyAddress parsing, easing functions, range mapping,
 * ExpressionTagRegistry link operations, cycle detection, and preset schema.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parseAddress } from '../PropertyAddress';
import { applyEasing, rangeMap, rangeMapArray } from '../easing';
import { ExpressionTagRegistry, _resetTagIdCounter } from '../../expression/ExpressionTagRegistry';
import { Grid } from '../../grid/Grid';
import { GlobalVariableStore } from '../../scripting/GlobalVariableStore';
import { PresetSchema } from '../../preset/schema';

// --- PropertyAddress Tests ---

describe('PropertyAddress', () => {
  it('TestPropertyAddress_ParseCellAddress', () => {
    const addr = parseAddress('cell.age');
    expect(addr.namespace).toBe('cell');
    expect(addr.key).toBe('age');
  });

  it('TestPropertyAddress_ParseEnvAddress', () => {
    const addr = parseAddress('env.feedRate');
    expect(addr.namespace).toBe('env');
    expect(addr.key).toBe('feedRate');
  });

  it('TestPropertyAddress_ParseGlobalAddress', () => {
    const addr = parseAddress('global.entropy');
    expect(addr.namespace).toBe('global');
    expect(addr.key).toBe('entropy');
  });

  it('TestPropertyAddress_InvalidAddress_NoDot', () => {
    expect(() => parseAddress('alive')).toThrow('missing namespace');
  });

  it('TestPropertyAddress_InvalidAddress_BadNamespace', () => {
    expect(() => parseAddress('foo.bar')).toThrow('Invalid namespace');
  });

  it('TestPropertyAddress_InvalidAddress_EmptyKey', () => {
    expect(() => parseAddress('cell.')).toThrow('empty key');
  });
});

// --- Easing Tests ---

describe('Easing', () => {
  it('TestEasing_Linear', () => {
    expect(applyEasing(0, 'linear')).toBe(0);
    expect(applyEasing(0.5, 'linear')).toBe(0.5);
    expect(applyEasing(1, 'linear')).toBe(1);
  });

  it('TestEasing_Smoothstep', () => {
    expect(applyEasing(0, 'smoothstep')).toBe(0);
    expect(applyEasing(1, 'smoothstep')).toBe(1);
    // Smoothstep at 0.5 should be 0.5
    expect(applyEasing(0.5, 'smoothstep')).toBe(0.5);
    // Smoothstep should curve — midpoint values differ from linear
    const val = applyEasing(0.25, 'smoothstep');
    expect(val).toBeGreaterThan(0);
    expect(val).toBeLessThan(0.25 + 0.1); // Slight overshoot
  });

  it('TestEasing_EaseIn', () => {
    expect(applyEasing(0, 'easeIn')).toBe(0);
    expect(applyEasing(1, 'easeIn')).toBe(1);
    // easeIn (t²) starts slow
    expect(applyEasing(0.5, 'easeIn')).toBe(0.25);
  });

  it('TestEasing_EaseOut', () => {
    expect(applyEasing(0, 'easeOut')).toBe(0);
    expect(applyEasing(1, 'easeOut')).toBe(1);
    // easeOut ends slow
    expect(applyEasing(0.5, 'easeOut')).toBe(0.75);
  });

  it('TestEasing_EaseInOut', () => {
    expect(applyEasing(0, 'easeInOut')).toBe(0);
    expect(applyEasing(1, 'easeInOut')).toBe(1);
    expect(applyEasing(0.5, 'easeInOut')).toBe(0.5);
  });
});

// --- Range Mapping Tests ---

describe('RangeMap', () => {
  it('TestRangeMap_NormalRange', () => {
    expect(rangeMap(50, [0, 100], [0, 1], 'linear')).toBeCloseTo(0.5);
    expect(rangeMap(0, [0, 100], [0, 1], 'linear')).toBeCloseTo(0);
    expect(rangeMap(100, [0, 100], [0, 1], 'linear')).toBeCloseTo(1);
  });

  it('TestRangeMap_InvertedRange', () => {
    // Target range is inverted: [1, 0] — should map 0→1 and 100→0
    expect(rangeMap(0, [0, 100], [1, 0], 'linear')).toBeCloseTo(1);
    expect(rangeMap(100, [0, 100], [1, 0], 'linear')).toBeCloseTo(0);
    expect(rangeMap(50, [0, 100], [1, 0], 'linear')).toBeCloseTo(0.5);
  });

  it('TestRangeMap_ClampsBeyondRange', () => {
    // Values outside source range should clamp to [0,1] before mapping
    expect(rangeMap(-10, [0, 100], [0, 1], 'linear')).toBeCloseTo(0);
    expect(rangeMap(200, [0, 100], [0, 1], 'linear')).toBeCloseTo(1);
  });

  it('TestRangeMap_ZeroSpan', () => {
    // Source range with zero span should not crash
    expect(rangeMap(5, [5, 5], [0, 10], 'linear')).toBe(0);
  });
});

describe('RangeMapArray', () => {
  it('TestRangeMapArray_ElementWise', () => {
    const src = new Float32Array([0, 25, 50, 75, 100]);
    const out = new Float32Array(5);
    rangeMapArray(src, out, [0, 100], [0, 1], 'linear');

    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0.25);
    expect(out[2]).toBeCloseTo(0.5);
    expect(out[3]).toBeCloseTo(0.75);
    expect(out[4]).toBeCloseTo(1);
  });

  it('TestRangeMapArray_MatchesSingleValues', () => {
    const src = new Float32Array([0, 50, 100]);
    const out = new Float32Array(3);
    rangeMapArray(src, out, [0, 100], [0, 10], 'easeIn');

    for (let i = 0; i < 3; i++) {
      expect(out[i]).toBeCloseTo(rangeMap(src[i], [0, 100], [0, 10], 'easeIn'));
    }
  });
});

// --- ExpressionTagRegistry Link Tests ---
// These replace the old LinkRegistry tests since links are now ExpressionTags.

describe('ExpressionTagRegistry — link operations', () => {
  let registry: ExpressionTagRegistry;

  beforeEach(() => {
    _resetTagIdCounter();
    registry = new ExpressionTagRegistry();
  });

  it('TestExpressionTagRegistry_AddLinkAndGet', () => {
    const tag = registry.addFromLink('cell.age', 'cell.alpha', [0, 100], [1, 0], 'smoothstep', true);

    expect(tag.id).toBeDefined();
    expect(registry.get(tag.id)).toEqual(tag);
    expect(registry.getAll().filter(t => t.linkMeta !== undefined)).toHaveLength(1);
  });

  it('TestExpressionTagRegistry_RemoveLink', () => {
    const tag = registry.addFromLink('cell.age', 'cell.alpha', [0, 100], [1, 0], 'linear', true);
    expect(registry.remove(tag.id)).toBe(true);
    expect(registry.getAll().filter(t => t.linkMeta !== undefined)).toHaveLength(0);
    expect(registry.remove('nonexistent')).toBe(false);
  });

  it('TestExpressionTagRegistry_EnableLink', () => {
    const tag = registry.addFromLink('cell.age', 'cell.alpha', [0, 100], [1, 0], 'linear', false);
    expect(tag.enabled).toBe(false);
    registry.enable(tag.id);
    expect(registry.get(tag.id)!.enabled).toBe(true);
  });

  it('TestExpressionTagRegistry_DisableLink', () => {
    const tag = registry.addFromLink('cell.age', 'cell.alpha', [0, 100], [1, 0], 'linear', true);
    expect(tag.enabled).toBe(true);
    registry.disable(tag.id);
    expect(registry.get(tag.id)!.enabled).toBe(false);
  });

  it('TestExpressionTagRegistry_ClearLinks', () => {
    registry.addFromLink('cell.age', 'cell.alpha', [0, 100], [1, 0], 'linear', true);
    registry.addFromLink('env.feedRate', 'env.killRate', [0, 1], [0, 1], 'linear', true);
    expect(registry.getAll().filter(t => t.linkMeta !== undefined)).toHaveLength(2);
    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });

  it('TestExpressionTagRegistry_LoadLinksFromConfig', () => {
    registry.loadLinksFromConfig([
      { source: 'cell.age', target: 'cell.alpha', sourceRange: [0, 100], targetRange: [1, 0] },
      { source: 'env.feedRate', target: 'env.killRate' },
    ]);
    const linkTags = registry.getAll().filter(t => t.linkMeta !== undefined);
    expect(linkTags).toHaveLength(2);
    expect(linkTags[0].linkMeta!.sourceRange).toEqual([0, 100]);
    // Defaults applied
    expect(linkTags[1].linkMeta!.sourceRange).toEqual([0, 1]);
    expect(linkTags[1].linkMeta!.easing).toBe('linear');
  });

  it('TestExpressionTagRegistry_GetEnabledLinks', () => {
    registry.addFromLink('cell.age', 'cell.alpha', [0, 100], [1, 0], 'linear', true);
    registry.addFromLink('env.feedRate', 'env.killRate', [0, 1], [0, 1], 'linear', false);
    const enabledLinkTags = registry.getEnabled().filter(t => t.linkMeta !== undefined);
    expect(enabledLinkTags).toHaveLength(1);
  });
});

// --- Cycle Detection Tests ---

describe('ExpressionTagRegistry — Cycle Detection', () => {
  let registry: ExpressionTagRegistry;

  beforeEach(() => {
    _resetTagIdCounter();
    registry = new ExpressionTagRegistry();
  });

  it('TestExpressionTagRegistry_CycleDetection_RejectsDirectCycle', () => {
    registry.addFromLink('cell.age', 'cell.alpha', [0, 1], [0, 1], 'linear', true);
    expect(() => {
      registry.addFromLink('cell.alpha', 'cell.age', [0, 1], [0, 1], 'linear', true);
    }).toThrow('cycle');
  });

  it('TestExpressionTagRegistry_CycleDetection_RejectsIndirectCycle', () => {
    registry.addFromLink('cell.age', 'cell.alpha', [0, 1], [0, 1], 'linear', true);
    registry.addFromLink('cell.alpha', 'env.feedRate', [0, 1], [0, 1], 'linear', true);
    expect(() => {
      registry.addFromLink('env.feedRate', 'cell.age', [0, 1], [0, 1], 'linear', true);
    }).toThrow('cycle');
  });

  it('TestExpressionTagRegistry_CycleDetection_RejectsSelfLoop', () => {
    expect(() => {
      registry.addFromLink('cell.age', 'cell.age', [0, 1], [0, 1], 'linear', true);
    }).toThrow('cycle');
  });

  it('TestExpressionTagRegistry_CycleDetection_AllowsDAG', () => {
    // A → B, A → C, B → D, C → D — valid DAG
    registry.addFromLink('cell.age', 'cell.alpha', [0, 1], [0, 1], 'linear', true);
    registry.addFromLink('cell.age', 'env.feedRate', [0, 1], [0, 1], 'linear', true);
    registry.addFromLink('cell.alpha', 'global.entropy', [0, 1], [0, 1], 'linear', true);
    expect(() => {
      registry.addFromLink('env.feedRate', 'global.entropy', [0, 1], [0, 1], 'linear', true);
    }).not.toThrow();
    expect(registry.getAll().filter(t => t.linkMeta !== undefined)).toHaveLength(4);
  });
});

// --- Resolution Tests ---

describe('ExpressionTagRegistry — resolvePreRule', () => {
  let grid: Grid;
  let params: Map<string, number>;
  let variableStore: GlobalVariableStore;

  beforeEach(() => {
    _resetTagIdCounter();
    grid = new Grid({
      dimensionality: '2d',
      width: 4,
      height: 4,
      depth: 1,
      topology: 'toroidal',
      neighborhood: 'moore',
    });
    grid.addProperty('age', 1, 0);
    grid.addProperty('alpha', 1, 1);
    params = new Map([['feedRate', 0.055], ['killRate', 0.062]]);
    variableStore = new GlobalVariableStore();
    variableStore.set('density', 0);
  });

  it('TestExpressionTagRegistry_ResolvePreRule_CellToCell', () => {
    const registry = new ExpressionTagRegistry();
    registry.addFromLink('cell.age', 'cell.alpha', [0, 100], [1, 0], 'linear', true);

    // Set some ages
    const ageBuf = grid.getCurrentBuffer('age');
    ageBuf[0] = 0;
    ageBuf[1] = 50;
    ageBuf[2] = 100;

    registry.resolvePreRule(grid, params, variableStore);

    const alphaBuf = grid.getCurrentBuffer('alpha');
    expect(alphaBuf[0]).toBeCloseTo(1);   // age 0 → alpha 1
    expect(alphaBuf[1]).toBeCloseTo(0.5); // age 50 → alpha 0.5
    expect(alphaBuf[2]).toBeCloseTo(0);   // age 100 → alpha 0
  });

  it('TestExpressionTagRegistry_ResolvePreRule_ScalarToScalar', () => {
    const registry = new ExpressionTagRegistry();
    registry.addFromLink('env.feedRate', 'env.killRate', [0, 0.1], [0, 0.1], 'linear', true);

    registry.resolvePreRule(grid, params, variableStore);

    // feedRate 0.055 mapped from [0,0.1] to [0,0.1] = 0.055
    expect(params.get('killRate')).toBeCloseTo(0.055);
  });

  it('TestExpressionTagRegistry_ResolvePreRule_ScalarToCell', () => {
    const registry = new ExpressionTagRegistry();
    registry.addFromLink('env.feedRate', 'cell.alpha', [0, 1], [0, 1], 'linear', true);

    registry.resolvePreRule(grid, params, variableStore);

    const alphaBuf = grid.getCurrentBuffer('alpha');
    for (let i = 0; i < alphaBuf.length; i++) {
      expect(alphaBuf[i]).toBeCloseTo(0.055);
    }
  });

  it('TestExpressionTagRegistry_ResolvePreRule_CellToScalar', () => {
    const registry = new ExpressionTagRegistry();
    registry.addFromLink('cell.age', 'global.density', [0, 100], [0, 1], 'linear', true);

    // Set ages: mean should be 25
    const ageBuf = grid.getCurrentBuffer('age');
    ageBuf.fill(0);
    ageBuf[0] = 100; // only one cell has age 100, rest are 0

    registry.resolvePreRule(grid, params, variableStore);

    // Mean = 100/16 = 6.25, mapped from [0,100] to [0,1] = 0.0625
    expect(variableStore.get('density')).toBeCloseTo(0.0625);
  });

  it('TestExpressionTagRegistry_ResolvePreRule_DisabledLinkSkipped', () => {
    const registry = new ExpressionTagRegistry();
    const tag = registry.addFromLink('env.feedRate', 'env.killRate', [0, 1], [0, 1], 'linear', false);

    const originalKillRate = params.get('killRate')!;
    registry.resolvePreRule(grid, params, variableStore);
    expect(params.get('killRate')).toBe(originalKillRate); // Unchanged

    // Re-enable and resolve
    registry.enable(tag.id);
    registry.resolvePreRule(grid, params, variableStore);
    expect(params.get('killRate')).toBeCloseTo(0.055);
  });
});

// --- Preset Schema Tests ---

const basePreset = {
  schema_version: '1',
  meta: { name: 'Link Test' },
  grid: { dimensionality: '2d', width: 8, height: 8, topology: 'toroidal' },
  cell_properties: [
    { name: 'alive', type: 'bool', default: 0 },
    { name: 'age', type: 'int', default: 0 },
    { name: 'alpha', type: 'float', default: 1 },
  ],
  rule: { type: 'typescript', compute: 'return 0;' },
};

describe('PresetSchema — parameter links', () => {
  it('TestPresetSchema_AcceptsParameterLinks', () => {
    const preset = {
      ...basePreset,
      parameter_links: [
        { source: 'cell.age', target: 'cell.alpha', sourceRange: [0, 100], targetRange: [1, 0], easing: 'smoothstep' },
      ],
    };
    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parameter_links).toHaveLength(1);
      expect(result.data.parameter_links![0].easing).toBe('smoothstep');
    }
  });

  it('TestPresetSchema_DefaultRanges', () => {
    const preset = {
      ...basePreset,
      parameter_links: [
        { source: 'cell.age', target: 'cell.alpha' },
      ],
    };
    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(true);
    if (result.success) {
      const link = result.data.parameter_links![0];
      expect(link.sourceRange).toEqual([0, 1]);
      expect(link.targetRange).toEqual([0, 1]);
      expect(link.easing).toBe('linear');
      expect(link.enabled).toBe(true);
    }
  });

  it('TestPresetSchema_ExistingPresetsUnaffected', () => {
    // Base preset without parameter_links should still parse
    const result = PresetSchema.safeParse(basePreset);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parameter_links).toBeUndefined();
    }
  });
});
