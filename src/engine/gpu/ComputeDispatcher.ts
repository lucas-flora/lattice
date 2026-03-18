/**
 * ComputeDispatcher: creates compute pipelines and dispatches workgroups.
 *
 * Provides both single-pass convenience (dispatchAndSubmit) and multi-pass
 * batching (beginCommandEncoder → dispatch → submit) for the tick pipeline.
 *
 * Workgroup count calculation: Math.ceil(gridDim / workgroupSize).
 */

import { GPUContext } from './GPUContext';
import { ShaderCompiler } from './ShaderCompiler';
import type { ComputeShaderConfig } from './types';
import { logDbg } from '../../lib/debugLog';

export class ComputeDispatcher {
  private compiler: ShaderCompiler;

  constructor(compiler?: ShaderCompiler) {
    this.compiler = compiler ?? new ShaderCompiler();
  }

  /**
   * Create a reusable compute pipeline from a shader configuration.
   * Uses 'auto' layout — sufficient for single-pipeline bind groups.
   *
   * @param config - Shader source, label, and workgroup size
   * @returns Compiled compute pipeline
   */
  createPipeline(config: ComputeShaderConfig): GPUComputePipeline {
    const ctx = GPUContext.get();
    const module = this.compiler.compile(config.wgsl, config.label);

    const pipeline = ctx.device.createComputePipeline({
      label: config.label,
      layout: 'auto',
      compute: {
        module,
        entryPoint: 'main',
      },
    });

    logDbg('gpu', `Pipeline created: ${config.label} (workgroup: ${config.workgroupSize.join('×')})`);
    return pipeline;
  }

  /**
   * Create a bind group for a pipeline, binding buffers to @binding slots.
   *
   * @param pipeline - The compute pipeline
   * @param entries - Bind group entries (buffer bindings)
   * @param groupIndex - Bind group index (default 0)
   * @returns Bind group ready for dispatch
   */
  createBindGroup(
    pipeline: GPUComputePipeline,
    entries: GPUBindGroupEntry[],
    groupIndex: number = 0,
  ): GPUBindGroup {
    const ctx = GPUContext.get();
    return ctx.device.createBindGroup({
      label: `${pipeline.label}-bindgroup-${groupIndex}`,
      layout: pipeline.getBindGroupLayout(groupIndex),
      entries,
    });
  }

  /**
   * Encode a compute dispatch into an existing command encoder.
   * Does NOT submit — allows batching multiple passes into one submit.
   *
   * @param encoder - Active command encoder
   * @param pipeline - Compute pipeline to dispatch
   * @param bindGroup - Bound resources
   * @param workgroupCounts - Number of workgroups per dimension [x, y, z]
   */
  dispatch(
    encoder: GPUCommandEncoder,
    pipeline: GPUComputePipeline,
    bindGroup: GPUBindGroup,
    workgroupCounts: [number, number, number],
  ): void {
    const pass = encoder.beginComputePass({ label: pipeline.label ?? 'compute-pass' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(...workgroupCounts);
    pass.end();
  }

  /**
   * Convenience: dispatch a single compute pass and submit immediately.
   * Equivalent to beginCommandEncoder → dispatch → submit.
   *
   * @param pipeline - Compute pipeline
   * @param bindGroup - Bound resources
   * @param workgroupCounts - Number of workgroups per dimension
   */
  dispatchAndSubmit(
    pipeline: GPUComputePipeline,
    bindGroup: GPUBindGroup,
    workgroupCounts: [number, number, number],
  ): void {
    const encoder = this.beginCommandEncoder(pipeline.label ?? 'dispatch');
    this.dispatch(encoder, pipeline, bindGroup, workgroupCounts);
    this.submit(encoder);
  }

  /**
   * Begin a new command encoder for multi-pass batching.
   * Use with dispatch() and submit() for the tick pipeline:
   *   encoder = beginCommandEncoder()
   *   dispatch(encoder, rulePipeline, ...)
   *   dispatch(encoder, exprPipeline, ...)
   *   submit(encoder)
   *
   * @param label - Debug label for the command encoder
   */
  beginCommandEncoder(label?: string): GPUCommandEncoder {
    const ctx = GPUContext.get();
    return ctx.device.createCommandEncoder({ label: label ?? 'compute-encoder' });
  }

  /**
   * Submit a command encoder to the GPU queue.
   *
   * @param encoder - Command encoder with recorded passes
   */
  submit(encoder: GPUCommandEncoder): void {
    const ctx = GPUContext.get();
    ctx.device.queue.submit([encoder.finish()]);
  }

  /**
   * Calculate workgroup counts for a given grid dimension and workgroup size.
   * Returns Math.ceil(dimension / workgroupSize) for each axis.
   *
   * @param gridDims - Grid dimensions [width, height, depth]
   * @param workgroupSize - Workgroup size [x, y, z]
   * @returns Workgroup counts [x, y, z]
   */
  static calcWorkgroups(
    gridDims: [number, number, number],
    workgroupSize: [number, number, number],
  ): [number, number, number] {
    return [
      Math.ceil(gridDims[0] / workgroupSize[0]),
      Math.ceil(gridDims[1] / workgroupSize[1]),
      Math.ceil(gridDims[2] / workgroupSize[2]),
    ];
  }

  /** Get the underlying shader compiler */
  getCompiler(): ShaderCompiler {
    return this.compiler;
  }
}
