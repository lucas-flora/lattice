/**
 * Unit tests for NodeCompiler: topological sort, compilation, cycle detection.
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
// Compilation
// ---------------------------------------------------------------------------

describe('compileNodeGraph', () => {
  it('compiles empty graph', () => {
    const result = compileNodeGraph({ nodes: [], edges: [] });
    expect(result.code).toBe('');
    expect(result.inputs).toEqual([]);
    expect(result.outputs).toEqual([]);
  });

  it('compiles PropertyRead → PropertyWrite', () => {
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
    expect(result.code).toContain("_n1 = cell['alive']");
    expect(result.code).toContain('self.age = _n1');
    expect(result.inputs).toContain('cell.alive');
    expect(result.outputs).toContain('cell.age');
  });

  it('compiles Constant → Add → PropertyWrite', () => {
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
    expect(result.code).toContain('_n1 = 5');
    expect(result.code).toContain('_n2 = 3');
    expect(result.code).toContain('_n3 = (_n1 + _n2)');
    expect(result.code).toContain('self.alive = _n3');
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

  it('compiles env property read/write', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'PropertyRead', position: { x: 0, y: 0 }, data: { address: 'env.feedRate' } },
        { id: '2', type: 'PropertyWrite', position: { x: 200, y: 0 }, data: { address: 'env.killRate' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).toContain("env['feedRate']");
    expect(result.code).toContain("env['killRate'] = _n1");
  });

  it('compiles Select (np.where) node', () => {
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
    expect(result.code).toContain('np.where');
  });

  it('compiles Clamp node', () => {
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
    expect(result.code).toContain('np.clip');
  });
});

// ---------------------------------------------------------------------------
// Node type compilation
// ---------------------------------------------------------------------------

describe('individual node types', () => {
  it('RangeMap produces range mapping expression', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 0.5 } },
        { id: '2', type: 'RangeMap', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).toContain('_n1');
  });

  it('Math unary nodes compile correctly', () => {
    for (const type of ['Negate', 'Abs', 'Sqrt', 'Sin', 'Cos', 'Floor', 'Ceil']) {
      const graph: NodeGraph = {
        nodes: [
          { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 5 } },
          { id: '2', type, position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
        ],
      };
      const result = compileNodeGraph(graph);
      expect(result.code).toContain('_n2');
    }
  });

  it('Math binary nodes compile correctly', () => {
    for (const type of ['Add', 'Subtract', 'Multiply', 'Divide', 'Power', 'Modulo']) {
      const graph: NodeGraph = {
        nodes: [
          { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 2 } },
          { id: '2', type: 'Constant', position: { x: 0, y: 60 }, data: { value: 3 } },
          { id: '3', type, position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          { id: 'e1', source: '1', sourcePort: 'value', target: '3', targetPort: 'a' },
          { id: 'e2', source: '2', sourcePort: 'value', target: '3', targetPort: 'b' },
        ],
      };
      const result = compileNodeGraph(graph);
      expect(result.code).toContain('_n3');
    }
  });

  it('Logic nodes compile correctly', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 1 } },
        { id: '2', type: 'Constant', position: { x: 0, y: 60 }, data: { value: 0 } },
        { id: '3', type: 'Compare', position: { x: 200, y: 0 }, data: { operator: '>' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '3', targetPort: 'a' },
        { id: 'e2', source: '2', sourcePort: 'value', target: '3', targetPort: 'b' },
      ],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).toContain('>');
  });

  it('Utility nodes compile', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Random', position: { x: 0, y: 0 }, data: {} },
        { id: '2', type: 'Sum', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
      ],
    };
    const result = compileNodeGraph(graph);
    expect(result.code).toContain('np.random.random');
    expect(result.code).toContain('np.sum');
  });
});
