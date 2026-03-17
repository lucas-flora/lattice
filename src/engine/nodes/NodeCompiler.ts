/**
 * NodeCompiler: compiles a NodeGraph into Python code.
 *
 * 1. Topological sort nodes by edges
 * 2. Each node emits Python via its compile() function
 * 3. Temp variables: _n{id} per node
 * 4. PropertyWrite nodes emit assignments
 * 5. Embeds the full NodeGraph as a @nodegraph JSON comment for round-trip
 */

import type { NodeGraph, CompilationResult, Edge, NodeInstance } from './types';
import { nodeTypeRegistry } from './NodeTypeRegistry';

/**
 * Topological sort of nodes based on edges.
 * Returns node IDs in dependency order (sources before targets).
 * Throws if a cycle is detected.
 */
export function topologicalSort(nodes: NodeInstance[], edges: Edge[]): string[] {
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    adj.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const neighbor of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (sorted.length !== nodes.length) {
    throw new Error('Cycle detected in node graph');
  }

  return sorted;
}

/**
 * Compile a NodeGraph into Python code + input/output declarations.
 */
export function compileNodeGraph(graph: NodeGraph): CompilationResult {
  const { nodes, edges } = graph;

  if (nodes.length === 0) {
    return { code: '', inputs: [], outputs: [] };
  }

  const sorted = topologicalSort(nodes, edges);

  // Map: nodeId → NodeInstance for quick lookup
  const nodeMap = new Map<string, NodeInstance>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Map: "targetId:targetPort" → expression string
  // Pre-populated from edges: target port gets source node's output expression
  const portExprs = new Map<string, string>();

  // Track inputs and outputs for the compiled expression
  const inputs: string[] = [];
  const outputs: string[] = [];

  const lines: string[] = [];

  for (const nodeId of sorted) {
    const node = nodeMap.get(nodeId)!;
    const typeDef = nodeTypeRegistry.get(node.type);
    if (!typeDef) {
      lines.push(`# Unknown node type: ${node.type}`);
      continue;
    }

    // Gather input expressions for this node
    const inputExprs: Record<string, string> = {};
    for (const port of typeDef.inputs) {
      const key = `${nodeId}:${port.id}`;
      if (portExprs.has(key)) {
        inputExprs[port.id] = portExprs.get(key)!;
      } else if (port.defaultValue !== undefined) {
        inputExprs[port.id] = String(port.defaultValue);
      }
    }

    // Compile this node
    const expr = typeDef.compile(inputExprs, node.data);

    // Track property reads/writes for input/output declarations
    if (node.type === 'PropertyRead') {
      const addr = (node.data.address as string) ?? 'cell.alive';
      if (!inputs.includes(addr)) inputs.push(addr);
    }
    if (node.type === 'PropertyWrite') {
      const addr = (node.data.address as string) ?? 'cell.alive';
      if (!outputs.includes(addr)) outputs.push(addr);
    }

    // PropertyWrite emits a direct assignment, not a temp var
    if (node.type === 'PropertyWrite') {
      lines.push(expr);
    } else {
      // Create temp variable for non-write nodes
      const varName = `_n${nodeId}`;
      lines.push(`${varName} = ${expr}`);

      // Propagate this node's output to all connected downstream ports
      for (const edge of edges) {
        if (edge.source === nodeId) {
          portExprs.set(`${edge.target}:${edge.targetPort}`, varName);
        }
      }
    }
  }

  // Embed the node graph as a comment for round-trip
  const graphJson = JSON.stringify(graph);
  lines.push(`# @nodegraph: ${graphJson}`);

  const code = lines.join('\n');
  return { code, inputs, outputs };
}
