/**
 * NodeDecompiler: extracts a NodeGraph from Python code.
 *
 * Three strategies:
 * 1. Parse the @nodegraph JSON comment (instant round-trip)
 * 2. IR-based: parse with PythonParser → walk IR → create visual nodes
 * 3. Fallback: wrap entire code in a CodeBlock node
 *
 * The IR approach (Strategy 2) uses PythonParser to produce a typed IR tree,
 * then mechanically maps each IR node to a visual node type. Constructs
 * without visual node types (neighbor_at, step, fract, etc.) become
 * CodeBlock escape-hatch nodes that preserve the raw expression text.
 */

import type { NodeGraph, NodeInstance, Edge } from './types';
import type { IRNode, IRStatement, IRProgram, IRType } from '../ir/types';
import { parsePython, type PythonParseContext } from '../ir/PythonParser';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const NODEGRAPH_PATTERN = /^#\s*@nodegraph:\s*(.+)$/m;

/**
 * Attempt to extract a NodeGraph from code.
 * Returns null only if the code is empty.
 */
export function decompileCode(code: string): NodeGraph | null {
  // Strategy 1: @nodegraph JSON comment (lossless round-trip)
  const match = code.match(NODEGRAPH_PATTERN);
  if (match) {
    try {
      const graph = JSON.parse(match[1]) as NodeGraph;
      if (graph.nodes && graph.edges) return graph;
    } catch { /* fall through */ }
  }

  // Strip comments and whitespace
  const stripped = stripNodeGraphComment(code).trim();
  if (!stripped) return null;

  // Strategy 2: IR-based decompilation
  try {
    const context = inferContext(stripped);
    const { program } = parsePython(stripped, context);
    const converter = new IRToNodeGraph();
    const graph = converter.convert(program);
    if (graph.nodes.length > 0) {
      return autoLayout(graph);
    }
  } catch {
    // PythonParser failed — fall through to fallback
  }

  // Strategy 3: CodeBlock fallback — better than a blank canvas
  return codeBlockFallback(stripped);
}

/** Check if code has a @nodegraph comment (without parsing it). */
export function hasNodeGraphComment(code: string): boolean {
  return NODEGRAPH_PATTERN.test(code);
}

/** Strip the @nodegraph comment from code (for display purposes). */
export function stripNodeGraphComment(code: string): string {
  return code.replace(NODEGRAPH_PATTERN, '').trim();
}

// ---------------------------------------------------------------------------
// Context inference — build PythonParseContext from code analysis
// ---------------------------------------------------------------------------

const SKIP_IDENTS = new Set([
  'self', 'cell', 'env', 'glob', 'np',
  'if', 'elif', 'else', 'and', 'or', 'not', 'True', 'False',
  'abs', 'sqrt', 'sin', 'cos', 'floor', 'ceil',
  'min', 'max', 'clamp', 'smoothstep', 'pow',
  'fract', 'sign', 'step', 'mix',
  'int', 'float', 'neighbor_at', 'neighbor_count',
  'x', 'y', 'z', 'width', 'height', 'generation', 'dt', 'time',
]);

function inferContext(code: string): PythonParseContext {
  const cellProps = new Set<string>();
  const envParams = new Set<string>();
  const globalVars = new Set<string>();
  const localVars = new Set<string>();

  // Definite cell props from self.X / cell.X patterns
  for (const m of code.matchAll(/\b(?:self|cell)\.(\w+)/g)) {
    cellProps.add(m[1]);
  }
  // env.X → env param
  for (const m of code.matchAll(/\benv\.(\w+)/g)) {
    envParams.add(m[1]);
  }
  // glob.X → global var
  for (const m of code.matchAll(/\bglob\.(\w+)/g)) {
    globalVars.add(m[1]);
  }

  // Detect local variables: bare `name = expr` where name isn't a known cell prop
  for (const line of code.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const assignMatch = trimmed.match(/^(\w+)\s*=/);
    if (assignMatch) {
      const name = assignMatch[1];
      if (!SKIP_IDENTS.has(name) && !cellProps.has(name) && name !== 'self' && name !== 'cell') {
        localVars.add(name);
      }
    }
  }

  // All remaining bare identifiers → candidate cell properties
  for (const m of code.matchAll(/\b([a-zA-Z_]\w*)\b/g)) {
    const id = m[1];
    if (SKIP_IDENTS.has(id) || localVars.has(id)) continue;
    if (envParams.has(id) || globalVars.has(id)) continue;

    if (id.startsWith('env_')) {
      envParams.add(id.slice(4));
      continue;
    }
    if (id.startsWith('neighbor_sum_') || id.startsWith('neighbors_')) {
      cellProps.add(id.replace(/^neighbor_sum_|^neighbors_/, ''));
      continue;
    }

    cellProps.add(id);
  }

  return {
    cellProperties: [...cellProps].map(name => ({ name, type: 'f32' as IRType, channels: 1 })),
    envParams: [...envParams],
    globalVars: [...globalVars],
    neighborhoodType: 'moore',
  };
}

