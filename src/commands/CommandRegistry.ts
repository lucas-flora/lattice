/**
 * CommandRegistry: central hub where all app actions are registered as commands.
 *
 * Implements CMDS-01: every action is a registered command with name, description,
 * category, parameter schema, and execute function.
 *
 * Both GUI buttons (CMDS-02) and CLI terminal (CMDS-03) invoke commands through
 * this registry -- the single call path for all app actions.
 */

import type { CommandDefinition, CommandResult, CommandCatalogEntry } from './types';
import { simStoreActions } from '../store/simStore';

/** Commands that mutate the preset configuration (trigger fork-on-modify). */
const CONFIG_MUTATING_COMMANDS = new Set([
  'op.add', 'op.remove', 'op.edit', 'op.enable', 'op.disable',
  'tag.add', 'tag.remove', 'tag.edit', 'tag.enable', 'tag.disable',
  'param.set', 'param.add', 'param.remove', 'param.reset',
  'cell.addProperty', 'cell.removeProperty', 'cell.setDefault',
  'var.set', 'var.delete', 'var.clear',
  'scene.enable', 'scene.disable',
  'link.add', 'link.remove', 'link.edit', 'link.clear',
  'expr.set', 'expr.clear', 'expr.clearAll',
  'script.add', 'script.remove', 'script.enable', 'script.disable', 'script.clear',
  'grid.resize',
  'rule.edit',
]);

export class CommandRegistry {
  private commands: Map<string, CommandDefinition> = new Map();

  /**
   * Register a command definition.
   * Throws if a command with the same name is already registered.
   */
  register(definition: CommandDefinition): void {
    if (this.commands.has(definition.name)) {
      throw new Error(`Command "${definition.name}" is already registered`);
    }
    this.commands.set(definition.name, definition);
  }

  /**
   * List all registered commands as a typed catalog.
   * Returns metadata sufficient for GUI rendering and CLI invocation.
   */
  list(): CommandCatalogEntry[] {
    const entries: CommandCatalogEntry[] = [];
    for (const cmd of this.commands.values()) {
      entries.push({
        name: cmd.name,
        description: cmd.description,
        category: cmd.category,
        paramsDescription: cmd.params.description ?? 'none',
      });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get a single command definition by name.
   * Returns undefined if not found.
   */
  get(name: string): CommandDefinition | undefined {
    return this.commands.get(name);
  }

  /**
   * Execute a command by name with given params.
   * Validates params against the command's Zod schema.
   * Never throws -- returns error results for invalid commands or params.
   */
  async execute(name: string, params: unknown = {}): Promise<CommandResult> {
    const command = this.commands.get(name);
    if (!command) {
      return { success: false, error: `Unknown command: "${name}"` };
    }

    // Validate params against Zod schema
    const parseResult = command.params.safeParse(params);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      return { success: false, error: `Invalid params for "${name}": ${issues}` };
    }

    try {
      const result = await command.execute(parseResult.data);
      // Fork-on-modify: if a config-mutating command succeeded, mark the preset as modified
      if (result.success && CONFIG_MUTATING_COMMANDS.has(name)) {
        simStoreActions.markPresetModified();
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Command "${name}" failed: ${message}` };
    }
  }

  /**
   * Check if a command is registered.
   */
  has(name: string): boolean {
    return this.commands.has(name);
  }

  /**
   * Get the count of registered commands.
   */
  get size(): number {
    return this.commands.size;
  }

  /**
   * Remove all registered commands.
   * Used for testing.
   */
  clear(): void {
    this.commands.clear();
  }
}

/** Global CommandRegistry singleton */
export const commandRegistry = new CommandRegistry();
