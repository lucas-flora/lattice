import { describe, it, expect } from 'vitest';
import { IR } from '../IRBuilder';

describe('IRBuilder', () => {
  it('TestIRBuilder_F32Literal_CorrectTypeAndValue', () => {
    const node = IR.f32(3.14);
    expect(node).toEqual({ kind: 'literal', value: 3.14, type: 'f32' });
  });

  it('TestIRBuilder_U32Literal_FloorsValue', () => {
    const node = IR.u32(3.7);
    expect(node).toEqual({ kind: 'literal', value: 3, type: 'u32' });
  });

  it('TestIRBuilder_BoolLiteral_MapsToNumeric', () => {
    expect(IR.bool(true)).toEqual({ kind: 'literal', value: 1, type: 'bool' });
    expect(IR.bool(false)).toEqual({ kind: 'literal', value: 0, type: 'bool' });
  });

  it('TestIRBuilder_Add_InheritsLeftType', () => {
    const node = IR.add(IR.f32(1), IR.f32(2));
    expect(node.kind).toBe('binop');
    expect(node.type).toBe('f32');
  });

  it('TestIRBuilder_Compare_AlwaysProducesBool', () => {
    const node = IR.gt(IR.f32(1), IR.f32(2));
    expect(node.type).toBe('bool');
  });

  it('TestIRBuilder_ReadCell_DefaultsToF32', () => {
    const node = IR.readCell('alive');
    expect(node).toEqual({ kind: 'read_property', property: 'alive', scope: 'cell', type: 'f32' });
  });

  it('TestIRBuilder_ReadEnv_SetsScope', () => {
    const node = IR.readEnv('feedRate');
    expect(node).toEqual({ kind: 'read_property', property: 'feedRate', scope: 'env', type: 'f32' });
  });

  it('TestIRBuilder_NeighborSum_SetsFields', () => {
    const node = IR.neighborSum('alive');
    expect(node.kind).toBe('neighbor_reduce');
    if (node.kind === 'neighbor_reduce') {
      expect(node.op).toBe('sum');
      expect(node.property).toBe('alive');
    }
  });

  it('TestIRBuilder_NeighborCount_CreatesPredicate', () => {
    const node = IR.neighborCount('alive', '>', 0);
    expect(node.kind).toBe('neighbor_reduce');
    if (node.kind === 'neighbor_reduce') {
      expect(node.op).toBe('count_where');
      expect(node.predicate).toBeDefined();
    }
  });

  it('TestIRBuilder_Select_InheritsIfTrueType', () => {
    const node = IR.select(IR.bool(true), IR.f32(1), IR.f32(0));
    expect(node.type).toBe('f32');
  });

  it('TestIRBuilder_Program_SetsDefaults', () => {
    const prog = IR.program([]);
    expect(prog.statements).toEqual([]);
    expect(prog.inputs).toEqual([]);
    expect(prog.outputs).toEqual([]);
    expect(prog.neighborhoodAccess).toBe(false);
  });

  it('TestIRBuilder_Coordinates_ReturnsU32', () => {
    expect(IR.x().type).toBe('u32');
    expect(IR.y().type).toBe('u32');
  });

  it('TestIRBuilder_Cast_SetsTarget', () => {
    const node = IR.toF32(IR.u32(5));
    expect(node.kind).toBe('cast');
    if (node.kind === 'cast') {
      expect(node.target).toBe('f32');
    }
  });

  it('TestIRBuilder_WriteProperty_SetsScopeCell', () => {
    const stmt = IR.writeProperty('alive', IR.f32(1));
    expect(stmt.kind).toBe('write_property');
    if (stmt.kind === 'write_property') {
      expect(stmt.scope).toBe('cell');
    }
  });
});