// ---------------------------------------------------------------------------
// IR → NodeGraph converter
// ---------------------------------------------------------------------------

interface ExprResult {
  nodeId: string;
  port: string;
}

class IRToNodeGraph {
  private nodes: NodeInstance[] = [];
  private edges: Edge[] = [];
  private nextId = 1;

  /** Current wire for each local variable */
  private varOutputs = new Map<string, ExprResult>();

  /** Dedup: reuse Constant nodes for the same value */
  private constCache = new Map<string, ExprResult>();
  /** Dedup: reuse PropertyRead nodes for the same address */
  private propReadCache = new Map<string, ExprResult>();
  /** Dedup: reuse Coordinates/Time nodes */
  private singletonCache = new Map<string, ExprResult>();

  /** When true, write_property statements are intercepted (inside if-body processing) */
  private interceptPropWrites = false;
  private interceptedWrites: { property: string; value: ExprResult }[] = [];

  convert(program: IRProgram): NodeGraph {
    for (const stmt of program.statements) {
      this.convertStatement(stmt);
    }
    return { nodes: this.nodes, edges: this.edges };
  }

  // ── Helpers ──

  private genId(): string { return String(this.nextId++); }

  private addNode(type: string, data: Record<string, unknown> = {}): string {
    const id = this.genId();
    this.nodes.push({ id, type, position: { x: 0, y: 0 }, data });
    return id;
  }

  private connect(source: ExprResult, targetId: string, targetPort: string): void {
    this.edges.push({
      id: `e${this.genId()}`,
      source: source.nodeId,
      sourcePort: source.port,
      target: targetId,
      targetPort,
    });
  }

  private getConstant(value: number, type: IRType = 'f32'): ExprResult {
    const key = `${value}_${type}`;
    const cached = this.constCache.get(key);
    if (cached) return cached;
    const id = this.addNode('Constant', { value });
    const result: ExprResult = { nodeId: id, port: 'value' };
    this.constCache.set(key, result);
    return result;
  }

  private getPropertyRead(address: string): ExprResult {
    const cached = this.propReadCache.get(address);
    if (cached) return cached;
    const id = this.addNode('PropertyRead', { address });
    const result: ExprResult = { nodeId: id, port: 'value' };
    this.propReadCache.set(address, result);
    return result;
  }

  private getSingleton(key: string, type: string, data: Record<string, unknown> = {}): ExprResult {
    const cached = this.singletonCache.get(key);
    if (cached) return cached;
    const id = this.addNode(type, data);
    const result: ExprResult = { nodeId: id, port: key.startsWith('coord_y') ? 'y' : key.startsWith('coord_') ? 'x' : 'frame' };
    this.singletonCache.set(key, result);
    return result;
  }

  private emitPropertyWrite(prop: string, value: ExprResult): void {
    if (this.interceptPropWrites) {
      this.interceptedWrites.push({ property: prop, value });
    } else {
      const writeId = this.addNode('PropertyWrite', { address: `cell.${prop}` });
      this.connect(value, writeId, 'value');
    }
  }

  // ── Statement conversion ──

  private convertStatement(stmt: IRStatement): void {
    switch (stmt.kind) {
      case 'write_property': {
        const value = this.convertExpr(stmt.value);
        if (value) this.emitPropertyWrite(stmt.property, value);
        break;
      }
      case 'declare_var':
      case 'assign_var': {
        const value = this.convertExpr(stmt.value);
        if (value) this.varOutputs.set(stmt.name, value);
        break;
      }
      case 'if':
        this.convertIf(stmt as Extract<IRStatement, { kind: 'if' }>);
        break;
    }
  }

