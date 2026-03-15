/**
 * CLI command parser for the terminal.
 *
 * Converts user input like "sim play" or "sim.play" into registry calls.
 * Handles argument parsing, hyphen-to-camelCase conversion, and autocomplete.
 *
 * Supports two input styles:
 *   - Space-delimited: "grid resize 128 128"
 *   - Dot notation:    "grid.resize 128 128"
 */

import type { CommandRegistry } from '@/commands/CommandRegistry';

export interface ParsedCommand {
  commandName: string;
  params: Record<string, unknown>;
}

/**
 * Convert hyphenated-action to camelCase.
 * E.g., "step-back" -> "stepBack", "brush-size" -> "brushSize"
 */
function hyphenToCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Known command parameter mappings.
 * Maps command names to how positional arguments should be interpreted.
 * Names prefixed with ? are optional.
 */
const PARAM_MAPPINGS: Record<string, string[]> = {
  'sim.speed': ['fps'],
  'sim.seek': ['generation'],
  'sim.setDuration': ['frames'],
  'sim.setPlaybackMode': ['mode'],
  'preset.load': ['name'],
  'edit.draw': ['x', 'y'],
  'edit.erase': ['x', 'y'],
  'edit.brushSize': ['size'],
  'view.zoom': ['level'],
  'view.pan': ['x', 'y'],
  'view.gridLines': ['?visible'],
  'param.set': ['name', 'value'],
  'param.get': ['name'],
  'param.reset': ['?name'],
  'grid.resize': ['width', '?height'],
  'rule.edit': ['...body'],
  'var.set': ['name', 'value'],
  'var.get': ['name'],
  'var.delete': ['name'],
  'expr.set': ['property', '...expression'],
  'expr.clear': ['property'],
  'script.add': ['name', '...code'],
  'script.remove': ['name'],
  'script.enable': ['name'],
  'script.disable': ['name'],
  'script.show': ['name'],
  'script.clear': [],
  'var.clear': [],
  'expr.clearAll': [],
};

/**
 * Human-readable argument descriptions for ghost text hints.
 */
const ARG_HINTS: Record<string, string> = {
  'sim.speed': '<fps>',
  'sim.seek': '<generation>',
  'sim.setDuration': '<frames>',
  'sim.setPlaybackMode': '<loop|endless|once>',
  'preset.load': '<name>',
  'edit.draw': '<x> <y>',
  'edit.erase': '<x> <y>',
  'edit.brushSize': '<size>',
  'view.zoom': '<level>',
  'view.pan': '<x> <y>',
  'view.gridLines': '[on|off]',
  'param.set': '<name> <value>',
  'param.get': '<name>',
  'param.reset': '[name]',
  'grid.resize': '<width> [height]',
  'rule.edit': '<body>',
  'var.set': '<name> <value>',
  'var.get': '<name>',
  'var.delete': '<name>',
  'expr.set': '<property> <expression>',
  'expr.clear': '<property>',
  'script.add': '<name> <code>',
  'script.remove': '<name>',
  'script.enable': '<name>',
  'script.disable': '<name>',
  'script.show': '<name>',
  'script.clear': '',
  'var.clear': '',
  'expr.clearAll': '',
};

/**
 * Learning model: tracks command usage frequency and recency for ranking suggestions.
 */
class CommandLearningModel {
  private usage = new Map<string, { count: number; lastUsed: number }>();

  record(commandName: string): void {
    const existing = this.usage.get(commandName);
    this.usage.set(commandName, {
      count: (existing?.count ?? 0) + 1,
      lastUsed: Date.now(),
    });
  }

  scoreCommand(commandName: string): number {
    const entry = this.usage.get(commandName);
    if (!entry) return 0;
    const ageMinutes = (Date.now() - entry.lastUsed) / 60000;
    const recency = Math.exp(-ageMinutes / 30);
    return entry.count * 0.4 + recency * 0.6;
  }

  scoreCli(cli: string): number {
    const parts = cli.split(' ');
    if (parts.length >= 2) {
      return this.scoreCommand(`${parts[0]}.${hyphenToCamelCase(parts[1])}`);
    }
    let total = 0;
    for (const [name] of this.usage) {
      if (name.startsWith(cli + '.')) {
        total += this.scoreCommand(name);
      }
    }
    return total;
  }

  rank<T extends string>(items: T[]): T[] {
    return [...items].sort((a, b) => this.scoreCli(b) - this.scoreCli(a));
  }
}

