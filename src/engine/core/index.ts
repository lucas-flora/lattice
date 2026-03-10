/**
 * Engine core module.
 *
 * Re-exports all core types and utilities.
 */
export type {
  GridDimensions,
  GridTopology,
  GridDimensionality,
  GridConfig,
  NeighborhoodType,
  PropertyBuffers,
  CellPropertyType,
  PropertyRole,
  CellPropertyConfig,
  ComputeContext,
  ComputeFn,
  PresetConfig,
  PresetValidationResult,
  WorkerInMessage,
  WorkerOutMessage,
  SimulationConfig,
  WorkerState,
} from './types';

export { EventBus, eventBus } from './EventBus';
export type { EngineEventMap, EngineEvent, EventHandler } from './EventBus';
