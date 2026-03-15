/**
 * Schema tests for Phase 5 scripting extensions:
 * global_variables, global_scripts, expression on properties.
 */

import { describe, it, expect } from 'vitest';
import { PresetSchema } from '../schema';

const basePreset = {
  schema_version: '1',
  meta: { name: 'Schema Test' },
  grid: { dimensionality: '2d', width: 8, height: 8, topology: 'toroidal' },
  cell_properties: [{ name: 'alive', type: 'bool', default: 0 }],
  rule: { type: 'typescript', compute: 'return 0;' },
};

describe('PresetSchema — scripting extensions', () => {
  it('TestPresetSchema_AcceptsGlobalVariables', () => {
    const preset = {
      ...basePreset,
      global_variables: [
        { name: 'feedRate', type: 'float', default: 0.055 },
        { name: 'killRate', type: 'float', default: 0.062 },
        { name: 'mode', type: 'string', default: 'auto' },
      ],
    };
    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(true);
  });

  it('TestPresetSchema_AcceptsGlobalScripts', () => {
    const preset = {
      ...basePreset,
      global_scripts: [
        {
          name: 'entropy',
          enabled: true,
          inputs: ['alive'],
          outputs: ['entropy'],
          code: 'glob["entropy"] = 0.5',
        },
        {
          name: 'logger',
          code: 'pass',
        },
      ],
    };
    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(true);
  });

  it('TestPresetSchema_AcceptsPropertyExpression', () => {
    const preset = {
      ...basePreset,
      cell_properties: [
        { name: 'alive', type: 'bool', default: 0 },
        { name: 'alpha', type: 'float', default: 1.0, expression: 'clamp(cell["age"] / 50.0)' },
      ],
    };
    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(true);
  });

  it('TestPresetSchema_ExistingPresetsUnaffected', () => {
    // No scripting fields — still valid
    const result = PresetSchema.safeParse(basePreset);
    expect(result.success).toBe(true);
  });

  it('TestPresetSchema_GlobalVariablesOptional', () => {
    const preset = { ...basePreset };
    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.global_variables).toBeUndefined();
    }
  });

  it('TestPresetSchema_GlobalScriptsOptional', () => {
    const preset = { ...basePreset };
    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.global_scripts).toBeUndefined();
    }
  });

  it('TestPresetSchema_AllScriptingFieldsTogether', () => {
    const preset = {
      ...basePreset,
      cell_properties: [
        { name: 'alive', type: 'bool', default: 0 },
        { name: 'alpha', type: 'float', default: 1.0, expression: 'clamp(cell["age"] / 50.0)' },
      ],
      global_variables: [
        { name: 'entropy', type: 'float', default: 0 },
      ],
      global_scripts: [
        { name: 'compute_entropy', enabled: true, code: 'glob["entropy"] = 0.5' },
      ],
    };
    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(true);
  });
});