export const learningModel = new CommandLearningModel();

/**
 * Get ordered cycle candidates for tab cycling.
 * Returns all subcommands for a category, ranked by usage.
 */
export function getCycleCandidates(input: string, registry: CommandRegistry): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const commands = registry.list();
  const parts = trimmed.split(/\s+/);

  if (parts.length === 1) {
    const matching = commands.filter((cmd) => cmd.category === trimmed);
    if (matching.length > 0) {
      const candidates = matching.map((cmd) => {
        const action = cmd.name.split('.')[1];
        const cliAction = action.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${trimmed} ${cliAction}`;
      });
      return learningModel.rank(candidates);
    }
  }

  if (parts.length >= 2) {
    const category = parts[0];
    const matching = commands.filter((cmd) => cmd.category === category);
    if (matching.length > 0) {
      const candidates = matching.map((cmd) => {
        const action = cmd.name.split('.')[1];
        const cliAction = action.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${category} ${cliAction}`;
      });
      return learningModel.rank(candidates);
    }
  }

  return [];
}

/**
 * Parse a CLI input string into a command name and params.
 * Returns null if the input is empty or doesn't match any command pattern.
 *
 * Supports both "category action args..." and "category.action args..." syntax.
 */
export function parseCommand(input: string, registry?: CommandRegistry): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  if (parts.length < 1) return null;

  const firstToken = parts[0];

  // Check for dot notation: "grid.resize 10 10"
  if (firstToken.includes('.')) {
    const dotParts = firstToken.split('.');
    if (dotParts.length === 2) {
      const commandName = `${dotParts[0]}.${hyphenToCamelCase(dotParts[1])}`;
      const args = parts.slice(1);

      // Verify the command exists if we have a registry
      if (registry && !registry.has(commandName)) {
        return null;
      }

      return { commandName, params: mapArgs(commandName, args) };
    }
  }

  const category = firstToken;
  const action = parts.length >= 2 ? parts[1] : null;
  const args = parts.slice(2);

  // Try category action format: "grid resize 10 10"
  if (action) {
    const camelAction = hyphenToCamelCase(action);
    const commandName = `${category}.${camelAction}`;

    if (registry) {
      if (registry.has(commandName)) {
        return { commandName, params: mapArgs(commandName, args) };
      }
      // If category.action doesn't exist, fall through
      if (!registry.has(category)) {
        return null;
      }
    }

    return { commandName, params: mapArgs(commandName, args) };
  }

  // Single word -- could be a category-level command
  if (registry && registry.has(category)) {
    return { commandName: category, params: {} };
  }

  return null;
}

/**
 * Map positional arguments to named params using PARAM_MAPPINGS.
 */
function mapArgs(commandName: string, args: string[]): Record<string, unknown> {
  const paramNames = PARAM_MAPPINGS[commandName] || [];
  const params: Record<string, unknown> = {};

  for (let i = 0; i < paramNames.length && i < args.length; i++) {
    let rawName = paramNames[i];
    const isOptional = rawName.startsWith('?');
    if (isOptional) rawName = rawName.slice(1);

    // Rest parameter: captures all remaining args as a single string
    const isRest = rawName.startsWith('...');
    const name = isRest ? rawName.slice(3) : rawName;

    if (isRest) {
      params[name] = args.slice(i).join(' ');
      break;
    }

    const value = args[i];
    const numValue = Number(value);
    params[name] = isNaN(numValue) ? value : numValue;
  }

  return params;
}

/**
 * Check if input starts with a valid command prefix.
 */
export function isCommand(input: string, registry: CommandRegistry): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;

  const parts = trimmed.split(/\s+/);
  const firstToken = parts[0];

  // Dot notation: "grid.resize" → check directly
  if (firstToken.includes('.')) {
    const dotParts = firstToken.split('.');
    if (dotParts.length === 2) {
      const commandName = `${dotParts[0]}.${hyphenToCamelCase(dotParts[1])}`;
      if (registry.has(commandName)) return true;
    }
  }

  const category = firstToken;
  const commands = registry.list();
  return commands.some((cmd) => cmd.category === category || cmd.name.startsWith(category + '.'));
}

/**
 * Get autocomplete suggestions for the current input.
 * Returns an array of suggested completions (full command strings).
 *
 * Provides three levels of completion:
 *   1. Category: "g" → ["grid"]
 *   2. Subcommand: "grid " → ["grid info", "grid resize"]
 *   3. Arguments: "grid resize " → ["grid resize <width> [height]"]
 */
