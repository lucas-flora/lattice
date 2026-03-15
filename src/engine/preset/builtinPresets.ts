/**
 * Built-in preset registry.
 *
 * Built-in presets are loaded from YAML files through the same loadPresetOrThrow()
 * path as user-supplied presets. No privilege distinction — YAML-10.
 *
 * In a Node.js/test environment, presets are loaded from the filesystem.
 * In the browser, presets will be bundled at build time.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadPresetOrThrow } from './loader';
import type { PresetConfig } from './types';

/** Names of all built-in presets */
export const BUILTIN_PRESET_NAMES = [
  'conways-gol',
  'rule-110',
  'langtons-ant',
  'brians-brain',
  'gray-scott',
  'navier-stokes',
  'link-testbed',
] as const;

export type BuiltinPresetName = (typeof BUILTIN_PRESET_NAMES)[number];

/**
 * Resolve the builtins directory path.
 * Uses import.meta.url for ESM compatibility.
 */
function getBuiltinsDir(): string {
  // In Vitest/Node ESM, import.meta.url gives us the file URL of this module
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, 'builtins');
}

/**
 * Load a built-in preset by name.
 * Uses the same loadPresetOrThrow() as user-supplied presets — no privilege difference.
 */
export function loadBuiltinPreset(name: BuiltinPresetName): PresetConfig {
  const yamlString = loadBuiltinPresetYaml(name);
  return loadPresetOrThrow(yamlString);
}

/**
 * Load the raw YAML string for a built-in preset.
 */
export function loadBuiltinPresetYaml(name: BuiltinPresetName): string {
  const builtinsDir = getBuiltinsDir();
  const filePath = resolve(builtinsDir, `${name}.yaml`);
  return readFileSync(filePath, 'utf-8');
}

/**
 * Load all built-in presets.
 */
export function loadAllBuiltinPresets(): Map<BuiltinPresetName, PresetConfig> {
  const map = new Map<BuiltinPresetName, PresetConfig>();
  for (const name of BUILTIN_PRESET_NAMES) {
    map.set(name, loadBuiltinPreset(name));
  }
  return map;
}
