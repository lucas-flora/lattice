/**
 * SceneGraph: the tree of SceneNodes.
 *
 * Provides tree operations (add, remove, move, query), serialization,
 * and a builder to create a tree from existing Simulation state.
 */

import type { SceneNode, SceneNodeDef, SerializedSceneGraph } from './SceneNode';
import { generateNodeId, NODE_TYPES } from './SceneNode';
import type { Simulation } from '../rule/Simulation';
import type { PresetV2Config, SceneNodeV2 } from '../preset/schema';

export class SceneGraph {
  private nodes: Map<string, SceneNode> = new Map();
  private _rootIds: string[] = [];

  // --- Tree Operations ---

  addNode(def: SceneNodeDef): SceneNode {
    const id = generateNodeId();
    const node: SceneNode = { ...def, id };
    this.nodes.set(id, node);

    if (node.parentId === null) {
      // World-level node
      if (!this._rootIds.includes(id)) {
        this._rootIds.push(id);
      }
    } else {
      // Add to parent's childIds
      const parent = this.nodes.get(node.parentId);
      if (parent && !parent.childIds.includes(id)) {
        parent.childIds.push(id);
      }
    }

    return node;
  }

  /** Remove a node and its entire subtree */
  removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Recursively remove children
    for (const childId of [...node.childIds]) {
      this.removeNode(childId);
    }

