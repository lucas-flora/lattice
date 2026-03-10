import { describe, it, expect } from 'vitest';
import { VisualMapper } from '../VisualMapper';
import { loadBuiltinPreset } from '@/engine/preset/builtinPresets';
import { loadPresetOrThrow } from '@/engine/preset/loader';

describe('VisualMapper', () => {
  it('TestVisualMapper_MapsColorFromYamlConfig', () => {
    const preset = loadBuiltinPreset('conways-gol');
    const mapper = new VisualMapper(preset);

    // alive=1 should map to green (#00ff00)
    const aliveColor = mapper.getColor('alive', 1);
    expect(aliveColor.r).toBeCloseTo(0);
    expect(aliveColor.g).toBeCloseTo(1);
    expect(aliveColor.b).toBeCloseTo(0);

    // alive=0 should map to black (#000000)
    const deadColor = mapper.getColor('alive', 0);
    expect(deadColor.r).toBeCloseTo(0);
    expect(deadColor.g).toBeCloseTo(0);
    expect(deadColor.b).toBeCloseTo(0);
  });

  it('TestVisualMapper_ReturnsDefaultColor_WhenNoMapping', () => {
    const preset = loadBuiltinPreset('conways-gol');
    const mapper = new VisualMapper(preset);

    // Unknown property should return default color (black)
    const color = mapper.getColor('nonexistent', 1);
    expect(color.r).toBeCloseTo(0);
    expect(color.g).toBeCloseTo(0);
    expect(color.b).toBeCloseTo(0);
  });

  it('TestVisualMapper_HandlesMultipleMappings', () => {
    // Rule 110 has different colors: 0=white, 1=black
    const preset = loadBuiltinPreset('rule-110');
    const mapper = new VisualMapper(preset);

    const offColor = mapper.getColor('state', 0);
    // white = #ffffff
    expect(offColor.r).toBeCloseTo(1);
    expect(offColor.g).toBeCloseTo(1);
    expect(offColor.b).toBeCloseTo(1);

    const onColor = mapper.getColor('state', 1);
    // black = #000000
    expect(onColor.r).toBeCloseTo(0);
    expect(onColor.g).toBeCloseTo(0);
    expect(onColor.b).toBeCloseTo(0);
  });

  it('TestVisualMapper_MapsSizeChannel', () => {
    // Create a preset with size mapping
    const yaml = `
schema_version: "1"
meta:
  name: "Size Test"
grid:
  dimensionality: "2d"
  width: 8
  height: 8
  topology: "toroidal"
cell_properties:
  - name: "alive"
    type: "bool"
    default: 0
rule:
  type: "typescript"
  compute: "return { alive: 0 };"
visual_mappings:
  - property: "alive"
    channel: "size"
    mapping:
      "0": 0.5
      "1": 1.5
`;
    const preset = loadPresetOrThrow(yaml);
    const mapper = new VisualMapper(preset);

    expect(mapper.getSize('alive', 0)).toBeCloseTo(0.5);
    expect(mapper.getSize('alive', 1)).toBeCloseTo(1.5);
    // Unknown returns default 1.0
    expect(mapper.getSize('alive', 99)).toBeCloseTo(1.0);
  });

  it('TestVisualMapper_MapsOrientationChannel', () => {
    const yaml = `
schema_version: "1"
meta:
  name: "Orientation Test"
grid:
  dimensionality: "2d"
  width: 8
  height: 8
  topology: "toroidal"
cell_properties:
  - name: "direction"
    type: "int"
    default: 0
rule:
  type: "typescript"
  compute: "return { direction: 0 };"
visual_mappings:
  - property: "direction"
    channel: "orientation"
    mapping:
      "0": 0
      "1": 1.5708
      "2": 3.1416
      "3": 4.7124
`;
    const preset = loadPresetOrThrow(yaml);
    const mapper = new VisualMapper(preset);

    expect(mapper.getOrientation('direction', 0)).toBeCloseTo(0);
    expect(mapper.getOrientation('direction', 1)).toBeCloseTo(1.5708);
    expect(mapper.getOrientation('direction', 2)).toBeCloseTo(3.1416);
    expect(mapper.getOrientation('direction', 3)).toBeCloseTo(4.7124);
  });

  it('TestVisualMapper_GetsPrimaryColorProperty', () => {
    const preset = loadBuiltinPreset('conways-gol');
    const mapper = new VisualMapper(preset);

    expect(mapper.getPrimaryColorProperty()).toBe('alive');
  });

  it('TestVisualMapper_HandlesEmptyMappings', () => {
    const yaml = `
schema_version: "1"
meta:
  name: "No Mappings"
grid:
  dimensionality: "2d"
  width: 8
  height: 8
  topology: "toroidal"
cell_properties:
  - name: "alive"
    type: "bool"
    default: 0
rule:
  type: "typescript"
  compute: "return { alive: 0 };"
`;
    const preset = loadPresetOrThrow(yaml);
    const mapper = new VisualMapper(preset);

    // Should create default mapping for first bool property
    expect(mapper.hasColorMapping('alive')).toBe(true);
    expect(mapper.getPrimaryColorProperty()).toBe('alive');

    // Default mapping: 0=black, 1=green
    const deadColor = mapper.getColor('alive', 0);
    expect(deadColor.r).toBeCloseTo(0);
    expect(deadColor.g).toBeCloseTo(0);
    expect(deadColor.b).toBeCloseTo(0);

    const aliveColor = mapper.getColor('alive', 1);
    expect(aliveColor.r).toBeCloseTo(0);
    expect(aliveColor.g).toBeCloseTo(1);
    expect(aliveColor.b).toBeCloseTo(0);
  });

  it('TestVisualMapper_DataDrivenChange', () => {
    // Verify that different visual_mappings produce different results (RNDR-07)
    const golPreset = loadBuiltinPreset('conways-gol');
    const golMapper = new VisualMapper(golPreset);

    const rule110Preset = loadBuiltinPreset('rule-110');
    const rule110Mapper = new VisualMapper(rule110Preset);

    // GoL alive=1 -> green
    const golAlive = golMapper.getColor('alive', 1);
    // Rule 110 state=1 -> black
    const r110Active = rule110Mapper.getColor('state', 1);

    // Different presets produce different colors for the "active" state
    expect(golAlive.g).not.toBeCloseTo(r110Active.g);
  });

  it('TestVisualMapper_HasSizeMapping', () => {
    const yaml = `
schema_version: "1"
meta:
  name: "Mixed Channels"
grid:
  dimensionality: "2d"
  width: 8
  height: 8
  topology: "toroidal"
cell_properties:
  - name: "alive"
    type: "bool"
    default: 0
rule:
  type: "typescript"
  compute: "return { alive: 0 };"
visual_mappings:
  - property: "alive"
    channel: "color"
    mapping:
      "0": "#000000"
      "1": "#ff0000"
  - property: "alive"
    channel: "size"
    mapping:
      "0": 0.2
      "1": 1.0
`;
    const preset = loadPresetOrThrow(yaml);
    const mapper = new VisualMapper(preset);

    expect(mapper.hasColorMapping('alive')).toBe(true);
    expect(mapper.hasSizeMapping('alive')).toBe(true);
    expect(mapper.getPrimarySizeProperty()).toBe('alive');
  });
});
