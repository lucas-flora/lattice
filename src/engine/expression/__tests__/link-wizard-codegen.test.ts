/**
 * Tests for link wizard code generation and fast-path resolution.
 *
 * SG-5: Link Wizard + Source Simplification
 * - generateLinkCode produces valid rangeMap expressions
 * - Tags with linkMeta use JS fast-path (no Pyodide)
 * - Link wizard creates code-sourced tags, not link-sourced
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateLinkCode } from '../linkCodegen';
import { ExpressionTagRegistry, _resetTagIdCounter } from '../ExpressionTagRegistry';
import { GlobalVariableStore } from '../../scripting/GlobalVariableStore';
import type { LinkMeta } from '../types';

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

describe('Link Wizard Code Generation', () => {
  // --- generateLinkCode ---

  it('TestGenerateLinkCode_Linear_ProducesValidRangeMapExpression', () => {
    const meta: LinkMeta = {
      sourceAddress: 'cell.age',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'linear',
    };

    const code = generateLinkCode(meta, 'cell.alpha');

    // Should contain rangeMap call with correct params
    expect(code).toContain('rangeMap(cell.age');
    expect(code).toContain('[0,100]');
    expect(code).toContain('[0,1]');
    expect(code).toContain('"linear"');
    // Should assign to self.<property>
    expect(code).toContain('self.alpha = rangeMap');
    // Should have auto-generated comment header
    expect(code).toContain('# Auto-generated from link: cell.age');
    expect(code).toContain('cell.alpha');
  });

  it('TestGenerateLinkCode_Smoothstep_IncludesEasing', () => {
    const meta: LinkMeta = {
      sourceAddress: 'env.feedRate',
      sourceRange: [0, 1],
      targetRange: [0, 255],
      easing: 'smoothstep',
    };

    const code = generateLinkCode(meta, 'cell.alive');

    expect(code).toContain('"smoothstep"');
    expect(code).toContain('self.alive = rangeMap');
    expect(code).toContain('env.feedRate');
  });

  it('TestGenerateLinkCode_EnvTarget_ExtractsPropertyKey', () => {
    const meta: LinkMeta = {
      sourceAddress: 'cell.age',
      sourceRange: [0, 50],
      targetRange: [0, 0.1],
      easing: 'easeInOut',
    };

    const code = generateLinkCode(meta, 'env.killRate');

    // Should extract 'killRate' from 'env.killRate'
    expect(code).toContain('self.killRate = rangeMap');
  });

  it('TestGenerateLinkCode_CustomRanges_SerializesCorrectly', () => {
    const meta: LinkMeta = {
      sourceAddress: 'global.myVar',
      sourceRange: [10, 90],
      targetRange: [0.1, 0.9],
      easing: 'easeIn',
    };

    const code = generateLinkCode(meta, 'cell.alpha');

    // JSON.stringify produces [10,90] and [0.1,0.9]
    expect(code).toContain('[10,90]');
    expect(code).toContain('[0.1,0.9]');
    expect(code).toContain('"easeIn"');
  });

  it('TestGenerateLinkCode_AllEasingTypes_ProduceValidCode', () => {
    const easings = ['linear', 'smoothstep', 'easeIn', 'easeOut', 'easeInOut'] as const;

    for (const easing of easings) {
      const meta: LinkMeta = {
        sourceAddress: 'cell.age',
        sourceRange: [0, 1],
        targetRange: [0, 1],
        easing,
      };

      const code = generateLinkCode(meta, 'cell.alpha');

      expect(code).toContain(`"${easing}"`);
      expect(code).toContain('self.alpha = rangeMap');
    }
  });
});

describe('Link Wizard Fast-Path Integration', () => {
  let registry: ExpressionTagRegistry;

  beforeEach(() => {
    _resetTagIdCounter();
    registry = new ExpressionTagRegistry();
  });

  it('TestLinkWizard_CreatesCodeTag_NotLinkTag', () => {
    const tag = registry.addFromLink(
      'cell.age',
      'cell.alpha',
      [0, 100],
      [0, 1],
      'linear',
    );

    // Source should be 'code', NOT 'link'
    expect(tag.source).toBe('code');
    // linkMeta should be preserved for fast-path
    expect(tag.linkMeta).toBeDefined();
    expect(tag.linkMeta!.sourceAddress).toBe('cell.age');
    expect(tag.linkMeta!.easing).toBe('linear');
    // Phase should be pre-rule
    expect(tag.phase).toBe('pre-rule');
    // Generated code should contain rangeMap
    expect(tag.code).toContain('rangeMap');
  });

  it('TestLinkWizard_FastPath_TagWithLinkMetaUsesJsResolution', () => {
    const tag = registry.addFromLink(
      'env.feedRate',
      'cell.alive',
      [0, 1],
      [0, 255],
      'linear',
    );

    // isSimpleRangeMap checks linkMeta presence, regardless of source
    expect(registry.isSimpleRangeMap(tag)).toBe(true);
  });

  it('TestLinkWizard_FastPath_CodeTagWithoutLinkMeta_NotFastPath', () => {
    const tag = registry.addFromExpression('age', 'cell.age + 1');

    // No linkMeta means it goes through Python, not fast-path
    expect(registry.isSimpleRangeMap(tag)).toBe(false);
  });

  it('TestLinkWizard_FastPath_ResolvesCorrectly_ScalarToCell', () => {
    registry.addFromLink(
      'env.feedRate',
      'cell.alive',
      [0, 1],
      [0, 100],
      'linear',
    );

    const grid = new MockGrid(4, ['alive']);
    const params = new Map<string, number>([['feedRate', 0.75]]);
    const varStore = new GlobalVariableStore();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry.resolvePreRule(grid as any, params, varStore);

    // 0.75 mapped from [0,1] to [0,100] = 75, broadcast to all cells
    const buffer = grid.getCurrentBuffer('alive');
    for (let i = 0; i < buffer.length; i++) {
      expect(buffer[i]).toBeCloseTo(75, 3);
    }
  });

  it('TestLinkWizard_FastPath_ResolvesCorrectly_CellToCell', () => {
    registry.addFromLink(
      'cell.alive',
      'cell.age',
      [0, 1],
      [0, 50],
      'easeIn',
    );

    const grid = new MockGrid(4, ['alive', 'age']);
    const aliveBuf = grid.getCurrentBuffer('alive');
    aliveBuf[0] = 0.0;
    aliveBuf[1] = 0.5;
    aliveBuf[2] = 1.0;
    aliveBuf[3] = 0.25;

    const params = new Map<string, number>();
    const varStore = new GlobalVariableStore();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry.resolvePreRule(grid as any, params, varStore);

    const ageBuf = grid.getCurrentBuffer('age');
    // easeIn: t^2 mapped to [0,50]
    expect(ageBuf[0]).toBeCloseTo(0 * 0 * 50, 3);       // 0
    expect(ageBuf[1]).toBeCloseTo(0.5 * 0.5 * 50, 3);   // 12.5
    expect(ageBuf[2]).toBeCloseTo(1.0 * 1.0 * 50, 3);   // 50
    expect(ageBuf[3]).toBeCloseTo(0.25 * 0.25 * 50, 3); // 3.125
  });

  it('TestLinkWizard_FastPath_MigrateLinkTags_ConvertsToCode', () => {
    // Simulate a legacy link-sourced tag by directly adding one
    registry.add({
      name: 'legacy link',
      owner: { type: 'root' },
      code: 'pass',
      phase: 'pre-rule',
      enabled: true,
      source: 'link',  // legacy source type
      inputs: ['env.feedRate'],
      outputs: ['cell.alive'],
      linkMeta: {
        sourceAddress: 'env.feedRate',
        sourceRange: [0, 1],
        targetRange: [0, 1],
        easing: 'linear',
      },
    });

    // Before migration, source is 'link'
    const before = registry.getAll()[0];
    expect(before.source).toBe('link');

    // Run migration
    const count = registry.migrateLinkTags();
    expect(count).toBe(1);

    // After migration, source is 'code' but linkMeta preserved
    const after = registry.getAll()[0];
    expect(after.source).toBe('code');
    expect(after.linkMeta).toBeDefined();
    expect(after.linkMeta!.sourceAddress).toBe('env.feedRate');
  });

  it('TestLinkWizard_FastPath_CodeTagWithLinkMeta_StillFastPath', () => {
    // This tests the key SG-5 invariant: a code-sourced tag with linkMeta
    // should be eligible for the JS fast-path
    const tag = registry.add({
      name: 'wizard-generated',
      owner: { type: 'root' },
      code: generateLinkCode(
        { sourceAddress: 'env.feedRate', sourceRange: [0, 1], targetRange: [0, 1], easing: 'linear' },
        'cell.alive',
      ),
      phase: 'pre-rule',
      enabled: true,
      source: 'code',  // code source (from wizard)
      inputs: ['env.feedRate'],
      outputs: ['cell.alive'],
      linkMeta: {
        sourceAddress: 'env.feedRate',
        sourceRange: [0, 1],
        targetRange: [0, 1],
        easing: 'linear',
      },
    });

    // Must be detected as simple range map for fast-path
    expect(registry.isSimpleRangeMap(tag)).toBe(true);

    // Must actually resolve correctly via fast-path
    const grid = new MockGrid(4, ['alive']);
    const params = new Map<string, number>([['feedRate', 0.5]]);
    const varStore = new GlobalVariableStore();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry.resolvePreRule(grid as any, params, varStore);

    const buffer = grid.getCurrentBuffer('alive');
    for (let i = 0; i < buffer.length; i++) {
      expect(buffer[i]).toBeCloseTo(0.5, 5);
    }
  });
});
