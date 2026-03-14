/**
 * CellTypeRegistry: manages cell type hierarchy, property inheritance, and union computation.
 *
 * Core responsibilities:
 * - Register cell types with parent-child relationships
 * - Resolve properties for a type (inherent + inherited + own)
 * - Compute the property union across all types (for Grid buffer registration)
 * - Factory method `fromPreset()` for backward-compatible preset loading
 */

import { CellTypeDefinition } from './CellTypeDefinition';
import type { CellPropertyConfig, CellTypeConfig } from './types';
import { INHERENT_PROPERTIES } from './types';
import type { PresetConfig } from '../preset/types';

export class CellTypeRegistry {
  private types: Map<string, CellTypeDefinition> = new Map();
  private registrationOrder: string[] = [];

  /**
   * Register a cell type. Parent must already be registered if specified.
   * Throws on duplicate IDs or missing parents.
   */
  register(config: CellTypeConfig): CellTypeDefinition {
    if (this.types.has(config.id)) {
      throw new Error(`Duplicate cell type id: '${config.id}'`);
    }
    if (config.parent) {
      if (config.parent === config.id) {
        throw new Error(`Cell type '${config.id}' cannot be its own parent`);
      }
      if (!this.types.has(config.parent)) {
        throw new Error(`Parent type '${config.parent}' not found for type '${config.id}'`);
      }
    }

    const def = new CellTypeDefinition(config);
    this.types.set(def.id, def);
    this.registrationOrder.push(def.id);
    return def;
  }

  /**
   * Resolve the full property list for a type: inherent + inherited (parent chain) + own.
   * Preset properties that share a name with an inherent property merge (preset defaults/compute win).
   */
  resolveProperties(typeId: string): CellPropertyConfig[] {
    const typeDef = this.types.get(typeId);
    if (!typeDef) throw new Error(`Cell type '${typeId}' not found`);

    // Collect own + inherited properties (walk parent chain)
    const typeProps = this.collectInheritedProperties(typeId);

    // Start with inherent properties, then merge type properties on top
    const merged = new Map<string, CellPropertyConfig>();
    for (const prop of INHERENT_PROPERTIES) {
      merged.set(prop.name, { ...prop });
    }
    for (const prop of typeProps) {
      if (merged.has(prop.name)) {
        // Merge: type definition wins for default/compute/role, but property is still present
        merged.set(prop.name, { ...merged.get(prop.name)!, ...prop });
      } else {
        merged.set(prop.name, { ...prop });
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Walk parent chain to collect inherited + own properties (parent-first order).
   */
  private collectInheritedProperties(typeId: string): CellPropertyConfig[] {
    const chain: CellTypeDefinition[] = [];
    let current = this.types.get(typeId);
    while (current) {
      chain.unshift(current); // parent first
      current = current.parentId ? this.types.get(current.parentId) : undefined;
    }

    const result = new Map<string, CellPropertyConfig>();
    for (const typeDef of chain) {
      for (const prop of typeDef.ownProperties) {
        result.set(prop.name, { ...prop });
      }
    }
    return Array.from(result.values());
  }

  /**
   * Compute the property union across all registered types.
   * Used for Grid buffer registration — every property that any type uses gets a buffer.
   */
  getPropertyUnion(): CellPropertyConfig[] {
    const union = new Map<string, CellPropertyConfig>();

    // Start with inherent properties
    for (const prop of INHERENT_PROPERTIES) {
      union.set(prop.name, { ...prop });
    }

    // Merge all type properties
    for (const typeId of this.registrationOrder) {
      const resolved = this.collectInheritedProperties(typeId);
      for (const prop of resolved) {
        if (union.has(prop.name)) {
          // Merge: type definition wins
          union.set(prop.name, { ...union.get(prop.name)!, ...prop });
        } else {
          union.set(prop.name, { ...prop });
        }
      }
    }

    return Array.from(union.values());
  }

  /**
   * Check if a property name is inherent (defined in INHERENT_PROPERTIES).
   */
  isInherent(name: string): boolean {
    return INHERENT_PROPERTIES.some((p) => p.name === name);
  }

  /**
   * Get all registered type definitions in registration order.
   */
  getTypes(): CellTypeDefinition[] {
    return this.registrationOrder.map((id) => this.types.get(id)!);
  }

  /**
   * Get a single type definition by ID.
   */
  getType(id: string): CellTypeDefinition | undefined {
    return this.types.get(id);
  }

  /**
   * Get the number of registered types.
   */
  get typeCount(): number {
    return this.types.size;
  }

  /**
   * Factory: build a CellTypeRegistry from a PresetConfig.
   *
   * Backward compatible: if `cell_types` is absent, auto-creates a single
   * 'default' type from `cell_properties`. Zero changes needed to existing YAML.
   */
  static fromPreset(preset: PresetConfig): CellTypeRegistry {
    const registry = new CellTypeRegistry();

    if (preset.cell_types && preset.cell_types.length > 0) {
      // Explicit cell types defined
      for (const ct of preset.cell_types) {
        registry.register(ct);
      }
    } else {
      // Backward compat: single default type from cell_properties
      registry.register({
        id: 'default',
        name: preset.meta.name,
        color: '#4ade80',
        properties: preset.cell_properties,
      });
    }

    return registry;
  }
}
