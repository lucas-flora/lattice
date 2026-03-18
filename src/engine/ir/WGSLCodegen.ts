/**
 * WGSL Code Generator — transforms IRProgram into a complete WGSL compute shader.
 *
 * The generated shader reads from cellsIn (storage, read), writes to cellsOut
 * (storage, read_write), and reads simulation params from a uniform buffer.
 *
 * WGSL quirks handled here:
 * - select() arg order: (falseValue, trueValue, condition)
 * - Bool logic uses & / | not && / ||
 * - u32 literals need 'u' suffix, f32 needs decimal point
 * - No ternary operator — use select()
 */

import type { IRProgram, IRNode, IRStatement, IRType } from './types';
import type { PropertyLayout } from '../gpu/types';

export interface WGSLCodegenConfig {
  /** Workgroup size, e.g. [8, 8, 1] */
  workgroupSize: [number, number, number];
  /** Grid topology — affects neighbor wrapping */
  topology: 'toroidal' | 'finite';
  /** Property layout from BufferManager — maps names to buffer offsets */
  propertyLayout: PropertyLayout[];
  /** Names of env params in the uniform buffer (order = index) */
  envParams: string[];
  /** Names of global params */
  globalParams: string[];
}

/**
 * Generate a complete WGSL compute shader from an IR program.
 *
 * @param program - Validated IR program
 * @param config - Code generation configuration
 * @returns WGSL source string ready for ShaderCompiler
 */
