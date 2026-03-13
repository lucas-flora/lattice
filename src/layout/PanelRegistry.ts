/**
 * Panel registry: maps panel type strings to React components + metadata.
 *
 * All panel types must be registered before they can appear in a layout tree.
 */

import type { PanelDescriptor } from './types';

class PanelRegistryImpl {
  private panels: Map<string, PanelDescriptor> = new Map();

  /** Register a panel type */
  register(descriptor: PanelDescriptor): void {
    this.panels.set(descriptor.type, descriptor);
  }

  /** Get a panel descriptor by type */
  get(type: string): PanelDescriptor | undefined {
    return this.panels.get(type);
  }

  /** Get all registered panel descriptors */
  getAll(): PanelDescriptor[] {
    return Array.from(this.panels.values());
  }

  /** Check if a panel type is registered */
  has(type: string): boolean {
    return this.panels.has(type);
  }

  /** Clear all registrations (for testing) */
  clear(): void {
    this.panels.clear();
  }
}

/** Global panel registry singleton */
export const panelRegistry = new PanelRegistryImpl();
