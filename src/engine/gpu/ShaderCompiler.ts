/**
 * ShaderCompiler: compiles WGSL strings to GPUShaderModule with caching.
 *
 * Caches compiled modules by content hash (FNV-1a) to avoid redundant
 * compilation. Parses GPUCompilationInfo for error/warning diagnostics
 * with line-number references back to the WGSL source.
 */

import { GPUContext } from './GPUContext';
import { logMin, logDbg, logGPU } from '../../lib/debugLog';
import { eventBus } from '../core/EventBus';

/**
 * FNV-1a hash for string content. Fast, good distribution for cache keys.
 * Not cryptographic — just needs to be collision-resistant for ~dozens of shaders.
 */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return (hash >>> 0).toString(16);
}

export class ShaderCompiler {
  private cache = new Map<string, GPUShaderModule>();

  /**
   * Compile a WGSL shader string to a GPUShaderModule.
   * Returns a cached module if the same source was compiled before.
   *
   * @param wgsl - WGSL source code
   * @param label - Optional label for GPU debugger tooling
   * @returns Compiled shader module
   */
  compile(wgsl: string, label?: string): GPUShaderModule {
    const hash = fnv1a(wgsl);
    const cached = this.cache.get(hash);
    if (cached) {
      logDbg('gpu', `Shader cache hit: ${label ?? hash}`);
      eventBus.emit('gpu:shader-compiled', { label: label ?? hash, cached: true });
      return cached;
    }

    const ctx = GPUContext.get();
    const module = ctx.device.createShaderModule({
      label: label ?? `shader-${hash}`,
      code: wgsl,
    });

    this.cache.set(hash, module);
    logGPU(`Shader compiled: ${label ?? hash}`);
    eventBus.emit('gpu:shader-compiled', { label: label ?? hash, cached: false });

    // Check for compilation errors/warnings asynchronously
    this.checkCompilation(module, wgsl, label ?? hash);

    return module;
  }

  /**
   * Check if a shader source is already compiled and cached.
   */
  isCached(wgsl: string): boolean {
    return this.cache.has(fnv1a(wgsl));
  }

  /**
   * Clear all cached shader modules.
   */
  clearCache(): void {
    this.cache.clear();
    logDbg('gpu', 'Shader cache cleared');
  }

  /**
   * Get compilation diagnostics for a shader module.
   * Returns warnings and errors with line numbers.
   *
   * @param module - Compiled shader module
   * @returns Compilation info from the GPU driver
   */
  async getCompilationInfo(module: GPUShaderModule): Promise<GPUCompilationInfo> {
    return module.getCompilationInfo();
  }

  /** Get the number of cached modules */
  get cacheSize(): number {
    return this.cache.size;
  }

  /**
   * Check compilation info and log warnings/errors.
   * Called automatically after compile() — does not block.
   */
  private async checkCompilation(module: GPUShaderModule, wgsl: string, label: string): Promise<void> {
    try {
      const info = await module.getCompilationInfo();
      const lines = wgsl.split('\n');

      for (const msg of info.messages) {
        const lineNum = msg.lineNum ?? 0;
        const sourceLine = lineNum > 0 && lineNum <= lines.length ? lines[lineNum - 1] : '';
        const location = lineNum > 0 ? ` (line ${lineNum}: ${sourceLine.trim()})` : '';

        if (msg.type === 'error') {
          logGPU(`Shader ERROR in ${label}: ${msg.message}${location}`);
        } else if (msg.type === 'warning') {
          logDbg('gpu', `Shader warning in ${label}: ${msg.message}${location}`);
        }
      }
    } catch {
      // getCompilationInfo may not be supported on all implementations
    }
  }
}
