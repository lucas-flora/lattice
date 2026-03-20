/**
 * GPURuleRunner: executes simulation rules as GPU compute shaders.
 *
 * Sits alongside the existing RuleRunner/WasmRuleRunner/PythonRuleRunner.
 * Uses the Phase 1 GPU infrastructure (GPUContext, BufferManager, ShaderCompiler,
 * ComputeDispatcher) and Phase 2 IR pipeline (IRBuilder, WGSLCodegen).
 *
 * Lifecycle:
 *   1. construct with grid + preset + GPU context
 *   2. initialize() — build IR, compile shader, upload initial state
 *   3. tick() — dispatch compute, swap buffers
 *   4. destroy() — release GPU resources
 */

import type { Grid } from '../grid/Grid';
import type { PresetConfig } from '../preset/types';
import { CHANNELS_PER_TYPE } from '../cell/types';
import { BufferManager } from '../gpu/BufferManager';
import { ShaderCompiler } from '../gpu/ShaderCompiler';
import { ComputeDispatcher } from '../gpu/ComputeDispatcher';
import { GPUContext } from '../gpu/GPUContext';
import type { PropertyLayout, GPUPropertyDescriptor } from '../gpu/types';
import { BUILTIN_IR } from '../ir/builtinIR';
import { validateIR } from '../ir/validate';
import { generateWGSL, type WGSLCodegenConfig } from '../ir/WGSLCodegen';
import type { IRProgram } from '../ir/types';
import { parsePython, ParseError } from '../ir/PythonParser';
import { logGPU } from '../../lib/debugLog';

export class GPURuleRunner {
  private grid: Grid;
  private preset: PresetConfig;
  private bufferManager: BufferManager;
  private shaderCompiler: ShaderCompiler;
  private computeDispatcher: ComputeDispatcher;
  private pipeline: GPUComputePipeline | null = null;
  /** Two bind groups for ping-pong: [readA→writeB, readB→writeA] */
  private bindGroups: [GPUBindGroup, GPUBindGroup] | null = null;
  /** Which bind group is current (0 or 1) */
  private currentBindGroup: 0 | 1 = 0;
  private generation: number = 0;
  private propertyLayout: PropertyLayout[] = [];
  private envParamNames: string[] = [];
  private wgsl: string = '';

  constructor(grid: Grid, preset: PresetConfig) {
    this.grid = grid;
    this.preset = preset;
    this.bufferManager = new BufferManager();
    this.shaderCompiler = new ShaderCompiler();
    this.computeDispatcher = new ComputeDispatcher(this.shaderCompiler);
  }

