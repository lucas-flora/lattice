/**
 * ExpressionTagRegistry: unified registry for all computation tags.
 *
 * Replaces both LinkRegistry and ExpressionEngine. Every computation
 * primitive — links, per-property expressions, global scripts — is an
 * ExpressionTag that lives here.
 *
 * Key design points:
 *   - Tags created via link.add with simple rangeMap patterns run in JS
 *     (fast path — no Pyodide needed). Complex code tags go through Python.
 *   - Cycle detection at add-time using DFS on a directed adjacency graph.
 *   - Tags within each phase run in dependency order (topological sort).
 *   - `self` references resolve to the owning object's namespace.
 */

import type { Grid } from '../grid/Grid';
import type { GlobalVariableStore } from '../scripting/GlobalVariableStore';
import type { ExpressionTag, ExpressionTagDef, LinkMeta, TagOwner } from './types';
import type { EasingType } from '../linking/types';
import { parseAddress, resolveRead, resolveWrite } from './PropertyAddress';
import { rangeMap, rangeMapArray } from './easing';
import { generateLinkCode } from './linkCodegen';

let nextId = 0;
function generateId(): string {
  return `tag_${++nextId}`;
}

/** Reset ID counter (for testing) */
export function _resetTagIdCounter(): void {
  nextId = 0;
}

/**
 * Get a string key for a TagOwner (for indexing).
 */
function ownerKey(owner: TagOwner): string {
  if (owner.type === 'cell-type' && owner.id) return `cell-type:${owner.id}`;
  return owner.type;
}

export class ExpressionTagRegistry {
  private tags: Map<string, ExpressionTag> = new Map();
  /** Index: owner key → tag IDs */
  private tagsByOwner: Map<string, Set<string>> = new Map();
  /** Adjacency list for cycle detection: output address → set of input addresses */
  private graph: Map<string, Set<string>> = new Map();

  // --- CRUD ---

  /** Add a tag. Returns the tag with generated ID. */
  add(def: ExpressionTagDef): ExpressionTag {
    const tag: ExpressionTag = {
      ...def,
      id: generateId(),
    };

    // Validate output addresses
    for (const output of tag.outputs) {
      parseAddress(output);
    }

    // Cycle detection: would adding these edges create a cycle?
    for (const output of tag.outputs) {
      for (const input of tag.inputs) {
        if (this.wouldCreateCycle(input, output)) {
          throw new Error(
            `Adding tag "${tag.name}" would create a cycle: ${input} → ${output}`,
          );
        }
      }
    }

    // Add to dependency graph
    for (const input of tag.inputs) {
      for (const output of tag.outputs) {
        if (!this.graph.has(input)) {
          this.graph.set(input, new Set());
        }
        this.graph.get(input)!.add(output);
      }
    }

    // Store tag
    this.tags.set(tag.id, tag);

    // Index by owner
    const key = ownerKey(tag.owner);
    if (!this.tagsByOwner.has(key)) {
      this.tagsByOwner.set(key, new Set());
    }
    this.tagsByOwner.get(key)!.add(tag.id);

    return tag;
  }

  /** Remove a tag by ID. */
  remove(id: string): boolean {
    const tag = this.tags.get(id);
    if (!tag) return false;

    // Remove from dependency graph
    for (const input of tag.inputs) {
      const outputs = this.graph.get(input);
      if (outputs) {
        for (const output of tag.outputs) {
          outputs.delete(output);
        }
        if (outputs.size === 0) {
          this.graph.delete(input);
        }
      }
    }

    // Remove from owner index
    const key = ownerKey(tag.owner);
    const ownerTags = this.tagsByOwner.get(key);
    if (ownerTags) {
      ownerTags.delete(id);
      if (ownerTags.size === 0) {
        this.tagsByOwner.delete(key);
      }
    }

    this.tags.delete(id);
    return true;
  }

