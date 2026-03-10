/**
 * CLI command parser for the terminal.
 *
 * Converts user input like "sim play" into registry calls like "sim.play".
 * Handles argument parsing, hyphen-to-camelCase conversion, and autocomplete.
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
 */
const PARAM_MAPPINGS: Record<string, string[]> = {
  'sim.speed': ['fps'],
  'sim.seek': ['generation'],
  'preset.load': ['name'],
  'edit.draw': ['x', 'y'],
  'edit.erase': ['x', 'y'],
  'edit.brushSize': ['size'],
  'view.zoom': ['level'],
  'view.pan': ['x', 'y'],
};

/**
 * Parse a CLI input string into a command name and params.
 * Returns null if the input is empty or doesn't match any command pattern.
 */
export function parseCommand(input: string, registry?: CommandRegistry): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  if (parts.length < 1) return null;

  const category = parts[0];
  const action = parts.length >= 2 ? parts[1] : null;
  const args = parts.slice(2);

  // Try category.action format
  if (action) {
    const camelAction = hyphenToCamelCase(action);
    const commandName = `${category}.${camelAction}`;

    // If we have a registry, verify the command exists
    if (registry && !registry.has(commandName)) {
      // Try just the category (e.g., "help" or some single-word command)
      if (!registry.has(category)) {
        return null;
      }
    }

    // Map positional args to named params
    const paramNames = PARAM_MAPPINGS[commandName] || [];
    const params: Record<string, unknown> = {};

    for (let i = 0; i < paramNames.length && i < args.length; i++) {
      const value = args[i];
      // Auto-detect numbers
      const numValue = Number(value);
      params[paramNames[i]] = isNaN(numValue) ? value : numValue;
    }

    return { commandName, params };
  }

  // Single word -- could be a category-level command
  if (registry && registry.has(category)) {
    return { commandName: category, params: {} };
  }

  return null;
}

/**
 * Check if input starts with a valid command prefix.
 */
export function isCommand(input: string, registry: CommandRegistry): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;

  const parts = trimmed.split(/\s+/);
  const category = parts[0];

  // Check if any command starts with this category
  const commands = registry.list();
  return commands.some((cmd) => cmd.category === category || cmd.name.startsWith(category + '.'));
}

/**
 * Get autocomplete suggestions for the current input.
 * Returns an array of suggested completions (full command strings).
 */
export function getAutocompleteSuggestions(input: string, registry: CommandRegistry): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const commands = registry.list();
  const parts = trimmed.split(/\s+/);
  const category = parts[0];

  if (parts.length === 1) {
    // User is typing the category -- suggest matching categories
    const categories = new Set(commands.map((c) => c.category));
    return [...categories].filter((cat) => cat.startsWith(category)).map((cat) => cat);
  }

  if (parts.length === 2) {
    // User is typing the action -- suggest matching actions
    const action = parts[1];
    const matchingCommands = commands.filter((cmd) => cmd.category === category);
    return matchingCommands
      .map((cmd) => {
        const cmdAction = cmd.name.split('.')[1];
        // Convert camelCase to hyphenated for CLI display
        const cliAction = cmdAction.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${category} ${cliAction}`;
      })
      .filter((suggestion) => suggestion.startsWith(trimmed));
  }

  return [];
}

/**
 * Get the single best ghost-text suggestion for the input.
 * Returns the completion string (the part after the current input), or empty string.
 */
export function getGhostText(input: string, registry: CommandRegistry): string {
  const suggestions = getAutocompleteSuggestions(input, registry);
  if (suggestions.length === 0) return '';

  // Find the first suggestion that extends the current input
  const trimmed = input.trim();
  for (const suggestion of suggestions) {
    if (suggestion.startsWith(trimmed) && suggestion.length > trimmed.length) {
      return suggestion.slice(trimmed.length);
    }
  }

  return '';
}
