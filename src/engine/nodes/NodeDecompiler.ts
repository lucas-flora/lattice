/**
 * NodeDecompiler: extracts a NodeGraph from Python code.
 *
 * Two strategies:
 * 1. Parse the @nodegraph JSON comment (instant round-trip)
 * 2. Pattern match on common Python patterns (best-effort fallback)
 */

import type { NodeGraph, NodeInstance, Edge } from './types';

const NODEGRAPH_PATTERN = /^#\s*@nodegraph:\s*(.+)$/m;

/**
 * Attempt to extract a NodeGraph from code.
 * Returns null if no @nodegraph comment found and pattern matching fails.
 */
export function decompileCode(code: string): NodeGraph | null {
  // Strategy 1: Parse @nodegraph comment
  const match = code.match(NODEGRAPH_PATTERN);
  if (match) {
    try {
      const graph = JSON.parse(match[1]) as NodeGraph;
      if (graph.nodes && graph.edges) {
        return graph;
      }
    } catch {
      // Fall through to pattern matching
    }
  }

  // Strategy 2: Pattern matching (best-effort)
  return patternMatch(code);
}

/**
 * Check if code has a @nodegraph comment (without parsing it).
 */
export function hasNodeGraphComment(code: string): boolean {
  return NODEGRAPH_PATTERN.test(code);
}

/**
 * Strip the @nodegraph comment from code (for display purposes).
 */
export function stripNodeGraphComment(code: string): string {
  return code.replace(NODEGRAPH_PATTERN, '').trim();
}

// ---------------------------------------------------------------------------
// Pattern Matching (best-effort decompilation)
// ---------------------------------------------------------------------------

let nextId = 1;
function genId(): string {
  return String(nextId++);
}

function resetIdCounter(): void {
  nextId = 1;
}

/**
 * Attempt to build a node graph from common Python patterns.
 * Recognizes: self.X = Y, cell['X'], env['X'], rangeMap, clamp, np.where, arithmetic.
 */
function patternMatch(code: string): NodeGraph | null {
  resetIdCounter();
  const nodes: NodeInstance[] = [];
  const edges: Edge[] = [];
  const lines = code.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));

  if (lines.length === 0) return null;

  let y = 0;
  let hasAnyMatch = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Match: self.X = <expr>
    const assignMatch = trimmed.match(/^self\.(\w+)\s*=\s*(.+)$/);
    if (assignMatch) {
      const [, prop, expr] = assignMatch;
      const writeId = genId();
      nodes.push({
        id: writeId,
        type: 'PropertyWrite',
        position: { x: 400, y },
        data: { address: `cell.${prop}` },
      });

      // Try to parse the expression into nodes
      const exprResult = parseExpression(expr.trim(), nodes, edges, y);
      if (exprResult) {
        edges.push({
          id: `e${genId()}`,
          source: exprResult.nodeId,
          sourcePort: exprResult.port,
          target: writeId,
          targetPort: 'value',
        });
      }

      hasAnyMatch = true;
      y += 120;
      continue;
    }

    // Unrecognized line — skip
  }

  if (!hasAnyMatch) return null;
  return { nodes, edges };
}

interface ExprResult {
  nodeId: string;
  port: string;
}

/**
 * Parse a Python expression into nodes. Returns the output node/port.
 */
function parseExpression(
  expr: string,
  nodes: NodeInstance[],
  edges: Edge[],
  y: number,
): ExprResult | null {
  // cell['prop']
  const cellMatch = expr.match(/^cell\['(\w+)'\]$/);
  if (cellMatch) {
    const id = genId();
    nodes.push({
      id,
      type: 'PropertyRead',
      position: { x: 0, y },
      data: { address: `cell.${cellMatch[1]}` },
    });
    return { nodeId: id, port: 'value' };
  }

  // env['prop']
  const envMatch = expr.match(/^env\['(\w+)'\]$/);
  if (envMatch) {
    const id = genId();
    nodes.push({
      id,
      type: 'PropertyRead',
      position: { x: 0, y },
      data: { address: `env.${envMatch[1]}` },
    });
    return { nodeId: id, port: 'value' };
  }

  // np.clip(value, min, max)
  const clipMatch = expr.match(/^np\.clip\((.+),\s*(.+),\s*(.+)\)$/);
  if (clipMatch) {
    const id = genId();
    nodes.push({
      id,
      type: 'Clamp',
      position: { x: 200, y },
      data: {},
    });
    const valResult = parseExpression(clipMatch[1].trim(), nodes, edges, y);
    if (valResult) {
      edges.push({ id: `e${genId()}`, source: valResult.nodeId, sourcePort: valResult.port, target: id, targetPort: 'value' });
    }
    return { nodeId: id, port: 'result' };
  }

  // np.where(cond, ifTrue, ifFalse)
  const whereMatch = expr.match(/^np\.where\((.+),\s*(.+),\s*(.+)\)$/);
  if (whereMatch) {
    const id = genId();
    nodes.push({
      id,
      type: 'Select',
      position: { x: 200, y },
      data: {},
    });
    const condResult = parseExpression(whereMatch[1].trim(), nodes, edges, y - 40);
    if (condResult) {
      edges.push({ id: `e${genId()}`, source: condResult.nodeId, sourcePort: condResult.port, target: id, targetPort: 'condition' });
    }
    return { nodeId: id, port: 'result' };
  }

  // Numeric constant
  const numMatch = expr.match(/^-?\d+(\.\d+)?$/);
  if (numMatch) {
    const id = genId();
    nodes.push({
      id,
      type: 'Constant',
      position: { x: 0, y },
      data: { value: parseFloat(expr) },
    });
    return { nodeId: id, port: 'value' };
  }

  // Fallback: can't parse — return null
  return null;
}
