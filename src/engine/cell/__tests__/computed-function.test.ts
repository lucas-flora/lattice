import { describe, it, expect } from 'vitest';
import { ComputedFunction } from '../ComputedFunction';
import type { ComputeContext } from '../types';

function makeContext(overrides: Partial<ComputeContext> = {}): ComputeContext {
  return {
    cell: {},
    neighbors: [],
    grid: { width: 10, height: 10, depth: 1, dimensionality: '2d' },
    params: {},
    ...overrides,
  };
}

describe('ComputedFunction', () => {
  it('TestComputed_SimpleReturn', () => {
    const fn = new ComputedFunction('test', 'return 1;');
    expect(fn.evaluate(makeContext())).toBe(1);
  });

  it('TestComputed_CellAccess', () => {
    const fn = new ComputedFunction('derived', 'return ctx.cell.energy * 2;');
    const result = fn.evaluate(makeContext({ cell: { energy: 5 } }));
    expect(result).toBe(10);
  });

  it('TestComputed_NeighborAccess', () => {
    const fn = new ComputedFunction(
      'neighborSum',
      `
      let sum = 0;
      for (const n of ctx.neighbors) {
        sum += n.value;
      }
      return sum;
      `,
    );
    const result = fn.evaluate(
      makeContext({
        neighbors: [
          { value: 1 },
          { value: 2 },
          { value: 3 },
        ],
      }),
    );
    expect(result).toBe(6);
  });

  it('TestComputed_ConditionalLogic', () => {
    const fn = new ComputedFunction(
      'alive',
      `
      const alive = ctx.cell.alive;
      const neighborCount = ctx.neighbors.filter(function(n) { return n.alive === 1; }).length;
      if (alive === 1) {
        return (neighborCount === 2 || neighborCount === 3) ? 1 : 0;
      }
      return neighborCount === 3 ? 1 : 0;
      `,
    );

    // Live cell with 2 neighbors survives
    expect(
      fn.evaluate(
        makeContext({
          cell: { alive: 1 },
          neighbors: [{ alive: 1 }, { alive: 1 }, { alive: 0 }],
        }),
      ),
    ).toBe(1);

    // Live cell with 4 neighbors dies
    expect(
      fn.evaluate(
        makeContext({
          cell: { alive: 1 },
          neighbors: [{ alive: 1 }, { alive: 1 }, { alive: 1 }, { alive: 1 }],
        }),
      ),
    ).toBe(0);

    // Dead cell with 3 neighbors becomes alive
    expect(
      fn.evaluate(
        makeContext({
          cell: { alive: 0 },
          neighbors: [{ alive: 1 }, { alive: 1 }, { alive: 1 }],
        }),
      ),
    ).toBe(1);
  });

  it('TestComputed_SyntaxErrorThrows', () => {
    expect(
      () => new ComputedFunction('bad', 'return {{{;'),
    ).toThrow("Failed to compile compute function for property 'bad'");
  });

  it('TestComputed_VectorReturn', () => {
    const fn = new ComputedFunction('color', 'return [ctx.cell.r, ctx.cell.g, ctx.cell.b];');
    const result = fn.evaluate(makeContext({ cell: { r: 1, g: 0.5, b: 0 } }));
    expect(result).toEqual([1, 0.5, 0]);
  });

  it('TestComputed_GetSource', () => {
    const source = 'return ctx.cell.value + 1;';
    const fn = new ComputedFunction('inc', source);
    expect(fn.getSource()).toBe(source);
  });

  it('TestComputed_PropertyName', () => {
    const fn = new ComputedFunction('myProp', 'return 0;');
    expect(fn.propertyName).toBe('myProp');
  });

  it('TestComputed_ParamsAccess', () => {
    const fn = new ComputedFunction('paramTest', 'return ctx.params.threshold;');
    const result = fn.evaluate(makeContext({ params: { threshold: 0.5 } }));
    expect(result).toBe(0.5);
  });

  it('TestComputed_GridAccess', () => {
    const fn = new ComputedFunction('gridTest', 'return ctx.grid.width * ctx.grid.height;');
    const result = fn.evaluate(makeContext());
    expect(result).toBe(100); // 10 * 10
  });
});