export function generateWGSL(program: IRProgram, config: WGSLCodegenConfig): string {
  const propOffsets = new Map<string, number>();
  for (const p of config.propertyLayout) {
    propOffsets.set(p.name, p.offset);
  }
  const envIndices = new Map<string, number>();
  for (let i = 0; i < config.envParams.length; i++) {
    envIndices.set(config.envParams[i], i);
  }

  const lines: string[] = [];

  // ── Bindings ──
  lines.push('// === Bindings ===');
  lines.push('@group(0) @binding(0) var<storage, read> cellsIn: array<f32>;');
  lines.push('@group(0) @binding(1) var<storage, read_write> cellsOut: array<f32>;');
  lines.push('@group(0) @binding(2) var<uniform> params: SimParams;');
  lines.push('');

  // ── Params struct ──
  lines.push('// === Params struct ===');
  lines.push('struct SimParams {');
  lines.push('  width: u32,');
  lines.push('  height: u32,');
  lines.push('  depth: u32,');
  lines.push('  stride: u32,');
  lines.push('  generation: u32,');
  lines.push('  dt: f32,');
  lines.push('  _pad0: u32,');
  lines.push('  _pad1: u32,');
  // env params as individual fields (WGSL doesn't support runtime-sized arrays in uniforms)
  for (let i = 0; i < 32; i++) {
    lines.push(`  env${i}: f32,`);
  }
  lines.push('}');
  lines.push('');

  // ── Helper functions ──
  lines.push('// === Helpers ===');
  lines.push('fn getCell(idx: u32, propOffset: u32) -> f32 {');
  lines.push('  return cellsIn[idx * params.stride + propOffset];');
  lines.push('}');
  lines.push('');
  lines.push('fn setCell(idx: u32, propOffset: u32, value: f32) {');
  lines.push('  cellsOut[idx * params.stride + propOffset] = value;');
  lines.push('}');
  lines.push('');

  if (program.neighborhoodAccess) {
    if (config.topology === 'toroidal') {
      lines.push('fn neighborIndex(nx: i32, ny: i32, w: u32, h: u32) -> u32 {');
      lines.push('  let wx = ((nx % i32(w)) + i32(w)) % i32(w);');
      lines.push('  let wy = ((ny % i32(h)) + i32(h)) % i32(h);');
      lines.push('  return u32(wy) * w + u32(wx);');
      lines.push('}');
    } else {
      lines.push('fn neighborIndex(nx: i32, ny: i32, w: u32, h: u32) -> u32 {');
      lines.push('  let cx = clamp(nx, 0, i32(w) - 1);');
      lines.push('  let cy = clamp(ny, 0, i32(h) - 1);');
      lines.push('  return u32(cy) * w + u32(cx);');
      lines.push('}');
    }
    lines.push('');
  }

  // ── Main entry ──
  const [wx, wy, wz] = config.workgroupSize;
  lines.push(`@compute @workgroup_size(${wx}, ${wy}, ${wz})`);
  lines.push('fn main(@builtin(global_invocation_id) gid: vec3<u32>) {');
  lines.push('  let x = gid.x;');
  lines.push('  let y = gid.y;');
  lines.push('  if (x >= params.width || y >= params.height) { return; }');
  lines.push('  let idx = y * params.width + x;');
  lines.push('');

  // ── Read inputs ──
  for (const input of program.inputs) {
    if (input.scope === 'cell') {
      const offset = propOffsets.get(input.property);
      if (offset !== undefined) {
        lines.push(`  let prop_${input.property} = getCell(idx, ${offset}u);`);
      }
    }
  }
  if (program.inputs.some(i => i.scope === 'cell')) {
    lines.push('');
  }

  // ── Neighbor reductions (emit loops for each unique reduction) ──
  const neighborReductions = collectNeighborReductions(program);
  for (const red of neighborReductions) {
    emitNeighborLoop(lines, red, propOffsets);
  }

  // ── Statements ──
  for (const stmt of program.statements) {
    emitStatement(lines, stmt, propOffsets, envIndices, '  ');
  }

  lines.push('}');
  return lines.join('\n');

  // ── Expression codegen ──

  function emitExpr(node: IRNode): string {
    switch (node.kind) {
      case 'literal':
        return formatLiteral(node.value, node.type);

      case 'read_property':
        if (node.scope === 'cell') {
          return `prop_${node.property}`;
        } else if (node.scope === 'env') {
          const idx = envIndices.get(node.property) ?? 0;
          return `params.env${idx}`;
        }
        return `prop_${node.property}`;

      case 'binop':
        return `(${emitExpr(node.left)} ${node.op} ${emitExpr(node.right)})`;

      case 'unary':
        if (node.op === '!') return `!(${emitExpr(node.operand)})`;
        return `(-(${emitExpr(node.operand)}))`;

      case 'compare':
        return `(${emitExpr(node.left)} ${node.op} ${emitExpr(node.right)})`;

      case 'logic':
        // WGSL uses & / | for bool, not && / ||
        const logicOp = node.op === '&&' ? '&' : '|';
        return `(${emitExpr(node.left)} ${logicOp} ${emitExpr(node.right)})`;

      case 'select':
        // WGSL select order: (falseValue, trueValue, condition)
        return `select(${emitExpr(node.ifFalse)}, ${emitExpr(node.ifTrue)}, ${emitExpr(node.condition)})`;

      case 'call':
        return `${node.fn}(${node.args.map(emitExpr).join(', ')})`;

      case 'neighbor_reduce':
        // Reference the pre-computed variable from the neighbor loop
        if (node.op === 'sum') return `nr_sum_${node.property}`;
        return `nr_count_${node.property}`;

      case 'neighbor_at': {
        const naOffset = propOffsets.get(node.property) ?? 0;
        return `getCell(neighborIndex(i32(x) + ${node.dx}, i32(y) + ${node.dy}, params.width, params.height), ${naOffset}u)`;
      }

      case 'var_ref':
        return node.name;

      case 'cast':
        return `${node.target}(${emitExpr(node.value)})`;

      case 'coordinates':
        return node.axis;

      case 'grid_param':
        return `params.${node.param}`;
    }
  }

  function emitStatement(
    out: string[], stmt: IRStatement,
    offsets: Map<string, number>, envIdx: Map<string, number>,
    indent: string,
  ): void {
    switch (stmt.kind) {
      case 'declare_var':
        out.push(`${indent}var ${stmt.name}: ${wgslType(stmt.type)} = ${emitExpr(stmt.value)};`);
        break;

      case 'assign_var':
        out.push(`${indent}${stmt.name} = ${emitExpr(stmt.value)};`);
        break;

      case 'write_property': {
        const offset = offsets.get(stmt.property);
        if (offset !== undefined) {
          out.push(`${indent}setCell(idx, ${offset}u, ${emitExpr(stmt.value)});`);
        }
        break;
      }

      case 'if':
        out.push(`${indent}if (${emitExpr(stmt.condition)}) {`);
        for (const s of stmt.body) {
          emitStatement(out, s, offsets, envIdx, indent + '  ');
        }
        if (stmt.elseBody && stmt.elseBody.length > 0) {
          out.push(`${indent}} else {`);
          for (const s of stmt.elseBody) {
            emitStatement(out, s, offsets, envIdx, indent + '  ');
          }
        }
        out.push(`${indent}}`);
        break;
    }
  }

  function emitNeighborLoop(
    out: string[],
    red: { property: string; op: 'sum' | 'count_where'; predicate?: IRNode },
    offsets: Map<string, number>,
  ): void {
    const offset = offsets.get(red.property) ?? 0;
    const varName = red.op === 'sum' ? `nr_sum_${red.property}` : `nr_count_${red.property}`;

    out.push(`  // Neighbor ${red.op} for '${red.property}'`);
    out.push(`  var ${varName}: f32 = 0.0;`);
    out.push('  for (var dy: i32 = -1; dy <= 1; dy++) {');
    out.push('    for (var dx: i32 = -1; dx <= 1; dx++) {');
    out.push('      if (dx == 0 && dy == 0) { continue; }');
    out.push('      let ni = neighborIndex(i32(x) + dx, i32(y) + dy, params.width, params.height);');

    if (red.op === 'sum') {
      out.push(`      ${varName} += getCell(ni, ${offset}u);`);
    } else {
      // count_where with predicate
      out.push(`      let nr_val = getCell(ni, ${offset}u);`);
      if (red.predicate) {
        // Emit the predicate with nr_val substituted for the property read
        const predExpr = emitNeighborPredicate(red.predicate, red.property);
        out.push(`      if (${predExpr}) { ${varName} += 1.0; }`);
      } else {
        out.push(`      if (nr_val > 0.5) { ${varName} += 1.0; }`);
      }
    }

    out.push('    }');
    out.push('  }');
    out.push('');
  }

  function emitNeighborPredicate(node: IRNode, neighborProp: string): string {
    // In neighbor predicates, read_property of the neighbor property becomes 'nr_val'
    if (node.kind === 'read_property' && node.property === neighborProp && node.scope === 'cell') {
      return 'nr_val';
    }
    if (node.kind === 'compare') {
      const left = node.left.kind === 'read_property' && node.left.property === neighborProp ? 'nr_val' : emitExpr(node.left);
      const right = node.right.kind === 'read_property' && node.right.property === neighborProp ? 'nr_val' : emitExpr(node.right);
      return `(${left} ${node.op} ${right})`;
    }
    return emitExpr(node);
  }
}

