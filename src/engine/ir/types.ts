/**
 * Intermediate Representation (IR) type definitions.
 *
 * The IR is a typed expression tree that represents simulation computation
 * in a target-independent way. It's the central hub of the compilation pipeline:
 *
 *   NodeGraph → IR → WGSL (GPU execution)
 *                  → Python (Show Code preview)
 *
 * Every IRNode carries its type — this enables WGSL codegen to emit correct
 * types without inference. The discriminated union uses 'kind' as the tag.
 */

// === Scalar types ===

/** Scalar types supported by the IR */
export type IRType = 'f32' | 'u32' | 'bool';

// === Expression Nodes ===

/** Built-in math/utility functions available in the IR */
export type IRBuiltinFn =
  | 'abs' | 'sqrt' | 'sin' | 'cos' | 'floor' | 'ceil'
  | 'min' | 'max' | 'clamp' | 'smoothstep'
  | 'pow' | 'fract' | 'sign' | 'step' | 'mix';

/** Expression node — evaluates to a typed value */
export type IRNode =
  /** Constant value */
  | { kind: 'literal'; value: number; type: IRType }
  /** Read a cell/env/global property */
  | { kind: 'read_property'; property: string; scope: 'cell' | 'env' | 'global'; type: IRType }
  /** Binary arithmetic operation */
  | { kind: 'binop'; op: '+' | '-' | '*' | '/' | '%'; left: IRNode; right: IRNode; type: IRType }
  /** Unary operation (negate, logical not) */
  | { kind: 'unary'; op: '-' | '!'; operand: IRNode; type: IRType }
  /** Comparison — always produces bool */
  | { kind: 'compare'; op: '>' | '<' | '==' | '!=' | '>=' | '<='; left: IRNode; right: IRNode; type: IRType }
  /** Logical and/or — operands must be bool */
  | { kind: 'logic'; op: '&&' | '||'; left: IRNode; right: IRNode; type: IRType }
  /** Conditional select (ternary): condition ? ifTrue : ifFalse */
  | { kind: 'select'; condition: IRNode; ifTrue: IRNode; ifFalse: IRNode; type: IRType }
  /** Built-in function call */
  | { kind: 'call'; fn: IRBuiltinFn; args: IRNode[]; type: IRType }
  /** Neighbor reduction: sum a property across Moore neighborhood, or count where predicate holds */
  | { kind: 'neighbor_reduce'; property: string; op: 'sum' | 'count_where'; predicate?: IRNode; type: IRType }
  /** Reference a previously declared local variable */
  | { kind: 'var_ref'; name: string; type: IRType }
  /** Type cast — type equals target */
  | { kind: 'cast'; target: IRType; value: IRNode; type: IRType }
  /** Grid position coordinate */
  | { kind: 'coordinates'; axis: 'x' | 'y' | 'z'; type: IRType }
  /** Grid/simulation metadata parameter */
  | { kind: 'grid_param'; param: 'width' | 'height' | 'depth' | 'generation' | 'dt'; type: IRType };

// === Statements ===

/** Statement node — performs an action (declare, assign, write, branch) */
export type IRStatement =
  /** Declare a new local variable with initial value */
  | { kind: 'declare_var'; name: string; type: IRType; value: IRNode }
  /** Assign to an existing local variable */
  | { kind: 'assign_var'; name: string; value: IRNode }
  /** Write a value to a cell property in the output buffer */
  | { kind: 'write_property'; property: string; scope: 'cell'; value: IRNode }
  /** Conditional branch */
  | { kind: 'if'; condition: IRNode; body: IRStatement[]; elseBody?: IRStatement[] };

// === Program ===

/** Describes a property referenced by the program (input or output) */
export interface IRPropertyDescriptor {
  /** Property name (e.g. 'alive', 'age') */
  property: string;
  /** Which scope: cell buffer, env uniform, or global variable */
  scope: 'cell' | 'env' | 'global';
  /** Data type */
  type: IRType;
  /** Number of channels (default 1) */
  channels?: number;
}

/**
 * A complete IR program — the unit of compilation.
 *
 * Contains the statement list, input/output declarations,
 * and metadata for round-trip decompilation.
 */
export interface IRProgram {
  /** Ordered list of statements to execute */
  statements: IRStatement[];
  /** Properties read by this program */
  inputs: IRPropertyDescriptor[];
  /** Properties written by this program */
  outputs: IRPropertyDescriptor[];
  /** True if any node reads neighbors — affects shader preamble (neighbor loop generation) */
  neighborhoodAccess: boolean;
  /** Optional metadata for round-trip and debugging */
  metadata?: {
    sourceType: 'node_graph' | 'python_script' | 'builtin';
    nodeGraph?: unknown;
  };
}
