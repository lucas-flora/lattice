/**
 * Unit tests for parameter graph data management.
 *
 * GUIP-02: Ring buffer and sparkline point generation.
 */

import { describe, it, expect } from 'vitest';
import { ParamGraphBuffer, samplesToSparklinePoints } from '../paramGraphData';

describe('ParamGraphBuffer', () => {
  it('TestParamGraphBuffer_InitializesEmpty', () => {
    const buffer = new ParamGraphBuffer(10);
    expect(buffer.getCount()).toBe(0);
    expect(buffer.getCapacity()).toBe(10);
    expect(buffer.getSamples()).toEqual([]);
  });

  it('TestParamGraphBuffer_PushAndRetrieve', () => {
    const buffer = new ParamGraphBuffer(5);
    buffer.push({ generation: 0, value: 100 });
    buffer.push({ generation: 1, value: 200 });
    buffer.push({ generation: 2, value: 150 });

    expect(buffer.getCount()).toBe(3);
    const samples = buffer.getSamples();
    expect(samples.length).toBe(3);
    expect(samples[0].value).toBe(100);
    expect(samples[2].value).toBe(150);
  });

  it('TestParamGraphBuffer_WrapsAtCapacity', () => {
    const buffer = new ParamGraphBuffer(3);
    buffer.push({ generation: 0, value: 10 });
    buffer.push({ generation: 1, value: 20 });
    buffer.push({ generation: 2, value: 30 });
    buffer.push({ generation: 3, value: 40 });

    expect(buffer.getCount()).toBe(3);
    const samples = buffer.getSamples();
    expect(samples.length).toBe(3);
    // Oldest (10) should have been evicted
    expect(samples[0].value).toBe(20);
    expect(samples[1].value).toBe(30);
    expect(samples[2].value).toBe(40);
  });

  it('TestParamGraphBuffer_GetLatest', () => {
    const buffer = new ParamGraphBuffer(10);
    expect(buffer.getLatest()).toBeNull();

    buffer.push({ generation: 0, value: 50 });
    expect(buffer.getLatest()?.value).toBe(50);

    buffer.push({ generation: 1, value: 75 });
    expect(buffer.getLatest()?.value).toBe(75);
  });

  it('TestParamGraphBuffer_GetRange', () => {
    const buffer = new ParamGraphBuffer(10);
    expect(buffer.getRange()).toEqual({ min: 0, max: 0 });

    buffer.push({ generation: 0, value: 50 });
    buffer.push({ generation: 1, value: 100 });
    buffer.push({ generation: 2, value: 25 });

    const range = buffer.getRange();
    expect(range.min).toBe(25);
    expect(range.max).toBe(100);
  });

  it('TestParamGraphBuffer_Clear', () => {
    const buffer = new ParamGraphBuffer(10);
    buffer.push({ generation: 0, value: 50 });
    buffer.push({ generation: 1, value: 100 });
    buffer.clear();

    expect(buffer.getCount()).toBe(0);
    expect(buffer.getSamples()).toEqual([]);
    expect(buffer.getLatest()).toBeNull();
  });

  it('TestParamGraphBuffer_DefaultCapacity', () => {
    const buffer = new ParamGraphBuffer();
    expect(buffer.getCapacity()).toBe(200);
  });

  it('TestParamGraphBuffer_MinimumCapacity', () => {
    const buffer = new ParamGraphBuffer(0);
    expect(buffer.getCapacity()).toBe(1);
  });
});

describe('samplesToSparklinePoints', () => {
  it('TestSparklinePoints_EmptyInput', () => {
    expect(samplesToSparklinePoints([], 100, 50)).toEqual([]);
  });

  it('TestSparklinePoints_SinglePoint', () => {
    const points = samplesToSparklinePoints(
      [{ generation: 0, value: 50 }],
      100,
      50,
    );
    expect(points.length).toBe(1);
    expect(points[0][0]).toBe(50); // center x
    expect(points[0][1]).toBe(25); // center y
  });

  it('TestSparklinePoints_MultiplePoints_CorrectXSpacing', () => {
    const samples = [
      { generation: 0, value: 0 },
      { generation: 1, value: 50 },
      { generation: 2, value: 100 },
    ];
    const points = samplesToSparklinePoints(samples, 200, 100);
    expect(points.length).toBe(3);
    expect(points[0][0]).toBe(0); // First point at x=0
    expect(points[1][0]).toBe(100); // Middle at x=100
    expect(points[2][0]).toBe(200); // Last at x=200
  });

  it('TestSparklinePoints_YAxisNormalized', () => {
    const samples = [
      { generation: 0, value: 0 },
      { generation: 1, value: 100 },
    ];
    const points = samplesToSparklinePoints(samples, 100, 100);
    // Min value should be at bottom (y close to height), max at top (y close to 0)
    expect(points[0][1]).toBeGreaterThan(points[1][1]);
  });

  it('TestSparklinePoints_ConstantValues', () => {
    const samples = [
      { generation: 0, value: 50 },
      { generation: 1, value: 50 },
      { generation: 2, value: 50 },
    ];
    const points = samplesToSparklinePoints(samples, 100, 100);
    // All y values should be the same
    expect(points[0][1]).toBe(points[1][1]);
    expect(points[1][1]).toBe(points[2][1]);
  });
});
