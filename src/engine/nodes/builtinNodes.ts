/**
 * Built-in node type definitions.
 *
 * Each node defines its ports and a compile() function that emits Python code.
 * Registered once at startup via registerBuiltinNodes().
 */

import type { NodeTypeDefinition } from './types';
import { nodeTypeRegistry } from './NodeTypeRegistry';

// ---------------------------------------------------------------------------
// Helper: shorthand port factories
// ---------------------------------------------------------------------------

const inp = (id: string, label: string, type: 'scalar' | 'array' | 'bool' | 'string' = 'scalar', defaultValue?: unknown) =>
  ({ id, label, type, direction: 'input' as const, defaultValue });

const out = (id: string, label: string, type: 'scalar' | 'array' | 'bool' | 'string' = 'scalar') =>
  ({ id, label, type, direction: 'output' as const });

// ---------------------------------------------------------------------------
// Property nodes
// ---------------------------------------------------------------------------

const PropertyRead: NodeTypeDefinition = {
  type: 'PropertyRead',
  label: 'Read Property',
  category: 'property',
  inputs: [],
  outputs: [out('value', 'Value', 'array')],
  hasData: true,
  compile: (_inputs, data) => {
    const addr = (data.address as string) ?? 'cell.alive';
    const parts = addr.split('.');
    if (parts[0] === 'cell') return `cell['${parts[1]}']`;
    if (parts[0] === 'env') return `env['${parts[1]}']`;
    if (parts[0] === 'global') return `glob['${parts[1]}']`;
    return `cell['${parts[1] ?? parts[0]}']`;
  },
};

const PropertyWrite: NodeTypeDefinition = {
  type: 'PropertyWrite',
  label: 'Write Property',
  category: 'property',
  inputs: [inp('value', 'Value', 'array')],
  outputs: [],
  hasData: true,
  compile: (inputs, data) => {
    const addr = (data.address as string) ?? 'cell.alive';
    const parts = addr.split('.');
    const val = inputs.value ?? '0';
    if (parts[0] === 'cell') return `self.${parts[1]} = ${val}`;
    if (parts[0] === 'env') return `env['${parts[1]}'] = ${val}`;
    if (parts[0] === 'global') return `glob['${parts[1]}'] = ${val}`;
    return `self.${parts[1] ?? parts[0]} = ${val}`;
  },
};

const Constant: NodeTypeDefinition = {
  type: 'Constant',
  label: 'Constant',
  category: 'property',
  inputs: [],
  outputs: [out('value', 'Value')],
  hasData: true,
  compile: (_inputs, data) => {
    const v = data.value ?? 0;
    return String(v);
  },
};

const Time: NodeTypeDefinition = {
  type: 'Time',
  label: 'Time',
  category: 'property',
  inputs: [],
  outputs: [out('frame', 'Frame'), out('t', 'Normalized')],
  compile: () => 'frame',
};

// ---------------------------------------------------------------------------
// Math nodes
// ---------------------------------------------------------------------------

function binaryMathNode(type: string, label: string, op: string, pyFn?: string): NodeTypeDefinition {
  return {
    type,
    label,
    category: 'math',
    inputs: [inp('a', 'A'), inp('b', 'B')],
    outputs: [out('result', 'Result')],
    compile: (inputs) => {
      const a = inputs.a ?? '0';
      const b = inputs.b ?? '0';
      if (pyFn) return `${pyFn}(${a}, ${b})`;
      return `(${a} ${op} ${b})`;
    },
  };
}

function unaryMathNode(type: string, label: string, pyFn: string): NodeTypeDefinition {
  return {
    type,
    label,
    category: 'math',
    inputs: [inp('value', 'Value')],
    outputs: [out('result', 'Result')],
    compile: (inputs) => `${pyFn}(${inputs.value ?? '0'})`,
  };
}

const Add = binaryMathNode('Add', 'Add', '+');
const Subtract = binaryMathNode('Subtract', 'Subtract', '-');
const Multiply = binaryMathNode('Multiply', 'Multiply', '*');
const Divide = binaryMathNode('Divide', 'Divide', '/');
const Power = binaryMathNode('Power', 'Power', '**');
const Modulo = binaryMathNode('Modulo', 'Modulo', '%');
const Negate = unaryMathNode('Negate', 'Negate', '-');
const Abs = unaryMathNode('Abs', 'Abs', 'np.abs');
const Sqrt = unaryMathNode('Sqrt', 'Sqrt', 'np.sqrt');
const Sin = unaryMathNode('Sin', 'Sin', 'np.sin');
const Cos = unaryMathNode('Cos', 'Cos', 'np.cos');
const Floor = unaryMathNode('Floor', 'Floor', 'np.floor');
const Ceil = unaryMathNode('Ceil', 'Ceil', 'np.ceil');