// ── Utilities ──

function formatLiteral(value: number, type: IRType): string {
  if (type === 'bool') return value ? 'true' : 'false';
  if (type === 'u32') return `${Math.floor(value)}u`;
  // f32: ensure decimal point
  const s = String(value);
  return s.includes('.') ? s : s + '.0';
}

function wgslType(type: IRType): string {
  switch (type) {
    case 'f32': return 'f32';
    case 'u32': return 'u32';
    case 'bool': return 'bool';
  }
}

/** Collect unique neighbor_reduce nodes from an IR program */
function collectNeighborReductions(program: IRProgram): Array<{ property: string; op: 'sum' | 'count_where'; predicate?: IRNode }> {
  const seen = new Set<string>();
  const result: Array<{ property: string; op: 'sum' | 'count_where'; predicate?: IRNode }> = [];

  function walkNode(node: IRNode): void {
    if (node.kind === 'neighbor_reduce') {
      const key = `${node.op}_${node.property}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ property: node.property, op: node.op, predicate: node.predicate });
      }
    }
    // Recurse into child nodes
    if ('left' in node && node.left) walkNode(node.left as IRNode);
    if ('right' in node && node.right) walkNode(node.right as IRNode);
    if ('operand' in node && node.operand) walkNode(node.operand as IRNode);
    if ('condition' in node && node.condition) walkNode(node.condition as IRNode);
    if ('ifTrue' in node && node.ifTrue) walkNode(node.ifTrue as IRNode);
    if ('ifFalse' in node && node.ifFalse) walkNode(node.ifFalse as IRNode);
    if ('value' in node && typeof node.value === 'object' && node.value) walkNode(node.value as IRNode);
    if ('args' in node && node.args) for (const a of node.args) walkNode(a);
  }

  function walkStmt(stmt: IRStatement): void {
    if ('value' in stmt && stmt.value) walkNode(stmt.value as IRNode);
    if ('condition' in stmt && stmt.condition) walkNode(stmt.condition as IRNode);
    if ('body' in stmt && stmt.body) for (const s of stmt.body) walkStmt(s);
    if ('elseBody' in stmt && stmt.elseBody) for (const s of stmt.elseBody) walkStmt(s);
  }

  for (const stmt of program.statements) walkStmt(stmt);
  return result;
}
