import { describe, it, expect } from 'vitest';
import { compileRampToIR, type RampMapping } from '../RampCompiler';
import { validateIR } from '../validate';
import { generateWGSL, type WGSLCodegenConfig } from '../WGSLCodegen';

/** Minimal property layout for fire-style presets */
const FIRE_LAYOUT = [
  { name: 'temperature', offset: 0, channels: 1, type: 'f32' as const },
  { name: 'fuel', offset: 1, channels: 1, type: 'f32' as const },
  { name: 'smoke', offset: 2, channels: 1, type: 'f32' as const },
  { name: 'vx', offset: 3, channels: 1, type: 'f32' as const },
  { name: 'vy', offset: 4, channels: 1, type: 'f32' as const },
  { name: 'pressure', offset: 5, channels: 1, type: 'f32' as const },
  { name: 'age', offset: 6, channels: 1, type: 'f32' as const },
  { name: 'alpha', offset: 7, channels: 1, type: 'f32' as const },
  { name: 'colorR', offset: 8, channels: 1, type: 'f32' as const },
  { name: 'colorG', offset: 9, channels: 1, type: 'f32' as const },
  { name: 'colorB', offset: 10, channels: 1, type: 'f32' as const },
  { name: '_cellType', offset: 11, channels: 1, type: 'f32' as const },
];

const FIRE_CONFIG: WGSLCodegenConfig = {
  workgroupSize: [8, 8, 1],
  topology: 'toroidal',
  propertyLayout: FIRE_LAYOUT,
  envParams: [],
  globalParams: [],
  copyAllProperties: true,
};

