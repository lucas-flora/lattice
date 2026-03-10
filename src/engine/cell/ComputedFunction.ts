/**
 * Compiled computed function wrapper.
 *
 * Compiles a JavaScript function body string into a callable function
 * that receives a ComputeContext and returns a value.
 */

import type { ComputeContext, ComputeFn } from './types';

export class ComputedFunction {
  readonly propertyName: string;
  private fn: ComputeFn;
  private source: string;

  constructor(propertyName: string, functionBody: string) {
    this.propertyName = propertyName;
    this.source = functionBody;
    this.fn = this.compile(functionBody);
  }

  /**
   * Compile a function body string into a callable function.
   *
   * The function receives a single 'ctx' parameter of type ComputeContext
   * containing: { cell, neighbors, grid, params }
   */
  private compile(body: string): ComputeFn {
    try {
      return new Function('ctx', body) as ComputeFn;
    } catch (err) {
      throw new Error(
        `Failed to compile compute function for property '${this.propertyName}': ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Execute the computed function with the given context.
   */
  evaluate(ctx: ComputeContext): number | number[] {
    return this.fn(ctx);
  }

  /**
   * Get the original source for debugging.
   */
  getSource(): string {
    return this.source;
  }
}
