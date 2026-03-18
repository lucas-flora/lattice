/**
 * GPUContext: singleton managing WebGPU adapter/device lifecycle.
 *
 * Call GPUContext.initialize() once at app startup. All other GPU modules
 * call GPUContext.get() to access the device. Handles device loss with
 * automatic re-initialization attempt and EventBus notification.
 */

import { eventBus } from '../core/EventBus';
import { logMin, logDbg } from '../../lib/debugLog';

export class GPUContext {
  private static instance: GPUContext | null = null;

  readonly adapter: GPUAdapter;
  readonly device: GPUDevice;
  readonly adapterInfo: GPUAdapterInfo;

  private constructor(adapter: GPUAdapter, device: GPUDevice, adapterInfo: GPUAdapterInfo) {
    this.adapter = adapter;
    this.device = device;
    this.adapterInfo = adapterInfo;

    // Listen for device loss
    this.device.lost.then((info) => {
      const reason = info.message || info.reason || 'unknown';
      logMin('gpu', `Device lost: ${reason}`);
      eventBus.emit('gpu:device-lost', { reason });
      GPUContext.instance = null;

      // Attempt re-initialization if the loss wasn't intentional
      if (info.reason !== 'destroyed') {
        logMin('gpu', 'Attempting GPU re-initialization...');
        GPUContext.initialize().catch((err) => {
          logMin('gpu', `Re-initialization failed: ${err}`);
        });
      }
    });
  }

  /**
   * Check if WebGPU is available in this browser.
   * Does not request adapter — just checks for the API surface.
   */
  static isAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  }

  /**
   * Acquire GPU adapter and device. Call once at app startup.
   * Emits 'gpu:initialized' on success, 'gpu:error' on failure.
   *
   * @throws Error if WebGPU is not available or device acquisition fails
   */
  static async initialize(): Promise<GPUContext> {
    if (GPUContext.instance) return GPUContext.instance;

    if (!GPUContext.isAvailable()) {
      const msg = 'WebGPU not available in this browser. Requires Chrome 113+, Safari 26+, or Firefox 141+.';
      eventBus.emit('gpu:error', { message: msg });
      throw new Error(msg);
    }

    // Request high-performance adapter
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });

    if (!adapter) {
      const msg = 'Failed to acquire GPU adapter. Your browser supports WebGPU but no suitable GPU was found.';
      eventBus.emit('gpu:error', { message: msg });
      throw new Error(msg);
    }

    const adapterInfo = adapter.info;

    // Log adapter info
    logMin('gpu', `Adapter: ${adapterInfo.vendor} ${adapterInfo.architecture} — ${adapterInfo.description || adapterInfo.device}`);
    logDbg('gpu', `Max storage buffer: ${adapter.limits.maxStorageBufferBindingSize} bytes`);
    logDbg('gpu', `Max compute workgroups/dim: ${adapter.limits.maxComputeWorkgroupsPerDimension}`);
    logDbg('gpu', `Max workgroup size X: ${adapter.limits.maxComputeWorkgroupSizeX}`);

    // Request device with elevated limits for large grids
    const requiredLimits: Record<string, number> = {};

    // Request max available storage buffer size (for large grids)
    const maxStorage = adapter.limits.maxStorageBufferBindingSize;
    requiredLimits.maxStorageBufferBindingSize = maxStorage;

    // Request max buffer size
    const maxBufferSize = adapter.limits.maxBufferSize;
    requiredLimits.maxBufferSize = maxBufferSize;

    let device: GPUDevice;
    try {
      device = await adapter.requestDevice({
        label: 'lattice-compute',
        requiredLimits,
      });
    } catch (err) {
      const msg = `Failed to acquire GPU device: ${err instanceof Error ? err.message : String(err)}. ` +
        `Adapter limits: maxStorageBuffer=${maxStorage}, maxBuffer=${maxBufferSize}`;
      eventBus.emit('gpu:error', { message: msg });
      throw new Error(msg);
    }

    // Handle uncaptured errors
    device.addEventListener('uncapturederror', (event: GPUUncapturedErrorEvent) => {
      logMin('gpu', `Uncaptured GPU error: ${event.error.message}`);
      eventBus.emit('gpu:error', { message: event.error.message });
    });

    const ctx = new GPUContext(adapter, device, adapterInfo);
    GPUContext.instance = ctx;

    // Calculate max supported grid size
    const maxGridSize = ctx.getMaxGridSize(8); // assume 8 properties as typical

    logMin('gpu', `GPU initialized — max grid: ${maxGridSize}x${maxGridSize} (8 props), buffer limit: ${(maxStorage / (1024 * 1024)).toFixed(0)}MB`);

    eventBus.emit('gpu:initialized', {
      adapter: `${adapterInfo.vendor} ${adapterInfo.architecture}`,
      device: adapterInfo.description || adapterInfo.device,
      maxBufferSize: maxStorage,
    });

    return ctx;
  }

  /**
   * Get the singleton GPUContext. Throws if not initialized.
   */
  static get(): GPUContext {
    if (!GPUContext.instance) {
      throw new Error('GPUContext not initialized. Call GPUContext.initialize() first.');
    }
    return GPUContext.instance;
  }

  /**
   * Get the singleton if available, or null if not initialized.
   */
  static tryGet(): GPUContext | null {
    return GPUContext.instance;
  }

  /**
   * Calculate the maximum square grid size supported given a number of properties.
   * Each cell uses `stride * 4` bytes where stride = sum of all property channels.
   * Two buffers needed for ping-pong, so max cells = maxStorageBufferSize / (stride * 4).
   *
   * @param numPropertyChannels - Total float channels across all properties
   * @returns Maximum side length for a square grid
   */
  getMaxGridSize(numPropertyChannels: number): number {
    const maxBytes = this.device.limits.maxStorageBufferBindingSize;
    const bytesPerCell = numPropertyChannels * 4; // Float32 = 4 bytes
    const maxCells = Math.floor(maxBytes / bytesPerCell);
    return Math.floor(Math.sqrt(maxCells));
  }

  /**
   * Get key device limits for display and constraint checking.
   */
  getLimits(): {
    maxStorageBufferBindingSize: number;
    maxBufferSize: number;
    maxComputeWorkgroupsPerDimension: number;
    maxComputeWorkgroupSizeX: number;
    maxComputeWorkgroupSizeY: number;
    maxComputeWorkgroupSizeZ: number;
    maxComputeInvocationsPerWorkgroup: number;
  } {
    const l = this.device.limits;
    return {
      maxStorageBufferBindingSize: l.maxStorageBufferBindingSize,
      maxBufferSize: l.maxBufferSize,
      maxComputeWorkgroupsPerDimension: l.maxComputeWorkgroupsPerDimension,
      maxComputeWorkgroupSizeX: l.maxComputeWorkgroupSizeX,
      maxComputeWorkgroupSizeY: l.maxComputeWorkgroupSizeY,
      maxComputeWorkgroupSizeZ: l.maxComputeWorkgroupSizeZ,
      maxComputeInvocationsPerWorkgroup: l.maxComputeInvocationsPerWorkgroup,
    };
  }

  /**
   * Clean up GPU resources. Called on app teardown.
   * After destroy(), GPUContext.get() will throw until re-initialized.
   */
  destroy(): void {
    this.device.destroy();
    GPUContext.instance = null;
    logMin('gpu', 'GPU context destroyed');
  }
}