// ---------------------------------------------------------------------------
// Range nodes
// ---------------------------------------------------------------------------

const RangeMap: NodeTypeDefinition = {
  type: 'RangeMap',
  label: 'Range Map',
  category: 'range',
  inputs: [
    inp('value', 'Value'),
    inp('srcMin', 'Src Min', 'scalar', 0),
    inp('srcMax', 'Src Max', 'scalar', 1),
    inp('dstMin', 'Dst Min', 'scalar', 0),
    inp('dstMax', 'Dst Max', 'scalar', 1),
  ],
  outputs: [out('result', 'Result')],
  compile: (inputs) => {
    const v = inputs.value ?? '0';
    const s0 = inputs.srcMin ?? '0';
    const s1 = inputs.srcMax ?? '1';
    const d0 = inputs.dstMin ?? '0';
    const d1 = inputs.dstMax ?? '1';
    return `((${v} - ${s0}) / (${s1} - ${s0}) * (${d1} - ${d0}) + ${d0})`;
  },
};

const Clamp: NodeTypeDefinition = {
  type: 'Clamp',
  label: 'Clamp',
  category: 'range',
  inputs: [
    inp('value', 'Value'),
    inp('min', 'Min', 'scalar', 0),
    inp('max', 'Max', 'scalar', 1),
  ],
  outputs: [out('result', 'Result')],
  compile: (inputs) => {
    const v = inputs.value ?? '0';
    const lo = inputs.min ?? '0';
    const hi = inputs.max ?? '1';
    return `np.clip(${v}, ${lo}, ${hi})`;
  },
};

const Smoothstep: NodeTypeDefinition = {
  type: 'Smoothstep',
  label: 'Smoothstep',
  category: 'range',
  inputs: [
    inp('value', 'Value'),
    inp('edge0', 'Edge 0', 'scalar', 0),
    inp('edge1', 'Edge 1', 'scalar', 1),
  ],
  outputs: [out('result', 'Result')],
  compile: (inputs) => {
    const v = inputs.value ?? '0';
    const e0 = inputs.edge0 ?? '0';
    const e1 = inputs.edge1 ?? '1';
    return `(lambda t: t * t * (3 - 2 * t))(np.clip((${v} - ${e0}) / (${e1} - ${e0}), 0, 1))`;
  },
};

const Linear: NodeTypeDefinition = {
  type: 'Linear',
  label: 'Linear Interp',
  category: 'range',
  inputs: [
    inp('a', 'A'),
    inp('b', 'B'),
    inp('t', 'T', 'scalar', 0.5),
  ],
  outputs: [out('result', 'Result')],
  compile: (inputs) => {
    const a = inputs.a ?? '0';
    const b = inputs.b ?? '1';
    const t = inputs.t ?? '0.5';
    return `(${a} + (${b} - ${a}) * ${t})`;
  },
};

// ---------------------------------------------------------------------------
// Logic nodes
// ---------------------------------------------------------------------------

const Compare: NodeTypeDefinition = {
  type: 'Compare',
  label: 'Compare',
  category: 'logic',
  inputs: [inp('a', 'A'), inp('b', 'B')],
  outputs: [out('result', 'Result', 'bool')],
  hasData: true,
  compile: (inputs, data) => {
    const a = inputs.a ?? '0';
    const b = inputs.b ?? '0';
    const op = (data.operator as string) ?? '>';
    return `(${a} ${op} ${b})`;
  },
};

const And: NodeTypeDefinition = {
  type: 'And',
  label: 'And',
  category: 'logic',
  inputs: [inp('a', 'A', 'bool'), inp('b', 'B', 'bool')],
  outputs: [out('result', 'Result', 'bool')],
  compile: (inputs) => `np.logical_and(${inputs.a ?? 'False'}, ${inputs.b ?? 'False'})`,
};

const Or: NodeTypeDefinition = {
  type: 'Or',
  label: 'Or',
  category: 'logic',
  inputs: [inp('a', 'A', 'bool'), inp('b', 'B', 'bool')],
  outputs: [out('result', 'Result', 'bool')],
  compile: (inputs) => `np.logical_or(${inputs.a ?? 'False'}, ${inputs.b ?? 'False'})`,
};

