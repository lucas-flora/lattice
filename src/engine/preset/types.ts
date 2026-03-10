/**
 * Preset type definitions inferred from the Zod schema.
 */

import { z } from 'zod';
import { PresetSchema } from './schema';

/** Validated preset configuration type (inferred from Zod schema) */
export type PresetConfig = z.infer<typeof PresetSchema>;

/** Validation error with field path */
export interface PresetValidationError {
  valid: false;
  errors: Array<{
    path: string[];
    message: string;
  }>;
}

/** Successful validation result */
export interface PresetValidationSuccess {
  valid: true;
  config: PresetConfig;
}

/** Result of preset validation */
export type PresetValidationResult = PresetValidationSuccess | PresetValidationError;
