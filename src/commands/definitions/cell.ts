/**
 * Cell commands: edit cell type properties (change defaults, add/remove properties).
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';
import type { CellPropertyType } from '../../engine/cell/types';
import { CHANNELS_PER_TYPE, INHERENT_PROPERTIES } from '../../engine/cell/types';
import type { Simulation } from '../../engine/rule/Simulation';

const SetDefaultParams = z.object({
  type: z.string(),
  property: z.string(),
  value: z.union([z.number(), z.array(z.number())]),
}).describe('{ type: string, property: string, value: number | number[] }');

const AddPropertyParams = z.object({
  type: z.string(),
  name: z.string(),
  propType: z.enum(['bool', 'int', 'float', 'vec2', 'vec3', 'vec4']),
  default: z.union([z.number(), z.array(z.number())]).optional(),
}).describe('{ type: string, name: string, propType: string, [default]: number | number[] }');

const RemovePropertyParams = z.object({
  type: z.string(),
  name: z.string(),
}).describe('{ type: string, name: string }');

const ListPropertiesParams = z.object({
  type: z.string().optional(),
}).describe('{ [type]: string }');

/** Build the full presetLoaded payload including cellTypes */
function emitCellUpdate(sim: Simulation, eventBus: EventBus): void {
  const registry = sim.typeRegistry;
  const cellTypes = registry.getTypes().map((typeDef) => {
    const resolved = registry.resolveProperties(typeDef.id);
    return {
      id: typeDef.id,
      name: typeDef.name,
      color: typeDef.color,
      properties: resolved
        .filter((p) => p.name !== '_cellType')
        .map((p) => ({
          name: p.name,
          type: p.type,
          default: p.default,
          role: p.role,
          isInherent: registry.isInherent(p.name),
        })),
    };
  });

  eventBus.emit('sim:presetLoaded', {
    name: sim.preset.meta.name,
    width: sim.grid.config.width,
    height: sim.grid.config.height,
    cellProperties: registry.getPropertyUnion()
      .filter((p) => p.name !== '_cellType')
      .map(p => ({
        name: p.name,
        type: p.type,
        default: p.default,
        role: p.role,
        isInherent: INHERENT_PROPERTIES.some(ip => ip.name === p.name),
      })),
    cellTypes,
  });
}

export function registerCellCommands(
  registry: CommandRegistry,
  controller: SimulationController,
  eventBus: EventBus,
): void {
  registry.register({
    name: 'cell.setDefault',
    description: 'Change default value for a property on a cell type',
    category: 'cell',
    params: SetDefaultParams,
    execute: async (params) => {
      const { type, property, value } = params as z.infer<typeof SetDefaultParams>;
      const sim = controller.getSimulation();
      if (!sim) return { success: false, error: 'No simulation loaded' };

      const typeDef = sim.typeRegistry.getType(type);
      if (!typeDef) return { success: false, error: `Cell type "${type}" not found` };

      const allProps = sim.typeRegistry.resolveProperties(type);
      const prop = allProps.find(p => p.name === property);
      if (!prop) return { success: false, error: `Property "${property}" not found on type "${type}"` };

      typeDef.setPropertyDefault(property, value);
      emitCellUpdate(sim, eventBus);

      return { success: true, data: { type, property, value } };
    },
  });

  registry.register({
    name: 'cell.addProperty',
    description: 'Add a new property to a cell type',
    category: 'cell',
    params: AddPropertyParams,
    execute: async (params) => {
      const { type, name, propType, default: defaultVal } = params as z.infer<typeof AddPropertyParams>;
      const sim = controller.getSimulation();
      if (!sim) return { success: false, error: 'No simulation loaded' };

      const typeDef = sim.typeRegistry.getType(type);
      if (!typeDef) return { success: false, error: `Cell type "${type}" not found` };

      const allProps = sim.typeRegistry.resolveProperties(type);
      if (allProps.some(p => p.name === name)) {
        return { success: false, error: `Property "${name}" already exists on type "${type}"` };
      }

      const resolvedDefault = defaultVal ?? 0;

      typeDef.addProperty({
        name,
        type: propType as CellPropertyType,
        default: resolvedDefault,
        role: 'output',
      });

      const channels = CHANNELS_PER_TYPE[propType as CellPropertyType];
      sim.grid.addProperty(name, channels, resolvedDefault);

      emitCellUpdate(sim, eventBus);

      return { success: true, data: { type, name, propType, default: resolvedDefault } };
    },
  });

  registry.register({
    name: 'cell.removeProperty',
    description: 'Remove a user-added property from a cell type',
    category: 'cell',
    params: RemovePropertyParams,
    execute: async (params) => {
      const { type, name } = params as z.infer<typeof RemovePropertyParams>;
      const sim = controller.getSimulation();
      if (!sim) return { success: false, error: 'No simulation loaded' };

      const typeDef = sim.typeRegistry.getType(type);
      if (!typeDef) return { success: false, error: `Cell type "${type}" not found` };

      if (INHERENT_PROPERTIES.some(p => p.name === name)) {
        return { success: false, error: `Cannot remove inherent property "${name}"` };
      }

      const removed = typeDef.removeProperty(name);
      if (!removed) {
        return { success: false, error: `Property "${name}" not found on type "${type}"` };
      }

      emitCellUpdate(sim, eventBus);

      return { success: true, data: { type, name } };
    },
  });

  registry.register({
    name: 'cell.listProperties',
    description: 'List all properties of a cell type',
    category: 'cell',
    params: ListPropertiesParams,
    execute: async (params) => {
      const { type } = params as z.infer<typeof ListPropertiesParams>;
      const sim = controller.getSimulation();
      if (!sim) return { success: false, error: 'No simulation loaded' };

      const typeId = type ?? sim.typeRegistry.getTypes()[0]?.id;
      if (!typeId) return { success: false, error: 'No cell types defined' };

      const typeDef = sim.typeRegistry.getType(typeId);
      if (!typeDef) return { success: false, error: `Cell type "${typeId}" not found` };

      const props = sim.typeRegistry.resolveProperties(typeId).map(p => ({
        name: p.name,
        type: p.type,
        default: p.default,
        role: p.role,
        isInherent: INHERENT_PROPERTIES.some(ip => ip.name === p.name),
      }));

      return { success: true, data: { type: typeId, properties: props } };
    },
  });
}
