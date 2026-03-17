/**
 * Parameter commands: set, get, list, reset runtime simulation parameters.
 *
 * All parameter control flows through these commands via the CommandRegistry.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';

const SetParams = z.object({
  name: z.string(),
  value: z.number(),
}).describe('{ name: string, value: number }');

const GetParams = z.object({
  name: z.string(),
}).describe('{ name: string }');

const NoParams = z.object({}).describe('none');

const ResetParams = z.object({
  name: z.string().optional(),
}).describe('{ name?: string }');

const AddParams = z.object({
  name: z.string(),
  type: z.enum(['float', 'int']).default('float'),
  default: z.number().default(0),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  label: z.string().optional(),
}).describe('{ name, type?, default?, min?, max?, step?, label? }');

const RemoveParams = z.object({
  name: z.string(),
}).describe('{ name: string }');

export function registerParamCommands(
  registry: CommandRegistry,
  controller: SimulationController,
): void {
  registry.register({
    name: 'param.set',
    description: 'Set a runtime simulation parameter',
    category: 'param',
    params: SetParams,
    execute: async (params) => {
      const { name, value } = params as z.infer<typeof SetParams>;
      const defs = controller.getParamDefs();
      const def = defs.find((d) => d.name === name);
      if (!def) {
        return { success: false, error: `Unknown parameter: "${name}". Use param.list to see available parameters.` };
      }
      controller.setParam(name, value);
      const actual = controller.getParam(name);
      return { success: true, data: { name, value: actual } };
    },
  });

  registry.register({
    name: 'param.get',
    description: 'Get current value of a runtime parameter',
    category: 'param',
    params: GetParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof GetParams>;
      const value = controller.getParam(name);
      if (value === undefined) {
        return { success: false, error: `Unknown parameter: "${name}"` };
      }
      return { success: true, data: { name, value } };
    },
  });

  registry.register({
    name: 'param.list',
    description: 'List all runtime parameters with current values',
    category: 'param',
    params: NoParams,
    execute: async () => {
      const defs = controller.getParamDefs();
      const values = controller.getParamValues();
      const params = defs.map((d) => ({
        name: d.name,
        label: d.label ?? d.name,
        value: values[d.name] ?? d.default,
        default: d.default,
        min: d.min,
        max: d.max,
        step: d.step,
        type: d.type,
      }));
      return { success: true, data: { params } };
    },
  });

  registry.register({
    name: 'param.reset',
    description: 'Reset parameters to defaults (one or all)',
    category: 'param',
    params: ResetParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof ResetParams>;
      if (name) {
        const defs = controller.getParamDefs();
        const def = defs.find((d) => d.name === name);
        if (!def) {
          return { success: false, error: `Unknown parameter: "${name}"` };
        }
        controller.setParam(name, def.default);
        return { success: true, data: { name, value: def.default } };
      }
      controller.resetParams();
      return { success: true };
    },
  });

  registry.register({
    name: 'param.add',
    description: 'Add a user-defined runtime parameter',
    category: 'param',
    params: AddParams,
    execute: async (params) => {
      const { name, type, default: defaultVal, min, max, step, label } = params as z.infer<typeof AddParams>;
      const existing = controller.getParamDefs();
      if (existing.some((d) => d.name === name)) {
        return { success: false, error: `Parameter "${name}" already exists` };
      }
      controller.addParamDef({ name, type, default: defaultVal, min, max, step, label });
      return { success: true, data: { name, type, default: defaultVal, min, max, step } };
    },
  });

  registry.register({
    name: 'param.remove',
    description: 'Remove a user-added runtime parameter (cannot remove preset params)',
    category: 'param',
    params: RemoveParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof RemoveParams>;
      if (!controller.isUserParam(name)) {
        return { success: false, error: `Cannot remove "${name}": not a user-added parameter (preset params cannot be removed)` };
      }
      const removed = controller.removeParamDef(name);
      if (!removed) {
        return { success: false, error: `Parameter "${name}" not found` };
      }
      return { success: true, data: { name } };
    },
  });
}
