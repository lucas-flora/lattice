/**
 * Cell Property System module.
 *
 * Provides typed property definitions, a registry for managing collections,
 * compiled computed functions for derived values, and cell type hierarchy.
 */
export { CellPropertyDefinition } from './CellPropertyDefinition';
export { CellPropertyRegistry } from './CellPropertyRegistry';
export { ComputedFunction } from './ComputedFunction';
export { CellTypeDefinition } from './CellTypeDefinition';
export { CellTypeRegistry } from './CellTypeRegistry';
export type {
  CellPropertyType,
  PropertyRole,
  CellPropertyConfig,
  ComputeContext,
  ComputeFn,
  CellTypeConfig,
  CellTypeSummary,
} from './types';
export { CHANNELS_PER_TYPE, INHERENT_PROPERTIES } from './types';