export function getAutocompleteSuggestions(input: string, registry: CommandRegistry): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const commands = registry.list();
  const parts = trimmed.split(/\s+/);
  const category = parts[0];
  const hasTrailingSpace = input.endsWith(' ');

  // Level 1: typing a category prefix (no trailing space, single word)
  if (parts.length === 1 && !hasTrailingSpace) {
    const categories = new Set(commands.map((c) => c.category));
    return learningModel.rank([...categories].filter((cat) => cat.startsWith(category)));
  }

  // Level 2: category complete, show/filter subcommands
  const matchingCommands = commands.filter((cmd) => cmd.category === category);
  if (matchingCommands.length === 0) return [];

  // Either "grid " (1 part + trailing space) or "grid re" (2 parts)
  const actionPrefix = parts.length >= 2 ? parts[1] : '';
  return learningModel.rank(
    matchingCommands
      .map((cmd) => {
        const cmdAction = cmd.name.split('.')[1];
        const cliAction = cmdAction.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${category} ${cliAction}`;
      })
      .filter((suggestion) => {
        if (actionPrefix) {
          return suggestion.startsWith(`${category} ${actionPrefix}`);
        }
        return true;
      })
  );
}

/**
 * Get the single best ghost-text suggestion for the input.
 * Returns the completion string (the part after the current input), or empty string.
 *
 * Three modes:
 *   1. Category completion: "gr" → "id" (completes to "grid")
 *   2. Subcommand hint: "grid " → "info" or "resize" (first subcommand)
 *   3. Argument hint: "grid resize " → "<width> [height]"
 */
export function getGhostText(input: string, registry: CommandRegistry): string {
  // Don't suggest on empty input
  if (!input || !input.trim()) return '';

  const trimmed = input.trim();
  const hasTrailingSpace = input.endsWith(' ');
  const parts = trimmed.split(/\s+/);

  // Check if user has typed a complete command (category + action) with trailing space
  // → show arg hints
  if (hasTrailingSpace && parts.length >= 2) {
    const category = parts[0];
    const action = parts[1];
    const camelAction = hyphenToCamelCase(action);
    const commandName = `${category}.${camelAction}`;
    const argCount = parts.length - 2; // how many args already typed

    if (registry.has(commandName)) {
      const hint = ARG_HINTS[commandName];
      if (hint && argCount === 0) {
        return hint;
      }
      // If some args typed, show remaining hints
      if (hint && argCount > 0) {
        const hintParts = hint.split(/\s+/);
        if (argCount < hintParts.length) {
          return hintParts.slice(argCount).join(' ');
        }
      }
      return '';
    }
  }

  // If trailing space with just a category → show best-ranked subcommand
  if (hasTrailingSpace && parts.length === 1) {
    const candidates = getCycleCandidates(trimmed, registry);
    if (candidates.length > 0) {
      return candidates[0].split(' ').slice(1).join(' ');
    }
    return '';
  }

  // No trailing space, exactly 2 parts — check if it's a complete command → show arg hints
  if (!hasTrailingSpace && parts.length === 2) {
    const camelAction = hyphenToCamelCase(parts[1]);
    const commandName = `${parts[0]}.${camelAction}`;
    if (registry.has(commandName)) {
      const hint = ARG_HINTS[commandName];
      if (hint) {
        return ' ' + hint;
      }
      return '';
    }
  }

  // No trailing space, 3+ parts — mid-arg, show remaining param hints
  if (!hasTrailingSpace && parts.length > 2) {
    const camelAction = hyphenToCamelCase(parts[1]);
    const commandName = `${parts[0]}.${camelAction}`;
    if (registry.has(commandName)) {
      const hint = ARG_HINTS[commandName];
      if (hint) {
        const hintParts = hint.split(/\s+/);
        const typedArgCount = parts.length - 2;
        if (typedArgCount < hintParts.length) {
          return ' ' + hintParts.slice(typedArgCount).join(' ');
        }
      }
      return '';
    }
  }

  // Standard prefix completion
  const suggestions = getAutocompleteSuggestions(input, registry);
  if (suggestions.length === 0) return '';

  for (const suggestion of suggestions) {
    if (suggestion.startsWith(trimmed) && suggestion.length > trimmed.length) {
      return suggestion.slice(trimmed.length);
    }
  }

  return '';
}