  /**
   * Convert an if/elif/else into Select node chains.
   *
   * For each variable or property that is assigned in either branch,
   * creates a Select(condition, trueValue, falseValue) node. Nested
   * ifs are handled recursively — each nesting level adds another
   * Select in the chain.
   */
  private convertIf(stmt: { kind: 'if'; condition: IRNode; body: IRStatement[]; elseBody?: IRStatement[] }): void {
    const cond = this.convertExpr(stmt.condition);
    if (!cond) return;

    // Snapshot state before entering branches
    const savedVars = new Map(this.varOutputs);
    const savedIntercept = this.interceptPropWrites;
    const savedIntercepted = this.interceptedWrites;

    // Process if-body
    this.interceptPropWrites = true;
    this.interceptedWrites = [];
    for (const s of stmt.body) this.convertStatement(s);
    const bodyVars = new Map(this.varOutputs);
    const bodyPropWrites = [...this.interceptedWrites];

    // Reset to pre-body state and process else-body
    this.varOutputs = new Map(savedVars);
    this.interceptedWrites = [];
    if (stmt.elseBody) {
      for (const s of stmt.elseBody) this.convertStatement(s);
    }
    const elseVars = new Map(this.varOutputs);
    const elsePropWrites = [...this.interceptedWrites];

    // Restore parent intercept state
    this.interceptPropWrites = savedIntercept;
    this.interceptedWrites = savedIntercepted;

    // Merge variables: create Select for each that changed in either branch
    const allVarNames = new Set([...bodyVars.keys(), ...elseVars.keys()]);
    for (const name of allVarNames) {
      const bodyVal = bodyVars.get(name);
      const elseVal = elseVars.get(name);
      const savedVal = savedVars.get(name);

      // Skip unchanged variables
      if (bodyVal === savedVal && elseVal === savedVal) continue;
      // Both branches set same wire — no Select needed
      if (bodyVal && elseVal && bodyVal.nodeId === elseVal.nodeId && bodyVal.port === elseVal.port) {
        this.varOutputs.set(name, bodyVal);
        continue;
      }

      const trueVal = bodyVal ?? savedVal ?? this.getConstant(0);
      const falseVal = elseVal ?? savedVal ?? this.getConstant(0);

      const selectId = this.addNode('Select', {});
      this.connect(cond, selectId, 'condition');
      this.connect(trueVal, selectId, 'ifTrue');
      this.connect(falseVal, selectId, 'ifFalse');
      this.varOutputs.set(name, { nodeId: selectId, port: 'result' });
    }

    // Merge property writes: create Select + PropertyWrite for each property
    const allProps = new Set([
      ...bodyPropWrites.map(w => w.property),
      ...elsePropWrites.map(w => w.property),
    ]);

    for (const prop of allProps) {
      const bodyW = bodyPropWrites.find(w => w.property === prop);
      const elseW = elsePropWrites.find(w => w.property === prop);

      // Default: read original property value (no change)
      const defaultVal = this.getPropertyRead(`cell.${prop}`);
      const trueVal = bodyW?.value ?? defaultVal;
      const falseVal = elseW?.value ?? defaultVal;

      // Same value in both branches → no Select
      if (trueVal.nodeId === falseVal.nodeId && trueVal.port === falseVal.port) {
        this.emitPropertyWrite(prop, trueVal);
        continue;
      }

      const selectId = this.addNode('Select', {});
      this.connect(cond, selectId, 'condition');
      this.connect(trueVal, selectId, 'ifTrue');
      this.connect(falseVal, selectId, 'ifFalse');
      this.emitPropertyWrite(prop, { nodeId: selectId, port: 'result' });
    }
  }

  // ── Expression conversion ──

