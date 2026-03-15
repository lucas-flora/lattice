/**
 * Script commands: add, remove, list, enable, disable, show global scripts.
 *
 * Lazily creates PyodideBridge and GlobalScriptRunner on first use.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';

const AddParams = z.object({
  name: z.string(),
  code: z.string(),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
}).describe('{ name: string, code: string, inputs?: string[], outputs?: string[] }');

const NameParams = z.object({
  name: z.string(),
}).describe('{ name: string }');

const NoParams = z.object({}).describe('none');

export function registerScriptCommands(
  registry: CommandRegistry,
  controller: SimulationController,
): void {
  registry.register({
    name: 'script.list',
    description: 'List all global scripts',
    category: 'script',
    params: NoParams,
    execute: async () => {
      const runner = controller.getGlobalScriptRunner();
      if (!runner) {
        return { success: true, data: { scripts: [] } };
      }
      const scripts = runner.getAllScripts().map((s) => ({
        name: s.name,
        enabled: s.enabled,
        inputs: s.inputs,
        outputs: s.outputs,
      }));
      return { success: true, data: { scripts } };
    },
  });

  registry.register({
    name: 'script.add',
    description: 'Add a global script',
    category: 'script',
    params: AddParams,
    execute: async (params) => {
      const { name, code, inputs, outputs } = params as z.infer<typeof AddParams>;

      // Lazily create scripting engines
      const engines = controller.ensureScriptingEngines();
      if (!engines) {
        return { success: false, error: 'Failed to initialize scripting engines' };
      }

      engines.scriptRunner.addScript({ name, enabled: true, code, inputs, outputs });
      return { success: true, data: { name } };
    },
  });

  registry.register({
    name: 'script.remove',
    description: 'Remove a global script',
    category: 'script',
    params: NameParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof NameParams>;
      const runner = controller.getGlobalScriptRunner();
      if (!runner) {
        return { success: false, error: 'No scripts loaded' };
      }
      const existed = runner.removeScript(name);
      if (!existed) {
        return { success: false, error: `Script "${name}" not found` };
      }
      return { success: true, data: { name } };
    },
  });

  registry.register({
    name: 'script.enable',
    description: 'Enable a global script',
    category: 'script',
    params: NameParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof NameParams>;
      const runner = controller.getGlobalScriptRunner();
      if (!runner) {
        return { success: false, error: 'No scripts loaded' };
      }
      const script = runner.getScript(name);
      if (!script) {
        return { success: false, error: `Script "${name}" not found` };
      }
      runner.enableScript(name);
      return { success: true, data: { name, enabled: true } };
    },
  });

  registry.register({
    name: 'script.disable',
    description: 'Disable a global script',
    category: 'script',
    params: NameParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof NameParams>;
      const runner = controller.getGlobalScriptRunner();
      if (!runner) {
        return { success: false, error: 'No scripts loaded' };
      }
      const script = runner.getScript(name);
      if (!script) {
        return { success: false, error: `Script "${name}" not found` };
      }
      runner.disableScript(name);
      return { success: true, data: { name, enabled: false } };
    },
  });

  registry.register({
    name: 'script.show',
    description: 'Show details of a global script',
    category: 'script',
    params: NameParams,
    execute: async (params) => {
      const { name } = params as z.infer<typeof NameParams>;
      const runner = controller.getGlobalScriptRunner();
      if (!runner) {
        return { success: false, error: 'No scripts loaded' };
      }
      const script = runner.getScript(name);
      if (!script) {
        return { success: false, error: `Script "${name}" not found` };
      }
      return { success: true, data: script };
    },
  });

  registry.register({
    name: 'script.clear',
    description: 'Remove all global scripts',
    category: 'script',
    params: NoParams,
    execute: async () => {
      const runner = controller.getGlobalScriptRunner();
      if (!runner) {
        return { success: true, data: { removed: 0 } };
      }
      const all = runner.getAllScripts();
      for (const s of all) {
        runner.removeScript(s.name);
      }
      return { success: true, data: { removed: all.length } };
    },
  });
}
