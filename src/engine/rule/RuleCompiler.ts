/**
 * Rule Compiler: transforms YAML rule compute strings into callable functions.
 *
 * The compile step uses `new Function()` to create a function from the
 * compute body string. The function receives a `ctx` parameter containing
 * cell state, neighbors, grid info, and parameters.
 *
 * This is the TypeScript baseline execution path. WASM acceleration
 * is handled by RuleRunner checking for a WASM module first.
 */

import type { RuleFn, RuleContext } from './types';

/**
 * Compile a rule compute string into a callable RuleFn.
 *
 * The compute body has access to `ctx` with these fields:
 * - ctx.cell: Record<string, number | number[]> - current cell properties
 * - ctx.neighbors: Array<Record<string, number | number[]>> - neighbor views
 * - ctx.grid: { width, height, depth, dimensionality }
 * - ctx.params: Record<string, unknown>
 * - ctx.cellIndex, ctx.x, ctx.y, ctx.z
 * - ctx.generation, ctx.dt
 *
 * The function must return a Record<string, number | number[]> mapping
 * property names to their new values.
 */
export function compileRule(computeBody: string): RuleFn {
  try {
    // Wrap the compute body so it can return a value.
    // If the body already contains "return", use it directly.
    // Otherwise wrap it to return the last expression.
    const fn = new Function('ctx', computeBody) as RuleFn;
    return fn;
  } catch (err) {
    throw new Error(
      `Failed to compile rule: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Validate that a compiled rule function runs without error against a test context.
 */
export function validateCompiledRule(fn: RuleFn): boolean {
  const testCtx: RuleContext = {
    cell: {},
    neighbors: [],
    grid: { width: 1, height: 1, depth: 1, dimensionality: '2d' },
    params: {},
    cellIndex: 0,
    x: 0,
    y: 0,
    z: 0,
    generation: 0,
    dt: 1,
  };

  try {
    fn(testCtx);
    return true;
  } catch {
    return false;
  }
}
