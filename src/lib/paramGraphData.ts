/**
 * Parameter graph data management.
 *
 * GUIP-02: Ring buffer for parameter time series data.
 * Stores the last N samples of simulation metrics for sparkline rendering.
 */

export interface GraphSample {
  /** Generation number when this sample was taken */
  generation: number;
  /** Value of the metric at this generation */
  value: number;
}

/**
 * Ring buffer that stores parameter samples for graph rendering.
 * Fixed capacity — oldest samples are evicted when full.
 */
export class ParamGraphBuffer {
  private buffer: GraphSample[];
  private capacity: number;
  private writeIndex: number = 0;
  private count: number = 0;

  constructor(capacity: number = 200) {
    this.capacity = Math.max(1, capacity);
    this.buffer = new Array<GraphSample>(this.capacity);
  }

  /**
   * Add a sample to the ring buffer.
   */
  push(sample: GraphSample): void {
    this.buffer[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * Get all samples in chronological order (oldest first).
   */
  getSamples(): GraphSample[] {
    if (this.count === 0) return [];

    if (this.count < this.capacity) {
      return this.buffer.slice(0, this.count);
    }

    // Ring has wrapped: read from writeIndex to end, then from 0 to writeIndex
    const result: GraphSample[] = [];
    for (let i = 0; i < this.capacity; i++) {
      const idx = (this.writeIndex + i) % this.capacity;
      result.push(this.buffer[idx]);
    }
    return result;
  }

  /**
   * Get the current number of samples.
   */
  getCount(): number {
    return this.count;
  }

  /**
   * Get the buffer capacity.
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Get the most recent sample, or null if empty.
   */
  getLatest(): GraphSample | null {
    if (this.count === 0) return null;
    const idx = (this.writeIndex - 1 + this.capacity) % this.capacity;
    return this.buffer[idx];
  }

  /**
   * Get the min and max values in the buffer.
   */
  getRange(): { min: number; max: number } {
    if (this.count === 0) return { min: 0, max: 0 };

    let min = Infinity;
    let max = -Infinity;
    const samples = this.getSamples();
    for (const s of samples) {
      if (s.value < min) min = s.value;
      if (s.value > max) max = s.value;
    }
    return { min, max };
  }

  /**
   * Clear all samples.
   */
  clear(): void {
    this.count = 0;
    this.writeIndex = 0;
  }
}

/**
 * Render sparkline points from samples, normalized to a given width and height.
 *
 * @param samples - Array of graph samples
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @returns Array of [x, y] coordinate pairs for drawing
 */
export function samplesToSparklinePoints(
  samples: GraphSample[],
  width: number,
  height: number,
): Array<[number, number]> {
  if (samples.length === 0) return [];
  if (samples.length === 1) {
    return [[width / 2, height / 2]];
  }

  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    if (s.value < min) min = s.value;
    if (s.value > max) max = s.value;
  }

  // Avoid division by zero
  const range = max - min || 1;
  const padding = height * 0.1;
  const drawHeight = height - 2 * padding;

  return samples.map((s, i) => {
    const x = (i / (samples.length - 1)) * width;
    const y = padding + drawHeight * (1 - (s.value - min) / range);
    return [x, y] as [number, number];
  });
}
