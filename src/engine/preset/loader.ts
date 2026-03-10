/**
 * Preset loader: YAML string to validated PresetConfig.
 *
 * Pipeline: YAML.parse() -> Zod safeParse() -> typed result or error
 */

import YAML from 'yaml';
import { PresetSchema } from './schema';
import type { PresetValidationResult, PresetConfig } from './types';

/**
 * Parse and validate a YAML preset string.
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

  // Step 2: Validate with Zod
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
 * Parse and validate a YAML preset string, throwing on failure.
 *
 * @param yamlString - Raw YAML string
 * @returns Typed PresetConfig
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
