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

  it('pattern matches self.X = <identifier> (PythonParser format)', () => {
    // New format: bare property name instead of cell['prop']
    const code = 'self.age = alive';
    const result = decompileCode(code);
    // Pattern matcher recognizes self.X = Y pattern
    expect(result).not.toBeNull();
    const types = result!.nodes.map((n) => n.type);
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

  it('does not crash on PythonParser-compatible code', () => {
    // New format with clamp() and bare property names
    const code = 'self.alpha = clamp(age / 100, 0, 1)';
    expect(() => decompileCode(code)).not.toThrow();
  });

  it('does not crash on code with smoothstep()', () => {
    const code = 'self.alpha = smoothstep(0, 1, age)';
    expect(() => decompileCode(code)).not.toThrow();
  });

  it('returns CodeBlock fallback for unrecognized code', () => {
    const code = 'for i in range(10):\n  print(i)';
    const result = decompileCode(code);
    // CodeBlock fallback — better than a blank canvas
    expect(result).not.toBeNull();
    expect(result!.nodes[0].type).toBe('CodeBlock');
    expect(result!.nodes[0].data.code).toContain('for i in range');
  });

  it('returns null for empty code', () => {
    const result = decompileCode('');
    expect(result).toBeNull();
  });
});

describe('hasNodeGraphComment', () => {
  it('detects @nodegraph comment', () => {
    const code = 'self.alive = 0\n# @nodegraph: {"nodes":[],"edges":[]}';
    expect(hasNodeGraphComment(code)).toBe(true);
  });

  it('returns false when no comment', () => {
    expect(hasNodeGraphComment('self.alive = age')).toBe(false);
  });
});

describe('stripNodeGraphComment', () => {
  it('removes @nodegraph line', () => {
    const code = 'self.alive = 42\n# @nodegraph: {"nodes":[],"edges":[]}';
    const stripped = stripNodeGraphComment(code);
    expect(stripped).not.toContain('@nodegraph');
    expect(stripped).toContain('self.alive = 42');
  });
});

