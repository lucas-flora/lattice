/**
 * Preset loading module.
 *
 * Parses YAML presets, validates against Zod schema, returns typed PresetConfig.
 */
export { PresetSchema } from './schema';
export { loadPreset, loadPresetOrThrow } from './loader';
export type {
  PresetConfig,
  PresetValidationResult,
  PresetValidationError,
  PresetValidationSuccess,
} from './types';
