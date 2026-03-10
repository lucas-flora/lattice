/**
 * Registry for managing cell property collections.
 *
 * Tracks property definitions, calculates offsets, and provides
 * role-based filtering. User-defined properties use the exact same
 * registration path as built-in ones -- no privilege distinction.
 */

import { CellPropertyDefinition } from './CellPropertyDefinition';
import type { CellPropertyConfig, PropertyRole } from './types';

export class CellPropertyRegistry {
  private definitions: Map<string, CellPropertyDefinition> = new Map();
  private offsets: Map<string, number> = new Map();
  private _totalChannels: number = 0;
  private registrationOrder: string[] = [];

  /**
   * Register a property definition.
   *
   * @returns The created CellPropertyDefinition
   * @throws Error if a property with the same name already exists
   */
  register(config: CellPropertyConfig): CellPropertyDefinition {
    if (this.definitions.has(config.name)) {
      throw new Error(`Property '${config.name}' is already registered`);
    }

    const definition = new CellPropertyDefinition(config);

    this.offsets.set(config.name, this._totalChannels);
    this._totalChannels += definition.channels;

    this.definitions.set(config.name, definition);
    this.registrationOrder.push(config.name);

    return definition;
  }

  /**
   * Register multiple properties at once.
   */
  registerAll(configs: CellPropertyConfig[]): void {
    for (const config of configs) {
      this.register(config);
    }
  }

  /**
   * Get a property definition by name.
   */
  get(name: string): CellPropertyDefinition | undefined {
    return this.definitions.get(name);
  }

  /**
   * Get the buffer offset for a property (in channels).
   *
   * @throws Error if the property is not registered
   */
  getPropertyOffset(name: string): number {
    const offset = this.offsets.get(name);
    if (offset === undefined) {
      throw new Error(`Property '${name}' is not registered`);
    }
    return offset;
  }

  /**
   * Total channels across all registered properties.
   */
  get totalChannels(): number {
    return this._totalChannels;
  }

  /**
   * Get all property definitions in registration order.
   */
  getAll(): CellPropertyDefinition[] {
    return this.registrationOrder.map((name) => this.definitions.get(name)!);
  }

  /**
   * Get all definitions matching a given role.
   */
  getByRole(role: PropertyRole): CellPropertyDefinition[] {
    return this.getAll().filter((def) => def.role === role);
  }

  /**
   * Check if a property exists in the registry.
   */
  has(name: string): boolean {
    return this.definitions.has(name);
  }

  /**
   * Get property names in registration order.
   */
  getNames(): string[] {
    return [...this.registrationOrder];
  }

  /**
   * Get the number of registered properties.
   */
  get size(): number {
    return this.definitions.size;
  }
}
