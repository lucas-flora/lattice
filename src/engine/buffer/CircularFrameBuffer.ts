/**
 * CircularFrameBuffer: ring buffer of GPU frame snapshots for scrubbing.
 *
 * Migration context:
 * - Replaces the old Map<number, TickSnapshot> frame cache in SimulationController.
 * - Stores interleaved GPU readback data (Float32Array) per frame, not per-property Maps.
 * - Frame indices are absolute (0, 1, 2, ...). Ring maps via modulo.
 * - Each snapshot is a .slice() clone — never a reference to a live GPU staging buffer.
 * - Single-threaded (requestAnimationFrame callback) — no concurrent read/write safety needed.
 *
 * The buffer fills behind the playhead during live mode. When full, the oldest
 * frame is overwritten. Scrubbing within the buffer window is instant (upload
 * snapshot back to GPU). Scrubbing beyond requires recomputation from the nearest
 * cached frame or initial state.
 */

export interface FrameSnapshot {
  /** Absolute frame number in the simulation */
  frameIndex: number;
  /** Interleaved GPU buffer data (Float32Array clone) */
  data: Float32Array;
  /** Date.now() when captured — for debugging/profiling */
  timestamp: number;
}

/**
 * Compute a sensible default buffer capacity based on grid dimensions.
 * Targets ~500MB RAM. Clamps to [10, 2000] frames.
 */
export function computeDefaultBufferSize(
  gridWidth: number,
  gridHeight: number,
  propertiesPerCell: number,
  bytesPerProperty: number = 4, // Float32
): { frames: number; estimatedRAM: number; bytesPerFrame: number } {
  const bytesPerFrame = gridWidth * gridHeight * propertiesPerCell * bytesPerProperty;
  const targetRAM = 500 * 1024 * 1024; // 500MB
  let frames = bytesPerFrame > 0 ? Math.floor(targetRAM / bytesPerFrame) : 2000;
  frames = Math.max(10, Math.min(frames, 2000));

  return {
    frames,
    estimatedRAM: frames * bytesPerFrame,
    bytesPerFrame,
  };
}

export class CircularFrameBuffer {
  private buffer: (FrameSnapshot | null)[];
  private capacity: number;
  private writeIndex: number = 0;
  private _oldestFrameIndex: number = -1;
  private _newestFrameIndex: number = -1;
  private _count: number = 0;
  private _bytesPerFrame: number = 0;

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
    this.buffer = new Array(this.capacity).fill(null);
  }

  /** Push a new frame snapshot. If buffer is full, overwrites oldest. */
  push(frameIndex: number, data: Float32Array): void {
    const snapshot: FrameSnapshot = {
      frameIndex,
      data: data.slice(), // Clone — never hold a reference to a mutable buffer
      timestamp: Date.now(),
    };

    this._bytesPerFrame = data.byteLength;
    this.buffer[this.writeIndex] = snapshot;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;

    if (this._count < this.capacity) {
      this._count++;
    }

    this._newestFrameIndex = frameIndex;

    // Update oldest: scan for the actual oldest when buffer is full
    if (this._count === 1) {
      this._oldestFrameIndex = frameIndex;
    } else if (this._count === this.capacity) {
      // The slot we're about to write next holds the oldest
      const oldestSlot = this.buffer[this.writeIndex];
      this._oldestFrameIndex = oldestSlot ? oldestSlot.frameIndex : frameIndex;
    }
  }

  /** Get a frame snapshot by absolute frame index. Returns null if not cached. */
  get(frameIndex: number): FrameSnapshot | null {
    if (this._count === 0) return null;
    // Linear scan — buffer is small enough (max 2000) that this is fine
    for (let i = 0; i < this._count; i++) {
      const slot = this.buffer[i];
      if (slot && slot.frameIndex === frameIndex) return slot;
    }
    return null;
  }

  /** Check if a frame is in the buffer. */
  has(frameIndex: number): boolean {
    return this.get(frameIndex) !== null;
  }

  /** Oldest frame index currently in the buffer. -1 if empty. */
  get oldestFrame(): number {
    return this._oldestFrameIndex;
  }

  /** Newest frame index currently in the buffer. -1 if empty. */
  get newestFrame(): number {
    return this._newestFrameIndex;
  }

  /** How many frames are currently stored. */
  get size(): number {
    return this._count;
  }

  /** Maximum frames this buffer can hold. */
  get maxCapacity(): number {
    return this.capacity;
  }

  /** Clear all stored frames. */
  clear(): void {
    this.buffer.fill(null);
    this.writeIndex = 0;
    this._oldestFrameIndex = -1;
    this._newestFrameIndex = -1;
    this._count = 0;
  }

  /** Resize the buffer. Clears all existing data. */
  resize(newCapacity: number): void {
    this.capacity = Math.max(1, newCapacity);
    this.buffer = new Array(this.capacity).fill(null);
    this.writeIndex = 0;
    this._oldestFrameIndex = -1;
    this._newestFrameIndex = -1;
    this._count = 0;
  }

  /** Estimated memory usage in bytes. */
  get memoryUsage(): number {
    return this._count * this._bytesPerFrame;
  }

  /** Bytes per frame (0 if no frames pushed yet). */
  get bytesPerFrame(): number {
    return this._bytesPerFrame;
  }
}