  /** Update a tag's properties. Returns updated tag or null. */
  update(id: string, patch: Partial<Pick<ExpressionTag, 'name' | 'code' | 'phase' | 'enabled' | 'source' | 'inputs' | 'outputs' | 'linkMeta'>> & { owner?: TagOwner }): ExpressionTag | null {
    const tag = this.tags.get(id);
    if (!tag) return null;

    // If inputs/outputs changed, rebuild graph edges
    if (patch.inputs || patch.outputs) {
      // Remove old edges
      for (const input of tag.inputs) {
        const outputs = this.graph.get(input);
        if (outputs) {
          for (const output of tag.outputs) {
            outputs.delete(output);
          }
          if (outputs.size === 0) this.graph.delete(input);
        }
      }

      const newInputs = patch.inputs ?? tag.inputs;
      const newOutputs = patch.outputs ?? tag.outputs;

      // Cycle check
      for (const output of newOutputs) {
        for (const input of newInputs) {
          if (this.wouldCreateCycle(input, output)) {
            throw new Error(`Update would create a cycle: ${input} → ${output}`);
          }
        }
      }

      // Add new edges
      for (const input of newInputs) {
        for (const output of newOutputs) {
          if (!this.graph.has(input)) this.graph.set(input, new Set());
          this.graph.get(input)!.add(output);
        }
      }
    }

    // If owner changed, update the owner index
    if (patch.owner) {
      const oldKey = ownerKey(tag.owner);
      const oldSet = this.tagsByOwner.get(oldKey);
      if (oldSet) {
        oldSet.delete(id);
        if (oldSet.size === 0) this.tagsByOwner.delete(oldKey);
      }
      const newKey = ownerKey(patch.owner);
      if (!this.tagsByOwner.has(newKey)) this.tagsByOwner.set(newKey, new Set());
      this.tagsByOwner.get(newKey)!.add(id);
    }

    Object.assign(tag, patch);
    return tag;
  }

  /** Enable a tag. */
  enable(id: string): void {
    const tag = this.tags.get(id);
    if (tag) tag.enabled = true;
  }

  /** Disable a tag. */
  disable(id: string): void {
    const tag = this.tags.get(id);
    if (tag) tag.enabled = false;
  }

  // --- Queries ---

  get(id: string): ExpressionTag | undefined {
    return this.tags.get(id);
  }

  getAll(): ExpressionTag[] {
    return [...this.tags.values()];
  }

  getEnabled(): ExpressionTag[] {
    return [...this.tags.values()].filter((t) => t.enabled);
  }

  getByOwner(owner: TagOwner): ExpressionTag[] {
    const key = ownerKey(owner);
    const ids = this.tagsByOwner.get(key);
    if (!ids) return [];
    return [...ids].map((id) => this.tags.get(id)!);
  }

  /** Get tags that write to a specific property address. */
  getByTarget(address: string): ExpressionTag[] {
    return [...this.tags.values()].filter((t) => t.outputs.includes(address));
  }

  /** Check if any tags exist. */
  hasTags(): boolean {
    return this.tags.size > 0;
  }

  /** Check if any enabled pre-rule tags exist (link fast path). */
  hasPreRuleTags(): boolean {
    for (const tag of this.tags.values()) {
      if (tag.enabled && tag.phase === 'pre-rule') return true;
    }
    return false;
  }

  /** Check if any enabled post-rule tags exist. */
  hasPostRuleTags(): boolean {
    for (const tag of this.tags.values()) {
      if (tag.enabled && tag.phase === 'post-rule') return true;
    }
    return false;
  }

  /** Clear all tags. */
  clear(): void {
    this.tags.clear();
    this.tagsByOwner.clear();
    this.graph.clear();
  }

  // --- Copy ---

  /**
   * Copy a tag to a new owner. `self` references in the code automatically
   * adapt (absolute references stay as-is).
   */
  copyToOwner(id: string, newOwner: TagOwner): ExpressionTag {
    const original = this.tags.get(id);
    if (!original) throw new Error(`Tag "${id}" not found`);

    const copy: ExpressionTagDef = {
      ...original,
      owner: newOwner,
      name: `${original.name} (copy)`,
      // Inputs/outputs referencing self need updating
      inputs: [...original.inputs],
      outputs: [...original.outputs],
      linkMeta: original.linkMeta ? { ...original.linkMeta } : undefined,
    };

    return this.add(copy);
  }

  // --- Execution ---

  /**
   * Resolve all enabled pre-rule tags via JS fast path.
   * Link-sourced tags use rangeMap directly. Code-sourced pre-rule tags
   * are skipped here (they go through Python in evaluatePostRule).
   */
  resolvePreRule(
    grid: Grid,
    params: Map<string, number>,
    variableStore: GlobalVariableStore,
  ): void {
    for (const tag of this.tags.values()) {
      if (!tag.enabled || tag.phase !== 'pre-rule') continue;
      if (this.isSimpleRangeMap(tag)) {
        this.resolveJsFastPath(tag, grid, params, variableStore);
      }
    }
  }

