/**
 * SceneNode: the one generic data structure for all objects in the scene tree.
 *
 * Type is metadata, not a different class. What makes a node an "Environment"
 * vs a "CellType" is just its `type` label and what `properties` it carries.
 * The engine interprets `type` to know what to do with the node.
 *
 * This is exactly how C4D works — a Null, a Mesh, a Light are all BaseObject.
 */

/** Well-known node type labels */
export const NODE_TYPES = {
  SIM_ROOT: 'sim-root',
  CELL_TYPE: 'cell-type',
  GROUP: 'group',
  ENVIRONMENT: 'environment',
  GLOBALS: 'globals',
  INITIAL_STATE: 'initial-state',
  SHARED: 'shared',
  VISUAL: 'visual',
} as const;

export type NodeType = (typeof NODE_TYPES)[keyof typeof NODE_TYPES] | string;

export interface SceneNode {
  id: string;
  /** Label: 'sim-root', 'cell-type', 'group', 'environment', 'globals', etc. */
  type: NodeType;
  name: string;
  /** null = world-level (top of tree) */
  parentId: string | null;
  /** Ordered child IDs */
  childIds: string[];
  enabled: boolean;
  /** Generic property bag (color, gridConfig, paramDefs, etc.) */
  properties: Record<string, unknown>;
  /** Operator IDs attached to this node. UI: "Ops" */
  tags: string[];
}

/** Definition for creating a new SceneNode (ID auto-generated) */
export type SceneNodeDef = Omit<SceneNode, 'id'>;

/** Serialized scene graph for JSON/YAML persistence */
export interface SerializedSceneGraph {
  nodes: Array<SceneNode>;
  rootIds: string[];
}

let _nodeIdCounter = 0;

export function generateNodeId(): string {
  return `node_${++_nodeIdCounter}`;
}

/** Reset ID counter (for deterministic tests) */
export function _resetNodeIdCounter(): void {
  _nodeIdCounter = 0;
}
