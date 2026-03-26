/**
 * Preset registry — loads presets from the YAML source files.
 *
 * Uses raw-loader (configured in next.config.ts) to import .yaml files
 * as strings at build time. One source of truth — no inlined copies.
 *
 * KNOWN ISSUE / MIGRATION PLAN:
 * This local-file approach is a stopgap. Production will load presets from
 * a Supabase table (upcoming sprint). When that lands:
 *   - Gate this YAML-import path behind NEXT_PUBLIC_PRESETS_SOURCE=local
 *   - Add a Supabase fetch path as the default
 *   - Keep this path alive for local dev (fast YAML iteration without DB)
 */

import { loadPresetOrThrow } from './loader';
import type { PresetConfig } from './types';

// Import YAML files as raw strings via bundler (raw-loader / Turbopack)
import conwaysGolYaml from './builtins/conways-gol.yaml';
import conwaysAdvancedYaml from './builtins/conways-advanced.yaml';
import rule110Yaml from './builtins/rule-110.yaml';
import langtonsAntYaml from './builtins/langtons-ant.yaml';
import briansBrainYaml from './builtins/brians-brain.yaml';
import grayScottYaml from './builtins/gray-scott.yaml';
import navierStokesYaml from './builtins/navier-stokes.yaml';
import fireYaml from './builtins/fire.yaml';
import linkTestbedYaml from './builtins/link-testbed.yaml';
import seedsYaml from './builtins/seeds.yaml';

/** Names of all shipped presets */
export const BUILTIN_PRESET_NAMES_CLIENT = [
  'conways-gol',
  'conways-advanced',
  'rule-110',
  'langtons-ant',
  'brians-brain',
  'gray-scott',
  'navier-stokes',
  'fire',
  'link-testbed',
  'seeds',
] as const;

export type BuiltinPresetNameClient = (typeof BUILTIN_PRESET_NAMES_CLIENT)[number];

/** Map preset names to their raw YAML strings (imported at build time) */
const PRESET_YAMLS: Record<BuiltinPresetNameClient, string> = {
  'conways-gol': conwaysGolYaml,
  'conways-advanced': conwaysAdvancedYaml,
  'rule-110': rule110Yaml,
  'langtons-ant': langtonsAntYaml,
  'brians-brain': briansBrainYaml,
  'gray-scott': grayScottYaml,
  'navier-stokes': navierStokesYaml,
  'fire': fireYaml,
  'link-testbed': linkTestbedYaml,
  'seeds': seedsYaml,
};

/** Parse cache — avoid re-parsing the same YAML on repeated loads */
const cache = new Map<string, PresetConfig>();

/**
 * Load a preset by name. Parses from the YAML source file (cached).
 */
export function loadBuiltinPresetClient(name: BuiltinPresetNameClient): PresetConfig {
  const cached = cache.get(name);
  if (cached) return cached;
  const yaml = PRESET_YAMLS[name];
  if (!yaml) throw new Error(`Unknown preset: "${name}"`);
  const config = loadPresetOrThrow(yaml);
  cache.set(name, config);
  return config;
}
