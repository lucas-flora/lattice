/**
 * IR Builder — sugar functions for constructing IR trees.
 *
 * Usage:
 *   import { IR } from './IRBuilder';
 *   const expr = IR.add(IR.readCell('alive'), IR.f32(1));
 *   const stmt = IR.writeProperty('alive', expr);
 *   const prog = IR.program([stmt], { inputs: [...], outputs: [...] });
 *
 * Every function returns a correctly typed IRNode/IRStatement/IRProgram.
 * The builder handles type propagation for arithmetic (inherits from left operand).
 */

import type { IRNode, IRType, IRBuiltinFn, IRStatement, IRProgram, IRPropertyDescriptor } from './types';

export const IR = {
  // ── Literals ──

  /** f32 literal (e.g. 3.0) */
  f32(value: number): IRNode { return { kind: 'literal', value, type: 'f32' }; },
  /** u32 literal (e.g. 3u) */
  u32(value: number): IRNode { return { kind: 'literal', value: Math.floor(value), type: 'u32' }; },
  /** bool literal */
  bool(value: boolean): IRNode { return { kind: 'literal', value: value ? 1 : 0, type: 'bool' }; },

  // ── Property Access ──

  /** Read a cell property from the input buffer */
  readCell(property: string, type: IRType = 'f32'): IRNode {
    return { kind: 'read_property', property, scope: 'cell', type };
  },
  /** Read an environment parameter from the uniform buffer */
  readEnv(property: string): IRNode {
    return { kind: 'read_property', property, scope: 'env', type: 'f32' };
  },
  /** Read a global variable */
  readGlobal(property: string): IRNode {
    return { kind: 'read_property', property, scope: 'global', type: 'f32' };
  },

  // ── Arithmetic ──

  add(left: IRNode, right: IRNode): IRNode { return { kind: 'binop', op: '+', left, right, type: left.type as IRType }; },
  sub(left: IRNode, right: IRNode): IRNode { return { kind: 'binop', op: '-', left, right, type: left.type as IRType }; },
  mul(left: IRNode, right: IRNode): IRNode { return { kind: 'binop', op: '*', left, right, type: left.type as IRType }; },
  div(left: IRNode, right: IRNode): IRNode { return { kind: 'binop', op: '/', left, right, type: left.type as IRType }; },
  mod(left: IRNode, right: IRNode): IRNode { return { kind: 'binop', op: '%', left, right, type: left.type as IRType }; },
  neg(operand: IRNode): IRNode { return { kind: 'unary', op: '-', operand, type: operand.type as IRType }; },

  // ── Comparison (always produces bool) ──

  gt(left: IRNode, right: IRNode): IRNode { return { kind: 'compare', op: '>', left, right, type: 'bool' }; },
  lt(left: IRNode, right: IRNode): IRNode { return { kind: 'compare', op: '<', left, right, type: 'bool' }; },
  eq(left: IRNode, right: IRNode): IRNode { return { kind: 'compare', op: '==', left, right, type: 'bool' }; },
  neq(left: IRNode, right: IRNode): IRNode { return { kind: 'compare', op: '!=', left, right, type: 'bool' }; },
  gte(left: IRNode, right: IRNode): IRNode { return { kind: 'compare', op: '>=', left, right, type: 'bool' }; },
  lte(left: IRNode, right: IRNode): IRNode { return { kind: 'compare', op: '<=', left, right, type: 'bool' }; },

  // ── Logic (operands and result are bool) ──

  and(left: IRNode, right: IRNode): IRNode { return { kind: 'logic', op: '&&', left, right, type: 'bool' }; },
  or(left: IRNode, right: IRNode): IRNode { return { kind: 'logic', op: '||', left, right, type: 'bool' }; },
  not(operand: IRNode): IRNode { return { kind: 'unary', op: '!', operand, type: 'bool' }; },

  // ── Selection (ternary) ──

  /** Conditional select: condition ? ifTrue : ifFalse */
  select(condition: IRNode, ifTrue: IRNode, ifFalse: IRNode): IRNode {
    return { kind: 'select', condition, ifTrue, ifFalse, type: ifTrue.type as IRType };
  },

  // ── Built-in Functions ──

  /** Generic built-in function call */
  call(fn: IRBuiltinFn, ...args: IRNode[]): IRNode {
    return { kind: 'call', fn, args, type: args[0]?.type as IRType ?? 'f32' };
  },
  abs(x: IRNode): IRNode { return IR.call('abs', x); },
  sqrt(x: IRNode): IRNode { return IR.call('sqrt', x); },
  sin(x: IRNode): IRNode { return IR.call('sin', x); },
  cos(x: IRNode): IRNode { return IR.call('cos', x); },
  floor(x: IRNode): IRNode { return IR.call('floor', x); },
  ceil(x: IRNode): IRNode { return IR.call('ceil', x); },
  fract(x: IRNode): IRNode { return IR.call('fract', x); },
  sign(x: IRNode): IRNode { return IR.call('sign', x); },
  clamp(x: IRNode, lo: IRNode, hi: IRNode): IRNode { return IR.call('clamp', x, lo, hi); },
  min(a: IRNode, b: IRNode): IRNode { return IR.call('min', a, b); },
  max(a: IRNode, b: IRNode): IRNode { return IR.call('max', a, b); },
  mix(a: IRNode, b: IRNode, t: IRNode): IRNode { return IR.call('mix', a, b, t); },
  smoothstep(edge0: IRNode, edge1: IRNode, x: IRNode): IRNode { return IR.call('smoothstep', edge0, edge1, x); },
  pow(base: IRNode, exp: IRNode): IRNode { return IR.call('pow', base, exp); },
  step(edge: IRNode, x: IRNode): IRNode { return IR.call('step', edge, x); },

  // ── Neighbor Access ──

  /** Sum a property across Moore neighborhood */
  neighborSum(property: string): IRNode {
    return { kind: 'neighbor_reduce', property, op: 'sum', type: 'f32' };
  },
  /**
   * Count neighbors where property matches a comparison.
   * E.g. neighborCount('alive', '>', 0) counts live neighbors.
   */
  neighborCount(property: string, op: '>' | '<' | '==' | '!=', threshold: number): IRNode {
    const predicate: IRNode = {
      kind: 'compare', op,
      left: { kind: 'read_property', property, scope: 'cell', type: 'f32' },
      right: { kind: 'literal', value: threshold, type: 'f32' },
      type: 'bool',
    };
    return { kind: 'neighbor_reduce', property, op: 'count_where', predicate, type: 'f32' };
  },

  // ── Coordinates & Grid Params ──

  x(): IRNode { return { kind: 'coordinates', axis: 'x', type: 'u32' }; },
  y(): IRNode { return { kind: 'coordinates', axis: 'y', type: 'u32' }; },
  z(): IRNode { return { kind: 'coordinates', axis: 'z', type: 'u32' }; },
  generation(): IRNode { return { kind: 'grid_param', param: 'generation', type: 'u32' }; },
  dt(): IRNode { return { kind: 'grid_param', param: 'dt', type: 'f32' }; },
  width(): IRNode { return { kind: 'grid_param', param: 'width', type: 'u32' }; },
  height(): IRNode { return { kind: 'grid_param', param: 'height', type: 'u32' }; },

  // ── Type Casting ──

  toF32(x: IRNode): IRNode { return { kind: 'cast', target: 'f32', value: x, type: 'f32' }; },
  toU32(x: IRNode): IRNode { return { kind: 'cast', target: 'u32', value: x, type: 'u32' }; },
  toBool(x: IRNode): IRNode { return { kind: 'cast', target: 'bool', value: x, type: 'bool' }; },

  // ── Variable References ──

  varRef(name: string, type: IRType = 'f32'): IRNode { return { kind: 'var_ref', name, type }; },
  boolRef(name: string): IRNode { return { kind: 'var_ref', name, type: 'bool' }; },

  // ── Statements ──

  declareVar(name: string, type: IRType, value: IRNode): IRStatement {
    return { kind: 'declare_var', name, type, value };
  },
  assignVar(name: string, value: IRNode): IRStatement {
    return { kind: 'assign_var', name, value };
  },
  writeProperty(property: string, value: IRNode): IRStatement {
    return { kind: 'write_property', property, scope: 'cell', value };
  },
  ifStmt(condition: IRNode, body: IRStatement[], elseBody?: IRStatement[]): IRStatement {
    return { kind: 'if', condition, body, elseBody };
  },

  // ── Program ──

  program(statements: IRStatement[], opts?: Partial<Omit<IRProgram, 'statements'>>): IRProgram {
    return {
      statements,
      inputs: opts?.inputs ?? [],
      outputs: opts?.outputs ?? [],
      neighborhoodAccess: opts?.neighborhoodAccess ?? false,
      metadata: opts?.metadata,
    };
  },
};
