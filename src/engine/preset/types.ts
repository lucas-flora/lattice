/**
 * Preset type definitions inferred from the Zod schema.
 */

import { z } from 'zod';
import { PresetSchema, PresetV2Schema } from './schema';

/** Validated preset configuration type (inferred from Zod schema) */
export type PresetConfig = z.infer<typeof PresetSchema>;

/** Validated v2 preset configuration type */
export type PresetV2Config = z.infer<typeof PresetV2Schema>;

/** Validation error with field path */
export interface PresetValidationError {
  valid: false;
  errors: Array<{
    path: string[];
    message: string;
  }>;
}

/** Successful v1 validation result */
export interface PresetValidationSuccess {
  valid: true;
  config: PresetConfig;
}

/** Successful v2 validation result */
export interface PresetV2ValidationSuccess {
  valid: true;
  config: PresetV2Config;
}

/** Result of preset validation (v1) */
export type PresetValidationResult = PresetValidationSuccess | PresetValidationError;

/** Result of preset validation (v2) */
export type PresetV2ValidationResult = PresetV2ValidationSuccess | PresetValidationError;