  /**
   * Initialize: build IR from preset, compile to WGSL, create GPU resources,
   * upload initial grid state.
   */
  async initialize(): Promise<void> {
    const presetName = this.preset.meta.name;

    // 1. Build property descriptors from preset
    const properties: GPUPropertyDescriptor[] = [];
    const cellProps = this.preset.cell_properties ?? [];
    for (const prop of cellProps) {
      const channels = CHANNELS_PER_TYPE[prop.type] ?? 1;
      const defaultVal = Array.isArray(prop.default)
        ? prop.default.map(Number)
        : [Number(prop.default ?? 0)];
      properties.push({ name: prop.name, channels, type: 'f32', defaultValue: defaultVal });
    }

    // 2. Initialize GPU buffers
    const { width, height } = this.grid.config;
    const depth = this.grid.config.depth ?? 1;
    this.bufferManager.initialize({ width, height, depth, properties });
    this.propertyLayout = [...this.bufferManager.layout];

    // 3. Build env param names (order matters — maps to uniform buffer slots)
    this.envParamNames = (this.preset.params ?? []).map(p => p.name);

    // 4. Build IR program — try built-in first, then transpile from compute body
    let irProgram: IRProgram | null = null;

    // 4a. Try hand-built IR (optimization for known presets)
    const irBuilder = BUILTIN_IR[presetName];
    if (irBuilder) {
      irProgram = irBuilder(this.preset);
    }

    // 4b. Try transpiling the compute body as Python
    if (!irProgram && this.preset.rule.compute) {
      try {
        const cellProps = (this.preset.cell_properties ?? []);
        const context = {
          cellProperties: cellProps.map(p => ({
            name: p.name,
            type: 'f32' as const,
            channels: CHANNELS_PER_TYPE[p.type] ?? 1,
          })),
          envParams: this.envParamNames,
          globalVars: [] as string[],
          neighborhoodType: 'moore' as const,
        };
        const result = parsePython(this.preset.rule.compute, context);
        irProgram = result.program;
        logGPU(`Python transpiled to IR for "${presetName}" (${irProgram.statements.length} statements)`);
      } catch (e) {
        if (e instanceof ParseError) {
          logGPU(`Python transpilation failed for "${presetName}": ${e.message}`);
        } else {
          throw e;
        }
      }
    }

    if (!irProgram) {
      throw new Error(`No IR available for preset "${presetName}" — no built-in IR and transpilation failed`);
    }

    // 5. Validate IR
    const validation = validateIR(irProgram);
    if (!validation.valid) {
      throw new Error(`IR validation failed for "${presetName}": ${validation.errors.map(e => e.message).join('; ')}`);
    }

    // 6. Generate WGSL
    const config: WGSLCodegenConfig = {
      workgroupSize: [8, 8, 1],
      topology: this.grid.config.topology ?? 'toroidal',
      propertyLayout: this.propertyLayout,
      envParams: this.envParamNames,
      globalParams: [],
    };
    this.wgsl = generateWGSL(irProgram, config);

    // 7. Compile shader + create pipeline
    this.pipeline = this.computeDispatcher.createPipeline({
      wgsl: this.wgsl,
      label: `${presetName}-gpu-rule`,
      workgroupSize: [8, 8, 1],
    });

    // 8. Create two bind groups for ping-pong
    const readBuf = this.bufferManager.getReadBuffer();
    const writeBuf = this.bufferManager.getWriteBuffer();
    const paramsBuf = this.bufferManager.getParamsBuffer();

    // Bind group 0: read from A, write to B
    const bg0 = this.computeDispatcher.createBindGroup(this.pipeline, [
      { binding: 0, resource: { buffer: readBuf } },
      { binding: 1, resource: { buffer: writeBuf } },
      { binding: 2, resource: { buffer: paramsBuf } },
    ]);
    // Bind group 1: read from B, write to A
    const bg1 = this.computeDispatcher.createBindGroup(this.pipeline, [
      { binding: 0, resource: { buffer: writeBuf } },
      { binding: 1, resource: { buffer: readBuf } },
      { binding: 2, resource: { buffer: paramsBuf } },
    ]);
    this.bindGroups = [bg0, bg1];
    this.currentBindGroup = 0;

    // 9. Pack grid state from CPU into interleaved GPU format and upload
    this.uploadFromGrid();

    // 10. Write initial params
    this.updateParams({}, 0, 1.0);

    logGPU(`GPURuleRunner initialized: ${presetName} (${width}×${height}, stride=${this.bufferManager.stride}, ${this.wgsl.length} chars WGSL)`);
  }

  /**
   * Execute one simulation tick on the GPU.
   * Does NOT submit to the queue — call submit() after batching any additional passes.
   */
  tick(): void {
    if (!this.pipeline || !this.bindGroups) {
      throw new Error('GPURuleRunner not initialized');
    }

    const ctx = GPUContext.get();
    const { width, height } = this.grid.config;
    const depth = this.grid.config.depth ?? 1;
    const workgroups = ComputeDispatcher.calcWorkgroups(
      [width, height, depth],
      [8, 8, 1],
    );

    // Update params uniform (generation, dt, env params)
    this.generation++;
    this.bufferManager.updateParams(this.getEnvParamsObject());

    // Dispatch with current bind group
    this.computeDispatcher.dispatchAndSubmit(
      this.pipeline,
      this.bindGroups[this.currentBindGroup],
      workgroups,
    );

    // Swap: toggle bind group index
    this.currentBindGroup = this.currentBindGroup === 0 ? 1 : 0;
    this.bufferManager.swap();
  }

  /**
   * Read current state back to CPU. Expensive — only use for frame cache, not rendering.
   */
  async readBack(): Promise<Float32Array> {
    const ctx = GPUContext.get();
    await ctx.device.queue.onSubmittedWorkDone();
    return this.bufferManager.readBack();
  }