const Not: NodeTypeDefinition = {
  type: 'Not',
  label: 'Not',
  category: 'logic',
  inputs: [inp('value', 'Value', 'bool')],
  outputs: [out('result', 'Result', 'bool')],
  compile: (inputs) => `np.logical_not(${inputs.value ?? 'False'})`,
};

const Select: NodeTypeDefinition = {
  type: 'Select',
  label: 'Select',
  category: 'logic',
  inputs: [
    inp('condition', 'Condition', 'bool'),
    inp('ifTrue', 'If True'),
    inp('ifFalse', 'If False'),
  ],
  outputs: [out('result', 'Result')],
  compile: (inputs) => {
    const cond = inputs.condition ?? 'True';
    const t = inputs.ifTrue ?? '1';
    const f = inputs.ifFalse ?? '0';
    return `np.where(${cond}, ${t}, ${f})`;
  },
};

// ---------------------------------------------------------------------------
// Utility nodes
// ---------------------------------------------------------------------------

const Random: NodeTypeDefinition = {
  type: 'Random',
  label: 'Random',
  category: 'utility',
  inputs: [inp('min', 'Min', 'scalar', 0), inp('max', 'Max', 'scalar', 1)],
  outputs: [out('value', 'Value', 'array')],
  compile: (inputs) => {
    const lo = inputs.min ?? '0';
    const hi = inputs.max ?? '1';
    return `(np.random.random(grid_shape) * (${hi} - ${lo}) + ${lo})`;
  },
};

const Sum: NodeTypeDefinition = {
  type: 'Sum',
  label: 'Sum',
  category: 'utility',
  inputs: [inp('value', 'Value', 'array')],
  outputs: [out('result', 'Result')],
  compile: (inputs) => `np.sum(${inputs.value ?? '0'})`,
};

const Mean: NodeTypeDefinition = {
  type: 'Mean',
  label: 'Mean',
  category: 'utility',
  inputs: [inp('value', 'Value', 'array')],
  outputs: [out('result', 'Result')],
  compile: (inputs) => `np.mean(${inputs.value ?? '0'})`,
};

const MaxNode: NodeTypeDefinition = {
  type: 'Max',
  label: 'Max',
  category: 'utility',
  inputs: [inp('a', 'A'), inp('b', 'B')],
  outputs: [out('result', 'Result')],
  compile: (inputs) => `np.maximum(${inputs.a ?? '0'}, ${inputs.b ?? '0'})`,
};

const MinNode: NodeTypeDefinition = {
  type: 'Min',
  label: 'Min',
  category: 'utility',
  inputs: [inp('a', 'A'), inp('b', 'B')],
  outputs: [out('result', 'Result')],
  compile: (inputs) => `np.minimum(${inputs.a ?? '0'}, ${inputs.b ?? '0'})`,
};

const Count: NodeTypeDefinition = {
  type: 'Count',
  label: 'Count',
  category: 'utility',
  inputs: [inp('value', 'Value', 'bool')],
  outputs: [out('result', 'Result')],
  compile: (inputs) => `np.count_nonzero(${inputs.value ?? '0'})`,
};

const Coordinates: NodeTypeDefinition = {
  type: 'Coordinates',
  label: 'Coordinates',
  category: 'utility',
  inputs: [],
  outputs: [out('x', 'X', 'array'), out('y', 'Y', 'array')],
  compile: () => 'coords',
};

// ---------------------------------------------------------------------------
// Object node (skeleton — ports are dynamic, compiler special-cases this)
// ---------------------------------------------------------------------------

const ObjectNode: NodeTypeDefinition = {
  type: 'ObjectNode',
  label: 'Object',
  category: 'object',
  inputs: [],
  outputs: [],
  hasData: true,
  compile: () => '# ObjectNode — compiled via special case',
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const ALL_NODES: NodeTypeDefinition[] = [
  // Property
  PropertyRead, PropertyWrite, Constant, Time,
  // Math
  Add, Subtract, Multiply, Divide, Negate, Abs, Power, Sqrt, Modulo, Sin, Cos, Floor, Ceil,
  // Range
  RangeMap, Clamp, Smoothstep, Linear,
  // Logic
  Compare, And, Or, Not, Select,
  // Utility
  Random, Sum, Mean, MaxNode, MinNode, Count, Coordinates,
  // Object
  ObjectNode,
];

export function registerBuiltinNodes(): void {
  for (const node of ALL_NODES) {
    nodeTypeRegistry.register(node);
  }
}

export { ALL_NODES };