  private convertExpr(node: IRNode): ExprResult | null {
    switch (node.kind) {
      case 'literal':
        return this.getConstant(node.value, node.type);

      case 'read_property': {
        const prefix = node.scope === 'cell' ? 'cell' : node.scope === 'env' ? 'env' : 'global';
        return this.getPropertyRead(`${prefix}.${node.property}`);
      }

      case 'binop': {
        const typeMap: Record<string, string> = {
          '+': 'Add', '-': 'Subtract', '*': 'Multiply', '/': 'Divide', '%': 'Modulo',
        };
        const nodeType = typeMap[node.op];
        if (!nodeType) return this.codeBlockExpr(node);
        const id = this.addNode(nodeType, {});
        const left = this.convertExpr(node.left);
        const right = this.convertExpr(node.right);
        if (left) this.connect(left, id, 'a');
        if (right) this.connect(right, id, 'b');
        return { nodeId: id, port: 'result' };
      }

      case 'unary':
        if (node.op === '-') {
          const id = this.addNode('Negate', {});
          const operand = this.convertExpr(node.operand);
          if (operand) this.connect(operand, id, 'value');
          return { nodeId: id, port: 'result' };
        }
        if (node.op === '!') {
          const id = this.addNode('Not', {});
          const operand = this.convertExpr(node.operand);
          if (operand) this.connect(operand, id, 'value');
          return { nodeId: id, port: 'result' };
        }
        return this.codeBlockExpr(node);

      case 'compare': {
        const id = this.addNode('Compare', { operator: node.op });
        const left = this.convertExpr(node.left);
        const right = this.convertExpr(node.right);
        if (left) this.connect(left, id, 'a');
        if (right) this.connect(right, id, 'b');
        return { nodeId: id, port: 'result' };
      }

      case 'logic': {
        const type = node.op === '&&' ? 'And' : 'Or';
        const id = this.addNode(type, {});
        const left = this.convertExpr(node.left);
        const right = this.convertExpr(node.right);
        if (left) this.connect(left, id, 'a');
        if (right) this.connect(right, id, 'b');
        return { nodeId: id, port: 'result' };
      }

      case 'select': {
        const id = this.addNode('Select', {});
        const c = this.convertExpr(node.condition);
        const t = this.convertExpr(node.ifTrue);
        const f = this.convertExpr(node.ifFalse);
        if (c) this.connect(c, id, 'condition');
        if (t) this.connect(t, id, 'ifTrue');
        if (f) this.connect(f, id, 'ifFalse');
        return { nodeId: id, port: 'result' };
      }

      case 'call':
        return this.convertCall(node as Extract<IRNode, { kind: 'call' }>);

      case 'var_ref': {
        const result = this.varOutputs.get(node.name);
        if (result) return result;
        return this.codeBlockExpr(node);
      }

      case 'coordinates':
        return this.getSingleton(`coord_${node.axis}`, 'Coordinates');

      case 'grid_param':
        if (node.param === 'generation') {
          return this.getSingleton('time_gen', 'Time');
        }
        return this.codeBlockExpr(node);

      case 'cast':
        // Transparent on GPU (everything is f32)
        return this.convertExpr(node.value);

      case 'neighbor_at': {
        const id = this.addNode('NeighborRead', {
          dx: node.dx,
          dy: node.dy,
          property: node.property,
        });
        return { nodeId: id, port: 'result' };
      }

      case 'neighbor_reduce':
        if (node.op === 'sum') {
          const id = this.addNode('NeighborSum', { property: node.property });
          return { nodeId: id, port: 'result' };
        }
        // count_where → CodeBlock (has predicate sub-expression)
        return this.codeBlockExpr(node);
    }
  }

  private convertCall(node: { kind: 'call'; fn: string; args: IRNode[]; type: IRType }): ExprResult | null {
    const { fn, args } = node;

    // Unary math → single-input nodes
    const unaryMap: Record<string, string> = {
      abs: 'Abs', sqrt: 'Sqrt', sin: 'Sin', cos: 'Cos', floor: 'Floor', ceil: 'Ceil',
    };
    if (fn in unaryMap && args.length >= 1) {
      const id = this.addNode(unaryMap[fn], {});
      const a = this.convertExpr(args[0]);
      if (a) this.connect(a, id, 'value');
      return { nodeId: id, port: 'result' };
    }

    // Binary math → two-input nodes
    const binaryMap: Record<string, string> = { min: 'Min', max: 'Max', pow: 'Power' };
    if (fn in binaryMap && args.length >= 2) {
      const id = this.addNode(binaryMap[fn], {});
      const a = this.convertExpr(args[0]);
      const b = this.convertExpr(args[1]);
      if (a) this.connect(a, id, 'a');
      if (b) this.connect(b, id, 'b');
      return { nodeId: id, port: 'result' };
    }

    // clamp(value, min, max)
    if (fn === 'clamp' && args.length >= 3) {
      const id = this.addNode('Clamp', {});
      const v = this.convertExpr(args[0]);
      const lo = this.convertExpr(args[1]);
      const hi = this.convertExpr(args[2]);
      if (v) this.connect(v, id, 'value');
      if (lo) this.connect(lo, id, 'min');
      if (hi) this.connect(hi, id, 'max');
      return { nodeId: id, port: 'result' };
    }

    // smoothstep(edge0, edge1, value)
    if (fn === 'smoothstep' && args.length >= 3) {
      const id = this.addNode('Smoothstep', {});
      const e0 = this.convertExpr(args[0]);
      const e1 = this.convertExpr(args[1]);
      const v = this.convertExpr(args[2]);
      if (v) this.connect(v, id, 'value');
      if (e0) this.connect(e0, id, 'edge0');
      if (e1) this.connect(e1, id, 'edge1');
      return { nodeId: id, port: 'result' };
    }

    // mix(a, b, t) → Linear interp
    if (fn === 'mix' && args.length >= 3) {
      const id = this.addNode('Linear', {});
      const a = this.convertExpr(args[0]);
      const b = this.convertExpr(args[1]);
      const t = this.convertExpr(args[2]);
      if (a) this.connect(a, id, 'a');
      if (b) this.connect(b, id, 'b');
      if (t) this.connect(t, id, 't');
      return { nodeId: id, port: 'result' };
    }

    // step, fract, sign, etc. → CodeBlock
    return this.codeBlockExpr(node as IRNode);
  }

