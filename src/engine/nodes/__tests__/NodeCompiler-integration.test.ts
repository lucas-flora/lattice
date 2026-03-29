/**
 * Integration test: NodeCompiler → PythonParser → IR → valid WGSL.
 *
 * Proves the full pipeline: node graph compiles to code that the GPU
 * pipeline can actually execute.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { compileNodeGraph } from '../NodeCompiler';
import { registerBuiltinNodes } from '../builtinNodes';
import { parsePython, type PythonParseContext } from '../../ir/PythonParser';
import { validateIR } from '../../ir/validate';
import { generateWGSL, type WGSLCodegenConfig } from '../../ir/WGSLCodegen';
import { decompileCode, stripNodeGraphComment } from '../NodeDecompiler';
import type { NodeGraph } from '../types';

beforeAll(() => {
  registerBuiltinNodes();
});

const baseContext: PythonParseContext = {
  cellProperties: [
    { name: 'alive', type: 'f32', channels: 1 },
    { name: 'age', type: 'f32', channels: 1 },
    { name: 'alpha', type: 'f32', channels: 1 },
  ],
  envParams: ['feedRate', 'killRate'],
  globalVars: [],
  neighborhoodType: 'moore',
};

const wgslConfig: WGSLCodegenConfig = {
  workgroupSize: [8, 8, 1],
  topology: 'toroidal',
  propertyLayout: [
    { name: 'alive', offset: 0, type: 'f32', channels: 1 },
    { name: 'age', offset: 1, type: 'f32', channels: 1 },
    { name: 'alpha', offset: 2, type: 'f32', channels: 1 },
  ],
  envParams: ['feedRate', 'killRate'],
  globalParams: [],
};

// ---------------------------------------------------------------------------
// Full pipeline: NodeGraph → Python → IR → WGSL
// ---------------------------------------------------------------------------

describe('NodeCompiler → PythonParser → IR pipeline', () => {
  it('age → divide → clamp → alpha compiles through full pipeline', () => {
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

    // Step 1: Compile node graph to code
    const compiled = compileNodeGraph(graph);
    expect(compiled.code).toBeTruthy();
    expect(compiled.code).not.toContain('np.');

    // Step 2: Strip @nodegraph comment and parse through PythonParser
    const code = stripNodeGraphComment(compiled.code);
    const parseResult = parsePython(code, baseContext);
    expect(parseResult.program).toBeTruthy();
    expect(parseResult.program.statements.length).toBeGreaterThan(0);

    // Step 3: Validate the IR
    const validation = validateIR(parseResult.program);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);

    // Step 4: Generate WGSL
    const wgsl = generateWGSL(parseResult.program, wgslConfig);
    expect(wgsl).toContain('fn main');
    expect(wgsl).toContain('clamp');
  });

  it('compare → select pipeline compiles to valid IR', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'PropertyRead', position: { x: 0, y: 0 }, data: { address: 'cell.age' } },
        { id: '2', type: 'Constant', position: { x: 0, y: 60 }, data: { value: 10 } },
        { id: '3', type: 'Compare', position: { x: 200, y: 0 }, data: { operator: '>' } },
        { id: '4', type: 'Constant', position: { x: 0, y: 120 }, data: { value: 1 } },
        { id: '5', type: 'Constant', position: { x: 0, y: 180 }, data: { value: 0 } },
        { id: '6', type: 'Select', position: { x: 400, y: 0 }, data: {} },
        { id: '7', type: 'PropertyWrite', position: { x: 600, y: 0 }, data: { address: 'cell.alive' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '3', targetPort: 'a' },
        { id: 'e2', source: '2', sourcePort: 'value', target: '3', targetPort: 'b' },
        { id: 'e3', source: '3', sourcePort: 'result', target: '6', targetPort: 'condition' },
        { id: 'e4', source: '4', sourcePort: 'value', target: '6', targetPort: 'ifTrue' },
        { id: 'e5', source: '5', sourcePort: 'value', target: '6', targetPort: 'ifFalse' },
        { id: 'e6', source: '6', sourcePort: 'result', target: '7', targetPort: 'value' },
      ],
    };

    const compiled = compileNodeGraph(graph);
    const code = stripNodeGraphComment(compiled.code);
    const parseResult = parsePython(code, baseContext);

    const validation = validateIR(parseResult.program);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('smoothstep pipeline compiles to valid IR', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'PropertyRead', position: { x: 0, y: 0 }, data: { address: 'cell.age' } },
        { id: '2', type: 'Smoothstep', position: { x: 200, y: 0 }, data: {} },
        { id: '3', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.alpha' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
        { id: 'e2', source: '2', sourcePort: 'result', target: '3', targetPort: 'value' },
      ],
    };

    const compiled = compileNodeGraph(graph);
    const code = stripNodeGraphComment(compiled.code);
    const parseResult = parsePython(code, baseContext);

    const validation = validateIR(parseResult.program);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('mix (Linear) pipeline compiles to valid IR', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'Constant', position: { x: 0, y: 0 }, data: { value: 0 } },
        { id: '2', type: 'Constant', position: { x: 0, y: 60 }, data: { value: 1 } },
        { id: '3', type: 'PropertyRead', position: { x: 0, y: 120 }, data: { address: 'cell.age' } },
        { id: '4', type: 'Linear', position: { x: 200, y: 0 }, data: {} },
        { id: '5', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.alpha' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '4', targetPort: 'a' },
        { id: 'e2', source: '2', sourcePort: 'value', target: '4', targetPort: 'b' },
        { id: 'e3', source: '3', sourcePort: 'value', target: '4', targetPort: 't' },
        { id: 'e4', source: '4', sourcePort: 'result', target: '5', targetPort: 'value' },
      ],
    };

    const compiled = compileNodeGraph(graph);
    const code = stripNodeGraphComment(compiled.code);
    const parseResult = parsePython(code, baseContext);

    const validation = validateIR(parseResult.program);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('env read pipeline compiles to valid IR', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'PropertyRead', position: { x: 0, y: 0 }, data: { address: 'env.feedRate' } },
        { id: '2', type: 'PropertyWrite', position: { x: 200, y: 0 }, data: { address: 'cell.alpha' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
      ],
    };

    const compiled = compileNodeGraph(graph);
    const code = stripNodeGraphComment(compiled.code);
    const parseResult = parsePython(code, baseContext);

    const validation = validateIR(parseResult.program);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('ObjectNode cell-type pipeline compiles to valid IR', () => {
    const graph: NodeGraph = {
      nodes: [
        {
          id: 'obj1', type: 'ObjectNode', position: { x: 0, y: 0 },
          data: {
            objectKind: 'cell-type', objectId: 'ct1', objectName: 'Cell',
            enabledInputs: [], enabledOutputs: ['age'],
            availableProperties: [{ name: 'age', portType: 'scalar' }],
          },
        },
        { id: '2', type: 'Constant', position: { x: 0, y: 60 }, data: { value: 100 } },
        { id: '3', type: 'Divide', position: { x: 200, y: 0 }, data: {} },
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
        { id: 'e1', source: 'obj1', sourcePort: 'out_age', target: '3', targetPort: 'a' },
        { id: 'e2', source: '2', sourcePort: 'value', target: '3', targetPort: 'b' },
        { id: 'e3', source: '3', sourcePort: 'result', target: 'obj2', targetPort: 'in_alpha' },
      ],
    };

    const compiled = compileNodeGraph(graph);
    const code = stripNodeGraphComment(compiled.code);
    const parseResult = parsePython(code, baseContext);

    const validation = validateIR(parseResult.program);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Decompiler doesn't crash on new output format
// ---------------------------------------------------------------------------

describe('Decompiler compatibility', () => {
  it('decompiler does not crash on PythonParser-compatible output', () => {
    const graph: NodeGraph = {
      nodes: [
        { id: '1', type: 'PropertyRead', position: { x: 0, y: 0 }, data: { address: 'cell.age' } },
        { id: '2', type: 'Clamp', position: { x: 200, y: 0 }, data: {} },
        { id: '3', type: 'PropertyWrite', position: { x: 400, y: 0 }, data: { address: 'cell.alpha' } },
      ],
      edges: [
        { id: 'e1', source: '1', sourcePort: 'value', target: '2', targetPort: 'value' },
        { id: 'e2', source: '2', sourcePort: 'result', target: '3', targetPort: 'value' },
      ],
    };

    const compiled = compileNodeGraph(graph);

    // Should not throw — decompiler uses @nodegraph comment for round-trip
    expect(() => decompileCode(compiled.code)).not.toThrow();

    const recovered = decompileCode(compiled.code);
    expect(recovered).not.toBeNull();
    expect(recovered!.nodes).toHaveLength(3);
    expect(recovered!.edges).toHaveLength(2);
  });

  it('pattern matching fallback handles new syntax without crashing', () => {
    // Code in new PythonParser format (no @nodegraph comment)
    const code = 'self.alpha = clamp(age / 100, 0, 1)';
    // Should not throw — may return null or a partial graph, but no crash
    expect(() => decompileCode(code)).not.toThrow();
  });
});
