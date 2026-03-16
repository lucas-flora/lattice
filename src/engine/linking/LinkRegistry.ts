/**
 * LinkRegistry: stores parameter links and resolves them per tick.
 *
 * Handles four cross-type semantics:
 *   - cell→cell: element-wise range mapping
 *   - scalar→scalar: direct range mapping
 *   - scalar→cell: broadcast mapped scalar to entire buffer
 *   - cell→scalar: mean reduction then range mapping
 *
 * Cycle detection at add-time using DFS on a directed adjacency graph.
 */

import type { Grid } from '../grid/Grid';
import type { GlobalVariableStore } from '../scripting/GlobalVariableStore';
import type { ParameterLink, ParameterLinkDef, EasingType } from './types';
import { parseAddress, resolveRead, resolveWrite } from './PropertyAddress';
import { rangeMap, rangeMapArray } from './easing';

let nextId = 0;
function generateId(): string {
  return `link_${++nextId}`;
}

/** Reset ID counter (for testing) */
export function _resetIdCounter(): void {
  nextId = 0;
}

export class LinkRegistry {
  private links: Map<string, ParameterLink> = new Map();
  /** Adjacency list for cycle detection: source address → set of target addresses */
  private graph: Map<string, Set<string>> = new Map();

  /** Add a link. Throws if it would create a cycle. Returns the link with generated ID. */
  add(def: Omit<ParameterLink, 'id'> | ParameterLinkDef): ParameterLink {
    const link: ParameterLink = {
      id: generateId(),
      source: def.source,
      target: def.target,
      sourceRange: def.sourceRange ?? [0, 1],
      targetRange: def.targetRange ?? [0, 1],
      easing: def.easing ?? 'linear',
      enabled: def.enabled ?? true,
    };

    // Validate addresses parse correctly
    parseAddress(link.source);
    parseAddress(link.target);

    // Cycle detection: would adding source→target create a cycle?
    if (this.wouldCreateCycle(link.source, link.target)) {
      throw new Error(
        `Adding link ${link.source} → ${link.target} would create a cycle`,
      );
    }

    // Add to graph
    if (!this.graph.has(link.source)) {
      this.graph.set(link.source, new Set());
    }
    this.graph.get(link.source)!.add(link.target);

    this.links.set(link.id, link);
    return link;
  }

  /** Remove a link by ID */
  remove(id: string): boolean {
    const link = this.links.get(id);
    if (!link) return false;

    // Remove from graph
    const targets = this.graph.get(link.source);
    if (targets) {
      targets.delete(link.target);
      if (targets.size === 0) {
        this.graph.delete(link.source);
      }
    }

    this.links.delete(id);
    return true;
  }

  /** Enable a link */
  enable(id: string): void {
    const link = this.links.get(id);
    if (link) link.enabled = true;
  }

  /** Disable a link */
  disable(id: string): void {
    const link = this.links.get(id);
    if (link) link.enabled = false;
  }

  /** Update a link's range or easing properties. Returns updated link or null if not found. */
  update(id: string, patch: { sourceRange?: [number, number]; targetRange?: [number, number]; easing?: EasingType }): ParameterLink | null {
    const link = this.links.get(id);
    if (!link) return null;
    if (patch.sourceRange) link.sourceRange = patch.sourceRange;
    if (patch.targetRange) link.targetRange = patch.targetRange;
    if (patch.easing) link.easing = patch.easing;
    return link;
  }

  /** Get a link by ID */
  get(id: string): ParameterLink | undefined {
    return this.links.get(id);
  }

  /** Get all links */
  getAll(): ParameterLink[] {
    return [...this.links.values()];
  }

  /** Get only enabled links */
  getEnabled(): ParameterLink[] {
    return [...this.links.values()].filter((l) => l.enabled);
  }

  /** Check if any links exist */
  hasLinks(): boolean {
    return this.links.size > 0;
  }

  /** Clear all links */
  clear(): void {
    this.links.clear();
    this.graph.clear();
  }

  /** Load links from preset config definitions */
  loadFromConfig(defs: ParameterLinkDef[]): void {
    for (const def of defs) {
      this.add(def);
    }
  }

  /**
   * Resolve all enabled links. Mutates grid/params/variableStore in place.
   * Called once per tick, before the rule executes.
   */
  resolveAll(
    grid: Grid,
    params: Map<string, number>,
    variableStore: GlobalVariableStore,
  ): void {
    for (const link of this.links.values()) {
      if (!link.enabled) continue;
      this.resolveOne(link, grid, params, variableStore);
    }
  }

  private resolveOne(
    link: ParameterLink,
    grid: Grid,
    params: Map<string, number>,
    variableStore: GlobalVariableStore,
  ): void {
    const srcAddr = parseAddress(link.source);
    const dstAddr = parseAddress(link.target);

    const srcValue = resolveRead(srcAddr, grid, params, variableStore);
    const isSourceArray = srcValue instanceof Float32Array;
    const isTargetCell = dstAddr.namespace === 'cell';

    if (isSourceArray && isTargetCell) {
      // cell→cell: element-wise range mapping
      const dstBuf = grid.getCurrentBuffer(dstAddr.key);
      rangeMapArray(srcValue, dstBuf, link.sourceRange, link.targetRange, link.easing);
    } else if (!isSourceArray && !isTargetCell) {
      // scalar→scalar
      const mapped = rangeMap(srcValue, link.sourceRange, link.targetRange, link.easing);
      resolveWrite(dstAddr, mapped, grid, params, variableStore);
    } else if (!isSourceArray && isTargetCell) {
      // scalar→cell: broadcast mapped scalar
      const mapped = rangeMap(srcValue, link.sourceRange, link.targetRange, link.easing);
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
      const mapped = rangeMap(mean, link.sourceRange, link.targetRange, link.easing);
      resolveWrite(dstAddr, mapped, grid, params, variableStore);
    }
  }

  /** Check if adding an edge from source to target would create a cycle */
  private wouldCreateCycle(source: string, target: string): boolean {
    // A cycle would exist if there's already a path from target back to source
    if (source === target) return true;
    return this.hasPath(target, source);
  }

  /** DFS: check if there's a path from `from` to `to` in the graph */
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
}