  /**
   * Evaluate all enabled post-rule tags.
   * Returns a record of property → expression for the Python harness.
   * The actual Python execution is delegated to Simulation.tickAsync() via PyodideBridge.
   */
  getPostRuleExpressions(): Record<string, string> {
    const expressions: Record<string, string> = {};
    for (const tag of this.tags.values()) {
      if (!tag.enabled || tag.phase !== 'post-rule' || tag.source !== 'code' || !tag.code.trim()) continue;
      // For code/script tags, map each output property to the code
      for (const output of tag.outputs) {
        const addr = parseAddress(output);
        if (addr.namespace === 'cell') {
          expressions[addr.key] = tag.code;
        }
      }
    }
    return expressions;
  }

  // --- Fast path ---

  /** Check if a tag can be resolved via the JS fast path (rangeMap).
   * Checks linkMeta presence regardless of source — link wizard creates
   * 'code' tags with linkMeta preserved for fast-path eligibility. */
  isSimpleRangeMap(tag: ExpressionTag): boolean {
    return tag.linkMeta !== undefined;
  }

  /** Resolve a link-sourced tag using JS rangeMap (no Pyodide). */
  private resolveJsFastPath(
    tag: ExpressionTag,
    grid: Grid,
    params: Map<string, number>,
    variableStore: GlobalVariableStore,
  ): void {
    if (!tag.linkMeta) return;

    const { sourceAddress, sourceRange, targetRange, easing } = tag.linkMeta;
    const srcAddr = parseAddress(sourceAddress);
    const dstAddr = parseAddress(tag.outputs[0]);

    const srcValue = resolveRead(srcAddr, grid, params, variableStore);
    const isSourceArray = srcValue instanceof Float32Array;
    const isTargetCell = dstAddr.namespace === 'cell';

    if (isSourceArray && isTargetCell) {
      // cell→cell: element-wise range mapping
      const dstBuf = grid.getCurrentBuffer(dstAddr.key);
      rangeMapArray(srcValue, dstBuf, sourceRange, targetRange, easing);
    } else if (!isSourceArray && !isTargetCell) {
      // scalar→scalar
      const mapped = rangeMap(srcValue, sourceRange, targetRange, easing);
      resolveWrite(dstAddr, mapped, grid, params, variableStore);
    } else if (!isSourceArray && isTargetCell) {
      // scalar→cell: broadcast mapped scalar
      const mapped = rangeMap(srcValue, sourceRange, targetRange, easing);
      const dstBuf = grid.getCurrentBuffer(dstAddr.key);
      dstBuf.fill(mapped);
    } else {
      // cell→scalar: mean reduction
      const srcArray = srcValue as Float32Array;
      let sum = 0;
      for (let i = 0; i < srcArray.length; i++) {
        sum += srcArray[i];
      }
      const mean = srcArray.length > 0 ? sum / srcArray.length : 0;
      const mapped = rangeMap(mean, sourceRange, targetRange, easing);
      resolveWrite(dstAddr, mapped, grid, params, variableStore);
    }
  }

  // --- Cycle detection ---

  /** Check if adding an edge from source to target would create a cycle. */
  private wouldCreateCycle(source: string, target: string): boolean {
    if (source === target) return true;
    return this.hasPath(target, source);
  }

  /** DFS: check if there's a path from `from` to `to` in the graph. */
  private hasPath(from: string, to: string): boolean {
    const visited = new Set<string>();
    const stack = [from];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node === to) return true;
      if (visited.has(node)) continue;
      visited.add(node);

