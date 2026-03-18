/**
 * Shared type definitions for the GPU compute subsystem.
 *
 * These types describe the data layout for GPU buffers, simulation parameters,
 * and the property descriptors that bridge the CPU Grid model to GPU storage buffers.
 */

/** Describes a single cell property for GPU buffer layout */
export interface GPUPropertyDescriptor {
  /** Property name (e.g. 'alive', 'u', 'v') */
  name: string;
  /** Number of float channels: 1 = scalar, 2 = vec2, 3 = vec3, 4 = vec4 */
  channels: number;
  /** Data type in the storage buffer */
  type: 'f32' | 'u32';
  /** Default value per channel */
  defaultValue: number[];
}

/** Grid buffer configuration for GPU allocation */
export interface GPUGridConfig {
  width: number;
  height: number;
  depth: number;
  properties: GPUPropertyDescriptor[];
}

/** Layout of a property within the interleaved per-cell stride */
export interface PropertyLayout {
  /** Property name */
  name: string;
  /** Offset in floats within the per-cell stride */
  offset: number;
  /** Number of float channels */
  channels: number;
  /** Data type */
  type: 'f32' | 'u32';
}

/**
 * Layout of the simulation params uniform buffer.
 *
 * WGSL struct alignment:
 *   width:      u32 @ offset 0
 *   height:     u32 @ offset 4
 *   depth:      u32 @ offset 8
 *   stride:     u32 @ offset 12
 *   generation: u32 @ offset 16
 *   dt:         f32 @ offset 20
 *   _pad:       u32[2] @ offset 24  (align to 32 bytes)
 *   envParams:  f32[32] @ offset 32
 *
 * Total: 160 bytes (32 + 128)
 */
export const SIM_PARAMS_SIZE_BYTES = 160;
export const SIM_PARAMS_ENV_OFFSET_FLOATS = 8; // 32 bytes / 4
export const SIM_PARAMS_MAX_ENV_PARAMS = 32;

/** Configuration for a compute shader pipeline */
export interface ComputeShaderConfig {
  /** WGSL source code */
  wgsl: string;
  /** Label for GPU debugger tooling */
  label: string;
  /** Workgroup dimensions, e.g. [8, 8, 1] for 2D grids */
  workgroupSize: [number, number, number];
}
