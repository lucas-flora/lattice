import { describe, it, expect } from 'vitest';
import { validateIR } from '../validate';
import { IR } from '../IRBuilder';
import { CONWAY_GOL_IR, AGE_FADE_IR } from './referencePrograms';

describe('validateIR', () => {
  it('TestValidate_ConwayGOL_PassesValidation', () => {
    const result = validateIR(CONWAY_GOL_IR);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('TestValidate_AgeFade_PassesValidation', () => {
    const result = validateIR(AGE_FADE_IR);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('TestValidate_MissingInput_CaughtAsError', () => {
    const prog = IR.program([
      IR.writeProperty('alive', IR.readCell('alive')),
    ], {
      inputs: [],  // alive not declared
      outputs: [{ property: 'alive', scope: 'cell', type: 'f32' }],
    });
    const result = validateIR(prog);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('cell.alive') && e.message.includes('not declared in inputs'))).toBe(true);
  });

  it('TestValidate_MissingOutput_CaughtAsError', () => {
    const prog = IR.program([
      IR.writeProperty('alive', IR.f32(1)),
    ], {
      inputs: [],
      outputs: [],  // alive not declared
    });
    const result = validateIR(prog);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('cell.alive') && e.message.includes('not declared in outputs'))).toBe(true);
  });

  it('TestValidate_TypeMismatch_BinopCaught', () => {
    const prog = IR.program([
      IR.declareVar('x', 'f32', IR.add(IR.f32(1), IR.u32(2))),
    ], {
      inputs: [],
      outputs: [],
    });
    const result = validateIR(prog);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Type mismatch'))).toBe(true);
  });

  it('TestValidate_UndeclaredVarRef_CaughtAsError', () => {
    const prog = IR.program([
      IR.writeProperty('alive', IR.varRef('missing')),
    ], {
      inputs: [],
      outputs: [{ property: 'alive', scope: 'cell', type: 'f32' }],
    });
    const result = validateIR(prog);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes("'missing'") && e.message.includes('before declaration'))).toBe(true);
  });

  it('TestValidate_DuplicateVarDeclaration_CaughtAsError', () => {
    const prog = IR.program([
      IR.declareVar('x', 'f32', IR.f32(1)),
      IR.declareVar('x', 'f32', IR.f32(2)),
    ], {
      inputs: [],
      outputs: [],
    });
    const result = validateIR(prog);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Duplicate'))).toBe(true);
  });

  it('TestValidate_NeighborReduceWithoutFlag_CaughtAsError', () => {
    const prog = IR.program([
      IR.declareVar('n', 'f32', IR.neighborSum('alive')),
    ], {
      inputs: [{ property: 'alive', scope: 'cell', type: 'f32' }],
      outputs: [],
      neighborhoodAccess: false,
    });
    const result = validateIR(prog);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('neighborhoodAccess'))).toBe(true);
  });

  it('TestValidate_WrongCallArity_CaughtAsError', () => {
    const prog = IR.program([
      IR.declareVar('x', 'f32', { kind: 'call', fn: 'clamp', args: [IR.f32(1)], type: 'f32' }),
    ], { inputs: [], outputs: [] });
    const result = validateIR(prog);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('clamp') && e.message.includes('3 args'))).toBe(true);
  });

  it('TestValidate_UnusedVar_WarningNotError', () => {
    const prog = IR.program([
      IR.declareVar('unused', 'f32', IR.f32(42)),
    ], { inputs: [], outputs: [] });
    const result = validateIR(prog);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.message.includes('unused'))).toBe(true);
  });

  it('TestValidate_LogicOnNonBool_CaughtAsError', () => {
    const prog = IR.program([
      IR.declareVar('x', 'bool', IR.and(IR.f32(1), IR.f32(0))),
    ], { inputs: [], outputs: [] });
    const result = validateIR(prog);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('bool operands'))).toBe(true);
  });
});