      const neighbors = this.graph.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          stack.push(neighbor);
        }
      }
    }

    return false;
  }

  // --- Topological sort ---

  /** Sort tags within a phase by dependency order. */
  topologicalSort(tags: ExpressionTag[]): ExpressionTag[] {
    if (tags.length <= 1) return tags;

    // Build adjacency: tag A depends on tag B if any of A's inputs overlap B's outputs
    const tagIds = new Set(tags.map((t) => t.id));
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const t of tags) {
      inDegree.set(t.id, 0);
      adj.set(t.id, []);
    }

    for (const a of tags) {
      for (const b of tags) {
        if (a.id === b.id) continue;
        // b must run before a if any of b's outputs are a's inputs
        const depends = b.outputs.some((out) => a.inputs.includes(out));
        if (depends) {
          adj.get(b.id)!.push(a.id);
          inDegree.set(a.id, (inDegree.get(a.id) ?? 0) + 1);
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: ExpressionTag[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      sorted.push(this.tags.get(id)!);
      for (const neighbor of adj.get(id) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    // If we couldn't sort all (cycle among the subset), append remaining
    if (sorted.length < tags.length) {
      for (const t of tags) {
        if (!sorted.includes(t)) sorted.push(t);
      }
    }

    return sorted;
  }

  // --- Preset migration ---

  /**
   * Create a code tag from link wizard data.
   * Links are a creation wizard, not a source type — the result is a normal
   * code tag with linkMeta preserved for JS fast-path eligibility.
   */
  addFromLink(source: string, target: string, sourceRange: [number, number], targetRange: [number, number], easing: EasingType, enabled: boolean = true): ExpressionTag {
    const meta: LinkMeta = { sourceAddress: source, sourceRange, targetRange, easing };
    return this.add({
      name: `${source} → ${target}`,
      owner: { type: 'root' },
      code: generateLinkCode(meta, target),
      phase: 'pre-rule',
      enabled,
      source: 'code',
      inputs: [source],
      outputs: [target],
      linkMeta: meta,
    });
  }

  /**
   * Migrate legacy link-sourced tags to code-sourced.
   * Preserves linkMeta for fast-path. Called during preset load.
   */
  migrateLinkTags(): number {
    let count = 0;
    for (const tag of this.tags.values()) {
      if (tag.source === 'link') {
        (tag as { source: string }).source = 'code';
        count++;
      }
    }
    return count;
  }

  /**
   * Create a code-style ExpressionTag from a legacy per-property expression.
   */
  addFromExpression(propertyName: string, expression: string): ExpressionTag {
    return this.add({
      name: `expr: ${propertyName}`,
      owner: { type: 'cell-type' },
      code: expression,
      phase: 'post-rule',
      enabled: true,
      source: 'code',
      inputs: [],
      outputs: [`cell.${propertyName}`],
    });
  }

  /**
   * Create a script-style ExpressionTag from a legacy global script.
   */
  addFromScript(name: string, code: string, inputs: string[], outputs: string[], enabled: boolean = true): ExpressionTag {
    return this.add({
      name,
      owner: { type: 'root' },
      code,
      phase: 'post-rule',
      enabled,
      source: 'script',
      inputs,
      outputs,
    });
  }

  /**
   * Create a rule tag from a preset's compute body.
   * Rule tags have phase: 'rule' and receive RuleContext.
   *
   * Rule tags are exempt from cycle detection because they inherently
   * read and write the same cell properties (that's what a rule does).
   * They run at their own pipeline stage, not in the expression graph.
   */
  addFromRule(presetName: string, computeBody: string, _ruleType: 'typescript' | 'wasm' | 'python' = 'typescript'): ExpressionTag {
    const tag: ExpressionTag = {
      id: generateId(),
      name: `${presetName} Rule`,
      owner: { type: 'root' },
      code: computeBody,
      phase: 'rule',
      enabled: true,
      source: 'code',
      inputs: ['cell.*'],
      outputs: ['cell.*'],
      linkMeta: undefined,
    };

    // Store directly — skip cycle detection and dependency graph.
    // Rule tags don't participate in the expression dependency graph;
    // they run at their own pipeline stage (step 2 in the tick pipeline).
    this.tags.set(tag.id, tag);

    const key = ownerKey(tag.owner);
    if (!this.tagsByOwner.has(key)) {
      this.tagsByOwner.set(key, new Set());
    }
    this.tagsByOwner.get(key)!.add(tag.id);

    return tag;
  }

  /** Get the active rule tag (phase='rule', enabled) */
  getRuleTag(): ExpressionTag | undefined {
    for (const tag of this.tags.values()) {
      if (tag.phase === 'rule' && tag.enabled) return tag;
    }
    return undefined;
  }

  /**
   * Load legacy parameter_links from preset config.
   */
  loadLinksFromConfig(defs: Array<{ source: string; target: string; sourceRange?: [number, number]; targetRange?: [number, number]; easing?: EasingType; enabled?: boolean }>): void {
    for (const def of defs) {
      this.addFromLink(
        def.source,
        def.target,
        def.sourceRange ?? [0, 1],
        def.targetRange ?? [0, 1],
        def.easing ?? 'linear',
        def.enabled ?? true,
      );
    }
  }
}
