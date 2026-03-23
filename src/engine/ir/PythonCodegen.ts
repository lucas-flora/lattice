/**
 * Python Code Generator — transforms IRProgram into readable Python.
 *
 * Used for "Show Code" preview in the node editor and debugging.
 * Emits NumPy-convention function calls (np.sqrt, np.clip, etc.).
 * Preserves @nodegraph metadata comment for round-trip decompilation.
 */

import type { IRProgram, IRNode, IRStatement } from './types';

/**
 * Generate a Python string from an IR program.
 *
 * @param program - Validated IR program
 * @returns Python source string
 */
export function generatePython(program: IRProgram): string {
  const lines: string[] = [];

  // Emit @nodegraph metadata comment for round-trip
  if (program.metadata?.nodeGraph) {
    lines.push(`# @nodegraph: ${JSON.stringify(program.metadata.nodeGraph)}`);
  }

  for (const stmt of program.statements) {
    emitStatement(lines, stmt, '');
  }

  return lines.join('\n');
}

function emitExpr(node: IRNode): string {
  switch (node.kind) {
    case 'literal':
      if (node.type === 'bool') return node.value ? 'True' : 'False';
      return String(node.value);

    case 'read_property':
      if (node.scope === 'cell') return `self.${node.property}`;
      if (node.scope === 'env') return `env_${node.property}`;
      return `global_${node.property}`;

    case 'binop':
      return `(${emitExpr(node.left)} ${node.op} ${emitExpr(node.right)})`;

    case 'unary':
      if (node.op === '!') return `(not ${emitExpr(node.operand)})`;
      return `(-${emitExpr(node.operand)})`;

    case 'compare': {
      const pyOp = node.op === '!=' ? '!=' : node.op;
      return `(${emitExpr(node.left)} ${pyOp} ${emitExpr(node.right)})`;
    }

    case 'logic': {
      const pyLogic = node.op === '&&' ? 'and' : 'or';
      return `(${emitExpr(node.left)} ${pyLogic} ${emitExpr(node.right)})`;
    }

    case 'select':
      return `(${emitExpr(node.ifTrue)} if ${emitExpr(node.condition)} else ${emitExpr(node.ifFalse)})`;

    case 'call':
      return emitCall(node.fn, node.args);

    case 'neighbor_reduce':
      if (node.op === 'sum') return `neighbor_sum_${node.property}`;
      return `neighbor_count_${node.property}`;

    case 'neighbor_at':
      return `neighbor_at(${node.dx}, ${node.dy}, '${node.property}')`;

    case 'var_ref':
      return node.name;

    case 'cast':
      if (node.target === 'f32') return `float(${emitExpr(node.value)})`;
      if (node.target === 'u32') return `int(${emitExpr(node.value)})`;
      return `bool(${emitExpr(node.value)})`;

    case 'coordinates':
      return node.axis;

    case 'grid_param':
      if (node.param === 'width') return 'width';
      if (node.param === 'height') return 'height';
      if (node.param === 'generation') return '_generation';
      if (node.param === 'dt') return '_dt';
      return node.param;
  }
}

function emitCall(fn: string, args: IRNode[]): string {
  const a = args.map(emitExpr);
  switch (fn) {
    case 'abs': return `np.abs(${a[0]})`;
    case 'sqrt': return `np.sqrt(${a[0]})`;
    case 'sin': return `np.sin(${a[0]})`;
    case 'cos': return `np.cos(${a[0]})`;
    case 'floor': return `np.floor(${a[0]})`;
    case 'ceil': return `np.ceil(${a[0]})`;
    case 'fract': return `(${a[0]} % 1.0)`;
    case 'sign': return `np.sign(${a[0]})`;
    case 'min': return `np.minimum(${a[0]}, ${a[1]})`;
    case 'max': return `np.maximum(${a[0]}, ${a[1]})`;
    case 'clamp': return `np.clip(${a[0]}, ${a[1]}, ${a[2]})`;
    case 'smoothstep': return `smoothstep(${a[0]}, ${a[1]}, ${a[2]})`;
    case 'pow': return `np.power(${a[0]}, ${a[1]})`;
    case 'step': return `np.where(${a[1]} >= ${a[0]}, 1.0, 0.0)`;
    case 'mix': return `(${a[0]} * (1.0 - ${a[2]}) + ${a[1]} * ${a[2]})`;
    default: return `${fn}(${a.join(', ')})`;
  }
}

function emitStatement(out: string[], stmt: IRStatement, indent: string): void {
  switch (stmt.kind) {
    case 'declare_var':
      out.push(`${indent}${stmt.name} = ${emitExpr(stmt.value)}`);
      break;

    case 'assign_var':
      out.push(`${indent}${stmt.name} = ${emitExpr(stmt.value)}`);
      break;

    case 'write_property':
      out.push(`${indent}self.${stmt.property} = ${emitExpr(stmt.value)}`);
      break;

    case 'if':
      out.push(`${indent}if ${emitExpr(stmt.condition)}:`);
      for (const s of stmt.body) {
        emitStatement(out, s, indent + '    ');
      }
      if (stmt.elseBody && stmt.elseBody.length > 0) {
        out.push(`${indent}else:`);
        for (const s of stmt.elseBody) {
          emitStatement(out, s, indent + '    ');
        }
      }
      break;
  }
}
