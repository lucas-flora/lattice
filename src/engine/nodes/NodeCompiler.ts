/**
 * NodeCompiler: compiles a NodeGraph into Python code.
 *
 * 1. Topological sort nodes by edges
 * 2. Each node emits Python via its compile() function
 * 3. Single-use expressions are inlined (no temp vars)
 * 4. Multi-use expressions get readable variable names
 * 5. Embeds the full NodeGraph as a @nodegraph JSON comment for round-trip
 */

import type { NodeGraph, CompilationResult, Edge, NodeInstance, ObjectNodeData } from './types';
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
 *
 * Inlines single-use expressions for clean output. A graph like:
 *   ObjectNode(age) → RangeMap(0,20,1,0) → ObjectNode(alpha)
 * compiles to:
 *   self.alpha = ((cell['age'] - 0) / (20 - 0) * (0 - 1) + 1)
 */
export function compileNodeGraph(graph: NodeGraph): CompilationResult {
  const { nodes, edges } = graph;

  if (nodes.length === 0) {
    return { code: '', inputs: [], outputs: [] };
  }

  const sorted = topologicalSort(nodes, edges);

  const nodeMap = new Map<string, NodeInstance>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Count how many downstream edges consume each source port
  const portUsage = new Map<string, number>();
  for (const edge of edges) {
    const key = `${edge.source}:${edge.sourcePort}`;
    portUsage.set(key, (portUsage.get(key) ?? 0) + 1);
  }

  // Map: "targetId:targetPort" → expression string (may be inlined or a var name)
  const portExprs = new Map<string, string>();

  const inputs: string[] = [];
  const outputs: string[] = [];
  const lines: string[] = [];
  const usedVarNames = new Set<string>();

  for (const nodeId of sorted) {
    const node = nodeMap.get(nodeId)!;

    // --- ObjectNode special case ---
    if (node.type === 'ObjectNode') {
      const od = node.data as unknown as ObjectNodeData;
      const kind = od.objectKind;

      const readExpr = (prop: string) => {
        if (kind === 'cell-type') return `cell['${prop}']`;
        if (kind === 'environment') return `env['${prop}']`;
        return `glob['${prop}']`;
      };
      const writeStmt = (prop: string, val: string) => {
        if (kind === 'cell-type') return `self.${prop} = ${val}`;
        if (kind === 'environment') return `env['${prop}'] = ${val}`;
        return `glob['${prop}'] = ${val}`;
      };
      const addrPrefix = kind === 'cell-type' ? 'cell' : kind === 'environment' ? 'env' : 'global';

      // Outputs (right side) → reads from object, sends downstream
      for (const prop of od.enabledOutputs ?? []) {
        const addr = `${addrPrefix}.${prop}`;
        if (!inputs.includes(addr)) inputs.push(addr);

        const portKey = `out_${prop}`;
        const usage = portUsage.get(`${nodeId}:${portKey}`) ?? 0;
        const outEdges = edges.filter((e) => e.source === nodeId && e.sourcePort === portKey);

        if (usage <= 1) {
          // Single use → inline the read expression directly
          for (const edge of outEdges) {
            portExprs.set(`${edge.target}:${edge.targetPort}`, readExpr(prop));
          }
        } else {
          // Multiple consumers → use property name as variable
          let varName = prop;
          if (usedVarNames.has(varName)) varName = `_${prop}_${nodeId}`;
          usedVarNames.add(varName);
          lines.push(`${varName} = ${readExpr(prop)}`);
          for (const edge of outEdges) {
            portExprs.set(`${edge.target}:${edge.targetPort}`, varName);
          }
        }
      }

      // Inputs (left side) → receives from upstream, writes to object
      for (const prop of od.enabledInputs ?? []) {
        const key = `${nodeId}:in_${prop}`;
        const inputVal = portExprs.get(key);
        if (inputVal) {
          lines.push(writeStmt(prop, inputVal));
          const addr = `${addrPrefix}.${prop}`;
          if (!outputs.includes(addr)) outputs.push(addr);
        }
      }

      continue;
    }

    // --- Standard node compilation ---
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

    // Compile this node's expression
    const expr = typeDef.compile(inputExprs, node.data);

    // Track property reads/writes
    if (node.type === 'PropertyRead') {
      const addr = (node.data.address as string) ?? 'cell.alive';
      if (!inputs.includes(addr)) inputs.push(addr);
    }
    if (node.type === 'PropertyWrite') {
      const addr = (node.data.address as string) ?? 'cell.alive';
      if (!outputs.includes(addr)) outputs.push(addr);
    }

    // PropertyWrite emits a direct assignment
    if (node.type === 'PropertyWrite') {
      lines.push(expr);
      continue;
    }

    // Check downstream usage — inline if single consumer
    const outEdges = edges.filter((e) => e.source === nodeId);
    if (outEdges.length <= 1) {
      // Single use (or unused) → inline the expression, no temp var
      for (const edge of outEdges) {
        portExprs.set(`${edge.target}:${edge.targetPort}`, expr);
      }
    } else {
      // Multiple consumers → emit a readable temp var
      const varName = `_${node.type.toLowerCase()}_${nodeId}`;
      lines.push(`${varName} = ${expr}`);
      for (const edge of outEdges) {
        portExprs.set(`${edge.target}:${edge.targetPort}`, varName);
      }
    }
  }

  // Embed the node graph as a comment for round-trip
  const graphJson = JSON.stringify(graph);
  lines.push(`# @nodegraph: ${graphJson}`);

  const code = lines.join('\n');
  return { code, inputs, outputs };
}