describe('RampCompiler', () => {
  it('TestRampCompiler_SingleStop_WritesSolidColor', () => {
    const mappings: RampMapping[] = [{
      property: 'temperature',
      channel: 'color',
      type: 'ramp',
      stops: [{ t: 0.5, color: '#ff0000' }],
    }];

    const ir = compileRampToIR(mappings);
    expect(ir.statements.length).toBe(4); // declare t + 3 writes (R, G, B)
    expect(ir.outputs).toHaveLength(3);
    expect(ir.outputs.map(o => o.property)).toEqual(['colorR', 'colorG', 'colorB']);

    const validation = validateIR(ir);
    expect(validation.valid).toBe(true);
  });

  it('TestRampCompiler_TwoStops_ProducesMixSmoothstep', () => {
    const mappings: RampMapping[] = [{
      property: 'temperature',
      channel: 'color',
      type: 'ramp',
      stops: [
        { t: 0.0, color: '#000000' },
        { t: 1.0, color: '#ff6600' },
      ],
    }];

    const ir = compileRampToIR(mappings);
    expect(ir.statements.length).toBe(4); // declare t + 3 writes

    const validation = validateIR(ir);
    expect(validation.valid).toBe(true);

    // Should compile to WGSL
    const wgsl = generateWGSL(ir, FIRE_CONFIG);
    expect(wgsl).toContain('smoothstep');
    expect(wgsl).toContain('mix');
  });

  it('TestRampCompiler_EightStopFireRamp_ValidIRAndWGSL', () => {
    const mappings: RampMapping[] = [{
      property: 'temperature',
      channel: 'color',
      type: 'ramp',
      range: [0.0, 1.0],
      stops: [
        { t: 0.0, color: '#0a0a0a' },
        { t: 0.10, color: '#1a0000' },
        { t: 0.25, color: '#8b0000' },
        { t: 0.40, color: '#cc2200' },
        { t: 0.55, color: '#ff4500' },
        { t: 0.70, color: '#ff8c00' },
        { t: 0.85, color: '#ffd700' },
        { t: 1.0, color: '#ffffee' },
      ],
    }];

    const ir = compileRampToIR(mappings);

    // 1 declare + 3 writes
    expect(ir.statements.length).toBe(4);
    expect(ir.inputs).toHaveLength(1);
    expect(ir.inputs[0].property).toBe('temperature');
    expect(ir.outputs).toHaveLength(3);
    expect(ir.neighborhoodAccess).toBe(false);

    const validation = validateIR(ir);
    expect(validation.valid).toBe(true);

    const wgsl = generateWGSL(ir, FIRE_CONFIG);
    expect(wgsl).toContain('smoothstep');
    expect(wgsl).toContain('setCell');
    // 7 segments = 6 selects
    expect(wgsl).toContain('select');
  });

  it('TestRampCompiler_AlphaChannel_WritesAlpha', () => {
    const mappings: RampMapping[] = [{
      property: 'smoke',
      channel: 'alpha',
      type: 'ramp',
      range: [0.0, 1.0],
      stops: [
        { t: 0.0, alpha: 0.0 },
        { t: 0.5, alpha: 0.7 },
        { t: 1.0, alpha: 1.0 },
      ],
    }];

    const ir = compileRampToIR(mappings);
    expect(ir.outputs).toHaveLength(1);
    expect(ir.outputs[0].property).toBe('alpha');
    expect(ir.inputs[0].property).toBe('smoke');

    const validation = validateIR(ir);
    expect(validation.valid).toBe(true);

    const wgsl = generateWGSL(ir, FIRE_CONFIG);
    expect(wgsl).toContain('smoothstep');
  });

  it('TestRampCompiler_ColorPlusAlpha_CombinedProgram', () => {
    const mappings: RampMapping[] = [
      {
        property: 'temperature',
        channel: 'color',
        type: 'ramp',
        stops: [
          { t: 0.0, color: '#000000' },
          { t: 1.0, color: '#ffffff' },
        ],
      },
      {
        property: 'smoke',
        channel: 'alpha',
        type: 'ramp',
        stops: [
          { t: 0.0, alpha: 0.0 },
          { t: 1.0, alpha: 1.0 },
        ],
      },
    ];

    const ir = compileRampToIR(mappings);
    // 2 declares + 3 color writes + 1 alpha write = 6
    expect(ir.statements.length).toBe(6);
    expect(ir.inputs).toHaveLength(2);
    expect(ir.outputs).toHaveLength(4); // colorR, colorG, colorB, alpha

    const validation = validateIR(ir);
    expect(validation.valid).toBe(true);

    const wgsl = generateWGSL(ir, FIRE_CONFIG);
    expect(wgsl).toBeDefined();
  });

  it('TestRampCompiler_CustomRange_NormalizesValues', () => {
    const mappings: RampMapping[] = [{
      property: 'temperature',
      channel: 'color',
      type: 'ramp',
      range: [100, 500],
      stops: [
        { t: 0.0, color: '#000000' },
        { t: 1.0, color: '#ff0000' },
      ],
    }];

    const ir = compileRampToIR(mappings);
    const validation = validateIR(ir);
    expect(validation.valid).toBe(true);

    // The normalization (value - 100) / 400 should appear as sub + div
    const wgsl = generateWGSL(ir, FIRE_CONFIG);
    expect(wgsl).toContain('100.0'); // rangeMin
  });

  it('TestRampCompiler_UnsortedStops_SortsByPosition', () => {
    const mappings: RampMapping[] = [{
      property: 'temperature',
      channel: 'color',
      type: 'ramp',
      stops: [
        { t: 1.0, color: '#ffffff' },
        { t: 0.0, color: '#000000' },
        { t: 0.5, color: '#ff0000' },
      ],
    }];

    const ir = compileRampToIR(mappings);
    const validation = validateIR(ir);
    expect(validation.valid).toBe(true);
  });

  it('TestRampCompiler_EmptyMappings_ProducesEmptyProgram', () => {
    const ir = compileRampToIR([]);
    expect(ir.statements).toHaveLength(0);
    expect(ir.inputs).toHaveLength(0);
    expect(ir.outputs).toHaveLength(0);
  });

  it('TestRampCompiler_NoRampType_SkipsMappings', () => {
    const mappings = [{
      property: 'alive',
      channel: 'color' as const,
      type: 'binary' as never, // not 'ramp'
      stops: [],
    }];

    const ir = compileRampToIR(mappings as RampMapping[]);
    expect(ir.statements).toHaveLength(0);
  });

  it('TestRampCompiler_DefaultRange_UsesZeroToOne', () => {
    const mappings: RampMapping[] = [{
      property: 'temperature',
      channel: 'color',
      type: 'ramp',
      // range omitted — defaults to [0, 1]
      stops: [
        { t: 0.0, color: '#000000' },
        { t: 1.0, color: '#ffffff' },
      ],
    }];

    const ir = compileRampToIR(mappings);
    const validation = validateIR(ir);
    expect(validation.valid).toBe(true);

    // With [0,1] range, normalization simplifies to just clamp
    const wgsl = generateWGSL(ir, FIRE_CONFIG);
    expect(wgsl).toContain('clamp');
  });
});
