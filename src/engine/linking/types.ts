/**
 * Type definitions for the parameter linking system.
 */

/** Supported easing functions for parameter links */
export type EasingType = 'linear' | 'smoothstep' | 'easeIn' | 'easeOut' | 'easeInOut';

/** Address namespace for dot-path resolution */
export type AddressNamespace = 'cell' | 'env' | 'global';

/** Parsed dot-path address */
export interface ParsedAddress {
  namespace: AddressNamespace;
  key: string;
}

/** Runtime parameter link with auto-generated ID */
export interface ParameterLink {
  id: string;
  source: string;
  target: string;
  sourceRange: [number, number];
  targetRange: [number, number];
  easing: EasingType;
  enabled: boolean;
}

/** Link definition from preset config (no ID, optional fields) */
export interface ParameterLinkDef {
  source: string;
  target: string;
  sourceRange?: [number, number];
  targetRange?: [number, number];
  easing?: EasingType;
  enabled?: boolean;
}
