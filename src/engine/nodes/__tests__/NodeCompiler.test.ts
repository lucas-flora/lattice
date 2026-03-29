/**
 * Unit tests for NodeCompiler: topological sort, compilation, cycle detection.
 * Output format: PythonParser-compatible code (GPU pipeline target).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { compileNodeGraph, topologicalSort } from '../NodeCompiler';
import { registerBuiltinNodes } from '../builtinNodes';
import type { NodeGraph, NodeInstance, Edge } from '../types';

beforeAll(() => {
  registerBuiltinNodes();
});

// ---------------------------------------------------------------------------
// Topological Sort
// ---------------------------------------------------------------------------

describe('topologicalSort', () => {
  it('sorts independent nodes in insertion order', () => {
    const nodes: NodeInstance[] = [
      { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 5 } },
      { id: '2', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 10 } },
    ];
    const result = topologicalSort(nodes, []);
    expect(result).toEqual(['1', '2']);
  });

  it('sorts dependent nodes source-before-target', () => {
    const nodes: NodeInstance[] = [
      { id: 'a', type: 'Constant', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', type: 'Add', position: { x: 0, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'a', sourcePort: 'value', target: 'b', targetPort: 'a' },
    ];
    const result = topologicalSort(nodes, edges);
    expect(result.indexOf('a')).toBeLessThan(result.indexOf('b'));
  });

  it('detects cycles', () => {
    const nodes: NodeInstance[] = [
      { id: '1', type: 'Add', position: { x: 0, y: 0 }, data: {} },
      { id: '2', type: 'Add', position: { x: 0, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: '1', sourcePort: 'result', target: '2', targetPort: 'a' },
      { id: 'e2', source: '2', sourcePort: 'result', target: '1', targetPort: 'a' },
    ];
    expect(() => topologicalSort(nodes, edges)).toThrow('Cycle detected');
  });

  it('handles diamond dependency', () => {
    const nodes: NodeInstance[] = [
      { id: 'src', type: 'Constant', position: { x: 0, y: 0 }, data: {} },
      { id: 'mid1', type: 'Add', position: { x: 0, y: 0 }, data: {} },
      { id: 'mid2', type: 'Add', position: { x: 0, y: 0 }, data: {} },
      { id: 'sink', type: 'Add', position: { x: 0, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'src', sourcePort: 'value', target: 'mid1', targetPort: 'a' },
      { id: 'e2', source: 'src', sourcePort: 'value', target: 'mid2', targetPort: 'a' },
      { id: 'e3', source: 'mid1', sourcePort: 'result', target: 'sink', targetPort: 'a' },
      { id: 'e4', source: 'mid2', sourcePort: 'result', target: 'sink', targetPort: 'b' },
    ];
    const result = topologicalSort(nodes, edges);
    expect(result.indexOf('src')).toBeLessThan(result.indexOf('mid1'));
    expect(result.indexOf('src')).toBeLessThan(result.indexOf('mid2'));
    expect(result.indexOf('mid1')).toBeLessThan(result.indexOf('sink'));
    expect(result.indexOf('mid2')).toBeLessThan(result.indexOf('sink'));
  });
});

// ---------------------------------------------------------------------------
// Compilation — PythonParser-compatible output
// ---------------------------------------------------------------------------

describe('compileNodeGraph', () => {
  it('compiles empty graph', () => {
    const result = compileNodeGraph({ nodes: [], edges: [] });
    expect(result.code).toBe('');
    expect(result.inputs).toEqual([]);
    expect(result.outputs).toEqual([]);
  });

  it('compiles PropertyRead → PropertyWrite (inlined)', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'PropertyRead', position: { x: 0, y: 0 }, data: { address: 'cell.alive' } },
        { id: '2', type: 'PropertyWrite', position: { x: 200, y: 0 }, data: { address: 'cell.age' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    // PropertyRead emits bare property name, inlined into PropertyWrite
    expect(result.code).toContain('self.age = alive');
    expect(result.inputs).toContain('cell.alive');
    expect(result.outputs).toContain('cell.age');
  });

  it('compiles Constant → Add → PropertyWrite (inlined)', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 5 } },
        { id: '2', type: 'Constant', position: { x: 0, y: 60 }, data: { value: 3 } },
        { id: '3', type: 'Add', position: { x: 200, y: 0 }, data: {} },
        { id: '4', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.alive' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '3', targetPort: 'a' },
        { id: 'e2', source: '2', sourcePort: 'value', target: '3', targetPort: 'b' },
        { id: 'e3', source: '3', sourcePort: 'result', target: '4', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    // All single-use → fully inlined
    expect(result.code).toContain('self.alive = (5.0 + 3.0)');
    expect(result.outputs).toContain('cell.alive');
  });

  it('embeds @nodegraph comment', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 42 } },
      ],
      edges: [],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).toContain('# @nodegraph:');
    const match = result.code.match(/# @nodegraph: (.+)/);
    expect(match).toBeTruthy();
    const parsed = JSON.parse(match![1]);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0].data.value).toBe(42);
  });

  it('compiles env property read with dot notation', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'PropertyRead', position: { x: 0, y: 0 }, data: { address: 'env.feedRate' } },
        { id: '2', type: 'PropertyWrite', position: { x: 200, y: 0 }, data: { address: 'cell.alpha' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).toContain('env.feedRate');
    expect(result.code).toContain('self.alpha = env.feedRate');
  });

  it('compiles env property write with GPU-incompatible warning', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 0.5 } },
        { id: '2', type: 'PropertyWrite', position: { x: 200, y: 0 }, data: { address: 'env.killRate' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).toContain('WARNING');
    expect(result.code).toContain('env.killRate');
  });

  it('compiles Select node with Python ternary', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'PropertyRead', position: { x: 0, y: 0 }, data: { address: 'cell.alive' } },
        { id: '2', type: 'Constant', position: { x: 0, y: 60 }, data: { value: 1 } },
        { id: '3', type: 'Constant', position: { x: 0, y: 120 }, data: { value: 0 } },
        { id: '4', type: 'Select', position: { x: 200, y: 0 }, data: {} },
        { id: '5', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.age' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '4', targetPort: 'condition' },
        { id: 'e2', source: '2', sourcePort: 'value', target: '4', targetPort: 'ifTrue' },
        { id: 'e3', source: '3', sourcePort: 'value', target: '4', targetPort: 'ifFalse' },
        { id: 'e4', source: '4', sourcePort: 'result', target: '5', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    // Python ternary: (ifTrue if condition else ifFalse)
    expect(result.code).toContain('if');
    expect(result.code).toContain('else');
    expect(result.code).not.toContain('np.where');
  });

  it('compiles Clamp node with clamp() builtin', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'PropertyRead', position: { x: 0, y: 0 }, data: { address: 'cell.alive' } },
        { id: '2', type: 'Clamp', position: { x: 200, y: 0 }, data: {} },
        { id: '3', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.alive' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
        { id: 'e2', source: '2', sourcePort: 'result', target: '3', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).toContain('clamp(');
    expect(result.code).not.toContain('np.clip');
  });

  it('uses temp vars for multi-use nodes', () => {
    // Constant used by two Add nodes → should get a temp var
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 7 } },
        { id: '2', type: 'Add', position: { x: 200, y: 0 }, data: {} },
        { id: '3', type: 'Add', position: { x: 200, y: 60 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'a' },
        { id: 'e2', source: '1', sourcePort: 'value', target: '3', targetPort: 'a' },
      ],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).toContain('_constant_1 = 7');
  });
});

// ---------------------------------------------------------------------------
// Node type compilation — PythonParser output format
// ---------------------------------------------------------------------------

describe('individual node types', () => {
  it('RangeMap produces range mapping expression', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 0.5 } },
        { id: '2', type: 'RangeMap', position: { x: 200, y: 0 }, data: {} },
        { id: '3', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.alpha' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
        { id: 'e2', source: '2', sourcePort: 'result', target: '3', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    // RangeMap uses only arithmetic, no numpy
    expect(result.code).toContain('self.alpha');
    expect(result.code).not.toContain('np.');
  });

  it('Math unary nodes emit PythonParser builtins', () => {
    const expected: Record<string, string> = {
      Negate: '-(5.0)',
      Abs: 'abs(5.0)',
      Sqrt: 'sqrt(5.0)',
      Sin: 'sin(5.0)',
      Cos: 'cos(5.0)',
      Floor: 'floor(5.0)',
      Ceil: 'ceil(5.0)',
    };
    for (const [type, expr] of Object.entries(expected)) {
      const graph: NodeGraph = {
        nodes: [
          { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 5 } },
          { id: '2', type, position: { x: 200, y: 0 }, data: {} },
          { id: '3', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.val' } },
        ],
        edges: [
          { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
          { id: 'e2', source: '2', sourcePort: 'result', target: '3', targetPort: 'value' },
        ],
      };
      const result = compileNodeGraph(graph);
      expect(result.code).toContain(`self.val = ${expr}`);
      expect(result.code).not.toContain('np.');
    }
  });

  it('Math binary nodes compile with operators (no numpy)', () => {
    const expected: Record<string, string> = {
      Add: '+', Subtract: '-', Multiply: '*', Divide: '/', Power: '**', Modulo: '%',
    };
    for (const [type, op] of Object.entries(expected)) {
      const graph: NodeGraph = {
        nodes: [
          { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 2 } },
          { id: '2', type: 'Constant', position: { x: 0, y: 60 }, data: { value: 3 } },
          { id: '3', type, position: { x: 200, y: 0 }, data: {} },
          { id: '4', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.val' } },
        ],
        edges: [
          { id: 'e1', source: '1', sourcePort: 'value', target: '3', targetPort: 'a' },
          { id: 'e2', source: '2', sourcePort: 'value', target: '3', targetPort: 'b' },
          { id: 'e3', source: '3', sourcePort: 'result', target: '4', targetPort: 'value' },
        ],
      };
      const result = compileNodeGraph(graph);
      expect(result.code).toContain(`self.val = (2.0 ${op} 3.0)`);
    }
  });

  it('Logic nodes use Python operators', () => {
    // Compare
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 1 } },
        { id: '2', type: 'Constant', position: { x: 0, y: 60 }, data: { value: 0 } },
        { id: '3', type: 'Compare', position: { x: 200, y: 0 }, data: { operator: '>' } },
        { id: '4', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.flag' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '3', targetPort: 'a' },
        { id: 'e2', source: '2', sourcePort: 'value', target: '3', targetPort: 'b' },
        { id: 'e3', source: '3', sourcePort: 'result', target: '4', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).toContain('(1.0 > 0.0)');
  });

  it('And/Or/Not use Python keywords not numpy', () => {
    const andGraph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 1 } },
        { id: '2', type: 'Constant', position: { x: 0, y: 60 }, data: { value: 0 } },
        { id: '3', type: 'And', position: { x: 200, y: 0 }, data: {} },
        { id: '4', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.flag' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '3', targetPort: 'a' },
        { id: 'e2', source: '2', sourcePort: 'value', target: '3', targetPort: 'b' },
        { id: 'e3', source: '3', sourcePort: 'result', target: '4', targetPort: 'value' },
      ],
    };
    const andResult = compileNodeGraph(andGraph);
    expect(andResult.code).toContain('(1.0 and 0.0)');
    expect(andResult.code).not.toContain('np.logical');
  });

  it('Smoothstep emits smoothstep() builtin', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 0.5 } },
        { id: '2', type: 'Smoothstep', position: { x: 200, y: 0 }, data: {} },
        { id: '3', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.alpha' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
        { id: 'e2', source: '2', sourcePort: 'result', target: '3', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).toContain('smoothstep(');
    expect(result.code).not.toContain('lambda');
    expect(result.code).not.toContain('np.');
  });

  it('Linear emits mix() builtin', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 0 } },
        { id: '2', type: 'Constant', position: { x: 0, y: 60 }, data: { value: 1 } },
        { id: '3', type: 'Linear', position: { x: 200, y: 0 }, data: {} },
        { id: '4', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.alpha' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '3', targetPort: 'a' },
        { id: 'e2', source: '2', sourcePort: 'value', target: '3', targetPort: 'b' },
        { id: 'e3', source: '3', sourcePort: 'result', target: '4', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).toContain('mix(');
  });

  it('Max/Min use PythonParser builtins', () => {
    const maxGraph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 2 } },
        { id: '2', type: 'Constant', position: { x: 0, y: 60 }, data: { value: 5 } },
        { id: '3', type: 'Max', position: { x: 200, y: 0 }, data: {} },
        { id: '4', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.val' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '3', targetPort: 'a' },
        { id: 'e2', source: '2', sourcePort: 'value', target: '3', targetPort: 'b' },
        { id: 'e3', source: '3', sourcePort: 'result', target: '4', targetPort: 'value' },
      ],
    };
    const maxResult = compileNodeGraph(maxGraph);
    expect(maxResult.code).toContain('max(2.0, 5.0)');
    expect(maxResult.code).not.toContain('np.maximum');
  });

  it('GPU-incompatible nodes emit warning comments', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Random', position: { x: 0, y: 0 }, data: {} },
        { id: '2', type: 'PropertyWrite', position: { x: 200, y: 0 }, data: { address: 'cell.val' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).toContain('WARNING');
    expect(result.code).toContain('not GPU-compatible');
    expect(result.code).not.toContain('np.random');
  });

  it('output contains zero numpy references', () => {
    // Build a graph using many node types
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'PropertyRead', position: { x: 0, y: 0 }, data: { address: 'cell.age' } },
        { id: '2', type: 'Constant', position: { x: 0, y: 60 }, data: { value: 100 } },
        { id: '3', type: 'Divide', position: { x: 200, y: 0 }, data: {} },
        { id: '4', type: 'Clamp', position: { x: 400, y: 0 }, data: {} },
        { id: '5', type: 'PropertyWrite', position: { x: 600, y: 0 }, data: { address: 'cell.alpha' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '3', targetPort: 'a' },
        { id: 'e2', source: '2', sourcePort: 'value', target: '3', targetPort: 'b' },
        { id: 'e3', source: '3', sourcePort: 'result', target: '4', targetPort: 'value' },
        { id: 'e4', source: '4', sourcePort: 'result', target: '5', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).not.toContain('np.');
    expect(result.code).not.toContain('numpy');
    expect(result.code).not.toContain('import');
    // Should use clamp() not np.clip()
    expect(result.code).toContain('clamp(');
    expect(result.code).toContain('self.alpha');
  });
});

// ---------------------------------------------------------------------------
// ObjectNode compilation
// ---------------------------------------------------------------------------

describe('ObjectNode compilation', () => {
  it('emits bare property names for cell-type reads', () => {
    const graph: NodeGraph = {
      nodes: [
        {
          id: 'obj1', type: 'ObjectNode', position: { x: 0, y: 0 },
          data: {
            objectKind: 'cell-type', objectId: 'ct1', objectName: 'Cell',
            enabledInputs: [], enabledOutputs: ['alive', 'age'],
            availableProperties: [
              { name: 'alive', portType: 'scalar' },
              { name: 'age', portType: 'scalar' },
            ],
          },
        },
        { id: '2', type: 'Add', position: { x: 200, y: 0 }, data: {} },
        {
          id: 'obj2', type: 'ObjectNode', position: { x: 400, y: 0 },
          data: {
            objectKind: 'cell-type', objectId: 'ct1', objectName: 'Cell',
            enabledInputs: ['alpha'], enabledOutputs: [],
            availableProperties: [{ name: 'alpha', portType: 'scalar' }],
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'obj1', sourcePort: 'out_alive', target: '2', targetPort: 'a' },
        { id: 'e2', source: 'obj1', sourcePort: 'out_age', target: '2', targetPort: 'b' },
        { id: 'e3', source: '2', sourcePort: 'result', target: 'obj2', targetPort: 'in_alpha' },
      ],
    };
    const result = compileNodeGraph(graph);
    // Cell reads should be bare property names (not cell['prop'])
    expect(result.code).not.toContain("cell[");
    expect(result.code).toContain('self.alpha');
    expect(result.inputs).toContain('cell.alive');
    expect(result.inputs).toContain('cell.age');
    expect(result.outputs).toContain('cell.alpha');
  });

  it('emits env.param for environment reads', () => {
    const graph: NodeGraph = {
      nodes: [
        {
          id: 'obj1', type: 'ObjectNode', position: { x: 0, y: 0 },
          data: {
            objectKind: 'environment', objectId: 'env1', objectName: 'Environment',
            enabledInputs: [], enabledOutputs: ['feedRate'],
            availableProperties: [{ name: 'feedRate', portType: 'scalar' }],
          },
        },
        {
          id: 'obj2', type: 'ObjectNode', position: { x: 400, y: 0 },
          data: {
            objectKind: 'cell-type', objectId: 'ct1', objectName: 'Cell',
            enabledInputs: ['alpha'], enabledOutputs: [],
            availableProperties: [{ name: 'alpha', portType: 'scalar' }],
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'obj1', sourcePort: 'out_feedRate', target: 'obj2', targetPort: 'in_alpha' },
      ],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).toContain('env.feedRate');
    expect(result.code).not.toContain("env['");
  });
});
