/**
 * Preset loader: YAML string to validated PresetConfig.
 *
 * Pipeline: YAML.parse() -> detect schema_version -> Zod safeParse() -> typed result or error
 *
 * Supports both v1 (flat structure) and v2 (scene-graph tree) presets.
 * Built-in presets remain v1. User presets can use either version.
 */

import YAML from 'yaml';
import { PresetSchema, PresetV2Schema } from './schema';
import type {
  PresetValidationResult,
  PresetV2ValidationResult,
  PresetConfig,
  PresetV2Config,
} from './types';

/**
 * Parse and validate a v1 YAML preset string.
 *
 * @param yamlString - Raw YAML string
 * @returns Validation result with either typed config or error details
 */
export function loadPreset(yamlString: string): PresetValidationResult {
  // Step 1: Parse YAML
  let parsed: unknown;
  try {
    parsed = YAML.parse(yamlString);
  } catch (err) {
    return {
      valid: false,
      errors: [
        {
          path: [],
          message: `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }

  // Step 2: Validate with Zod (v1 only — use loadPresetAny for version-agnostic loading)
  const result = PresetSchema.safeParse(parsed);

  if (result.success) {
    return { valid: true, config: result.data };
  }

  // Step 3: Map Zod errors to user-friendly format
  return {
    valid: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.map(String),
      message: issue.message,
    })),
  };
}

/**
 * Parse and validate a v2 YAML preset string.
 *
 * @param yamlString - Raw YAML string
 * @returns Validation result with either typed v2 config or error details
 */
export function loadPresetV2(yamlString: string): PresetV2ValidationResult {
  let parsed: unknown;
  try {
    parsed = YAML.parse(yamlString);
  } catch (err) {
    return {
      valid: false,
      errors: [
        {
          path: [],
          message: `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }

  const result = PresetV2Schema.safeParse(parsed);

  if (result.success) {
    return { valid: true, config: result.data };
  }

  return {
    valid: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.map(String),
      message: issue.message,
    })),
  };
}

/** Union result from loadPresetAny */
export type PresetAnyValidationResult =
  | { valid: true; version: '1'; config: PresetConfig }
  | { valid: true; version: '2'; config: PresetV2Config }
  | { valid: false; errors: Array<{ path: string[]; message: string }> };

/**
 * Parse and validate a YAML preset string, auto-detecting schema version.
 *
 * Routes to v1 or v2 validation based on the `schema_version` field.
 * Returns a discriminated union with the version tag.
 */
export function loadPresetAny(yamlString: string): PresetAnyValidationResult {
  let parsed: unknown;
  try {
    parsed = YAML.parse(yamlString);
  } catch (err) {
    return {
      valid: false,
      errors: [
        {
          path: [],
          message: `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }

  // Detect schema version
  const version =
    parsed && typeof parsed === 'object' && 'schema_version' in parsed
      ? (parsed as Record<string, unknown>).schema_version
      : undefined;

  if (version === '2') {
    const result = PresetV2Schema.safeParse(parsed);
    if (result.success) {
      return { valid: true, version: '2', config: result.data };
    }
    return {
      valid: false,
      errors: result.error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
      })),
    };
  }

  // Default: v1 validation (also handles unknown versions — v1 schema
  // will report the specific schema_version error)
  const result = PresetSchema.safeParse(parsed);
  if (result.success) {
    return { valid: true, version: '1', config: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.map(String),
      message: issue.message,
    })),
  };
}

/**
 * Parse and validate a YAML preset string, throwing on failure.
 *
 * @param yamlString - Raw YAML string
 * @returns Typed PresetConfig (v1 only — use loadPresetAny for v2)
 * @throws Error with validation details
 */
export function loadPresetOrThrow(yamlString: string): PresetConfig {
  const result = loadPreset(yamlString);
  if (!result.valid) {
    const errorDetails = result.errors
      .map((e) => `  ${e.path.length > 0 ? e.path.join('.') + ': ' : ''}${e.message}`)
      .join('\n');
    throw new Error(`Preset validation failed:\n${errorDetails}`);
  }
  return result.config;
}

/**
 * Parse and validate a v2 YAML preset string, throwing on failure.
 *
 * @param yamlString - Raw YAML string
 * @returns Typed PresetV2Config
 * @throws Error with validation details
 */
export function loadPresetV2OrThrow(yamlString: string): PresetV2Config {
  const result = loadPresetV2(yamlString);
  if (!result.valid) {
    const errorDetails = result.errors
      .map((e) => `  ${e.path.length > 0 ? e.path.join('.') + ': ' : ''}${e.message}`)
      .join('\n');
    throw new Error(`Preset v2 validation failed:\n${errorDetails}`);
  }
  return result.config;
}
