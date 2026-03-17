/**
 * Scene data resolver: enumerates scene objects and their properties
 * for use in ObjectNode creation and the add-node menu.
 */

import { useSimStore } from '@/store/simStore';
import { useScriptStore } from '@/store/scriptStore';
import type { PortType } from './types';

export interface ObjectProperty {
  name: string;
  portType: PortType;
}

export interface SceneObject {
  kind: 'cell-type' | 'environment' | 'globals';
  id: string;
  name: string;
  properties: ObjectProperty[];
}

/** Map CellPropertySummary.type to PortType */
function cellPropTypeToPort(type: string): PortType {
  switch (type) {
    case 'bool': return 'bool';
    case 'int':
    case 'float': return 'scalar';
    case 'vec2':
    case 'vec3':
    case 'vec4': return 'array';
    default: return 'scalar';
  }
}

/** Get properties for a specific object kind + id */
export function getObjectProperties(kind: 'cell-type' | 'environment' | 'globals', objectId: string): ObjectProperty[] {
  if (kind === 'cell-type') {
    const { cellTypes, cellProperties } = useSimStore.getState();
    const ct = cellTypes.find((t) => t.id === objectId);
    if (ct) {
      return ct.properties.map((p) => ({ name: p.name, portType: cellPropTypeToPort(p.type) }));
    }
    // Fallback: use global cellProperties
    return cellProperties.map((p) => ({ name: p.name, portType: cellPropTypeToPort(p.type) }));
  }

  if (kind === 'environment') {
    const { paramDefs } = useSimStore.getState();
    return paramDefs.map((p) => ({ name: p.name, portType: 'scalar' as PortType }));
  }

  if (kind === 'globals') {
    const { globalVariables } = useScriptStore.getState();
    return Object.entries(globalVariables).map(([name, v]) => ({
      name,
      portType: (v.type === 'string' ? 'string' : 'scalar') as PortType,
    }));
  }

  return [];
}

/** Enumerate all available scene objects for the add-node menu */
export function getAllSceneObjects(): SceneObject[] {
  const objects: SceneObject[] = [];

  // Cell types
  const { cellTypes, cellProperties, paramDefs } = useSimStore.getState();
  if (cellTypes.length > 0) {
    for (const ct of cellTypes) {
      objects.push({
        kind: 'cell-type',
        id: ct.id,
        name: ct.name,
        properties: ct.properties.map((p) => ({ name: p.name, portType: cellPropTypeToPort(p.type) })),
      });
    }
  } else if (cellProperties.length > 0) {
    // No typed cell types — show a single "Cell" object from flat property list
    objects.push({
      kind: 'cell-type',
      id: 'default',
      name: 'Cell',
      properties: cellProperties.map((p) => ({ name: p.name, portType: cellPropTypeToPort(p.type) })),
    });
  }

  // Environment
  if (paramDefs.length > 0) {
    objects.push({
      kind: 'environment',
      id: 'env',
      name: 'Environment',
      properties: paramDefs.map((p) => ({ name: p.name, portType: 'scalar' })),
    });
  }

  // Globals
  const { globalVariables } = useScriptStore.getState();
  const globalEntries = Object.entries(globalVariables);
  objects.push({
    kind: 'globals',
    id: 'globals',
    name: 'Globals',
    properties: globalEntries.map(([name, v]) => ({
      name,
      portType: (v.type === 'string' ? 'string' : 'scalar') as PortType,
    })),
  });

  return objects;
}
