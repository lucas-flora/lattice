import { describe, it, expect } from 'vitest';
import { formatCommandResult } from '../formatCommandResult';

describe('formatCommandResult', () => {
  it('TestFormatCommandResult_RuleShow_ReturnsCodeBlock', () => {
    const result = formatCommandResult('rule.show', {
      body: 'const alive = neighbors === 3;\nreturn alive ? 1 : 0;',
    });
    expect(result.message).toBe('Rule body:');
    expect(result.structured).toEqual({
      kind: 'code',
      language: 'javascript',
      content: 'const alive = neighbors === 3;\nreturn alive ? 1 : 0;',
    });
  });

  it('TestFormatCommandResult_ParamList_ReturnsTable', () => {
    const result = formatCommandResult('param.list', {
      params: [
        { name: 'feedRate', value: 0.055, default: 0.055, min: 0, max: 0.1 },
        { name: 'killRate', value: 0.062, default: 0.062, min: 0, max: 0.1 },
      ],
    });
    expect(result.message).toBe('2 parameters:');
    expect(result.structured).toBeDefined();
    expect(result.structured!.kind).toBe('table');
    if (result.structured!.kind === 'table') {
      expect(result.structured!.columns).toEqual(['Name', 'Value', 'Default', 'Range']);
      expect(result.structured!.rows).toHaveLength(2);
      expect(result.structured!.rows[0][0]).toBe('feedRate');
      expect(result.structured!.rows[0][3]).toBe('0–0.1');
    }
  });

  it('TestFormatCommandResult_GridInfo_ReturnsKeyValue', () => {
    const result = formatCommandResult('grid.info', {
      width: 128,
      height: 128,
      cellCount: 16384,
      dimensionality: '2d',
    });
    expect(result.structured).toBeDefined();
    expect(result.structured!.kind).toBe('kv');
    if (result.structured!.kind === 'kv') {
      expect(result.structured!.pairs).toEqual([
        ['width', '128'],
        ['height', '128'],
        ['cellCount', '16384'],
        ['dimensionality', '2d'],
      ]);
    }
  });

  it('TestFormatCommandResult_ParamGet_ReturnsKeyValue', () => {
    const result = formatCommandResult('param.get', { name: 'feedRate', value: 0.055 });
    expect(result.structured!.kind).toBe('kv');
    if (result.structured!.kind === 'kv') {
      expect(result.structured!.pairs).toEqual([['feedRate', '0.055']]);
    }
  });

  it('TestFormatCommandResult_SimStatus_ReturnsKeyValue', () => {
    const result = formatCommandResult('sim.status', {
      running: true,
      generation: 42,
      speed: 60,
    });
    expect(result.structured!.kind).toBe('kv');
  });

  it('TestFormatCommandResult_UnknownCommand_ReturnsFallbackJson', () => {
    const data = { foo: 'bar', count: 42 };
    const result = formatCommandResult('unknown.cmd', data);
    expect(result.structured).toBeDefined();
    expect(result.structured!.kind).toBe('json');
    if (result.structured!.kind === 'json') {
      expect(result.structured!.content).toEqual(data);
    }
  });

  it('TestFormatCommandResult_ParamList_SingleParam_SingularMessage', () => {
    const result = formatCommandResult('param.list', {
      params: [{ name: 'x', value: 1, default: 1, min: 0, max: 10 }],
    });
    expect(result.message).toBe('1 parameter:');
  });
});
