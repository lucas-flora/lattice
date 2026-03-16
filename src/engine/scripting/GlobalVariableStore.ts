/**
 * GlobalVariableStore: holds `global.*` key-value state for scripting.
 *
 * Readable/writable from expressions and global scripts.
 * Emits events via EventBus on mutation.
 */

import { eventBus } from '../core/EventBus';
import type { GlobalVariableDef } from './types';

export class GlobalVariableStore {
  private vars = new Map<string, { value: number | string; type: 'float' | 'int' | 'string' }>();

  set(name: string, value: number | string): void {
    const existing = this.vars.get(name);
    const type = existing?.type ?? (typeof value === 'string' ? 'string' : 'float');
    this.vars.set(name, { value, type });
    eventBus.emit('script:variableChanged', { name, value });
  }

  get(name: string): number | string | undefined {
    return this.vars.get(name)?.value;
  }

  getAll(): Record<string, { value: number | string; type: string }> {
    const result: Record<string, { value: number | string; type: string }> = {};
    for (const [k, v] of this.vars) {
      result[k] = { value: v.value, type: v.type };
    }
    return result;
  }

  getNumericAll(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [k, v] of this.vars) {
      if (typeof v.value === 'number') {
        result[k] = v.value;
      }
    }
    return result;
  }

  has(name: string): boolean {
    return this.vars.has(name);
  }

  delete(name: string): boolean {
    const existed = this.vars.delete(name);
    if (existed) {
      eventBus.emit('script:variableDeleted', { name });
    }
    return existed;
  }

  clear(): void {
    this.vars.clear();
    eventBus.emit('script:variablesReset', {});
  }

  loadFromConfig(defs: GlobalVariableDef[]): void {
    this.vars.clear();
    for (const def of defs) {
      this.vars.set(def.name, { value: def.default, type: def.type });
    }
  }
}
