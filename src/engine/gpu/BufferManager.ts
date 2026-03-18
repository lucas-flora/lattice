/**
 * BufferManager: manages GPU storage buffers for the simulation grid.
 *
 * The GPU equivalent of Grid.ts's Float32Array ping-pong buffers.
 * Uses interleaved layout: all properties for cell 0, then cell 1, etc.
 * This is better for GPU cache coherence than separate buffers per property.
 *
 * Buffer lifecycle:
 *   1. initialize(config) — allocates ping-pong storage + staging + uniform buffers
 *   2. uploadToRead(data) — seeds initial state from CPU
 *   3. [compute shader reads from read buffer, writes to write buffer]
 *   4. swap() — swap read/write references (zero-cost pointer swap)
 *   5. readBack() — copy GPU data to CPU via staging buffer (async)
 *   6. destroy() — release all GPU buffers
 */

import { GPUContext } from './GPUContext';
import type { GPUGridConfig, PropertyLayout } from './types';
import { SIM_PARAMS_SIZE_BYTES, SIM_PARAMS_ENV_OFFSET_FLOATS, SIM_PARAMS_MAX_ENV_PARAMS } from './types';
import { logMin, logDbg } from '../../lib/debugLog';

export class BufferManager {
  /** Total floats per cell (sum of all property channels) */
  readonly stride: number;
  /** Total number of cells */
  readonly cellCount: number;
  /** Grid dimensions */
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  /** Property layout descriptors with computed offsets */
  readonly layout: PropertyLayout[];

  private bufferA: GPUBuffer | null = null;
  private bufferB: GPUBuffer | null = null;
  private stagingBuffer: GPUBuffer | null = null;
  private paramsBuffer: GPUBuffer | null = null;
  private aIsRead = true;
  private generation = 0;
  private totalGPUBytes = 0;

  constructor() {
    this.stride = 0;
    this.cellCount = 0;
    this.width = 0;
    this.height = 0;
    this.depth = 0;
    this.layout = [];
  }

