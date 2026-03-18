import { describe, it, expect } from 'vitest';
import { generateWGSL, type WGSLCodegenConfig } from '../WGSLCodegen';
import { IR } from '../IRBuilder';
import { CONWAY_GOL_IR, AGE_FADE_IR, GRAY_SCOTT_IR } from './referencePrograms';

const CONWAY_CONFIG: WGSLCodegenConfig = {
  workgroupSize: [8, 8, 1],
  topology: 'toroidal',
  propertyLayout: [{ name: 'alive', offset: 0, channels: 1, type: 'f32' }],
  envParams: [],
  globalParams: [],
};

const AGE_CONFIG: WGSLCodegenConfig = {
  workgroupSize: [8, 8, 1],
  topology: 'toroidal',
  propertyLayout: [
    { name: 'alive', offset: 0, channels: 1, type: 'f32' },
    { name: 'age', offset: 1, channels: 1, type: 'f32' },
    { name: 'alpha', offset: 2, channels: 1, type: 'f32' },
  ],
  envParams: [],
  globalParams: [],
};

const GRAY_SCOTT_CONFIG: WGSLCodegenConfig = {
  workgroupSize: [8, 8, 1],
  topology: 'toroidal',
  propertyLayout: [
    { name: 'u', offset: 0, channels: 1, type: 'f32' },
    { name: 'v', offset: 1, channels: 1, type: 'f32' },
  ],
  envParams: ['Du', 'Dv', 'F', 'k', 'dt'],
  globalParams: [],
};

describe('WGSLCodegen', () => {
  it('TestWGSL_ConwayGOL_ContainsRequiredElements', () => {
    const wgsl = generateWGSL(CONWAY_GOL_IR, CONWAY_CONFIG);

    // Bindings
    expect(wgsl).toContain('var<storage, read> cellsIn');
    expect(wgsl).toContain('var<storage, read_write> cellsOut');
    expect(wgsl).toContain('var<uniform> params');

    // Helpers
    expect(wgsl).toContain('fn getCell');
    expect(wgsl).toContain('fn setCell');
    expect(wgsl).toContain('fn neighborIndex');

    // Neighbor loop
    expect(wgsl).toContain('nr_sum_alive');
    expect(wgsl).toContain('for (var dy');
    expect(wgsl).toContain('for (var dx');

    // Workgroup
    expect(wgsl).toContain('@compute @workgroup_size(8, 8, 1)');

    // Bounds check
    expect(wgsl).toContain('if (x >= params.width || y >= params.height)');
  });

  it('TestWGSL_ConwayGOL_ToroidalWrapping', () => {
    const wgsl = generateWGSL(CONWAY_GOL_IR, CONWAY_CONFIG);
    // Toroidal wrapping uses modulo
    expect(wgsl).toContain('% i32(w)');
    expect(wgsl).toContain('% i32(h)');
  });

  it('TestWGSL_ConwayGOL_FiniteWrapping', () => {
    const wgsl = generateWGSL(CONWAY_GOL_IR, { ...CONWAY_CONFIG, topology: 'finite' });
    expect(wgsl).toContain('clamp(nx');
  });

  it('TestWGSL_AgeFade_NoNeighborLoop', () => {
    const wgsl = generateWGSL(AGE_FADE_IR, AGE_CONFIG);
    expect(wgsl).not.toContain('neighborIndex');
    expect(wgsl).not.toContain('for (var dy');
    expect(wgsl).toContain('setCell(idx, 2u');  // alpha is at offset 2
  });

  it('TestWGSL_Literals_CorrectFormatting', () => {
    const prog = IR.program([
      IR.declareVar('a', 'f32', IR.f32(3)),
      IR.declareVar('b', 'u32', IR.u32(5)),
      IR.declareVar('c', 'bool', IR.bool(true)),
    ], { inputs: [], outputs: [] });
    const wgsl = generateWGSL(prog, CONWAY_CONFIG);
    expect(wgsl).toContain('3.0');   // f32 gets decimal
    expect(wgsl).toContain('5u');    // u32 gets suffix
    expect(wgsl).toContain('true');  // bool
  });

  it('TestWGSL_LogicOps_UseBitwiseNotShortCircuit', () => {
    const prog = IR.program([
      IR.declareVar('a', 'bool', IR.and(IR.bool(true), IR.bool(false))),
      IR.declareVar('b', 'bool', IR.or(IR.bool(true), IR.bool(false))),
    ], { inputs: [], outputs: [] });
    const wgsl = generateWGSL(prog, CONWAY_CONFIG);
    // WGSL uses & and | for bool logic, not && and ||
    // The generated variable lines should use & and | operators
    expect(wgsl).toContain('(true & false)');
    expect(wgsl).toContain('(true | false)');
  });

  it('TestWGSL_Select_ArgOrderIsFalseTrueCondition', () => {
    const prog = IR.program([
      IR.declareVar('x', 'f32', IR.select(IR.bool(true), IR.f32(1), IR.f32(0))),
    ], { inputs: [], outputs: [] });
    const wgsl = generateWGSL(prog, CONWAY_CONFIG);
    // WGSL select: select(false_val, true_val, condition)
    expect(wgsl).toContain('select(0.0, 1.0, true)');
  });

  it('TestWGSL_PropertyOffsets_MatchLayout', () => {
    const wgsl = generateWGSL(AGE_FADE_IR, AGE_CONFIG);
    // age is at offset 1, alpha at offset 2
    expect(wgsl).toContain('getCell(idx, 1u)');  // read age
    expect(wgsl).toContain('setCell(idx, 2u');   // write alpha
  });

  it('TestWGSL_GrayScott_EnvParams', () => {
    const wgsl = generateWGSL(GRAY_SCOTT_IR, GRAY_SCOTT_CONFIG);
    // Env params accessed via params.envN
    expect(wgsl).toContain('params.env0');  // Du
    expect(wgsl).toContain('params.env1');  // Dv
    expect(wgsl).toContain('params.env2');  // F
    expect(wgsl).toContain('params.env3');  // k
    expect(wgsl).toContain('params.env4');  // dt
  });

  it('TestWGSL_GrayScott_HasClamp', () => {
    const wgsl = generateWGSL(GRAY_SCOTT_IR, GRAY_SCOTT_CONFIG);
    expect(wgsl).toContain('clamp(');
  });

  it('TestWGSL_Cast_EmitsTypeFunction', () => {
    const prog = IR.program([
      IR.declareVar('x', 'f32', IR.toF32(IR.u32(5))),
    ], { inputs: [], outputs: [] });
    const wgsl = generateWGSL(prog, CONWAY_CONFIG);
    expect(wgsl).toContain('f32(5u)');
  });

  it('TestWGSL_Coordinates_EmitsLocalVars', () => {
    const prog = IR.program([
      IR.declareVar('px', 'u32', IR.x()),
    ], { inputs: [], outputs: [] });
    const wgsl = generateWGSL(prog, CONWAY_CONFIG);
    expect(wgsl).toContain('var px: u32 = x;');
  });
});