  /**
   * Read back and unpack into per-property buffers matching the Grid format.
   * Returns a Map of property name → Float32Array (one value per cell).
   */
  async readBackToGrid(): Promise<Map<string, Float32Array>> {
    const interleavedData = await this.readBack();
    const result = new Map<string, Float32Array>();
    const stride = this.bufferManager.stride;
    const cellCount = this.bufferManager.cellCount;

    for (const prop of this.propertyLayout) {
      const buffer = new Float32Array(cellCount * prop.channels);
      for (let i = 0; i < cellCount; i++) {
        for (let ch = 0; ch < prop.channels; ch++) {
          buffer[i * prop.channels + ch] = interleavedData[i * stride + prop.offset + ch];
        }
      }
      result.set(prop.name, buffer);
    }

    return result;
  }

  /** Get the current GPU read buffer (for rendering) */
  getReadBuffer(): GPUBuffer { return this.bufferManager.getReadBuffer(); }

  /** Get the current GPU write buffer */
  getWriteBuffer(): GPUBuffer { return this.bufferManager.getWriteBuffer(); }

  /** Get the params uniform buffer */
  getParamsBuffer(): GPUBuffer { return this.bufferManager.getParamsBuffer(); }

  /** Get the property layout */
  getPropertyLayout(): PropertyLayout[] { return this.propertyLayout; }

  /** Get buffer stride (floats per cell) */
  getStride(): number { return this.bufferManager.stride; }

  /** Get the current generation */
  getGeneration(): number { return this.generation; }

  /** Set the generation (for seek/restore) */
  setGeneration(gen: number): void { this.generation = gen; }

  /** Get grid dimensions */
  getWidth(): number { return this.grid.config.width; }
  getHeight(): number { return this.grid.config.height; }

  /** Get the generated WGSL source (for debugging / ir.show) */
  getWGSL(): string { return this.wgsl; }

  /**
   * Upload new cell data from CPU. Used for cell editing and state restore.
   * Takes interleaved data matching the GPU buffer format.
   */
  uploadCellData(data: Float32Array): void {
    this.bufferManager.uploadToRead(data);
  }

  /**
   * Pack the Grid's per-property buffers into interleaved GPU format and upload.
   */
  uploadFromGrid(): void {
    const stride = this.bufferManager.stride;
    const cellCount = this.bufferManager.cellCount;
    const packed = new Float32Array(cellCount * stride);

    for (const prop of this.propertyLayout) {
      if (!this.grid.hasProperty(prop.name)) continue;
      const cpuBuf = this.grid.getCurrentBuffer(prop.name);
      for (let i = 0; i < cellCount; i++) {
        for (let ch = 0; ch < prop.channels; ch++) {
          packed[i * stride + prop.offset + ch] = cpuBuf[i * prop.channels + ch];
        }
      }
    }

    this.bufferManager.uploadToRead(packed);
  }

  /**
   * Unpack GPU readback data into the Grid's CPU buffers.
   */
  applyToGrid(interleavedData: Float32Array): void {
    const stride = this.bufferManager.stride;
    const cellCount = this.bufferManager.cellCount;

    for (const prop of this.propertyLayout) {
      if (!this.grid.hasProperty(prop.name)) continue;
      const cpuBuf = this.grid.getCurrentBuffer(prop.name);
      for (let i = 0; i < cellCount; i++) {
        for (let ch = 0; ch < prop.channels; ch++) {
          cpuBuf[i * prop.channels + ch] = interleavedData[i * stride + prop.offset + ch];
        }
      }
    }
  }

  /** Update env params in the uniform buffer */
  updateParams(envParams: Record<string, number>, generation: number, dt: number): void {
    this.generation = generation;
    this.bufferManager.updateParams(envParams);
  }

  /** Clean up all GPU resources */
  destroy(): void {
    this.bufferManager.destroy();
    this.pipeline = null;
    this.bindGroups = null;
  }

  private getEnvParamsObject(): Record<string, number> {
    const params: Record<string, number> = {};
    if (this.preset.params) {
      for (const p of this.preset.params) {
        params[p.name] = p.default;
      }
    }
    return params;
  }
}
