/**
 * Cell Property System type definitions.
 *
 * Defines property types, roles, and compute context for the cell property infrastructure.
 */

/** Supported cell property types */
export type CellPropertyType = 'bool' | 'int' | 'float' | 'vec2' | 'vec3' | 'vec4';

/** Number of Float32Array channels per property type */
export const CHANNELS_PER_TYPE: Record<CellPropertyType, number> = {
  bool: 1,
  int: 1,
  float: 1,
  vec2: 2,
  vec3: 3,
  vec4: 4,
};

/** Role of a property in the computation pipeline */
export type PropertyRole = 'input' | 'output' | 'input_output';

/** Configuration for defining a single cell property */
export interface CellPropertyConfig {
  name: string;
  type: CellPropertyType;
  default: number | number[];
  role?: PropertyRole;
  /** JavaScript function body string for computed properties */
  compute?: string;
}

/** Context object passed to computed functions */
export interface ComputeContext {
  /** Current cell's property values */
  cell: Record<string, number | number[]>;
  /** Array of neighbor cell views */
  neighbors: Array<Record<string, number | number[]>>;
  /** Grid information */
  grid: {
    width: number;
    height: number;
    depth: number;
    dimensionality: string;
  };
  /** Static parameters from preset */
  params: Record<string, unknown>;
}

/** Compiled computed function type */
export type ComputeFn = (ctx: ComputeContext) => number | number[];

/** Inherent properties injected into every cell type */
export const INHERENT_PROPERTIES: CellPropertyConfig[] = [
  { name: 'alive', type: 'bool', default: 0, role: 'input_output' },
  { name: 'age', type: 'int', default: 0, role: 'output' },
  { name: 'alpha', type: 'float', default: 1.0, role: 'output' },
  { name: '_cellType', type: 'int', default: 0, role: 'output' },
];

/** Configuration for defining a cell type in a preset */
export interface CellTypeConfig {
  id: string;
  name: string;
  parent?: string;
  color?: string;
  properties?: CellPropertyConfig[];
}

/** Summary of a cell type for UI display */
export interface CellTypeSummary {
  id: string;
  name: string;
  color: string;
  properties: Array<{
    name: string;
    type: CellPropertyType;
    default: number | number[];
    role?: string;
    isInherent?: boolean;
  }>;
}
