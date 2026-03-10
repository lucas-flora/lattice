/**
 * Cell property definition.
 *
 * Describes a single cell property with type, channels, default value,
 * I/O role, and optional compute function.
 */

import type { CellPropertyConfig, CellPropertyType, PropertyRole } from './types';
import { CHANNELS_PER_TYPE } from './types';

export class CellPropertyDefinition {
  readonly name: string;
  readonly type: CellPropertyType;
  readonly channels: number;
  readonly defaultValue: number[];
  readonly role: PropertyRole;
  readonly isComputed: boolean;
  readonly computeSource: string | undefined;

  constructor(config: CellPropertyConfig) {
    this.name = config.name;
    this.type = config.type;
    this.channels = CHANNELS_PER_TYPE[config.type];
    this.role = config.role ?? 'input_output';
    this.isComputed = config.compute !== undefined;
    this.computeSource = config.compute;

    // Normalize default value to array matching channel count
    this.defaultValue = this.normalizeDefault(config.default);
  }

  /**
   * Get the default value for this property.
   * Returns a single number for single-channel types, array for vector types.
   */
  getDefault(): number | number[] {
    if (this.channels === 1) {
      return this.defaultValue[0];
    }
    return [...this.defaultValue];
  }

  /**
   * Get the channel count for this property.
   */
  getChannels(): number {
    return this.channels;
  }

  /**
   * Validate a value against this property's type.
   */
  validateValue(value: number | number[]): boolean {
    if (this.channels === 1) {
      return typeof value === 'number';
    }
    return Array.isArray(value) && value.length === this.channels;
  }

  /**
   * Read a value from a Float32Array at the given cell index and property offset.
   *
   * @param buffer - The Float32Array to read from
   * @param cellIndex - The flat cell index
   * @param propertyOffset - The channel offset of this property within the cell's data
   */
  readFromBuffer(
    buffer: Float32Array,
    cellIndex: number,
    propertyOffset: number,
  ): number | number[] {
    const baseIndex = cellIndex * this.channels;

    if (this.channels === 1) {
      const raw = buffer[baseIndex + propertyOffset];
      if (this.type === 'bool') {
        return Math.round(raw) === 0 ? 0 : 1;
      }
      if (this.type === 'int') {
        return Math.round(raw);
      }
      return raw;
    }

    // Vector types: read consecutive channels
    const result: number[] = [];
    for (let c = 0; c < this.channels; c++) {
      result.push(buffer[baseIndex + propertyOffset + c]);
    }
    return result;
  }

  /**
   * Write a value to a Float32Array at the given cell index and property offset.
   *
   * @param buffer - The Float32Array to write to
   * @param cellIndex - The flat cell index
   * @param propertyOffset - The channel offset of this property within the cell's data
   * @param value - The value to write
   */
  writeToBuffer(
    buffer: Float32Array,
    cellIndex: number,
    propertyOffset: number,
    value: number | number[],
  ): void {
    const baseIndex = cellIndex * this.channels;

    if (this.channels === 1) {
      let v = value as number;
      if (this.type === 'bool') {
        v = v ? 1.0 : 0.0;
      }
      buffer[baseIndex + propertyOffset] = v;
      return;
    }

    // Vector types: write consecutive channels
    const arr = value as number[];
    for (let c = 0; c < this.channels; c++) {
      buffer[baseIndex + propertyOffset + c] = arr[c];
    }
  }

  /**
   * Normalize default value to an array matching channel count.
   */
  private normalizeDefault(value: number | number[]): number[] {
    if (typeof value === 'number') {
      return new Array(this.channels).fill(value);
    }
    if (value.length !== this.channels) {
      throw new Error(
        `Property '${this.name}' has type '${this.type}' (${this.channels} channels) but default has ${value.length} values`,
      );
    }
    return [...value];
  }
}
