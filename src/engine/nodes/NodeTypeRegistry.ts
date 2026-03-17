/**
 * NodeTypeRegistry: stores node type definitions and their compile functions.
 *
 * Each node type defines its ports (inputs/outputs) and a compile() function
 * that produces a Python expression from its input expressions.
 */

import type { NodeTypeDefinition } from './types';

class NodeTypeRegistryImpl {
  private types = new Map<string, NodeTypeDefinition>();

  register(def: NodeTypeDefinition): void {
    this.types.set(def.type, def);
  }

  get(type: string): NodeTypeDefinition | undefined {
    return this.types.get(type);
  }

  getAll(): NodeTypeDefinition[] {
    return Array.from(this.types.values());
  }

  getByCategory(category: string): NodeTypeDefinition[] {
    return this.getAll().filter((d) => d.category === category);
  }

  has(type: string): boolean {
    return this.types.has(type);
  }
}

export const nodeTypeRegistry = new NodeTypeRegistryImpl();