    // Remove from parent's childIds
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter((cid) => cid !== id);
      }
    }

    // Remove from root list
    this._rootIds = this._rootIds.filter((rid) => rid !== id);

    this.nodes.delete(id);
  }

  /** Move a node to a new parent at an optional index */
  moveNode(id: string, newParentId: string | null, index?: number): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Prevent moving a node to its own descendant
    if (newParentId !== null && this.isDescendant(newParentId, id)) {
      throw new Error('Cannot move a node to its own descendant');
    }

    // Remove from old parent
    if (node.parentId) {
      const oldParent = this.nodes.get(node.parentId);
      if (oldParent) {
        oldParent.childIds = oldParent.childIds.filter((cid) => cid !== id);
      }
    } else {
      this._rootIds = this._rootIds.filter((rid) => rid !== id);
    }

    // Set new parent
    node.parentId = newParentId;

    if (newParentId === null) {
      // Move to world level
      if (index !== undefined) {
        this._rootIds.splice(index, 0, id);
      } else {
        this._rootIds.push(id);
      }
    } else {
      const newParent = this.nodes.get(newParentId);
      if (newParent) {
        if (index !== undefined) {
          newParent.childIds.splice(index, 0, id);
        } else {
          newParent.childIds.push(id);
        }
      }
    }
  }

  // --- Queries ---

  getNode(id: string): SceneNode | undefined {
    return this.nodes.get(id);
  }

  getChildren(id: string): SceneNode[] {
    const node = this.nodes.get(id);
    if (!node) return [];
    return node.childIds
      .map((cid) => this.nodes.get(cid))
      .filter((n): n is SceneNode => n !== undefined);
  }

  getParent(id: string): SceneNode | null {
    const node = this.nodes.get(id);
    if (!node || !node.parentId) return null;
    return this.nodes.get(node.parentId) ?? null;
  }

  /** Get world-level nodes (SimRoots, Shared) */
  getRoots(): SceneNode[] {
    return this._rootIds
      .map((rid) => this.nodes.get(rid))
      .filter((n): n is SceneNode => n !== undefined);
  }

  get rootIds(): string[] {
    return [...this._rootIds];
  }

  /** Walk up to world, returning ancestors from immediate parent to top */
  getAncestors(id: string): SceneNode[] {
    const ancestors: SceneNode[] = [];
    let current = this.nodes.get(id);
    while (current?.parentId) {
      const parent = this.nodes.get(current.parentId);
      if (!parent) break;
      ancestors.push(parent);
      current = parent;
    }
    return ancestors;
  }

  /** Find the containing SimRoot for a node */
  getSimRoot(nodeId: string): SceneNode | null {
    let current = this.nodes.get(nodeId);
    while (current) {
      if (current.type === NODE_TYPES.SIM_ROOT) return current;
      if (!current.parentId) return null;
      current = this.nodes.get(current.parentId);
    }
    return null;
  }

  /** Find all nodes matching a type label */
  findByType(type: string): SceneNode[] {
    const result: SceneNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.type === type) result.push(node);
    }
    return result;
  }

  /** Find the initial-state child of a sim-root with isInitial: true */
  getInitialStateNode(simRootId: string): SceneNode | null {
    const children = this.getChildren(simRootId);
    return children.find(
      (n) => n.type === NODE_TYPES.INITIAL_STATE && n.properties.isInitial === true,
    ) ?? null;
  }

  /** Find nodes by name (exact match) */
  findByName(name: string): SceneNode[] {
    const result: SceneNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.name === name) result.push(node);
    }
    return result;
  }

  /** Get all nodes in the graph */
  getAllNodes(): SceneNode[] {
    return Array.from(this.nodes.values());
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  /** Check if `descendantId` is a descendant of `ancestorId` */
  private isDescendant(descendantId: string, ancestorId: string): boolean {
    let current = this.nodes.get(descendantId);
    while (current) {
      if (current.id === ancestorId) return true;
      if (!current.parentId) return false;
      current = this.nodes.get(current.parentId);
    }
    return false;
  }

  // --- Serialization ---

  toJSON(): SerializedSceneGraph {
    return {
      nodes: Array.from(this.nodes.values()),
      rootIds: [...this._rootIds],
    };
  }

  static fromJSON(data: SerializedSceneGraph): SceneGraph {
    const graph = new SceneGraph();
    for (const node of data.nodes) {
      graph.nodes.set(node.id, { ...node });
    }
    graph._rootIds = [...data.rootIds];
    return graph;
  }

  /**
   * Create a SceneGraph from a v2 preset.
   *
   * Walks the nested scene tree and creates flat SceneNode entries
   * with proper parent/child ID references.
   */
  static fromPresetV2(preset: PresetV2Config): SceneGraph {
    const graph = new SceneGraph();

    for (const nodeV2 of preset.scene) {
      SceneGraph.addV2Node(graph, nodeV2, null);
    }

    return graph;
  }

  /**
   * Recursively add a v2 scene node and its children to the graph.
   */
  private static addV2Node(
    graph: SceneGraph,
    nodeV2: SceneNodeV2,
    parentId: string | null,
  ): SceneNode {
    const node = graph.addNode({
      type: nodeV2.type,
      name: nodeV2.name,
      parentId,
      childIds: [],
      enabled: nodeV2.enabled ?? true,
      properties: nodeV2.properties ? { ...nodeV2.properties } : {},
      tags: (nodeV2.tags ?? []).map((t) => t.name),
    });

    // Recursively add children
    if (nodeV2.children) {
      for (const childV2 of nodeV2.children) {
        SceneGraph.addV2Node(graph, childV2, node.id);
      }
    }

    return node;
  }

  // --- Build from existing Simulation state ---

  /**
   * Create a SceneGraph from an existing Simulation instance.
   * Maps flat state to a tree:
   * - SimRoot from the Simulation itself
   * - Environment from sim.params + preset.params
   * - Globals from sim.variableStore
   * - CellType nodes from sim.typeRegistry
   * - Tags from sim.tagRegistry, attached to their owner nodes
   */
  static fromSimulation(sim: Simulation, presetName?: string): SceneGraph {
    const graph = new SceneGraph();
    const preset = sim.preset;

    // 1. SimRoot
    const simRoot = graph.addNode({
      type: NODE_TYPES.SIM_ROOT,
      name: presetName ?? preset.meta.name,
      parentId: null,
      childIds: [],
      enabled: true,
      properties: {
        gridWidth: preset.grid.width,
        gridHeight: preset.grid.height ?? 1,
        gridDepth: preset.grid.depth ?? 1,
        dimensionality: preset.grid.dimensionality,
        topology: preset.grid.topology,
        presetName: preset.meta.name,
      },
      tags: [],
    });

    // 2. Environment
    const paramDefs = preset.params ?? [];
    const paramValues: Record<string, number> = {};
    for (const p of paramDefs) {
      paramValues[p.name] = sim.params.get(p.name) ?? p.default;
    }

    graph.addNode({
      type: NODE_TYPES.ENVIRONMENT,
      name: 'Environment',
      parentId: simRoot.id,
      childIds: [],
      enabled: true,
      properties: {
        paramDefs,
        paramValues,
      },
      tags: [],
    });

    // 3. Globals
    const variableStore = sim.variableStore;
    const variableValues = variableStore.getAll();
    const variableDefs = preset.global_variables ?? [];

    graph.addNode({
      type: NODE_TYPES.GLOBALS,
      name: 'Globals',
      parentId: simRoot.id,
      childIds: [],
      enabled: true,
      properties: {
        variableDefs,
        variableValues,
      },
      tags: [],
    });

    // 4. CellType nodes
    const cellTypeNodeMap = new Map<string, SceneNode>();
    for (const typeDef of sim.typeRegistry.getTypes()) {
      const resolvedProps = sim.typeRegistry.resolveProperties(typeDef.id);
      const cellNode = graph.addNode({
        type: NODE_TYPES.CELL_TYPE,
        name: typeDef.name,
        parentId: simRoot.id,
        childIds: [],
        enabled: true,
        properties: {
          color: typeDef.color,
          parentType: typeDef.parentId,
          cellTypeId: typeDef.id,
          cellProperties: resolvedProps,
        },
        tags: [],
      });
      cellTypeNodeMap.set(typeDef.id, cellNode);
    }

    // 5. Visual node (if visual mappings exist — ramp or script type)
    const activeMappings = preset.visual_mappings?.filter(
      m => (m.type === 'ramp' && m.stops && m.stops.length > 0) || (m.type === 'script' && m.code),
    );
    if (activeMappings && activeMappings.length > 0) {
      graph.addNode({
        type: NODE_TYPES.VISUAL,
        name: 'Color Mapping',
        parentId: simRoot.id,
        childIds: [],
        enabled: true,
        properties: { mappings: activeMappings },
        tags: [],
      });
    }

    // 6. Attach tags to their owner nodes
    for (const tag of sim.tagRegistry.getAll()) {
      let ownerNode: SceneNode | undefined;

      if (tag.owner.type === 'cell-type' && tag.owner.id) {
        ownerNode = cellTypeNodeMap.get(tag.owner.id);
      } else if (tag.owner.type === 'environment') {
        ownerNode = graph.findByType(NODE_TYPES.ENVIRONMENT)[0];
      } else if (tag.owner.type === 'global') {
        ownerNode = graph.findByType(NODE_TYPES.GLOBALS)[0];
      } else if (tag.owner.type === 'root') {
        ownerNode = graph.getNode(simRoot.id);
      }

      if (ownerNode) {
        ownerNode.tags.push(tag.id);
      }
    }

    return graph;
  }
}
