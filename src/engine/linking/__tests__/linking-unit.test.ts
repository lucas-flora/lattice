/**
 * Unit tests for Phase 6: Parameter Linking.
 *
 * Tests PropertyAddress parsing, easing functions, range mapping,
 * LinkRegistry operations, cycle detection, and preset schema.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parseAddress } from '../PropertyAddress';
import { applyEasing, rangeMap, rangeMapArray } from '../easing';
import { LinkRegistry, _resetIdCounter } from '../LinkRegistry';
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

// --- LinkRegistry Tests ---

describe('LinkRegistry', () => {
  let registry: LinkRegistry;

  beforeEach(() => {
    _resetIdCounter();
    registry = new LinkRegistry();
  });

  it('TestLinkRegistry_AddAndGet', () => {
    const link = registry.add({
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [1, 0],
      easing: 'smoothstep',
      enabled: true,
    });

    expect(link.id).toBeDefined();
    expect(registry.get(link.id)).toEqual(link);
    expect(registry.getAll()).toHaveLength(1);
  });

  it('TestLinkRegistry_Remove', () => {
    const link = registry.add({ source: 'cell.age', target: 'cell.alpha' });
    expect(registry.remove(link.id)).toBe(true);
    expect(registry.getAll()).toHaveLength(0);
    expect(registry.remove('nonexistent')).toBe(false);
  });

  it('TestLinkRegistry_Enable', () => {
    const link = registry.add({ source: 'cell.age', target: 'cell.alpha', enabled: false });
    expect(link.enabled).toBe(false);
    registry.enable(link.id);
    expect(registry.get(link.id)!.enabled).toBe(true);
  });

  it('TestLinkRegistry_Disable', () => {
    const link = registry.add({ source: 'cell.age', target: 'cell.alpha' });
    expect(link.enabled).toBe(true);
    registry.disable(link.id);
    expect(registry.get(link.id)!.enabled).toBe(false);
  });

  it('TestLinkRegistry_Clear', () => {
    registry.add({ source: 'cell.age', target: 'cell.alpha' });
    registry.add({ source: 'env.feedRate', target: 'env.killRate' });
    expect(registry.getAll()).toHaveLength(2);
    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });

  it('TestLinkRegistry_LoadFromConfig', () => {
    registry.loadFromConfig([
      { source: 'cell.age', target: 'cell.alpha', sourceRange: [0, 100], targetRange: [1, 0] },
      { source: 'env.feedRate', target: 'env.killRate' },
    ]);
    expect(registry.getAll()).toHaveLength(2);
    const links = registry.getAll();
    expect(links[0].sourceRange).toEqual([0, 100]);
    // Defaults applied
    expect(links[1].sourceRange).toEqual([0, 1]);
    expect(links[1].easing).toBe('linear');
  });

  it('TestLinkRegistry_GetEnabled', () => {
    registry.add({ source: 'cell.age', target: 'cell.alpha', enabled: true });
    registry.add({ source: 'env.feedRate', target: 'env.killRate', enabled: false });
    expect(registry.getEnabled()).toHaveLength(1);
  });
});

// --- Cycle Detection Tests ---

describe('LinkRegistry — Cycle Detection', () => {
  let registry: LinkRegistry;

  beforeEach(() => {
    _resetIdCounter();
    registry = new LinkRegistry();
  });

  it('TestLinkRegistry_CycleDetection_RejectsDirectCycle', () => {
    registry.add({ source: 'cell.age', target: 'cell.alpha' });
    expect(() => {
      registry.add({ source: 'cell.alpha', target: 'cell.age' });
    }).toThrow('cycle');
  });

  it('TestLinkRegistry_CycleDetection_RejectsIndirectCycle', () => {
    registry.add({ source: 'cell.age', target: 'cell.alpha' });
    registry.add({ source: 'cell.alpha', target: 'env.feedRate' });
    expect(() => {
      registry.add({ source: 'env.feedRate', target: 'cell.age' });
    }).toThrow('cycle');
  });

  it('TestLinkRegistry_CycleDetection_RejectsSelfLoop', () => {
    expect(() => {
      registry.add({ source: 'cell.age', target: 'cell.age' });
    }).toThrow('cycle');
  });

  it('TestLinkRegistry_CycleDetection_AllowsDAG', () => {
    // A → B, A → C, B → D, C → D — valid DAG
    registry.add({ source: 'cell.age', target: 'cell.alpha' });
    registry.add({ source: 'cell.age', target: 'env.feedRate' });
    registry.add({ source: 'cell.alpha', target: 'global.entropy' });
    expect(() => {
      registry.add({ source: 'env.feedRate', target: 'global.entropy' });
    }).not.toThrow();
    expect(registry.getAll()).toHaveLength(4);
  });
});

// --- Resolution Tests ---

describe('LinkRegistry — resolveAll', () => {
  let grid: Grid;
  let params: Map<string, number>;
  let variableStore: GlobalVariableStore;

  beforeEach(() => {
    _resetIdCounter();
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

  it('TestLinkRegistry_ResolveAll_CellToCell', () => {
    const registry = new LinkRegistry();
    registry.add({
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [1, 0],
      easing: 'linear',
    });

    // Set some ages
    const ageBuf = grid.getCurrentBuffer('age');
    ageBuf[0] = 0;
    ageBuf[1] = 50;
    ageBuf[2] = 100;

    registry.resolveAll(grid, params, variableStore);

    const alphaBuf = grid.getCurrentBuffer('alpha');
    expect(alphaBuf[0]).toBeCloseTo(1);   // age 0 → alpha 1
    expect(alphaBuf[1]).toBeCloseTo(0.5); // age 50 → alpha 0.5
    expect(alphaBuf[2]).toBeCloseTo(0);   // age 100 → alpha 0
  });

  it('TestLinkRegistry_ResolveAll_ScalarToScalar', () => {
    const registry = new LinkRegistry();
    registry.add({
      source: 'env.feedRate',
      target: 'env.killRate',
      sourceRange: [0, 0.1],
      targetRange: [0, 0.1],
      easing: 'linear',
    });

    registry.resolveAll(grid, params, variableStore);

    // feedRate 0.055 mapped from [0,0.1] to [0,0.1] = 0.055
    expect(params.get('killRate')).toBeCloseTo(0.055);
  });

  it('TestLinkRegistry_ResolveAll_ScalarToCell', () => {
    const registry = new LinkRegistry();
    registry.add({
      source: 'env.feedRate',
      target: 'cell.alpha',
      sourceRange: [0, 1],
      targetRange: [0, 1],
      easing: 'linear',
    });

    registry.resolveAll(grid, params, variableStore);

    const alphaBuf = grid.getCurrentBuffer('alpha');
    for (let i = 0; i < alphaBuf.length; i++) {
      expect(alphaBuf[i]).toBeCloseTo(0.055);
    }
  });

  it('TestLinkRegistry_ResolveAll_CellToScalar', () => {
    const registry = new LinkRegistry();
    registry.add({
      source: 'cell.age',
      target: 'global.density',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'linear',
    });

    // Set ages: mean should be 25
    const ageBuf = grid.getCurrentBuffer('age');
    ageBuf.fill(0);
    ageBuf[0] = 100; // only one cell has age 100, rest are 0

    registry.resolveAll(grid, params, variableStore);

    // Mean = 100/16 = 6.25, mapped from [0,100] to [0,1] = 0.0625
    expect(variableStore.get('density')).toBeCloseTo(0.0625);
  });

  it('TestLinkRegistry_ResolveAll_DisabledLinkSkipped', () => {
    const registry = new LinkRegistry();
    const link = registry.add({
      source: 'env.feedRate',
      target: 'env.killRate',
      sourceRange: [0, 1],
      targetRange: [0, 1],
      easing: 'linear',
      enabled: false,
    });

    const originalKillRate = params.get('killRate')!;
    registry.resolveAll(grid, params, variableStore);
    expect(params.get('killRate')).toBe(originalKillRate); // Unchanged

    // Re-enable and resolve
    registry.enable(link.id);
    registry.resolveAll(grid, params, variableStore);
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
