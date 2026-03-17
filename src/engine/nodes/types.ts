/**
 * Type definitions for the node graph system.
 *
 * A NodeGraph is a visual authoring view for ExpressionTag code.
 * Nodes compile to Python — the graph is a view, not a runtime.
 */

/** Port data type — determines connection compatibility and wire color */
export type PortType = 'scalar' | 'array' | 'bool' | 'string';

/** Direction of a port on a node */
export type PortDirection = 'input' | 'output';

/** Definition of a single port on a node type */
export interface PortDefinition {
  id: string;
  label: string;
  type: PortType;
  direction: PortDirection;
  /** Default value when no edge is connected */
  defaultValue?: unknown;
}

/** Category for node grouping in the add menu */
export type NodeCategory = 'property' | 'math' | 'range' | 'logic' | 'utility' | 'object';

/** Data stored on an ObjectNode instance */
export interface ObjectNodeData {
  objectKind: 'cell-type' | 'environment' | 'globals';
  objectId: string;
  objectName: string;
  enabledInputs: string[];
  enabledOutputs: string[];
  availableProperties: Array<{ name: string; portType: PortType }>;
}

/** Static definition of a node type (registered once) */
export interface NodeTypeDefinition {
  type: string;
  label: string;
  category: NodeCategory;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  /** Whether this node has user-editable inline data (e.g., Constant value, property address) */
  hasData?: boolean;
  /**
   * Compile this node into a Python expression/statement.
   * @param inputExprs - Map of input port ID → Python expression string
   * @param data - User-configured node data (e.g., constant value, property address)
   * @returns Python expression string for this node's output
   */
  compile: (inputExprs: Record<string, string>, data: Record<string, unknown>) => string;
}

/** A concrete instance of a node in a graph */
export interface NodeInstance {
  id: string;
  type: string;
  position: { x: number; y: number };
  /** User-configured data (constant value, property address, etc.) */
  data: Record<string, unknown>;
}

/** An edge connecting two ports */
export interface Edge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}

/** A complete node graph (serializable) */
export interface NodeGraph {
  nodes: NodeInstance[];
  edges: Edge[];
}

/** Result of compiling a node graph to Python */
export interface CompilationResult {
  code: string;
  inputs: string[];
  outputs: string[];
}