describe('IR-based decompilation', () => {
  it('TestDecompiler_SimpleAssignment_CreatesPropertyWriteAndRead', () => {
    const code = 'self.colorG = alive';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const types = result!.nodes.map(n => n.type);
    expect(types).toContain('PropertyRead');
    expect(types).toContain('PropertyWrite');
    // PropertyWrite should have address cell.colorG
    const write = result!.nodes.find(n => n.type === 'PropertyWrite');
    expect(write?.data.address).toBe('cell.colorG');
    // PropertyRead should have address cell.alive
    const read = result!.nodes.find(n => n.type === 'PropertyRead');
    expect(read?.data.address).toBe('cell.alive');
    // They should be connected
    expect(result!.edges.length).toBeGreaterThan(0);
  });

  it('TestDecompiler_Arithmetic_CreatesMathNodes', () => {
    const code = 'self.age = age + 1.0';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const types = result!.nodes.map(n => n.type);
    expect(types).toContain('Add');
    expect(types).toContain('Constant');
    expect(types).toContain('PropertyRead');
    expect(types).toContain('PropertyWrite');
  });

  it('TestDecompiler_Clamp_CreatesClampNode', () => {
    const code = 'self.alpha = clamp(age, 0.0, 1.0)';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const types = result!.nodes.map(n => n.type);
    expect(types).toContain('Clamp');
    expect(types).toContain('PropertyWrite');
  });

  it('TestDecompiler_Smoothstep_CreatesSmoothstepNode', () => {
    const code = 'self.alpha = smoothstep(0.0, 1.0, age)';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const types = result!.nodes.map(n => n.type);
    expect(types).toContain('Smoothstep');
  });

  it('TestDecompiler_Mix_CreatesLinearNode', () => {
    const code = 'self.colorR = mix(0.0, 1.0, temperature)';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const types = result!.nodes.map(n => n.type);
    expect(types).toContain('Linear');
  });

  it('TestDecompiler_Compare_CreatesCompareNode', () => {
    const code = 'self.alive = 1.0 if alive > 0.5 else 0.0';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const types = result!.nodes.map(n => n.type);
    expect(types).toContain('Compare');
    expect(types).toContain('Select');
  });

  it('TestDecompiler_NeighborAt_CreatesNeighborReadNode', () => {
    const code = 'self.temperature = neighbor_at(1, 0, temperature)';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const types = result!.nodes.map(n => n.type);
    expect(types).toContain('NeighborRead');
    expect(types).not.toContain('CodeBlock');
    const nr = result!.nodes.find(n => n.type === 'NeighborRead');
    expect(nr?.data.dx).toBe(1);
    expect(nr?.data.dy).toBe(0);
    expect(nr?.data.property).toBe('temperature');
  });

  it('TestDecompiler_Step_CreatesCodeBlock', () => {
    const code = 'self.mask = step(0.5, alive)';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const types = result!.nodes.map(n => n.type);
    expect(types).toContain('CodeBlock');
  });

  it('TestDecompiler_LocalVariables_WiredCorrectly', () => {
    const code = 'val = clamp(age, 0.0, 1.0)\nself.alpha = val';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const types = result!.nodes.map(n => n.type);
    expect(types).toContain('Clamp');
    expect(types).toContain('PropertyWrite');
    // val's wire should connect Clamp output → PropertyWrite input
    expect(result!.edges.length).toBeGreaterThanOrEqual(2);
  });

  it('TestDecompiler_MultiOutput_CorrectPropertyWrites', () => {
    const code = 'self.colorR = 0.0\nself.colorG = alive\nself.colorB = 0.0';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const writes = result!.nodes.filter(n => n.type === 'PropertyWrite');
    expect(writes.length).toBe(3);
    const addresses = writes.map(n => n.data.address);
    expect(addresses).toContain('cell.colorR');
    expect(addresses).toContain('cell.colorG');
    expect(addresses).toContain('cell.colorB');
  });

  it('TestDecompiler_IfElse_CreatesSelectChain', () => {
    const code = 'if alive > 0.5:\n    self.alive = 1.0\nelse:\n    self.alive = 0.0';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const types = result!.nodes.map(n => n.type);
    expect(types).toContain('Select');
    expect(types).toContain('PropertyWrite');
    expect(types).toContain('Compare');
  });

  it('TestDecompiler_EnvParams_PropertyReadWithEnvPrefix', () => {
    const code = 'self.temperature = clamp(temperature, 0.0, env.max_temp)';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const reads = result!.nodes.filter(n => n.type === 'PropertyRead');
    const addresses = reads.map(n => n.data.address);
    expect(addresses).toContain('env.max_temp');
    expect(addresses).toContain('cell.temperature');
  });

  it('TestDecompiler_EnvUnderscoreConvention_Resolved', () => {
    const code = 'self.fuel = fuel + env_burn_rate';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const reads = result!.nodes.filter(n => n.type === 'PropertyRead');
    const addresses = reads.map(n => n.data.address);
    expect(addresses).toContain('env.burn_rate');
  });

  it('TestDecompiler_ConstantDedup_SharedNodes', () => {
    const code = 'self.colorR = 0.0\nself.colorG = 0.0\nself.colorB = 0.0';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    // All three writes share the same Constant(0) node
    const constants = result!.nodes.filter(n => n.type === 'Constant');
    expect(constants.length).toBe(1);
    expect(constants[0].data.value).toBe(0);
  });

  it('TestDecompiler_Coordinates_CreatesCoordinatesNode', () => {
    const code = 'self.position = x';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const types = result!.nodes.map(n => n.type);
    expect(types).toContain('Coordinates');
  });

  it('TestDecompiler_AutoLayout_NodesHavePositions', () => {
    const code = 'val = clamp(age, 0.0, 1.0)\nself.alpha = val';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    // Nodes should have non-zero positions (auto-layout applied)
    const positions = result!.nodes.map(n => n.position);
    const maxX = Math.max(...positions.map(p => p.x));
    expect(maxX).toBeGreaterThan(0);
  });

  it('TestDecompiler_ConwaysVisualMapping_DecompilesCleanly', () => {
    const code = 'self.colorR = 0.0\nself.colorG = alive\nself.colorB = 0.0';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    // Should have clean nodes — no CodeBlocks needed
    const codeBlocks = result!.nodes.filter(n => n.type === 'CodeBlock');
    expect(codeBlocks.length).toBe(0);
  });

  it('TestDecompiler_GrayScottVisualMapping_HasMixAndSmoothstep', () => {
    const code = [
      'val = clamp(v, 0.0, 1.0)',
      'r = 0.0',
      'g = 0.0',
      'b = 0.2',
      'f = smoothstep(0.0, 0.15, val)',
      'r = mix(r, 0.0, f)',
      'g = mix(g, 0.0, f)',
      'b = mix(b, 0.4, f)',
      'self.colorR = r',
      'self.colorG = g',
      'self.colorB = b',
    ].join('\n');
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const types = new Set(result!.nodes.map(n => n.type));
    expect(types.has('Smoothstep')).toBe(true);
    expect(types.has('Linear')).toBe(true);
    expect(types.has('Clamp')).toBe(true);
    expect(types.has('PropertyWrite')).toBe(true);
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

    // Decompile (uses @nodegraph comment)
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
