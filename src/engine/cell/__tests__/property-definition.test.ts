import { describe, it, expect } from 'vitest';
import { CellPropertyDefinition } from '../CellPropertyDefinition';

describe('CellPropertyDefinition - type storage', () => {
  it('TestCellProperty_BoolStoredAsFloat', () => {
    const prop = new CellPropertyDefinition({ name: 'alive', type: 'bool', default: 0 });
    expect(prop.channels).toBe(1);
    expect(prop.getDefault()).toBe(0);

    // Test buffer read/write
    const buffer = new Float32Array(1);
    prop.writeToBuffer(buffer, 0, 0, 1);
    expect(buffer[0]).toBe(1.0);

    const read = prop.readFromBuffer(buffer, 0, 0);
    expect(read).toBe(1);

    // Write false
    prop.writeToBuffer(buffer, 0, 0, 0);
    expect(prop.readFromBuffer(buffer, 0, 0)).toBe(0);
  });

  it('TestCellProperty_BoolClampsValues', () => {
    const prop = new CellPropertyDefinition({ name: 'flag', type: 'bool', default: 0 });
    const buffer = new Float32Array(1);

    // Truthy values become 1.0
    prop.writeToBuffer(buffer, 0, 0, 5);
    expect(buffer[0]).toBe(1.0);

    // Falsy (0) becomes 0.0
    prop.writeToBuffer(buffer, 0, 0, 0);
    expect(buffer[0]).toBe(0.0);
  });

  it('TestCellProperty_IntStoredAsFloat', () => {
    const prop = new CellPropertyDefinition({ name: 'age', type: 'int', default: 0 });
    expect(prop.channels).toBe(1);

    const buffer = new Float32Array(1);
    prop.writeToBuffer(buffer, 0, 0, 3);
    expect(buffer[0]).toBe(3.0);

    // Read rounds to integer
    buffer[0] = 3.7;
    expect(prop.readFromBuffer(buffer, 0, 0)).toBe(4);

    buffer[0] = 3.2;
    expect(prop.readFromBuffer(buffer, 0, 0)).toBe(3);
  });

  it('TestCellProperty_FloatDirect', () => {
    const prop = new CellPropertyDefinition({ name: 'energy', type: 'float', default: 0.5 });
    expect(prop.channels).toBe(1);
    expect(prop.getDefault()).toBe(0.5);

    const buffer = new Float32Array(1);
    prop.writeToBuffer(buffer, 0, 0, 3.14159);
    expect(prop.readFromBuffer(buffer, 0, 0)).toBeCloseTo(3.14159, 4);
  });

  it('TestCellProperty_Vec2Channels', () => {
    const prop = new CellPropertyDefinition({ name: 'velocity', type: 'vec2', default: [0, 0] });
    expect(prop.channels).toBe(2);
    expect(prop.getDefault()).toEqual([0, 0]);

    const buffer = new Float32Array(2);
    prop.writeToBuffer(buffer, 0, 0, [1.5, -2.0]);
    expect(buffer[0]).toBe(1.5);
    expect(buffer[1]).toBe(-2.0);

    const read = prop.readFromBuffer(buffer, 0, 0);
    expect(read).toEqual([1.5, -2.0]);
  });

  it('TestCellProperty_Vec3Channels', () => {
    const prop = new CellPropertyDefinition({ name: 'color', type: 'vec3', default: [1, 0.5, 0] });
    expect(prop.channels).toBe(3);
    expect(prop.getDefault()).toEqual([1, 0.5, 0]);
  });

  it('TestCellProperty_Vec4Channels', () => {
    const prop = new CellPropertyDefinition({ name: 'rgba', type: 'vec4', default: [1, 1, 1, 1] });
    expect(prop.channels).toBe(4);
    expect(prop.getDefault()).toEqual([1, 1, 1, 1]);
  });

  it('TestCellProperty_Vec2DefaultExpansion', () => {
    // Single number default fills all channels
    const prop = new CellPropertyDefinition({ name: 'pos', type: 'vec2', default: 0 });
    expect(prop.defaultValue).toEqual([0, 0]);
  });
});

describe('CellPropertyDefinition - roles', () => {
  it('TestCellProperty_RoleDefaults', () => {
    const prop = new CellPropertyDefinition({ name: 'state', type: 'float', default: 0 });
    expect(prop.role).toBe('input_output');
  });

  it('TestCellProperty_RoleInput', () => {
    const prop = new CellPropertyDefinition({ name: 'state', type: 'float', default: 0, role: 'input' });
    expect(prop.role).toBe('input');
  });

  it('TestCellProperty_RoleOutput', () => {
    const prop = new CellPropertyDefinition({ name: 'result', type: 'float', default: 0, role: 'output' });
    expect(prop.role).toBe('output');
  });
});

describe('CellPropertyDefinition - computed', () => {
  it('TestCellProperty_IsComputed_WithComputeString', () => {
    const prop = new CellPropertyDefinition({
      name: 'derived',
      type: 'float',
      default: 0,
      compute: 'return ctx.cell.energy * 2;',
    });
    expect(prop.isComputed).toBe(true);
    expect(prop.computeSource).toBe('return ctx.cell.energy * 2;');
  });

  it('TestCellProperty_IsComputed_WithoutComputeString', () => {
    const prop = new CellPropertyDefinition({ name: 'static', type: 'float', default: 0 });
    expect(prop.isComputed).toBe(false);
    expect(prop.computeSource).toBeUndefined();
  });
});

describe('CellPropertyDefinition - validation', () => {
  it('TestCellProperty_ValidateValue_SingleChannel', () => {
    const prop = new CellPropertyDefinition({ name: 'state', type: 'float', default: 0 });
    expect(prop.validateValue(42)).toBe(true);
    expect(prop.validateValue([1, 2])).toBe(false);
  });

  it('TestCellProperty_ValidateValue_MultiChannel', () => {
    const prop = new CellPropertyDefinition({ name: 'pos', type: 'vec2', default: [0, 0] });
    expect(prop.validateValue([1, 2])).toBe(true);
    expect(prop.validateValue(42)).toBe(false);
    expect(prop.validateValue([1, 2, 3])).toBe(false);
  });

  it('TestCellProperty_WrongDefaultLengthThrows', () => {
    expect(
      () => new CellPropertyDefinition({ name: 'bad', type: 'vec3', default: [1, 2] }),
    ).toThrow("3 channels");
  });
});

describe('CellPropertyDefinition - buffer operations', () => {
  it('TestCellProperty_BufferReadWrite_CorrectOffset', () => {
    const prop = new CellPropertyDefinition({ name: 'state', type: 'float', default: 0 });
    const buffer = new Float32Array(10);

    // Write to cell index 3 with offset 0
    prop.writeToBuffer(buffer, 3, 0, 42);
    expect(buffer[3]).toBe(42);
    expect(prop.readFromBuffer(buffer, 3, 0)).toBe(42);
  });

  it('TestCellProperty_VectorBufferReadWrite', () => {
    const prop = new CellPropertyDefinition({ name: 'vel', type: 'vec3', default: [0, 0, 0] });
    const buffer = new Float32Array(9); // 3 cells * 3 channels

    // Write to cell index 1
    prop.writeToBuffer(buffer, 1, 0, [1, 2, 3]);
    expect(buffer[3]).toBe(1);
    expect(buffer[4]).toBe(2);
    expect(buffer[5]).toBe(3);

    const read = prop.readFromBuffer(buffer, 1, 0);
    expect(read).toEqual([1, 2, 3]);
  });
});
