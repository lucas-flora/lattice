/**
 * Preset loading module.
 *
 * Parses YAML presets, validates against Zod schema, returns typed PresetConfig.
 * Supports both v1 (flat) and v2 (scene-graph tree) preset formats.
 * Includes built-in preset registry — loaded through the same path as user-supplied presets.
 */
export { PresetSchema, PresetV2Schema } from './schema';
export type { PresetV2Config, SceneNodeV2, TagV2 } from './schema';
export {
  loadPreset,
  loadPresetOrThrow,
  loadPresetV2,
  loadPresetV2OrThrow,
  loadPresetAny,
} from './loader';
export type { PresetAnyValidationResult } from './loader';
export { serializeSceneGraph } from './serializer';
export {
  loadBuiltinPreset,
  loadBuiltinPresetYaml,
  loadAllBuiltinPresets,
  BUILTIN_PRESET_NAMES,
} from './builtinPresets';
export type { BuiltinPresetName } from './builtinPresets';
export type {
  PresetConfig,
  PresetV2Config as PresetV2ConfigType,
  PresetValidationResult,
  PresetV2ValidationResult,
  PresetValidationError,
  PresetValidationSuccess,
  PresetV2ValidationSuccess,
} from './types';
