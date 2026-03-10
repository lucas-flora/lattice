/**
 * Universal Grid engine supporting 1D, 2D, and 3D simulations.
 *
 * All cell state is stored as Float32Array with ping-pong double buffering.
 * Pure TypeScript, zero browser API dependencies.
 */

import type { GridConfig, PropertyBuffers } from './types';
import { getNeighborIndices } from './neighbors';

export class Grid {
  readonly config: GridConfig;
  readonly cellCount: number;
  private properties: Map<string, PropertyBuffers> = new Map();

  constructor(config: GridConfig) {
    this.config = Object.freeze({ ...config });
    this.cellCount = config.width * config.height * config.depth;

    if (this.cellCount <= 0) {
      throw new Error(
        `Invalid grid dimensions: ${config.width}x${config.height}x${config.depth} = ${this.cellCount} cells`,
      );
    }
  }

  /**
   * Add a property with the given number of channels and optional default value.
   *
   * @param name - Property name (must be unique)
   * @param channels - Number of Float32Array elements per cell for this property
   * @param defaultValue - Default value(s). Single number fills all channels. Array must match channel count.
   */
  addProperty(name: string, channels: number, defaultValue?: number | number[]): void {
    if (this.properties.has(name)) {
      throw new Error(`Property '${name}' already exists on this grid`);
    }

    if (channels <= 0) {
      throw new Error(`Property '${name}' must have at least 1 channel`);
    }

    // Normalize default value to array
    let defaults: number[];
    if (defaultValue === undefined) {
      defaults = new Array(channels).fill(0);
    } else if (typeof defaultValue === 'number') {
      defaults = new Array(channels).fill(defaultValue);
    } else {
      if (defaultValue.length !== channels) {
        throw new Error(
          `Property '${name}' has ${channels} channels but default has ${defaultValue.length} values`,
        );
      }
      defaults = [...defaultValue];
    }

    const bufferSize = this.cellCount * channels;
    const bufferA = new Float32Array(bufferSize);
    const bufferB = new Float32Array(bufferSize);

    // Fill both buffers with default values
    for (let i = 0; i < this.cellCount; i++) {
      for (let c = 0; c < channels; c++) {
        bufferA[i * channels + c] = defaults[c];
        bufferB[i * channels + c] = defaults[c];
      }
    }

    this.properties.set(name, {
      bufferA,
      bufferB,
      aIsCurrent: true,
      channels,
      defaultValue: defaults,
    });
  }

  /**
   * Get the current (read) buffer for a property.
   */
  getCurrentBuffer(propertyName: string): Float32Array {
    const prop = this.getPropertyOrThrow(propertyName);
    return prop.aIsCurrent ? prop.bufferA : prop.bufferB;
  }

  /**
   * Get the next (write) buffer for a property.
   */
  getNextBuffer(propertyName: string): Float32Array {
    const prop = this.getPropertyOrThrow(propertyName);
    return prop.aIsCurrent ? prop.bufferB : prop.bufferA;
  }

  /**
   * Swap current and next buffers for all properties.
   * This is a reference swap, NOT a data copy.
   */
  swap(): void {
    for (const prop of this.properties.values()) {
      prop.aIsCurrent = !prop.aIsCurrent;
    }
  }

  /**
   * Convert (x, y, z) coordinates to a flat index.
   */
  coordToIndex(x: number, y: number, z: number): number {
    return x + y * this.config.width + z * this.config.width * this.config.height;
  }

  /**
   * Convert a flat index to (x, y, z) coordinates.
   */
  indexToCoord(index: number): [number, number, number] {
    const { width, height } = this.config;
    const x = index % width;
    const y = Math.floor(index / width) % height;
    const z = Math.floor(index / (width * height));
    return [x, y, z];
  }

  /**
   * Get a cell's value from the current (read) buffer.
   *
   * @param propertyName - Name of the property
   * @param index - Flat cell index
   * @param channel - Channel offset within the property (default 0)
   */
  getCellValue(propertyName: string, index: number, channel: number = 0): number {
    const buffer = this.getCurrentBuffer(propertyName);
    const prop = this.getPropertyOrThrow(propertyName);
    return buffer[index * prop.channels + channel];
  }

  /**
   * Set a cell's value in the next (write) buffer.
   *
   * @param propertyName - Name of the property
   * @param index - Flat cell index
   * @param value - Value to write
   * @param channel - Channel offset within the property (default 0)
   */
  setCellValue(propertyName: string, index: number, value: number, channel: number = 0): void {
    const buffer = this.getNextBuffer(propertyName);
    const prop = this.getPropertyOrThrow(propertyName);
    buffer[index * prop.channels + channel] = value;
  }

  /**
   * Get the flat indices of all valid neighbors for a cell.
   */
  getNeighborIndices(index: number): number[] {
    return getNeighborIndices(index, this.config);
  }

  /**
   * Reset all buffers to their default values.
   */
  reset(): void {
    for (const prop of this.properties.values()) {
      const { channels, defaultValue } = prop;
      for (let i = 0; i < this.cellCount; i++) {
        for (let c = 0; c < channels; c++) {
          prop.bufferA[i * channels + c] = defaultValue[c];
          prop.bufferB[i * channels + c] = defaultValue[c];
        }
      }
      prop.aIsCurrent = true;
    }
  }

  /**
   * Check if a property exists on this grid.
   */
  hasProperty(name: string): boolean {
    return this.properties.has(name);
  }

  /**
   * Get all property names.
   */
  getPropertyNames(): string[] {
    return [...this.properties.keys()];
  }

  /**
   * Get the internal PropertyBuffers for a property, or throw if not found.
   */
  private getPropertyOrThrow(name: string): PropertyBuffers {
    const prop = this.properties.get(name);
    if (!prop) {
      throw new Error(`Property '${name}' not found on this grid`);
    }
    return prop;
  }
}
