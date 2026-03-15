/**
 * PropertyAddress: parses dot-path strings and resolves reads/writes.
 *
 * Addresses follow the pattern `namespace.key`:
 *   - cell.age     → Grid Float32Array buffer
 *   - env.feedRate  → Simulation params Map
 *   - global.myVar  → GlobalVariableStore
 */

import type { Grid } from '../grid/Grid';
import type { GlobalVariableStore } from '../scripting/GlobalVariableStore';
import type { ParsedAddress, AddressNamespace } from './types';

const VALID_NAMESPACES = new Set<AddressNamespace>(['cell', 'env', 'global']);

/** Parse a dot-path address string into namespace + key */
export function parseAddress(addr: string): ParsedAddress {
  const dotIndex = addr.indexOf('.');
  if (dotIndex === -1) {
    throw new Error(`Invalid address "${addr}": missing namespace (expected "cell.x", "env.x", or "global.x")`);
  }

  const namespace = addr.slice(0, dotIndex) as AddressNamespace;
  const key = addr.slice(dotIndex + 1);

  if (!VALID_NAMESPACES.has(namespace)) {
    throw new Error(`Invalid namespace "${namespace}" in address "${addr}". Must be cell, env, or global`);
  }

  if (!key) {
    throw new Error(`Invalid address "${addr}": empty key`);
  }

  return { namespace, key };
}

/** Read a value from the addressed location. Returns Float32Array for cell, number for env/global. */
export function resolveRead(
  addr: ParsedAddress,
  grid: Grid,
  params: Map<string, number>,
  variableStore: GlobalVariableStore,
): number | Float32Array {
  switch (addr.namespace) {
    case 'cell':
      return grid.getCurrentBuffer(addr.key);
    case 'env': {
      const val = params.get(addr.key);
      if (val === undefined) throw new Error(`Env param "${addr.key}" not found`);
      return val;
    }
    case 'global': {
      const val = variableStore.get(addr.key);
      if (val === undefined) throw new Error(`Global variable "${addr.key}" not found`);
      if (typeof val === 'string') throw new Error(`Global variable "${addr.key}" is a string, not numeric`);
      return val;
    }
  }
}

/** Write a value to the addressed location */
export function resolveWrite(
  addr: ParsedAddress,
  value: number | Float32Array,
  grid: Grid,
  params: Map<string, number>,
  variableStore: GlobalVariableStore,
): void {
  switch (addr.namespace) {
    case 'cell': {
      if (!(value instanceof Float32Array)) {
        // Broadcast scalar to entire buffer
        const buf = grid.getCurrentBuffer(addr.key);
        buf.fill(value);
      } else {
        const buf = grid.getCurrentBuffer(addr.key);
        buf.set(value);
      }
      break;
    }
    case 'env': {
      if (typeof value !== 'number') throw new Error('Cannot write array to env param');
      params.set(addr.key, value);
      break;
    }
    case 'global': {
      if (typeof value !== 'number') throw new Error('Cannot write array to global variable');
      variableStore.set(addr.key, value);
      break;
    }
  }
}