  /** Wrap an IR expression in a CodeBlock escape-hatch node. */
  private codeBlockExpr(node: IRNode): ExprResult {
    const code = irNodeToPython(node);
    const id = this.addNode('CodeBlock', { code });
    return { nodeId: id, port: 'result' };
  }
}

// ---------------------------------------------------------------------------
// IR → Python text (for CodeBlock content)
// ---------------------------------------------------------------------------

function irNodeToPython(node: IRNode): string {
  switch (node.kind) {
    case 'literal':
      if (node.type === 'bool') return node.value ? 'True' : 'False';
      // Emit float format (1.0 not 1) for readability
      if (node.type === 'f32' && Number.isInteger(node.value)) return `${node.value}.0`;
      return String(node.value);
    case 'read_property':
      if (node.scope === 'cell') return node.property;
      return `${node.scope === 'env' ? 'env' : 'glob'}.${node.property}`;
    case 'binop':
      return `(${irNodeToPython(node.left)} ${node.op} ${irNodeToPython(node.right)})`;
    case 'unary':
      return node.op === '!' ? `(not ${irNodeToPython(node.operand)})` : `(-${irNodeToPython(node.operand)})`;
    case 'compare':
      return `(${irNodeToPython(node.left)} ${node.op} ${irNodeToPython(node.right)})`;
    case 'logic': {
      const op = node.op === '&&' ? 'and' : 'or';
      return `(${irNodeToPython(node.left)} ${op} ${irNodeToPython(node.right)})`;
    }
    case 'select':
      return `(${irNodeToPython(node.ifTrue)} if ${irNodeToPython(node.condition)} else ${irNodeToPython(node.ifFalse)})`;
    case 'call':
      return `${node.fn}(${node.args.map(irNodeToPython).join(', ')})`;
    case 'neighbor_at':
      return `neighbor_at(${node.dx}, ${node.dy}, ${node.property})`;
    case 'neighbor_reduce':
      return node.op === 'sum' ? `neighbor_sum_${node.property}` : `neighbor_count(${node.property}, 1.0)`;
    case 'var_ref':
      return node.name;
    case 'cast':
      if (node.target === 'f32') return `float(${irNodeToPython(node.value)})`;
      if (node.target === 'u32') return `int(${irNodeToPython(node.value)})`;
      return irNodeToPython(node.value);
    case 'coordinates':
      return node.axis;
    case 'grid_param':
      return node.param;
  }
}

// ---------------------------------------------------------------------------
// Prettify: compiled code → PythonParser → IR → readable Python
// ---------------------------------------------------------------------------

/**
 * Transform compiled node graph code into readable PythonParser-compatible Python.
 *
 * Converts flat ternary expressions into if/else blocks when they feed
 * directly into property writes. Emits float literals. The result is
 * valid PythonParser input that reads like hand-written Python.
 */
export function prettifyCode(code: string): string {
  const stripped = stripNodeGraphComment(code).trim();
  if (!stripped) return code;

  try {
    const context = inferContext(stripped);
    const { program } = parsePython(stripped, context);
    const transformed = selectWritesToIf(program.statements);
    return emitStatements(transformed, '');
  } catch {
    return stripped;
  }
}

