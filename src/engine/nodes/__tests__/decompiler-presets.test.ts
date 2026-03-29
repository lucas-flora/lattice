/**
 * Integration tests: decompile built-in preset code into node graphs.
 *
 * Verifies that every built-in preset's rule and visual mapping code
 * decompiles to a real node graph (not a blank canvas). CodeBlock
 * escape-hatch nodes are expected for constructs without visual node
 * types (step, fract, etc.). Neighbor ops have dedicated node types.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { decompileCode } from '../NodeDecompiler';
import { registerBuiltinNodes } from '../builtinNodes';

beforeAll(() => {
  registerBuiltinNodes();
});

// Helper: verify a decompiled graph has expected properties
function expectGraph(
  code: string,
  opts: {
    minNodes?: number;
    hasTypes?: string[];
    hasNoTypes?: string[];
    maxCodeBlocks?: number;
    minPropertyWrites?: number;
  },
) {
  const result = decompileCode(code);
  expect(result).not.toBeNull();
  const types = result!.nodes.map(n => n.type);
  const uniqueTypes = new Set(types);

  if (opts.minNodes !== undefined) {
    expect(result!.nodes.length).toBeGreaterThanOrEqual(opts.minNodes);
  }
  if (opts.hasTypes) {
    for (const t of opts.hasTypes) {
      expect(uniqueTypes.has(t), `Expected node type '${t}'`).toBe(true);
    }
  }
  if (opts.hasNoTypes) {
    for (const t of opts.hasNoTypes) {
      expect(uniqueTypes.has(t), `Did not expect node type '${t}'`).toBe(false);
    }
  }
  if (opts.maxCodeBlocks !== undefined) {
    const count = types.filter(t => t === 'CodeBlock').length;
    expect(count).toBeLessThanOrEqual(opts.maxCodeBlocks);
  }
  if (opts.minPropertyWrites !== undefined) {
    const count = types.filter(t => t === 'PropertyWrite').length;
    expect(count).toBeGreaterThanOrEqual(opts.minPropertyWrites);
  }
  return result!;
}

// ─── Conway's Game of Life ───

describe('Conway preset decompilation', () => {
  it('TestPreset_Conway_VisualMapping_CleanNodes', () => {
    const code = [
      'self.colorR = 0.0',
      'self.colorG = alive',
      'self.colorB = 0.0',
    ].join('\n');
    expectGraph(code, {
      minNodes: 3,
      hasTypes: ['PropertyWrite', 'PropertyRead', 'Constant'],
      hasNoTypes: ['CodeBlock'],
      minPropertyWrites: 3,
    });
  });

  it('TestPreset_Conway_Rule_ZeroCodeBlocks', () => {
    const code = [
      'n = neighbor_sum_alive',
      'if n == 3 or (alive > 0.5 and n >= 2 and n < 4):',
      '    self.alive = 1.0',
      'else:',
      '    self.alive = 0.0',
    ].join('\n');
    const graph = expectGraph(code, {
      hasTypes: ['Select', 'Compare', 'PropertyWrite', 'Constant', 'NeighborSum'],
      hasNoTypes: ['CodeBlock'],
      minPropertyWrites: 1,
    });
    // Verify NeighborSum is wired correctly
    const ns = graph.nodes.find(n => n.type === 'NeighborSum');
    expect(ns?.data.property).toBe('alive');
    // Select chains for if/else
    const selects = graph.nodes.filter(n => n.type === 'Select');
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Fire preset ───

describe('Fire preset decompilation', () => {
  it('TestPreset_Fire_Emitters_HasMathAndCodeBlocks', () => {
    const code = [
      'is_burner = step(3.5, material) * step(material, 4.5)',
      'self.fuel = fuel + is_burner * (1.0 - fuel)',
      'self.temperature = temperature + is_burner * max(env_emitter_strength - temperature, 0.0)',
    ].join('\n');
    expectGraph(code, {
      minNodes: 10,
      hasTypes: ['Multiply', 'Add', 'Subtract', 'Max', 'PropertyWrite', 'PropertyRead', 'CodeBlock'],
      minPropertyWrites: 2,
    });
  });

  it('TestPreset_Fire_Advection_HasMixAndNeighborRead', () => {
    const code = [
      'up_t = mix(neighbor_at(0, -1, temperature), neighbor_at(0, 1, temperature), step(0.0, vy))',
      'self.temperature = mix(temperature, up_t, 0.5)',
    ].join('\n');
    const graph = expectGraph(code, {
      hasTypes: ['Linear', 'NeighborRead', 'PropertyWrite'],
      minPropertyWrites: 1,
    });
    // step() still produces CodeBlock
    const codeBlocks = graph.nodes.filter(n => n.type === 'CodeBlock');
    expect(codeBlocks.length).toBeGreaterThanOrEqual(1);
    // But neighbor_at produces NeighborRead
    const nrs = graph.nodes.filter(n => n.type === 'NeighborRead');
    expect(nrs.length).toBe(2);
    expect(nrs[0].data.property).toBe('temperature');
  });

  it('TestPreset_Fire_VisualMapping_HasSmoothstepAndMix', () => {
    const code = [
      't = clamp(temperature / env_max_temp, 0.0, 1.0)',
      'is_burner = step(3.5, material) * step(material, 4.5)',
      'is_gas = 1.0 - is_burner',
      'fr = smoothstep(0.0, 0.1, t) * is_gas',
      'fg = smoothstep(0.15, 0.5, t) * 0.85 * is_gas',
      'fb = smoothstep(0.4, 0.9, t) * 0.6 * is_gas',
      'self.colorR = fr',
      'self.colorG = fg',
      'self.colorB = fb',
    ].join('\n');
    expectGraph(code, {
      hasTypes: ['Smoothstep', 'Clamp', 'Multiply', 'Divide', 'CodeBlock', 'PropertyWrite'],
      minPropertyWrites: 3,
    });
  });
});

// ─── Gray-Scott ───

describe('Gray-Scott preset decompilation', () => {
  it('TestPreset_GrayScott_Rule_HasClampAndNeighborRead', () => {
    const code = [
      'lap_u = neighbor_at(0, -1, u) + neighbor_at(0, 1, u) + neighbor_at(-1, 0, u) + neighbor_at(1, 0, u) - 4.0 * u',
      'lap_v = neighbor_at(0, -1, v) + neighbor_at(0, 1, v) + neighbor_at(-1, 0, v) + neighbor_at(1, 0, v) - 4.0 * v',
      'uvv = u * v * v',
      'self.u = clamp(u + env_dt * (env_Du * lap_u - uvv + env_F * (1.0 - u)), 0.0, 1.0)',
      'self.v = clamp(v + env_dt * (env_Dv * lap_v + uvv - (env_F + env_k) * v), 0.0, 1.0)',
    ].join('\n');
    const graph = expectGraph(code, {
      hasTypes: ['Clamp', 'Add', 'Multiply', 'Subtract', 'NeighborRead', 'PropertyWrite'],
      hasNoTypes: ['CodeBlock'],
      minPropertyWrites: 2,
    });
    // 8 neighbor_at calls total (4 for u Laplacian, 4 for v Laplacian)
    const nrs = graph.nodes.filter(n => n.type === 'NeighborRead');
    expect(nrs.length).toBe(8);
  });

  it('TestPreset_GrayScott_VisualMapping_HasSmoothstepMixChain', () => {
    const code = [
      'val = clamp(v, 0.0, 1.0)',
      'r = 0.0',
      'g = 0.0',
      'b = 0.2',
      'f = smoothstep(0.0, 0.15, val)',
      'r = mix(r, 0.0, f)',
      'g = mix(g, 0.0, f)',
      'b = mix(b, 0.4, f)',
      'f = smoothstep(0.15, 0.3, val)',
      'r = mix(r, 0.0, f)',
      'g = mix(g, 0.4, f)',
      'b = mix(b, 1.0, f)',
      'self.colorR = r',
      'self.colorG = g',
      'self.colorB = b',
    ].join('\n');
    expectGraph(code, {
      hasTypes: ['Smoothstep', 'Linear', 'Clamp', 'PropertyWrite', 'Constant'],
      hasNoTypes: ['CodeBlock'],
      minPropertyWrites: 3,
    });
  });
});

// ─── Langton's Ant ───

describe('Langton Ant preset decompilation', () => {
  it('TestPreset_LangtonsAnt_VisualMapping_CleanNodes', () => {
    const code = [
      'base = 1.0 - color',
      'self.colorR = base * (1.0 - ant) + ant',
      'self.colorG = base * (1.0 - ant)',
      'self.colorB = base * (1.0 - ant)',
    ].join('\n');
    expectGraph(code, {
      hasTypes: ['Multiply', 'Subtract', 'Add', 'PropertyWrite'],
      hasNoTypes: ['CodeBlock'],
      minPropertyWrites: 3,
    });
  });

  it('TestPreset_LangtonsAnt_Rule_HasSelectChainsAndNeighborRead', () => {
    const code = [
      'new_color = color',
      'new_ant = 0.0',
      'new_dir = 0.0',
      'if ant > 0.5:',
      '    new_color = 1.0 - color',
      'na = neighbor_at(0, -1, ant)',
      'if na > 0.5:',
      '    d0 = (neighbor_at(0, -1, ant_dir) + 1.0 + 2.0 * neighbor_at(0, -1, color)) % 4.0',
      '    if d0 > 1.5 and d0 < 2.5:',
      '        new_ant = 1.0',
      '        new_dir = d0',
      'self.color = new_color',
      'self.ant = new_ant',
      'self.ant_dir = new_dir',
    ].join('\n');
    const graph = expectGraph(code, {
      hasTypes: ['Select', 'Compare', 'PropertyWrite', 'NeighborRead'],
      hasNoTypes: ['CodeBlock'],
      minPropertyWrites: 3,
    });
    // Select chains for the if-else decomposition
    const selects = graph.nodes.filter(n => n.type === 'Select');
    expect(selects.length).toBeGreaterThanOrEqual(2);
    // NeighborRead nodes for neighbor_at calls
    const nrs = graph.nodes.filter(n => n.type === 'NeighborRead');
    expect(nrs.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Generic properties ───

describe('Decompiler general properties', () => {
  it('TestDecompiler_AllPresetVisualMappings_ProduceGraphs', () => {
    // Every visual mapping should decompile to something non-null
    const visualMappings = [
      'self.colorG = alive',
      'inv = 1.0 - state\nself.colorR = inv\nself.colorG = inv\nself.colorB = inv',
      'base = 1.0 - color\nself.colorR = base * (1.0 - ant) + ant\nself.colorG = base * (1.0 - ant)\nself.colorB = base * (1.0 - ant)',
      'self.colorR = mix(0.039, 1.0, alive)\nself.colorG = mix(0.918, 1.0, alive)\nself.colorB = mix(0.573, 1.0, alive)',
    ];
    for (const code of visualMappings) {
      const result = decompileCode(code);
      expect(result, `Failed for: ${code.substring(0, 40)}...`).not.toBeNull();
      expect(result!.nodes.length).toBeGreaterThan(0);
    }
  });

  it('TestDecompiler_CodeBlock_ContainsValidPythonText', () => {
    const code = 'self.out = step(0.5, alive)';
    const result = decompileCode(code);
    expect(result).not.toBeNull();
    const cb = result!.nodes.find(n => n.type === 'CodeBlock');
    expect(cb).toBeDefined();
    const cbCode = cb!.data.code as string;
    // Should be valid PythonParser expression text
    expect(cbCode).toContain('step');
    expect(cbCode).toContain('0.5');
  });
});
