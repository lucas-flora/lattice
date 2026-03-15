/**
 * ExpressionEngine: manages per-property Python expressions.
 *
 * Expressions evaluate before the rule in the tick pipeline.
 * All expressions are batched into a single Python harness and sent
 * as one worker call per tick.
 */

import { eventBus } from '../core/EventBus';
import type { PyodideBridge } from './PyodideBridge';
import type { Grid } from '../grid/Grid';
import { extractGridBuffers, applyResultBuffers } from './gridTransfer';
import { buildExpressionHarness } from './expressionHarness';

export class ExpressionEngine {
  private expressions = new Map<string, string>();
  private bridge: PyodideBridge;

  constructor(bridge: PyodideBridge) {
    this.bridge = bridge;
  }

  setExpression(propertyName: string, expr: string): void {
    this.expressions.set(propertyName, expr);
    eventBus.emit('script:expressionSet', { property: propertyName, expression: expr });
  }

  clearExpression(propertyName: string): void {
    if (this.expressions.delete(propertyName)) {
      eventBus.emit('script:expressionCleared', { property: propertyName });
    }
  }

  getExpression(propertyName: string): string | undefined {
    return this.expressions.get(propertyName);
  }

  getAllExpressions(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [k, v] of this.expressions) {
      result[k] = v;
    }
    return result;
  }

  hasExpressions(): boolean {
    return this.expressions.size > 0;
  }

  /**
   * Evaluate all expressions against the grid.
   * Runs post-rule: reads from current buffers (rule output), writes back to current.
   */
  async evaluate(
    grid: Grid,
    generation: number,
    dt: number,
    envParams: Record<string, number>,
    globalVars: Record<string, number>,
  ): Promise<void> {
    if (this.expressions.size === 0) return;

    const { width, height, depth } = grid.config;
    const propertyNames = grid.getPropertyNames();

    const expressions: Record<string, string> = {};
    for (const [k, v] of this.expressions) {
      expressions[k] = v;
    }

    const harness = buildExpressionHarness(expressions, propertyNames, width, height, depth);
    const inputBuffers = extractGridBuffers(grid);
    const params = { ...envParams, _generation: generation, _dt: dt };

    const resultBuffers = await this.bridge.execExpressions(
      harness,
      inputBuffers,
      width,
      height,
      depth,
      params,
      globalVars,
    );

    applyResultBuffers(grid, resultBuffers, 'current');
  }

  /**
   * Load expressions from preset cell property configs.
   */
  loadFromProperties(properties: Array<{ name: string; expression?: string }>): void {
    this.expressions.clear();
    for (const prop of properties) {
      if (prop.expression) {
        this.expressions.set(prop.name, prop.expression);
      }
    }
  }
}