/** Convert write_property(prop, select(cond, a, b)) → if(cond, [write(prop,a)], [write(prop,b)]) */
function selectWritesToIf(stmts: IRStatement[]): IRStatement[] {
  return stmts.map(stmt => {
    if (stmt.kind === 'write_property' && stmt.value.kind === 'select') {
      return {
        kind: 'if' as const,
        condition: stmt.value.condition,
        body: [{ kind: 'write_property' as const, property: stmt.property, scope: 'cell' as const, value: stmt.value.ifTrue }],
        elseBody: [{ kind: 'write_property' as const, property: stmt.property, scope: 'cell' as const, value: stmt.value.ifFalse }],
      };
    }
    return stmt;
  });
}

function emitStatements(stmts: IRStatement[], indent: string): string {
  const lines: string[] = [];
  for (const stmt of stmts) {
    switch (stmt.kind) {
      case 'declare_var':
      case 'assign_var':
        lines.push(`${indent}${stmt.name} = ${irNodeToPython(stmt.value)}`);
        break;
      case 'write_property':
        lines.push(`${indent}self.${stmt.property} = ${irNodeToPython(stmt.value)}`);
        break;
      case 'if':
        lines.push(`${indent}if ${irNodeToPython(stmt.condition)}:`);
        lines.push(emitStatements(stmt.body, indent + '    '));
        if (stmt.elseBody && stmt.elseBody.length > 0) {
          lines.push(`${indent}else:`);
          lines.push(emitStatements(stmt.elseBody, indent + '    '));
        }
        break;
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Auto-layout — position nodes in left-to-right layers
// ---------------------------------------------------------------------------

function autoLayout(graph: NodeGraph): NodeGraph {
  if (graph.nodes.length === 0) return graph;

  // Compute depth for each node via BFS from sources
  const depths = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of graph.nodes) {
    adj.set(n.id, []);
    depths.set(n.id, 0);
  }
  for (const e of graph.edges) {
    adj.get(e.source)?.push(e.target);
  }

  // Sources = nodes with no incoming edges
  const hasIncoming = new Set(graph.edges.map(e => e.target));
  const sources = graph.nodes.filter(n => !hasIncoming.has(n.id));
  if (sources.length === 0) {
    // All nodes have incoming edges (cycle or isolated) — use first node
    sources.push(graph.nodes[0]);
  }

  const queue = sources.map(n => ({ id: n.id, depth: 0 }));
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth > (depths.get(id) ?? 0)) {
      depths.set(id, depth);
    }
    for (const next of adj.get(id) ?? []) {
      queue.push({ id: next, depth: depth + 1 });
    }
  }

  // Position nodes by depth (x) and row within layer (y)
  const layerCounts = new Map<number, number>();
  const newNodes = graph.nodes.map(n => {
    const d = depths.get(n.id) ?? 0;
    const row = layerCounts.get(d) ?? 0;
    layerCounts.set(d, row + 1);
    return { ...n, position: { x: d * 220, y: row * 100 } };
  });

  return { nodes: newNodes, edges: graph.edges };
}

// ---------------------------------------------------------------------------
// CodeBlock fallback — wraps entire code when PythonParser can't parse it
// ---------------------------------------------------------------------------

function codeBlockFallback(code: string): NodeGraph | null {
  if (!code.trim()) return null;

  // Detect property writes from self.X = patterns for PropertyWrite nodes
  const writes = [...code.matchAll(/\bself\.(\w+)\s*=/g)].map(m => m[1]);
  const uniqueWrites = [...new Set(writes)];

  const nodes: NodeInstance[] = [];
  const edges: Edge[] = [];
  let nextId = 1;
  const gid = () => String(nextId++);

  // Single CodeBlock with the full code
  const blockId = gid();
  nodes.push({
    id: blockId,
    type: 'CodeBlock',
    position: { x: 0, y: 0 },
    data: { code: code.trim(), isStatement: true },
  });

  // If we can detect output properties, create PropertyWrite stubs
  if (uniqueWrites.length > 0) {
    // Statement-mode CodeBlock (no output edges) — code emits directly
    // No PropertyWrite nodes needed since the CodeBlock itself contains the writes
  }

  return autoLayout({ nodes, edges });
}
