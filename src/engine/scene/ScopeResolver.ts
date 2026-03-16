/**
 * ScopeResolver: tree-walking variable resolution.
 *
 * Variables resolve by walking UP the tree until found.
 * SimRoot is a scope boundary. Shared nodes are globally accessible.
 * Override semantics: closest ancestor wins (child overrides parent).
 */

import type { SceneGraph } from './SceneGraph';
import type { SceneNode } from './SceneNode';
import { NODE_TYPES } from './SceneNode';

export interface ResolvedVariable {
  node: SceneNode;
  value: unknown;
}

export class ScopeResolver {
  constructor(private graph: SceneGraph) {}

  /**
   * Resolve a variable name starting from a node, walking up ancestors.
   * Stops at SimRoot boundary. Returns first match or null.
   */
  resolve(startNodeId: string, variableName: string): ResolvedVariable | null {
    let current = this.graph.getNode(startNodeId);

    while (current) {
      // Check this node's properties for the variable
      const value = this.findVariable(current, variableName);
      if (value !== undefined) {
        return { node: current, value };
      }

      // Stop at SimRoot boundary (don't cross into another scope)
      if (current.type === NODE_TYPES.SIM_ROOT) {
        break;
      }

      // Walk up
      if (current.parentId) {
        current = this.graph.getNode(current.parentId) ?? undefined;
      } else {
        current = undefined;
      }
    }

    // Check shared nodes (accessible from all scopes)
    for (const root of this.graph.getRoots()) {
      if (root.type === NODE_TYPES.SHARED) {
        const value = this.findVariable(root, variableName);
        if (value !== undefined) {
          return { node: root, value };
        }
      }
    }

    return null;
  }

  /**
   * Get the full scope visible from a node (all accessible variables).
   * Merges from root down to node, last-write-wins (closest ancestor wins).
   */
  getScope(nodeId: string): Record<string, unknown> {
    const scope: Record<string, unknown> = {};

    // First, add shared variables
    for (const root of this.graph.getRoots()) {
      if (root.type === NODE_TYPES.SHARED) {
        Object.assign(scope, this.extractVariables(root));
      }
    }

    // Build ancestor chain from SimRoot down to node
    const chain: SceneNode[] = [];
    let current = this.graph.getNode(nodeId);
    while (current) {
      chain.unshift(current);
      if (current.type === NODE_TYPES.SIM_ROOT) break;
      if (current.parentId) {
        current = this.graph.getNode(current.parentId) ?? undefined;
      } else {
        current = undefined;
      }
    }

    // Merge variables from root down (child overrides parent)
    for (const node of chain) {
      Object.assign(scope, this.extractVariables(node));
    }

    return scope;
  }

  /**
   * Adapt self.* references when copying a tag to a new owner.
   * Replaces `self.propName` with the new context.
   */
  adaptReferences(
    code: string,
    _fromOwnerType: string,
    _toOwnerType: string,
  ): string {
    // self.* references are owner-relative — they naturally adapt
    // when the tag moves to a new owner because `self` resolves
    // to the new owner's context. Only absolute references need
    // explicit adaptation.
    //
    // For now, return code unchanged. Full adaptation (absolute refs)
    // is a future enhancement.
    return code;
  }

  /** Look up a variable name in a node's properties */
  private findVariable(node: SceneNode, name: string): unknown | undefined {
    // Check direct properties
    if (name in (node.properties ?? {})) {
      return node.properties[name];
    }

    // For environment nodes, check paramValues
    if (node.type === NODE_TYPES.ENVIRONMENT) {
      const values = node.properties.paramValues as Record<string, unknown> | undefined;
      if (values && name in values) return values[name];
    }

    // For globals nodes, check variableValues
    if (node.type === NODE_TYPES.GLOBALS) {
      const values = node.properties.variableValues as Record<string, { value: unknown }> | undefined;
      if (values && name in values) return values[name]?.value;
    }

    // For groups, check sharedProperties
    if (node.type === NODE_TYPES.GROUP) {
      const shared = node.properties.sharedProperties as Record<string, unknown> | undefined;
      if (shared && name in shared) return shared[name];
    }

    return undefined;
  }

  /** Extract all variable-like entries from a node */
  private extractVariables(node: SceneNode): Record<string, unknown> {
    const vars: Record<string, unknown> = {};

    if (node.type === NODE_TYPES.ENVIRONMENT) {
      const values = node.properties.paramValues as Record<string, unknown> | undefined;
      if (values) Object.assign(vars, values);
    } else if (node.type === NODE_TYPES.GLOBALS) {
      const values = node.properties.variableValues as Record<string, { value: unknown }> | undefined;
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          vars[k] = v?.value ?? v;
        }
      }
    } else if (node.type === NODE_TYPES.GROUP) {
      const shared = node.properties.sharedProperties as Record<string, unknown> | undefined;
      if (shared) Object.assign(vars, shared);
    }

    return vars;
  }
}
