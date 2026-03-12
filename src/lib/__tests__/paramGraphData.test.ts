/**
 * Unit tests for parameter graph data management.
 *
 * GUIP-02: Ring buffer and sparkline point generation.
 */

import { describe, it, expect } from 'vitest';
import { ParamGraphBuffer, TimelineDataBuffer, samplesToSparklinePoints, samplesToTimelinePoints } from '../paramGraphData';

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

describe('TimelineDataBuffer', () => {
  it('TestTimelineDataBuffer_InitializesEmpty', () => {
    const buffer = new TimelineDataBuffer();
    expect(buffer.size).toBe(0);
    expect(buffer.getAllSamples()).toEqual([]);
    expect(buffer.getValueAt(0)).toBeUndefined();
  });

  it('TestTimelineDataBuffer_RecordAndRetrieve', () => {
    const buffer = new TimelineDataBuffer();
    buffer.record(0, 100);
    buffer.record(5, 200);
    buffer.record(10, 150);

    expect(buffer.size).toBe(3);
    expect(buffer.getValueAt(0)).toBe(100);
    expect(buffer.getValueAt(5)).toBe(200);
    expect(buffer.getValueAt(10)).toBe(150);
    expect(buffer.getValueAt(3)).toBeUndefined();
  });

  it('TestTimelineDataBuffer_OverwritesExistingGeneration', () => {
    const buffer = new TimelineDataBuffer();
    buffer.record(5, 100);
    buffer.record(5, 200);
    expect(buffer.getValueAt(5)).toBe(200);
    expect(buffer.size).toBe(1);
  });

  it('TestTimelineDataBuffer_GetSamplesInRange', () => {
    const buffer = new TimelineDataBuffer();
    buffer.record(0, 10);
    buffer.record(5, 20);
    buffer.record(10, 30);
    buffer.record(15, 40);

    const range = buffer.getSamplesInRange(3, 12);
    expect(range.length).toBe(2);
    expect(range[0]).toEqual({ generation: 5, value: 20 });
    expect(range[1]).toEqual({ generation: 10, value: 30 });
  });

  it('TestTimelineDataBuffer_GetAllSamples_SortedByGeneration', () => {
    const buffer = new TimelineDataBuffer();
    buffer.record(10, 30);
    buffer.record(0, 10);
    buffer.record(5, 20);

    const samples = buffer.getAllSamples();
    expect(samples.length).toBe(3);
    expect(samples[0].generation).toBe(0);
    expect(samples[1].generation).toBe(5);
    expect(samples[2].generation).toBe(10);
  });

  it('TestTimelineDataBuffer_GetValueRange', () => {
    const buffer = new TimelineDataBuffer();
    expect(buffer.getValueRange()).toEqual({ min: 0, max: 0 });

    buffer.record(0, 50);
    buffer.record(1, 100);
    buffer.record(2, 25);

    const range = buffer.getValueRange();
    expect(range.min).toBe(25);
    expect(range.max).toBe(100);
  });

  it('TestTimelineDataBuffer_Clear', () => {
    const buffer = new TimelineDataBuffer();
    buffer.record(0, 50);
    buffer.record(1, 100);
    buffer.clear();

    expect(buffer.size).toBe(0);
    expect(buffer.getAllSamples()).toEqual([]);
  });
});

describe('samplesToTimelinePoints', () => {
  it('TestTimelinePoints_EmptyInput', () => {
    expect(samplesToTimelinePoints([], 100, 50, 0, 100)).toEqual([]);
  });

  it('TestTimelinePoints_XAxisMappedToGeneration', () => {
    const samples = [
      { generation: 0, value: 50 },
      { generation: 50, value: 100 },
      { generation: 100, value: 50 },
    ];
    const points = samplesToTimelinePoints(samples, 200, 100, 0, 100);
    expect(points.length).toBe(3);
    expect(points[0][0]).toBe(0);   // gen 0 → x=0
    expect(points[1][0]).toBe(100); // gen 50 → x=100
    expect(points[2][0]).toBe(200); // gen 100 → x=200
  });

  it('TestTimelinePoints_SubRange', () => {
    const samples = [
      { generation: 25, value: 50 },
      { generation: 75, value: 100 },
    ];
    // View range 0..100 on a 200px canvas
    const points = samplesToTimelinePoints(samples, 200, 100, 0, 100);
    expect(points[0][0]).toBe(50);  // gen 25 → x=50
    expect(points[1][0]).toBe(150); // gen 75 → x=150
  });
});
