import { describe, it, expect } from 'vitest';
import { PresetSchema } from '../schema';

describe('PresetSchema - valid presets', () => {
  it('TestPresetSchema_ValidFullPreset', () => {
    const preset = {
      schema_version: '1',
      meta: {
        name: 'Test Simulation',
        author: 'Test Author',
        description: 'A test preset',
        tags: ['test'],
      },
      grid: {
        dimensionality: '2d',
        width: 64,
        height: 64,
        topology: 'toroidal',
      },
      cell_properties: [
        { name: 'alive', type: 'bool', default: 0, role: 'input_output' },
        { name: 'age', type: 'int', default: 0, role: 'output' },
      ],
      rule: {
        type: 'typescript',
        compute: 'return 0;',
      },
      visual_mappings: [
        {
          property: 'alive',
          channel: 'color',
          mapping: { '0': '#000', '1': '#fff' },
        },
      ],
      ai_context: {
        description: 'A test simulation',
        hints: ['hint 1'],
      },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(true);
  });

  it('TestPresetSchema_ValidMinimalPreset', () => {
    const preset = {
      schema_version: '1',
      meta: { name: 'Minimal' },
      grid: { dimensionality: '1d', width: 100, topology: 'finite' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'typescript', compute: 'return 0;' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(true);
  });
});

describe('PresetSchema - schema_version validation', () => {
  it('TestPresetSchema_SchemaVersionRequired', () => {
    const preset = {
      meta: { name: 'No Version' },
      grid: { dimensionality: '2d', width: 10, height: 10, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'typescript', compute: 'return 0;' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(false);
    if (!result.success) {
      const versionError = result.error.issues.find(
        (i) => i.path.includes('schema_version'),
      );
      expect(versionError).toBeDefined();
    }
  });

  it('TestPresetSchema_SchemaVersionMustBeString1_WrongVersion', () => {
    const preset = {
      schema_version: '2',
      meta: { name: 'Wrong Version' },
      grid: { dimensionality: '2d', width: 10, height: 10, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'typescript', compute: 'return 0;' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(false);
    if (!result.success) {
      const versionError = result.error.issues.find(
        (i) => i.path.includes('schema_version'),
      );
      expect(versionError).toBeDefined();
      expect(versionError!.message).toContain("'1'");
    }
  });

  it('TestPresetSchema_SchemaVersionMustBeString1_NumberFails', () => {
    const preset = {
      schema_version: 1, // number, not string
      meta: { name: 'Numeric Version' },
      grid: { dimensionality: '2d', width: 10, height: 10, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'typescript', compute: 'return 0;' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(false);
  });
});

describe('PresetSchema - meta validation', () => {
  it('TestPresetSchema_MetaNameRequired', () => {
    const preset = {
      schema_version: '1',
      meta: {},
      grid: { dimensionality: '2d', width: 10, height: 10, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'typescript', compute: 'return 0;' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameError = result.error.issues.find(
        (i) => i.path.includes('meta') && i.path.includes('name'),
      );
      expect(nameError).toBeDefined();
    }
  });
});

describe('PresetSchema - grid validation', () => {
  it('TestPresetSchema_GridHeight_RequiredFor2D', () => {
    const preset = {
      schema_version: '1',
      meta: { name: 'No Height 2D' },
      grid: { dimensionality: '2d', width: 10, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'typescript', compute: 'return 0;' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(false);
    if (!result.success) {
      const heightError = result.error.issues.find(
        (i) => i.path.some((p) => String(p) === 'height'),
      );
      expect(heightError).toBeDefined();
    }
  });

  it('TestPresetSchema_GridDepth_RequiredFor3D', () => {
    const preset = {
      schema_version: '1',
      meta: { name: 'No Depth 3D' },
      grid: { dimensionality: '3d', width: 10, height: 10, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'typescript', compute: 'return 0;' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(false);
    if (!result.success) {
      const depthError = result.error.issues.find(
        (i) => i.path.some((p) => String(p) === 'depth'),
      );
      expect(depthError).toBeDefined();
    }
  });

  it('TestPresetSchema_GridHeight_OptionalFor1D', () => {
    const preset = {
      schema_version: '1',
      meta: { name: '1D No Height' },
      grid: { dimensionality: '1d', width: 100, topology: 'finite' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'typescript', compute: 'return 0;' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(true);
  });
});

describe('PresetSchema - cell_properties validation', () => {
  it('TestPresetSchema_CellPropertiesRequired', () => {
    const preset = {
      schema_version: '1',
      meta: { name: 'No Props' },
      grid: { dimensionality: '2d', width: 10, height: 10, topology: 'toroidal' },
      cell_properties: [],
      rule: { type: 'typescript', compute: 'return 0;' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(false);
  });

  it('TestPresetSchema_CellPropertiesMissing', () => {
    const preset = {
      schema_version: '1',
      meta: { name: 'Missing Props' },
      grid: { dimensionality: '2d', width: 10, height: 10, topology: 'toroidal' },
      rule: { type: 'typescript', compute: 'return 0;' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(false);
  });

  it('TestPresetSchema_CellPropertyTypeValidation', () => {
    const preset = {
      schema_version: '1',
      meta: { name: 'Bad Type' },
      grid: { dimensionality: '2d', width: 10, height: 10, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'string', default: 0 }],
      rule: { type: 'typescript', compute: 'return 0;' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(false);
  });

  it('TestPresetSchema_CellPropertyValidTypes', () => {
    const validTypes = ['bool', 'int', 'float', 'vec2', 'vec3', 'vec4'];
    for (const type of validTypes) {
      const defaultVal = type.startsWith('vec')
        ? new Array(parseInt(type.slice(3))).fill(0)
        : 0;
      const preset = {
        schema_version: '1',
        meta: { name: 'Valid Type' },
        grid: { dimensionality: '2d', width: 10, height: 10, topology: 'toroidal' },
        cell_properties: [{ name: 'state', type, default: defaultVal }],
        rule: { type: 'typescript', compute: 'return 0;' },
      };

      const result = PresetSchema.safeParse(preset);
      expect(result.success).toBe(true);
    }
  });
});

describe('PresetSchema - rule validation', () => {
  it('TestPresetSchema_RuleComputeRequired', () => {
    const preset = {
      schema_version: '1',
      meta: { name: 'No Compute' },
      grid: { dimensionality: '2d', width: 10, height: 10, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'typescript' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(false);
  });

  it('TestPresetSchema_RuleComputeEmptyFails', () => {
    const preset = {
      schema_version: '1',
      meta: { name: 'Empty Compute' },
      grid: { dimensionality: '2d', width: 10, height: 10, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'typescript', compute: '' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(false);
  });
});

describe('PresetSchema - optional sections', () => {
  it('TestPresetSchema_VisualMappingsOptional', () => {
    const preset = {
      schema_version: '1',
      meta: { name: 'No Visual' },
      grid: { dimensionality: '2d', width: 10, height: 10, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'typescript', compute: 'return 0;' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(true);
  });

  it('TestPresetSchema_AiContextOptional', () => {
    const preset = {
      schema_version: '1',
      meta: { name: 'No AI Context' },
      grid: { dimensionality: '2d', width: 10, height: 10, topology: 'toroidal' },
      cell_properties: [{ name: 'state', type: 'float', default: 0 }],
      rule: { type: 'typescript', compute: 'return 0;' },
    };

    const result = PresetSchema.safeParse(preset);
    expect(result.success).toBe(true);
  });
});
