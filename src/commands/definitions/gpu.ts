/**
 * GPU commands: gpu.test, gpu.info.
 *
 * gpu.test — End-to-end proof-of-life: initialize GPU, allocate buffers,
 *   compile a fill shader, dispatch, readback, verify, and submit results
 *   to the gpu_compatibility table in Supabase.
 *
 * gpu.info — Display WebGPU availability, adapter info, device limits,
 *   and max supported grid size.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import { GPUContext } from '../../engine/gpu/GPUContext';
import { BufferManager } from '../../engine/gpu/BufferManager';
import { ShaderCompiler } from '../../engine/gpu/ShaderCompiler';
import { ComputeDispatcher } from '../../engine/gpu/ComputeDispatcher';
import { supabase } from '../../lib/supabaseClient';

const NoParams = z.object({}).describe('none');

/**
 * Proof-of-life compute shader: fills every cell with 1.0.
 * Uses a vec4<u32> uniform for [width, height, 0, 0].
 */
const FILL_SHADER_WGSL = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> output: array<f32>;
@group(0) @binding(1) var<uniform> params: vec4<u32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x;
  let y = gid.y;
  let width = params.x;
  let height = params.y;
  if (x >= width || y >= height) { return; }
  let idx = y * width + x;
  output[idx] = 1.0;
}
`;

/** Detect browser from user agent */
function detectBrowser(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  const match = ua.match(/(Chrome|Firefox|Safari|Edge)\/(\d+[\d.]*)/);
  if (match) return `${match[1]}/${match[2]}`;
  return ua.slice(0, 100);
}

/** Submit GPU test results to the gpu_compatibility table */
async function submitCompatibilityResult(row: Record<string, unknown>): Promise<void> {
  if (!supabase) {
    console.log('[gpu] Supabase not configured — compatibility result logged to console');
    console.log(JSON.stringify(row, null, 2));
    return;
  }
  const { error } = await supabase.from('gpu_compatibility').insert(row);
  if (error) {
    console.error('[gpu] Failed to submit compatibility result:', error.message);
  }
}

export function registerGpuCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'gpu.test',
    description: 'Run GPU proof-of-life: fill shader dispatch + readback verification',
    category: 'gpu',
    params: NoParams,
    execute: async () => {
      const browser = detectBrowser();
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;

      try {
        // 1. Initialize GPU
        const initStart = performance.now();
        const ctx = await GPUContext.initialize();
        const initMs = performance.now() - initStart;

        const info = ctx.adapterInfo;
        const limits = ctx.getLimits();

        // 2. Create buffer manager for a 64×64 grid with one f32 property
        const bufMgr = new BufferManager();
        bufMgr.initialize({
          width: 64,
          height: 64,
          depth: 1,
          properties: [{ name: 'test', channels: 1, type: 'f32', defaultValue: [0] }],
        });

        // 3. Compile the fill shader
        const compiler = new ShaderCompiler();
        const dispatcher = new ComputeDispatcher(compiler);

        const compileStart = performance.now();
        const pipeline = dispatcher.createPipeline({
          wgsl: FILL_SHADER_WGSL,
          label: 'fill-test',
          workgroupSize: [8, 8, 1],
        });
        const compileMs = performance.now() - compileStart;

        // 4. Create uniform buffer with [width=64, height=64, 0, 0]
        const paramsData = new Uint32Array([64, 64, 0, 0]);
        const paramsBuffer = ctx.device.createBuffer({
          label: 'fill-test-params',
          size: 16,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        ctx.device.queue.writeBuffer(paramsBuffer, 0, paramsData);

        // 5. Create bind group
        const bindGroup = dispatcher.createBindGroup(pipeline, [
          { binding: 0, resource: { buffer: bufMgr.getWriteBuffer() } },
          { binding: 1, resource: { buffer: paramsBuffer } },
        ]);

        // 6. Dispatch
        const dispatchStart = performance.now();
        const workgroups = ComputeDispatcher.calcWorkgroups([64, 64, 1], [8, 8, 1]);
        dispatcher.dispatchAndSubmit(pipeline, bindGroup, workgroups);
        await ctx.device.queue.onSubmittedWorkDone();
        const dispatchMs = performance.now() - dispatchStart;

        // 7. Swap so write buffer becomes read buffer, then readback
        bufMgr.swap();
        const readbackStart = performance.now();
        const result = await bufMgr.readBack();
        const readbackMs = performance.now() - readbackStart;

        // 8. Verify all 4096 values are 1.0
        const totalCells = 64 * 64;
        let correctCount = 0;
        for (let i = 0; i < totalCells; i++) {
          if (result[i] === 1.0) correctCount++;
        }
        const passed = correctCount === totalCells;
        const totalMs = initMs + compileMs + dispatchMs + readbackMs;

        // 9. Clean up
        paramsBuffer.destroy();
        bufMgr.destroy();

        // 10. Submit to Supabase
        const round1 = (n: number) => Math.round(n * 10) / 10;
        await submitCompatibilityResult({
          browser,
          user_agent: userAgent,
          gpu_vendor: info.vendor || null,
          gpu_architecture: info.architecture || null,
          gpu_device: info.device || null,
          gpu_description: info.description || null,
          max_storage_buffer_mb: round1(limits.maxStorageBufferBindingSize / 1024 / 1024),
          max_buffer_size_mb: round1(limits.maxBufferSize / 1024 / 1024),
          max_compute_workgroups_per_dim: limits.maxComputeWorkgroupsPerDimension,
          max_workgroup_size_x: limits.maxComputeWorkgroupSizeX,
          max_workgroup_size_y: limits.maxComputeWorkgroupSizeY,
          max_workgroup_size_z: limits.maxComputeWorkgroupSizeZ,
          max_invocations_per_workgroup: limits.maxComputeInvocationsPerWorkgroup,
          test_passed: passed,
          cells_correct: correctCount,
          cells_total: totalCells,
          init_ms: round1(initMs),
          compile_ms: round1(compileMs),
          dispatch_ms: round1(dispatchMs),
          readback_ms: round1(readbackMs),
          total_ms: round1(totalMs),
          max_grid_4ch: ctx.getMaxGridSize(4),
          max_grid_8ch: ctx.getMaxGridSize(8),
          max_grid_16ch: ctx.getMaxGridSize(16),
          error_message: null,
        });

        const supabaseNote = supabase ? '  Result saved to Supabase' : '';
        const summary = [
          passed ? 'GPU test PASSED' : `GPU test FAILED: ${correctCount}/${totalCells} correct`,
          `  ${totalCells} cells verified = 1.0`,
          `  Init: ${initMs.toFixed(1)}ms`,
          `  Compile: ${compileMs.toFixed(1)}ms`,
          `  Dispatch: ${dispatchMs.toFixed(1)}ms`,
          `  Readback: ${readbackMs.toFixed(1)}ms`,
          `  Total: ${totalMs.toFixed(1)}ms`,
          `  GPU: ${info.vendor} ${info.architecture} — ${info.description || info.device}`,
          supabaseNote,
        ].filter(Boolean).join('\n');

        return { success: passed, data: { summary, correctCount, totalCells } };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // Submit failure to Supabase too — useful for compatibility tracking
        await submitCompatibilityResult({
          browser,
          user_agent: userAgent,
          test_passed: false,
          error_message: message,
        });

        return { success: false, error: `GPU test failed: ${message}` };
      }
    },
  });

  registry.register({
    name: 'gpu.info',
    description: 'Display WebGPU availability, adapter info, and device limits',
    category: 'gpu',
    params: NoParams,
    execute: async () => {
      const lines: string[] = [];

      // Availability
      const available = GPUContext.isAvailable();
      lines.push(`WebGPU: ${available ? 'available' : 'NOT available'}`);

      if (!available) {
        lines.push('Requires Chrome 113+, Safari 26+, or Firefox 141+.');
        return { success: true, data: { summary: lines.join('\n') } };
      }

      // Try to get or initialize context
      let ctx: GPUContext;
      try {
        ctx = GPUContext.tryGet() ?? await GPUContext.initialize();
      } catch (err) {
        lines.push(`Init failed: ${err instanceof Error ? err.message : String(err)}`);
        return { success: true, data: { summary: lines.join('\n') } };
      }

      // Adapter info
      const info = ctx.adapterInfo;
      lines.push('');
      lines.push('Adapter:');
      lines.push(`  Vendor: ${info.vendor}`);
      lines.push(`  Architecture: ${info.architecture}`);
      lines.push(`  Device: ${info.device}`);
      lines.push(`  Description: ${info.description}`);

      // Key limits
      const limits = ctx.getLimits();
      lines.push('');
      lines.push('Limits:');
      lines.push(`  Max storage buffer: ${(limits.maxStorageBufferBindingSize / 1024 / 1024).toFixed(0)} MB`);
      lines.push(`  Max buffer size: ${(limits.maxBufferSize / 1024 / 1024).toFixed(0)} MB`);
      lines.push(`  Max compute workgroups/dim: ${limits.maxComputeWorkgroupsPerDimension}`);
      lines.push(`  Max workgroup size: ${limits.maxComputeWorkgroupSizeX}×${limits.maxComputeWorkgroupSizeY}×${limits.maxComputeWorkgroupSizeZ}`);
      lines.push(`  Max invocations/workgroup: ${limits.maxComputeInvocationsPerWorkgroup}`);

      // Max grid sizes
      lines.push('');
      lines.push('Max grid size (square):');
      for (const props of [4, 8, 16, 32]) {
        const maxSide = ctx.getMaxGridSize(props);
        lines.push(`  ${props} channels: ${maxSide}×${maxSide} (${(maxSide * maxSide).toLocaleString()} cells)`);
      }

      return { success: true, data: { summary: lines.join('\n') } };
    },
  });
}
