/**
 * Tests for RuleCompiler — compiles YAML rule compute strings into callable functions.
 *
 * RULE-01: Rules follow perceive-update contract
 * RULE-02: TypeScript rule execution as baseline
 */

import { describe, it, expect } from 'vitest';
import { compileRule, validateCompiledRule } from '../RuleCompiler';
import type { RuleContext } from '../types';

function makeCtx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    cell: {},
    neighbors: [],
    grid: { width: 10, height: 10, depth: 1, dimensionality: '2d' },
    params: {},
    cellIndex: 0,
    x: 0,
    y: 0,
    z: 0,
    generation: 0,
    dt: 1,
    ...overrides,
  };
}

describe('RuleCompiler', () => {
  it('compiles a simple return statement', () => {
    const fn = compileRule('return { state: 1 };');
    const result = fn(makeCtx());
    expect(result).toEqual({ state: 1 });
  });

  it('compiles a rule that reads cell state', () => {
    const fn = compileRule('return { alive: ctx.cell.alive === 1 ? 0 : 1 };');
    const ctx = makeCtx({ cell: { alive: 1 } });
    expect(fn(ctx)).toEqual({ alive: 0 });
  });

  it('compiles a rule that reads neighbor state', () => {
    const fn = compileRule(
      'const count = ctx.neighbors.filter(n => n.alive === 1).length; return { count };',
    );
    const ctx = makeCtx({
      neighbors: [{ alive: 1 }, { alive: 0 }, { alive: 1 }],
    });
    expect(fn(ctx)).toEqual({ count: 2 });
  });

  it('compiles a multi-line rule', () => {
    const fn = compileRule(`
      const alive = ctx.cell.alive;
      const liveNeighbors = ctx.neighbors.filter(n => n.alive === 1).length;
      if (alive === 1) {
        return { alive: (liveNeighbors === 2 || liveNeighbors === 3) ? 1 : 0 };
      }
      return { alive: liveNeighbors === 3 ? 1 : 0 };
    `);
    // Dead cell with 3 neighbors -> born
    expect(fn(makeCtx({
      cell: { alive: 0 },
      neighbors: [{ alive: 1 }, { alive: 1 }, { alive: 1 }],
    }))).toEqual({ alive: 1 });
  });

  it('has access to grid dimensions', () => {
    const fn = compileRule('return { w: ctx.grid.width, h: ctx.grid.height };');
    const ctx = makeCtx({ grid: { width: 64, height: 32, depth: 1, dimensionality: '2d' } });
    expect(fn(ctx)).toEqual({ w: 64, h: 32 });
  });

  it('has access to cell coordinates', () => {
    const fn = compileRule('return { x: ctx.x, y: ctx.y };');
    const ctx = makeCtx({ x: 5, y: 10 });
    expect(fn(ctx)).toEqual({ x: 5, y: 10 });
  });

  it('has access to generation number', () => {
    const fn = compileRule('return { gen: ctx.generation };');
    const ctx = makeCtx({ generation: 42 });
    expect(fn(ctx)).toEqual({ gen: 42 });
  });

  it('throws on invalid JavaScript syntax', () => {
    expect(() => compileRule('return {{;')).toThrow('Failed to compile rule');
  });

  it('validateCompiledRule returns true for a valid rule', () => {
    const fn = compileRule('return { state: 0 };');
    expect(validateCompiledRule(fn)).toBe(true);
  });

  it('validateCompiledRule returns false for a rule that throws', () => {
    const fn = compileRule('throw new Error("boom");');
    expect(validateCompiledRule(fn)).toBe(false);
  });
});
