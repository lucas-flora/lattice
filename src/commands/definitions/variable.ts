/**
 * Variable commands: set, get, list, delete global scripting variables.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';

const SetParams = z.object({
  name: z.string(),
  value: z.union([z.number(), z.string()]),
}).describe('{ name: string, value: number | string }');

const GetParams = z.object({
  name: z.string(),
}).describe('{ name: string }');

const DeleteParams = z.object({
  name: z.string(),
}).describe('{ name: string }');

const NoParams = z.object({}).describe('none');

export function registerVariableCommands(
  registry: CommandRegistry,
  controller: SimulationController,
): void {
  registry.register({
    name: 'var.set',
    description: 'Set a global variable',
    category: 'var',
    params: SetParams,
    execute: async (params) => {
      const { name, value } = params as z.infer<typeof SetParams>;
      const store = controller.getVariableStore();
      if (!store) {
        return { success: false, error: 'No simulation loaded' };
      }
      store.set(name, value);
      return { success: true, data: { name, value } };
    },
  });

  registry.register({
    name: 'var.get',
    description: 'Get a global variable value',
    category: 'var',
    params: GetParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof GetParams>;
      const store = controller.getVariableStore();
      if (!store) {
        return { success: false, error: 'No simulation loaded' };
      }
      const value = store.get(name);
      if (value === undefined) {
        return { success: false, error: `Variable "${name}" not found` };
      }
      return { success: true, data: { name, value } };
    },
  });

  registry.register({
    name: 'var.list',
    description: 'List all global variables',
    category: 'var',
    params: NoParams,
    execute: async () => {
      const store = controller.getVariableStore();
      if (!store) {
        return { success: true, data: { variables: {} } };
      }
      return { success: true, data: { variables: store.getAll() } };
    },
  });

  registry.register({
    name: 'var.delete',
    description: 'Delete a global variable',
    category: 'var',
    params: DeleteParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof DeleteParams>;
      const store = controller.getVariableStore();
      if (!store) {
        return { success: false, error: 'No simulation loaded' };
      }
      const existed = store.delete(name);
      if (!existed) {
        return { success: false, error: `Variable "${name}" not found` };
      }
      return { success: true, data: { name } };
    },
  });

  registry.register({
    name: 'var.clear',
    description: 'Clear all global variables',
    category: 'var',
    params: NoParams,
    execute: async () => {
      const store = controller.getVariableStore();
      if (!store) {
        return { success: true, data: { cleared: true } };
      }
      store.clear();
      return { success: true, data: { cleared: true } };
    },
  });
}
