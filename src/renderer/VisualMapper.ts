/**
 * VisualMapper: data-driven visual mapping from cell properties to visual channels.
 *
 * Reads `visual_mappings` from a PresetConfig and provides fast lookup functions
 * for color, size, shape, and orientation channels. Any cell property can be mapped
 * to any visual parameter by editing the YAML preset -- no code changes needed (RNDR-07).
 *
 * Pure data transformation layer -- no Three.js rendering dependencies.
 */

import * as THREE from 'three';
import type { PresetConfig } from '@/engine/preset/types';

export class VisualMapper {
  /** Property name -> (value key -> THREE.Color) */
  private colorMaps: Map<string, Map<string, THREE.Color>> = new Map();
  /** Property name -> (value key -> scale factor) */
  private sizeMaps: Map<string, Map<string, number>> = new Map();
  /** Property name -> (value key -> rotation radians) */
  private orientationMaps: Map<string, Map<string, number>> = new Map();

  private readonly defaultColor: THREE.Color;
  private readonly defaultSize: number;

  constructor(preset: PresetConfig) {
    this.defaultColor = new THREE.Color(0x000000);
    this.defaultSize = 1.0;

    const mappings = preset.visual_mappings;
    if (!mappings || mappings.length === 0) {
      // No mappings defined -- create default: first bool property -> green/black
      this.createDefaultMapping(preset);
      return;
    }

    for (const mapping of mappings) {
      const { property, channel } = mapping;
      const rawMapping = mapping.mapping as Record<string, unknown> | undefined;
      if (!rawMapping) continue; // ramp-type mappings have stops, not mapping

      switch (channel) {
        case 'color': {
          const colorMap = new Map<string, THREE.Color>();
          for (const [key, value] of Object.entries(rawMapping)) {
            if (typeof value === 'string') {
              colorMap.set(key, new THREE.Color(value));
            }
          }
          this.colorMaps.set(property, colorMap);
          break;
        }
        case 'size': {
          const sizeMap = new Map<string, number>();
          for (const [key, value] of Object.entries(rawMapping)) {
            if (typeof value === 'number') {
              sizeMap.set(key, value);
            }
          }
          this.sizeMaps.set(property, sizeMap);
          break;
        }
        case 'orientation': {
          const orientMap = new Map<string, number>();
          for (const [key, value] of Object.entries(rawMapping)) {
            if (typeof value === 'number') {
              orientMap.set(key, value);
            }
          }
          this.orientationMaps.set(property, orientMap);
          break;
        }
        case 'shape': {
          // Shape mappings stored but not actively used until Phase 9+
          break;
        }
      }
    }
  }

  /**
   * Create a default color mapping for the first boolean property.
   * Alive = green (#00ff00), dead = black (#000000).
   */
  private createDefaultMapping(preset: PresetConfig): void {
    const boolProp = preset.cell_properties.find((p) => p.type === 'bool');
    if (boolProp) {
      const colorMap = new Map<string, THREE.Color>();
      colorMap.set('0', new THREE.Color(0x000000));
      colorMap.set('1', new THREE.Color(0x00ff00));
      this.colorMaps.set(boolProp.name, colorMap);
    }
  }

  /**
   * Get the color for a property value.
   * Returns the mapped color or the default color if no mapping exists.
   */
  getColor(propertyName: string, value: number): THREE.Color {
    const colorMap = this.colorMaps.get(propertyName);
    if (!colorMap) return this.defaultColor;

    const key = String(Math.round(value));
    return colorMap.get(key) ?? this.defaultColor;
  }

  /**
   * Get the size scale factor for a property value.
   * Returns the mapped scale or the default size (1.0) if no mapping exists.
   */
  getSize(propertyName: string, value: number): number {
    const sizeMap = this.sizeMaps.get(propertyName);
    if (!sizeMap) return this.defaultSize;

    const key = String(Math.round(value));
    return sizeMap.get(key) ?? this.defaultSize;
  }

  /**
   * Get the orientation in radians for a property value.
   * Returns the mapped rotation or 0 if no mapping exists.
   */
  getOrientation(propertyName: string, value: number): number {
    const orientMap = this.orientationMaps.get(propertyName);
    if (!orientMap) return 0;

    const key = String(Math.round(value));
    return orientMap.get(key) ?? 0;
  }

  /**
   * Check if a property has a color mapping.
   */
  hasColorMapping(propertyName: string): boolean {
    return this.colorMaps.has(propertyName);
  }

  /**
   * Get the first property that has a color mapping.
   * Used as the primary rendering property when no specific property is requested.
   */
  getPrimaryColorProperty(): string | null {
    const first = this.colorMaps.keys().next();
    return first.done ? null : first.value;
  }

  /**
   * Check if a property has a size mapping.
   */
  hasSizeMapping(propertyName: string): boolean {
    return this.sizeMaps.has(propertyName);
  }

  /**
   * Get the first property that has a size mapping.
   */
  getPrimarySizeProperty(): string | null {
    const first = this.sizeMaps.keys().next();
    return first.done ? null : first.value;
  }
}
