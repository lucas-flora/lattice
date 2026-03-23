/**
 * Unit tests for ShaderCompiler hash/cache behavior.
 *
 * These tests mock GPUContext so they can run in Node/Vitest without a real GPU.
 * They verify the caching logic and hash function — not actual WGSL compilation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShaderCompiler } from '../ShaderCompiler';

// Mock GPUContext.get() to return a fake device
vi.mock('../GPUContext', () => ({
  GPUContext: {
    get: () => ({
      device: {
        createShaderModule: vi.fn(({ label }: { label: string }) => ({
          label,
          getCompilationInfo: vi.fn(async () => ({ messages: [] })),
        })),
      },
    }),
  },
}));

// Mock eventBus
vi.mock('../../core/EventBus', () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

describe('ShaderCompiler', () => {
  let compiler: ShaderCompiler;

  beforeEach(() => {
    compiler = new ShaderCompiler();
  });

  it('TestShaderCompiler_Compile_ReturnsModule', () => {
    const module = compiler.compile('@compute fn main() {}', 'test-shader');
    expect(module).toBeDefined();
    expect(module.label).toBe('test-shader');
  });

  it('TestShaderCompiler_Cache_SameSourceReturnsSameModule', () => {
    const source = '@compute fn main() { /* v1 */ }';
    const module1 = compiler.compile(source, 'shader-a');
    const module2 = compiler.compile(source, 'shader-b');
    // Same source → same cached module (label from first compile)
    expect(module1).toBe(module2);
  });

  it('TestShaderCompiler_Cache_DifferentSourceReturnsDifferentModule', () => {
    const module1 = compiler.compile('@compute fn main() { /* A */ }', 'shader-a');
    const module2 = compiler.compile('@compute fn main() { /* B */ }', 'shader-b');
    expect(module1).not.toBe(module2);
  });

  it('TestShaderCompiler_IsCached_ReturnsTrueAfterCompile', () => {
    const source = '@compute fn main() {}';
    expect(compiler.isCached(source)).toBe(false);
    compiler.compile(source);
    expect(compiler.isCached(source)).toBe(true);
  });

  it('TestShaderCompiler_ClearCache_RemovesAllEntries', () => {
    compiler.compile('@compute fn a() {}', 'a');
    compiler.compile('@compute fn b() {}', 'b');
    expect(compiler.cacheSize).toBe(2);
    compiler.clearCache();
    expect(compiler.cacheSize).toBe(0);
  });

  it('TestShaderCompiler_HashCollisionResistance_SimilarStrings', () => {
    // These should produce different hashes
    const source1 = 'fn main() { x = 0; }';
    const source2 = 'fn main() { x = 1; }';
    compiler.compile(source1, 'a');
    compiler.compile(source2, 'b');
    expect(compiler.cacheSize).toBe(2);
  });
});
