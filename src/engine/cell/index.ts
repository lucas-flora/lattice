/**
 * Cell Property System module.
 *
 * Provides typed property definitions, a registry for managing collections,
 * and compiled computed functions for derived values.
 */
export { CellPropertyDefinition } from './CellPropertyDefinition';
export { CellPropertyRegistry } from './CellPropertyRegistry';
export { ComputedFunction } from './ComputedFunction';
export type {
  CellPropertyType,
  PropertyRole,
  CellPropertyConfig,
  ComputeContext,
  ComputeFn,
} from './types';
export { CHANNELS_PER_TYPE } from './types';
