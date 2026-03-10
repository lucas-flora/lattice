import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { loadPreset, loadPresetOrThrow } from '../loader';

function readFixture(name: string): string {
  return readFileSync(resolve(__dirname, '../../../../test/fixtures', name), 'utf-8');
}

describe('loadPreset - valid YAML', () => {
  it('TestLoader_ValidYamlReturnsConfig', () => {
    const yaml = `
schema_version: "1"
meta:
  name: "Test"
grid:
  dimensionality: "2d"
  width: 10
  height: 10
  topology: "toroidal"
cell_properties:
  - name: "state"
    type: "float"
    default: 0
rule:
  type: "typescript"
  compute: "return 0;"
`;
    const result = loadPreset(yaml);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.config.schema_version).toBe('1');
      expect(result.config.meta.name).toBe('Test');
      expect(result.config.grid.width).toBe(10);
      expect(result.config.cell_properties).toHaveLength(1);
    }
  });
});

describe('loadPreset - invalid YAML', () => {
  it('TestLoader_InvalidYamlReturnsErrors', () => {
    const yaml = `
schema_version: "1"
meta: {}
grid:
  dimensionality: "2d"
  width: 10
  height: 10
  topology: "toroidal"
cell_properties:
  - name: "state"
    type: "float"
    default: 0
rule:
  type: "typescript"
  compute: "return 0;"
`;
    const result = loadPreset(yaml);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('path');
      expect(result.errors[0]).toHaveProperty('message');
    }
  });

  it('TestLoader_ErrorPathPointsToField_MetaName', () => {
    const yaml = `
schema_version: "1"
meta: {}
grid:
  dimensionality: "2d"
  width: 10
  height: 10
  topology: "toroidal"
cell_properties:
  - name: "state"
    type: "float"
    default: 0
rule:
  type: "typescript"
  compute: "return 0;"
`;
    const result = loadPreset(yaml);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const nameError = result.errors.find(
        (e) => e.path.includes('meta') && e.path.includes('name'),
      );
      expect(nameError).toBeDefined();
    }
  });

  it('TestLoader_ErrorPathPointsToField_SchemaVersion', () => {
    const yaml = `
schema_version: "2"
meta:
  name: "Bad Version"
grid:
  dimensionality: "2d"
  width: 10
  height: 10
  topology: "toroidal"
cell_properties:
  - name: "state"
    type: "float"
    default: 0
rule:
  type: "typescript"
  compute: "return 0;"
`;
    const result = loadPreset(yaml);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const versionError = result.errors.find(
        (e) => e.path.includes('schema_version'),
      );
      expect(versionError).toBeDefined();
    }
  });
});

describe('loadPreset - malformed YAML', () => {
  it('TestLoader_MalformedYamlReturnsParseError', () => {
    const result = loadPreset('{{{{not valid yaml at all}}}}:::');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0].message).toContain('YAML parse error');
    }
  });
});

describe('loadPresetOrThrow', () => {
  it('TestLoader_LoadPresetOrThrowThrows', () => {
    const yaml = `
schema_version: "2"
meta:
  name: "Bad"
grid:
  dimensionality: "2d"
  width: 10
  height: 10
  topology: "toroidal"
cell_properties:
  - name: "state"
    type: "float"
    default: 0
rule:
  type: "typescript"
  compute: "return 0;"
`;
    expect(() => loadPresetOrThrow(yaml)).toThrow('Preset validation failed');
  });

  it('TestLoader_LoadPresetOrThrowReturns', () => {
    const yaml = `
schema_version: "1"
meta:
  name: "Valid"
grid:
  dimensionality: "2d"
  width: 10
  height: 10
  topology: "toroidal"
cell_properties:
  - name: "state"
    type: "float"
    default: 0
rule:
  type: "typescript"
  compute: "return 0;"
`;
    const config = loadPresetOrThrow(yaml);
    expect(config.meta.name).toBe('Valid');
    expect(config.schema_version).toBe('1');
  });
});

describe('loadPreset - fixture files', () => {
  it('TestLoader_FullFixtureFile', () => {
    const yaml = readFixture('valid-preset.yaml');
    const result = loadPreset(yaml);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.config.schema_version).toBe('1');
      expect(result.config.meta.name).toBe('Test Simulation');
      expect(result.config.meta.author).toBe('Test Author');
      expect(result.config.grid.dimensionality).toBe('2d');
      expect(result.config.grid.width).toBe(64);
      expect(result.config.cell_properties).toHaveLength(3);
      expect(result.config.visual_mappings).toHaveLength(2);
      expect(result.config.ai_context).toBeDefined();
      expect(result.config.ai_context!.hints).toHaveLength(2);
    }
  });

  it('TestLoader_MinimalFixtureFile', () => {
    const yaml = readFixture('minimal-preset.yaml');
    const result = loadPreset(yaml);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.config.meta.name).toBe('Minimal Test');
      expect(result.config.grid.dimensionality).toBe('1d');
      expect(result.config.grid.width).toBe(100);
      expect(result.config.visual_mappings).toBeUndefined();
      expect(result.config.ai_context).toBeUndefined();
    }
  });

  it('TestLoader_InvalidFixtureMissingField', () => {
    const yaml = readFixture('invalid-preset-missing-field.yaml');
    const result = loadPreset(yaml);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const nameError = result.errors.find(
        (e) => e.path.includes('meta') && e.path.includes('name'),
      );
      expect(nameError).toBeDefined();
    }
  });

  it('TestLoader_InvalidFixtureBadVersion', () => {
    const yaml = readFixture('invalid-preset-bad-version.yaml');
    const result = loadPreset(yaml);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const versionError = result.errors.find(
        (e) => e.path.includes('schema_version'),
      );
      expect(versionError).toBeDefined();
    }
  });
});
