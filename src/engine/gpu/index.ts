/**
 * GPU compute subsystem — public API.
 *
 * All WebGPU infrastructure lives behind this module boundary.
 * No GPU imports in existing engine code until Phase 3.
 */

export { GPUContext } from './GPUContext';
export { BufferManager } from './BufferManager';
export { ShaderCompiler } from './ShaderCompiler';
export { ComputeDispatcher } from './ComputeDispatcher';
export type {
  GPUGridConfig,
  GPUPropertyDescriptor,
  PropertyLayout,
  ComputeShaderConfig,
} from './types';
export {
  SIM_PARAMS_SIZE_BYTES,
  SIM_PARAMS_ENV_OFFSET_FLOATS,
  SIM_PARAMS_MAX_ENV_PARAMS,
} from './types';
