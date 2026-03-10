/**
 * Renderer type definitions.
 *
 * Defines visual mapping channels, renderer configuration,
 * and render modes for the unified Three.js rendering pipeline.
 */

/** Visual channels that cell properties can be mapped to */
export type VisualChannel = 'color' | 'size' | 'shape' | 'orientation';

/** Configuration for a single visual mapping (matches YAML schema) */
export interface VisualMappingConfig {
  property: string;
  channel: VisualChannel;
  mapping: Record<string, unknown>;
}

/** Color mapping: property value string -> hex color string */
export type ColorMapping = Record<string, string>;

/** Size mapping: property value string -> scale factor */
export type SizeMapping = Record<string, number>;

/** Shape mapping: property value string -> geometry type name */
export type ShapeMapping = Record<string, string>;

/** Orientation mapping: property value string -> rotation in radians */
export type OrientationMapping = Record<string, number>;

/** Configuration for creating a LatticeRenderer */
export interface RendererConfig {
  /** Canvas element to render into */
  canvas: HTMLCanvasElement;
  /** Viewport width in pixels */
  width: number;
  /** Viewport height in pixels */
  height: number;
  /** Enable anti-aliasing (default: true) */
  antialias?: boolean;
  /** Background color as hex number (default: 0x000000) */
  backgroundColor?: number;
}

/** Grid render modes */
export type GridRenderMode = '2d' | '1d-spacetime';
