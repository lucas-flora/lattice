/**
 * Renderer module public API.
 *
 * Exports the unified Three.js rendering pipeline:
 * - LatticeRenderer: InstancedMesh-based grid renderer for 1D/2D/3D
 * - VisualMapper: data-driven visual mapping from cell properties to visual channels
 * - CameraController: pan/zoom/zoom-to-fit for orthographic camera
 */

export { LatticeRenderer } from './LatticeRenderer';
export { VisualMapper } from './VisualMapper';
export { CameraController } from './CameraController';
export { OrbitCameraController } from './OrbitCameraController';
export type { CameraState } from './CameraController';
export type { OrbitCameraState } from './OrbitCameraController';
export type {
  VisualChannel,
  VisualMappingConfig,
  ColorMapping,
  SizeMapping,
  ShapeMapping,
  OrientationMapping,
  RendererConfig,
  GridRenderMode,
} from './types';
