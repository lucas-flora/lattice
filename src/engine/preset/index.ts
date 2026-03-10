/**
 * Preset loading module.
 *
 * Parses YAML presets, validates against Zod schema, returns typed PresetConfig.
 * Includes built-in preset registry — loaded through the same path as user-supplied presets.
 */
export { PresetSchema } from './schema';
export { loadPreset, loadPresetOrThrow } from './loader';
export {
  loadBuiltinPreset,
  loadBuiltinPresetYaml,
  loadAllBuiltinPresets,
  BUILTIN_PRESET_NAMES,
} from './builtinPresets';
export type { BuiltinPresetName } from './builtinPresets';
export type {
  PresetConfig,
  PresetValidationResult,
  PresetValidationError,
  PresetValidationSuccess,
} from './types';
