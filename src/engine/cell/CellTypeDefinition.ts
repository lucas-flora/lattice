/**
 * CellTypeDefinition: mutable value class representing a single cell type.
 *
 * Stores the type's identity, parent reference, color, and own (non-inherent) properties.
 * The full resolved property list (inherent + inherited + own) is computed by CellTypeRegistry.
 */

import type { CellPropertyConfig, CellTypeConfig } from './types';

export class CellTypeDefinition {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | undefined;
  readonly color: string;
  readonly ownProperties: CellPropertyConfig[];

  constructor(config: CellTypeConfig) {
    if (!config.id || config.id.length === 0) {
      throw new Error('CellTypeDefinition requires a non-empty id');
    }
    if (!config.name || config.name.length === 0) {
      throw new Error('CellTypeDefinition requires a non-empty name');
    }

    this.id = config.id;
    this.name = config.name;
    this.parentId = config.parent;
    this.color = config.color ?? '#4ade80';
    this.ownProperties = config.properties ? [...config.properties] : [];
  }

  /**
   * Change the default value of a property (own or inherent override).
   * If the property is inherent and not yet in ownProperties, adds an override entry.
   */
  setPropertyDefault(name: string, value: number | number[]): void {
    const existing = this.ownProperties.find(p => p.name === name);
    if (existing) {
      existing.default = value;
    } else {
      // Add as own property override (inherent property default override)
      this.ownProperties.push({ name, type: 'float', default: value });
    }
  }

  /**
   * Add a new property to this cell type.
   */
  addProperty(config: CellPropertyConfig): void {
    if (this.ownProperties.some(p => p.name === config.name)) {
      throw new Error(`Property "${config.name}" already exists on type "${this.id}"`);
    }
    this.ownProperties.push({ ...config });
  }

  /**
   * Remove a user-added property. Returns true if removed, false if not found.
   * Cannot remove inherent properties (caller should guard).
   */
  removeProperty(name: string): boolean {
    const idx = this.ownProperties.findIndex(p => p.name === name);
    if (idx === -1) return false;
    this.ownProperties.splice(idx, 1);
    return true;
  }
}
