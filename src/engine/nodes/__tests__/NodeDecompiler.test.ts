/**
 * Unit tests for NodeDecompiler: @nodegraph parsing and pattern matching.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { decompileCode, hasNodeGraphComment, stripNodeGraphComment } from '../NodeDecompiler';
import { compileNodeGraph } from '../NodeCompiler';
import { registerBuiltinNodes } from '../builtinNodes';
import type { NodeGraph } from '../types';

beforeAll(() => {
  registerBuiltinNodes();
});

describe('decompileCode', () => {
  it('parses @nodegraph comment (round-trip)', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 42 } },
        { id: '2', type: 'PropertyWrite', position: { x: 200, y: 0 }, data: { address: 'cell.alive' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
      ],
    };
    const compiled = compileNodeGraph(graph);
    const recovered = decompileCode(compiled.code);
    expect(recovered).not.toBeNull();
    expect(recovered!.nodes).toHaveLength(2);
    expect(recovered!.edges).toHaveLength(1);
    expect(recovered!.nodes[0].data.value).toBe(42);
  });

  it('pattern matches self.X = cell[Y]', () => {
    const code = "self.age = cell['alive']";
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    // Should have at least a PropertyRead and PropertyWrite
    const types = result!.nodes.map((n) => n.type);
    expect(types).toContain('PropertyRead');
    expect(types).toContain('PropertyWrite');
  });

  it('pattern matches self.X = <constant>', () => {
    const code = 'self.alive = 0';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const types = result!.nodes.map((n) => n.type);
    expect(types).toContain('Constant');
    expect(types).toContain('PropertyWrite');
  });

  it('returns null for unrecognized code', () => {
    const code = 'import numpy as np\nfor i in range(10):\n  print(i)';
    const result = decompileCode(code);
    expect(result).toBeNull();
  });

  it('returns null for empty code', () => {
    const result = decompileCode('');
    expect(result).toBeNull();
  });
});

describe('hasNodeGraphComment', () => {
  it('detects @nodegraph comment', () => {
    const code = '_n1 = 42\n# @nodegraph: {"nodes":[],"edges":[]}';
    expect(hasNodeGraphComment(code)).toBe(true);
  });

  it('returns false when no comment', () => {
    expect(hasNodeGraphComment("self.alive = cell['age']")).toBe(false);
  });
});

describe('stripNodeGraphComment', () => {
  it('removes @nodegraph line', () => {
    const code = '_n1 = 42\nself.alive = _n1\n# @nodegraph: {"nodes":[],"edges":[]}';
    const stripped = stripNodeGraphComment(code);
    expect(stripped).not.toContain('@nodegraph');
    expect(stripped).toContain('self.alive = _n1');
  });
});

describe('round-trip: compile → decompile → compile', () => {
  it('preserves graph structure through round-trip', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'PropertyRead', position: { x: 0, y: 0 }, data: { address: 'cell.alive' } },
        { id: '2', type: 'Constant', position: { x: 0, y: 60 }, data: { value: 2 } },
        { id: '3', type: 'Multiply', position: { x: 200, y: 0 }, data: {} },
        { id: '4', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.age' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '3', targetPort: 'a' },
        { id: 'e2', source: '2', sourcePort: 'value', target: '3', targetPort: 'b' },
        { id: 'e3', source: '3', sourcePort: 'result', target: '4', targetPort: 'value' },
      ],
    };

    // Compile
    const compiled1 = compileNodeGraph(graph);

    // Decompile
    const recovered = decompileCode(compiled1.code);
    expect(recovered).not.toBeNull();

    // Recompile
    const compiled2 = compileNodeGraph(recovered!);

    // Verify structure matches (ignoring @nodegraph comment contents)
    expect(compiled2.inputs).toEqual(compiled1.inputs);
    expect(compiled2.outputs).toEqual(compiled1.outputs);

    // The code should have the same functional lines
    const lines1 = compiled1.code.split('\n').filter((l) => !l.startsWith('#'));
    const lines2 = compiled2.code.split('\n').filter((l) => !l.startsWith('#'));
    expect(lines2).toEqual(lines1);
  });
});
