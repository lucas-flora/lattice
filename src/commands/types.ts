/**
 * Command system type definitions.
 *
 * Defines the CommandRegistry interface, command definitions, and result types.
 * Every app action is registered as a command with typed params and metadata.
 */

import type { z } from 'zod';

/**
 * Definition of a single command in the registry.
 * Commands are the architectural hub -- GUI buttons and CLI both invoke these.
 */
export interface CommandDefinition {
  /** Dot-notation name: "sim.play", "preset.load", etc. */
  name: string;
  /** Human-readable description of what the command does */
  description: string;
  /** Command category: "sim", "preset", "view", "edit", "ui" */
  category: string;
  /** Zod schema for parameter validation */
  params: z.ZodType;
  /** The command handler -- always async for future-proofing (Worker communication) */
  execute: (params: unknown) => Promise<CommandResult>;
}

/**
 * Result of executing a command.
 * Commands never throw -- they return error results.
 */
export interface CommandResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Entry in the command catalog returned by CommandRegistry.list().
 * Contains metadata sufficient for both GUI rendering and CLI invocation.
 */
export interface CommandCatalogEntry {
  /** Dot-notation command name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Command category */
  category: string;
  /** String description of the parameter schema */
  paramsDescription: string;
}
