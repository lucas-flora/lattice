/**
 * Tests for Grid SharedArrayBuffer support.
 *
 * RULE-03: WASM rule execution pipeline requires shared buffers
 * for zero-copy data sharing between Worker and main thread.
 */

import { describe, it, expect } from 'vitest';
import { Grid } from '../Grid';
import type { GridConfig } from '../types';

function makeConfig(useSharedBuffer: boolean = false): GridConfig {
  return {
    dimensionality: '2d',
    width: 8,
    height: 8,
    depth: 1,
    topology: 'toroidal',
    useSharedBuffer,
  };
}

const SAB_AVAILABLE = typeof SharedArrayBuffer !== 'undefined';

describe('Grid SharedArrayBuffer Support', () => {
  it('creates with SharedArrayBuffer when requested and available', () => {
    if (!SAB_AVAILABLE) return; // Skip in environments without SAB

    const grid = new Grid(makeConfig(true));
    grid.addProperty('state', 1, 0);
    expect(grid.isUsingSharedBuffers()).toBe(true);
  });

  it('falls back to regular ArrayBuffer silently when SAB unavailable', () => {
    // Even when useSharedBuffer is false, grid should work fine
    const grid = new Grid(makeConfig(false));
    grid.addProperty('state', 1, 0);
    expect(grid.isUsingSharedBuffers()).toBe(false);
    // Verify it still works
    const buf = grid.getCurrentBuffer('state');
    expect(buf).toBeInstanceOf(Float32Array);
    expect(buf.length).toBe(64);
  });

  it('getCellValue and setCellValue work identically with shared buffers', () => {
    if (!SAB_AVAILABLE) return;

    const grid = new Grid(makeConfig(true));
    grid.addProperty('state', 1, 0);

    // Write to next buffer
    grid.setCellValue('state', 5, 42);
    grid.swap();
    expect(grid.getCellValue('state', 5)).toBe(42);
  });

  it('swap works correctly with shared buffers', () => {
    if (!SAB_AVAILABLE) return;

    const grid = new Grid(makeConfig(true));
    grid.addProperty('state', 1, 0);

    // Write value to next buffer
    grid.setCellValue('state', 0, 1);
    // Before swap: current buffer should be default
    expect(grid.getCellValue('state', 0)).toBe(0);

    grid.swap();
    // After swap: current buffer has the written value
    expect(grid.getCellValue('state', 0)).toBe(1);
  });

  it('shared buffers are visible from multiple Float32Array views', () => {
    if (!SAB_AVAILABLE) return;

    const grid = new Grid(makeConfig(true));
    grid.addProperty('state', 1, 0);

    const buf1 = grid.getCurrentBuffer('state');
    // Simulate what the main thread renderer would do:
    // create another view on the same SharedArrayBuffer
    const sharedBuffers = grid.getSharedBuffers();
    const sabRef = sharedBuffers.get('state');
    expect(sabRef).toBeDefined();
    expect(sabRef!.sharedA).toBeInstanceOf(SharedArrayBuffer);

    const buf2 = new Float32Array(sabRef!.sharedA!);

    // Write via buf1 (simulates Worker writing)
    buf1[3] = 99;
    // Read via buf2 (simulates main thread reading)
    expect(buf2[3]).toBe(99);
  });

  it('regular grid creation without useSharedBuffer continues to work unchanged', () => {
    const grid = new Grid(makeConfig(false));
    grid.addProperty('alive', 1, 0);
    grid.addProperty('energy', 1, 1.0);

    expect(grid.isUsingSharedBuffers()).toBe(false);
    expect(grid.hasProperty('alive')).toBe(true);
    expect(grid.hasProperty('energy')).toBe(true);

    // Full ping-pong workflow
    grid.setCellValue('alive', 0, 1);
    grid.swap();
    expect(grid.getCellValue('alive', 0)).toBe(1);

    grid.reset();
    expect(grid.getCellValue('alive', 0)).toBe(0);
    expect(grid.getCellValue('energy', 0)).toBe(1.0);
  });

  it('getSharedBuffers returns undefined for non-shared properties', () => {
    const grid = new Grid(makeConfig(false));
    grid.addProperty('state', 1, 0);

    const sharedBuffers = grid.getSharedBuffers();
    const sabRef = sharedBuffers.get('state');
    expect(sabRef).toBeDefined();
    expect(sabRef!.sharedA).toBeUndefined();
    expect(sabRef!.sharedB).toBeUndefined();
  });

  it('reset works correctly with shared buffers', () => {
    if (!SAB_AVAILABLE) return;

    const grid = new Grid(makeConfig(true));
    grid.addProperty('state', 1, 0);

    // Write some values
    grid.setCellValue('state', 0, 42);
    grid.swap();
    expect(grid.getCellValue('state', 0)).toBe(42);

    // Reset should clear everything
    grid.reset();
    expect(grid.getCellValue('state', 0)).toBe(0);
    expect(grid.isUsingSharedBuffers()).toBe(true); // Still using SAB
  });
});
