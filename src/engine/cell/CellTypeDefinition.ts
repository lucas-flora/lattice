/**
 * CellTypeDefinition: immutable value class representing a single cell type.
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
}