  /**
   * Allocate GPU buffers for the given grid configuration.
   * Creates two storage buffers (ping-pong), one staging buffer (readback),
   * and one uniform buffer (simulation params).
   *
   * @param config - Grid dimensions and property descriptors
   * @throws Error if buffers exceed device limits
   */
  initialize(config: GPUGridConfig): void {
    this.destroy(); // Clean up any existing buffers

    const ctx = GPUContext.get();
    const device = ctx.device;

    // Compute interleaved layout
    const layout: PropertyLayout[] = [];
    let offset = 0;
    for (const prop of config.properties) {
      layout.push({
        name: prop.name,
        offset,
        channels: prop.channels,
        type: prop.type,
      });
      offset += prop.channels;
    }

    const stride = offset;
    const cellCount = config.width * config.height * config.depth;
    const bufferSizeBytes = cellCount * stride * 4; // Float32 = 4 bytes

    // Check against device limits
    const maxSize = device.limits.maxStorageBufferBindingSize;
    if (bufferSizeBytes > maxSize) {
      throw new Error(
        `Grid buffer (${(bufferSizeBytes / 1024 / 1024).toFixed(1)}MB) exceeds GPU limit ` +
        `(${(maxSize / 1024 / 1024).toFixed(0)}MB). Reduce grid size or property count.`
      );
    }

    // Mutate readonly properties (set once during initialize)
    (this as { stride: number }).stride = stride;
    (this as { cellCount: number }).cellCount = cellCount;
    (this as { width: number }).width = config.width;
    (this as { height: number }).height = config.height;
    (this as { depth: number }).depth = config.depth;
    (this as { layout: PropertyLayout[] }).layout = layout;

    // Create ping-pong storage buffers
    this.bufferA = device.createBuffer({
      label: 'grid-buffer-A',
      size: bufferSizeBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    this.bufferB = device.createBuffer({
      label: 'grid-buffer-B',
      size: bufferSizeBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    // Staging buffer for GPU→CPU readback
    this.stagingBuffer = device.createBuffer({
      label: 'grid-staging',
      size: bufferSizeBytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Uniform buffer for simulation params
    this.paramsBuffer = device.createBuffer({
      label: 'sim-params',
      size: SIM_PARAMS_SIZE_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.aIsRead = true;
    this.generation = 0;
    this.totalGPUBytes = bufferSizeBytes * 3 + SIM_PARAMS_SIZE_BYTES; // A + B + staging + params

    // Write initial params
    this.writeParams({});

    logMin('gpu', `Buffers allocated: ${cellCount} cells × ${stride} stride = ${(bufferSizeBytes / 1024).toFixed(0)}KB/buffer, ${(this.totalGPUBytes / 1024 / 1024).toFixed(1)}MB total`);
    logDbg('gpu', `Layout: ${layout.map(l => `${l.name}@${l.offset}[${l.channels}]`).join(', ')}`);
  }

  /**
   * Get the current read buffer (input to compute shader).
   * @throws Error if not initialized
   */
  getReadBuffer(): GPUBuffer {
    const buf = this.aIsRead ? this.bufferA : this.bufferB;
    if (!buf) throw new Error('BufferManager not initialized');
    return buf;
  }

  /**
   * Get the current write buffer (output of compute shader).
   * @throws Error if not initialized
   */
  getWriteBuffer(): GPUBuffer {
    const buf = this.aIsRead ? this.bufferB : this.bufferA;
    if (!buf) throw new Error('BufferManager not initialized');
    return buf;
  }

  /**
   * Swap read/write buffer references. Zero-cost pointer swap.
   * Call after each compute dispatch to advance the ping-pong.
   */
  swap(): void {
    this.aIsRead = !this.aIsRead;
    this.generation++;
  }

  /**
   * Upload CPU data to the read buffer (for initialization/seeding).
   * Data must be a Float32Array of size cellCount * stride.
   *
   * @param data - CPU-side grid data in interleaved layout
   */
  uploadToRead(data: Float32Array): void {
    const buf = this.getReadBuffer();
    const ctx = GPUContext.get();
    if (data.byteLength !== buf.size) {
      throw new Error(`Data size mismatch: expected ${buf.size} bytes, got ${data.byteLength}`);
    }
    ctx.device.queue.writeBuffer(buf, 0, data.buffer, data.byteOffset, data.byteLength);
  }

  /**
   * Read data back from the read buffer to CPU.
   * Uses a staging buffer + mapAsync for async GPU→CPU transfer.
   * This is slow — use sparingly (debugging, benchmarks, frame cache).
   *
   * @returns Float32Array of size cellCount * stride
   */
  async readBack(): Promise<Float32Array> {
    const readBuf = this.getReadBuffer();
    if (!this.stagingBuffer) throw new Error('BufferManager not initialized');
    const ctx = GPUContext.get();

    // Copy from storage buffer to staging buffer
    const encoder = ctx.device.createCommandEncoder({ label: 'readback-copy' });
    encoder.copyBufferToBuffer(readBuf, 0, this.stagingBuffer, 0, readBuf.size);
    ctx.device.queue.submit([encoder.finish()]);

    // Map staging buffer and read
    await this.stagingBuffer.mapAsync(GPUMapMode.READ);
    const mapped = this.stagingBuffer.getMappedRange();
    const result = new Float32Array(mapped.slice(0));
    this.stagingBuffer.unmap();

    return result;
  }

  /**
   * Get the uniform buffer containing simulation params.
   * @throws Error if not initialized
   */
  getParamsBuffer(): GPUBuffer {
    if (!this.paramsBuffer) throw new Error('BufferManager not initialized');
    return this.paramsBuffer;
  }

  /**
   * Update the simulation params uniform buffer.
   * Always writes width/height/depth/stride/generation/dt,
   * plus any env params passed in the record.
   *
   * @param envParams - Named environment parameters (e.g. { feedRate: 0.037 })
   */
  updateParams(envParams: Record<string, number>): void {
    this.writeParams(envParams);
  }

  /** Get total GPU memory allocated in bytes */
  getTotalGPUBytes(): number {
    return this.totalGPUBytes;
  }

  /** Get the current generation counter */
  getGeneration(): number {
    return this.generation;
  }

  /**
   * Release all GPU buffers. Safe to call multiple times.
   */
  destroy(): void {
    this.bufferA?.destroy();
    this.bufferB?.destroy();
    this.stagingBuffer?.destroy();
    this.paramsBuffer?.destroy();
    this.bufferA = null;
    this.bufferB = null;
    this.stagingBuffer = null;
    this.paramsBuffer = null;
    this.totalGPUBytes = 0;
  }

  /**
   * Write params to the uniform buffer.
   * Layout: [width, height, depth, stride, generation, dt, pad, pad, env0..env31]
   */
  private writeParams(envParams: Record<string, number>): void {
    if (!this.paramsBuffer) return;
    const ctx = GPUContext.get();

    const data = new ArrayBuffer(SIM_PARAMS_SIZE_BYTES);
    const u32 = new Uint32Array(data);
    const f32 = new Float32Array(data);

    u32[0] = this.width;
    u32[1] = this.height;
    u32[2] = this.depth;
    u32[3] = this.stride;
    u32[4] = this.generation;
    f32[5] = 1.0; // dt
    // u32[6], u32[7] = padding

    // Write env params into slots 8..39
    const envKeys = Object.keys(envParams);
    for (let i = 0; i < Math.min(envKeys.length, SIM_PARAMS_MAX_ENV_PARAMS); i++) {
      f32[SIM_PARAMS_ENV_OFFSET_FLOATS + i] = envParams[envKeys[i]];
    }

    ctx.device.queue.writeBuffer(this.paramsBuffer, 0, data);
  }
}
