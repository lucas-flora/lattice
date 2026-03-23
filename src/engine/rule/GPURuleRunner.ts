/**
 * GPURuleRunner: executes simulation rules as GPU compute shaders.
 *
 * All rules compile through the generic pipeline:
 *   YAML rule.compute (Python subset) → PythonParser → IR → WGSLCodegen → GPU compute shader
 *
 * Lifecycle:
 *   1. construct with grid + preset + GPU context
 *   2. initialize() — transpile rule, compile shader, upload initial state
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
import { validateIR } from '../ir/validate';
import { generateWGSL, type WGSLCodegenConfig } from '../ir/WGSLCodegen';
import type { IRProgram } from '../ir/types';
import { parsePython, ParseError } from '../ir/PythonParser';
import { compileRampToIR, type RampMapping } from '../ir/RampCompiler';
import { logGPU } from '../../lib/debugLog';

/** Compiled expression tag pass (post-rule) */
interface ExpressionPass {
  name: string;
  pipeline: GPUComputePipeline;
  bindGroups: [GPUBindGroup, GPUBindGroup];
}

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
  /** Compiled expression tag passes (dispatched after the main rule) */
  private expressionPasses: ExpressionPass[] = [];
  /** Shared bind group layout for all compute pipelines */
  private bindGroupLayout: GPUBindGroupLayout | null = null;
  /** Whether a visual mapping ramp pass was compiled */
  private _hasVisualMappingPass = false;

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

    // 1. Build property descriptors from the Grid (includes all inherent properties
    //    like age, alpha, colorR etc. — not just preset.cell_properties)
    const properties: GPUPropertyDescriptor[] = [];
    const cellCount = this.grid.cellCount;
    for (const propName of this.grid.getPropertyNames()) {
      const buf = this.grid.getCurrentBuffer(propName);
      const channels = buf.length / cellCount;
      properties.push({ name: propName, channels, type: 'f32', defaultValue: new Array(channels).fill(0) });
    }

    // 2. Initialize GPU buffers
    const { width, height } = this.grid.config;
    const depth = this.grid.config.depth ?? 1;
    this.bufferManager.initialize({ width, height, depth, properties });
    this.propertyLayout = [...this.bufferManager.layout];

    // 3. Build env param names (order matters — maps to uniform buffer slots)
    this.envParamNames = (this.preset.params ?? []).map(p => p.name);

    // 4. Transpile rule compute body (Python subset) → IR
    // Use the full property layout (includes inherent props like age, alpha, colorR/G/B)
    const context = {
      cellProperties: this.propertyLayout
        .filter(p => p.name !== '_cellType')
        .map(p => ({
          name: p.name,
          type: 'f32' as const,
          channels: p.channels,
        })),
      envParams: this.envParamNames,
      globalVars: [] as string[],
      neighborhoodType: 'moore' as const,
    };

    let irProgram: IRProgram;
    try {
      const result = parsePython(this.preset.rule.compute, context);
      irProgram = result.program;
      logGPU(`Transpiled "${presetName}" → IR (${irProgram.statements.length} statements)`);
    } catch (e) {
      const msg = e instanceof ParseError ? e.message : String(e);
      throw new Error(`Transpilation failed for "${presetName}": ${msg}`);
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
      copyAllProperties: true, // Copy through unwritten props (alpha, age, etc.) to prevent ping-pong stale data
    };
    this.wgsl = generateWGSL(irProgram, config);

    // 7. Create explicit bind group layout shared by all compute pipelines.
    //    This prevents the GPU driver from optimizing away unused bindings
    //    in expression tag shaders (which may not reference all buffers).
    const ctx = GPUContext.get();
    this.bindGroupLayout = ctx.device.createBindGroupLayout({
      label: `${presetName}-bgl`,
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    // 8. Compile shader + create pipeline with explicit layout
    this.pipeline = this.createPipelineWithLayout(this.wgsl, `${presetName}-gpu-rule`);

    // 9. Create two bind groups for ping-pong
    const readBuf = this.bufferManager.getReadBuffer();
    const writeBuf = this.bufferManager.getWriteBuffer();
    const paramsBuf = this.bufferManager.getParamsBuffer();

    const bg0 = this.createBindGroup(readBuf, writeBuf, paramsBuf);
    const bg1 = this.createBindGroup(writeBuf, readBuf, paramsBuf);
    this.bindGroups = [bg0, bg1];
    this.currentBindGroup = 0;

    // 9. Pack grid state from CPU into interleaved GPU format and upload
    this.uploadFromGrid();

    // 10. Write initial params
    this.updateParams({}, 0, 1.0);

    // 11. Compile expression tags (post-rule passes)
    this.compileExpressionTags();

    // 12. Compile visual mapping ramp (runs after all expression tags)
    this.compileVisualMapping();

    logGPU(`GPURuleRunner initialized: ${presetName} (${width}×${height}, stride=${this.bufferManager.stride}, ${this.wgsl.length} chars WGSL, ${this.expressionPasses.length} expr passes)`);
  }

  /** Create a compute pipeline using the shared bind group layout */
  private createPipelineWithLayout(wgsl: string, label: string): GPUComputePipeline {
    const ctx = GPUContext.get();
    const module = this.shaderCompiler.compile(wgsl, label);
    const pipelineLayout = ctx.device.createPipelineLayout({
      label: `${label}-layout`,
      bindGroupLayouts: [this.bindGroupLayout!],
    });
    const pipeline = ctx.device.createComputePipeline({
      label,
      layout: pipelineLayout,
      compute: { module, entryPoint: 'main' },
    });
    logGPU(`Pipeline created: ${label}`);
    return pipeline;
  }

  /** Create a bind group using the shared layout */
  private createBindGroup(readBuf: GPUBuffer, writeBuf: GPUBuffer, paramsBuf: GPUBuffer): GPUBindGroup {
    const ctx = GPUContext.get();
    return ctx.device.createBindGroup({
      layout: this.bindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: readBuf } },
        { binding: 1, resource: { buffer: writeBuf } },
        { binding: 2, resource: { buffer: paramsBuf } },
      ],
    });
  }

  /**
   * Compile expression tags from the preset into additional compute passes.
   * Each tag becomes a separate WGSL compute shader dispatched after the main rule.
   */
  private compileExpressionTags(): void {
    const tags = this.preset.expression_tags;
    if (!tags || tags.length === 0) return;

    const context = {
      cellProperties: this.propertyLayout
        .filter(p => p.name !== '_cellType')
        .map(p => ({
          name: p.name,
          type: 'f32' as const,
          channels: p.channels,
        })),
      envParams: this.envParamNames,
      globalVars: [] as string[],
      neighborhoodType: 'moore' as const,
    };

    const readBuf = this.bufferManager.getReadBuffer();
    const writeBuf = this.bufferManager.getWriteBuffer();
    const paramsBuf = this.bufferManager.getParamsBuffer();

    for (const tag of tags) {
      if (tag.enabled === false || tag.phase !== 'post-rule' || !tag.code) continue;

      try {
        const result = parsePython(tag.code, context);
        const irProgram = result.program;

        const validation = validateIR(irProgram);
        if (!validation.valid) {
          logGPU(`Expression tag "${tag.name}" IR validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
          continue;
        }

        const config: WGSLCodegenConfig = {
          workgroupSize: [8, 8, 1],
          topology: this.grid.config.topology ?? 'toroidal',
          propertyLayout: this.propertyLayout,
          envParams: this.envParamNames,
          globalParams: [],
          copyAllProperties: true, // Expression tags only write some props — copy the rest
        };
        const wgsl = generateWGSL(irProgram, config);
        const pipeline = this.createPipelineWithLayout(wgsl, `expr-${tag.name}`);

        // Expression passes use the same ping-pong buffers
        const bg0 = this.createBindGroup(readBuf, writeBuf, paramsBuf);
        const bg1 = this.createBindGroup(writeBuf, readBuf, paramsBuf);

        this.expressionPasses.push({ name: tag.name, pipeline, bindGroups: [bg0, bg1] });
        logGPU(`Expression tag "${tag.name}" compiled to GPU`);
      } catch (e) {
        logGPU(`Expression tag "${tag.name}" transpile failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  /**
   * Compile visual mapping ramps from the preset into a final compute pass.
   * Runs after all expression tags so the ramp has the last word on colorR/G/B.
   */
  private compileVisualMapping(): void {
    const mappings = this.preset.visual_mappings;
    if (!mappings) return;

    // Filter for ramp-type mappings with stops
    const rampMappings: RampMapping[] = mappings
      .filter(m => m.type === 'ramp' && m.stops && m.stops.length > 0)
      .map(m => ({
        property: m.property,
        channel: m.channel as 'color' | 'alpha',
        type: 'ramp' as const,
        range: m.range as [number, number] | undefined,
        stops: m.stops!,
        cell_type: m.cell_type,
      }));

    if (rampMappings.length === 0) return;

    try {
      const irProgram = compileRampToIR(rampMappings);
      if (irProgram.statements.length === 0) return;

      const validation = validateIR(irProgram);
      if (!validation.valid) {
        logGPU(`Visual mapping ramp IR validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
        return;
      }

      const config: WGSLCodegenConfig = {
        workgroupSize: [8, 8, 1],
        topology: this.grid.config.topology ?? 'toroidal',
        propertyLayout: this.propertyLayout,
        envParams: this.envParamNames,
        globalParams: [],
        copyAllProperties: true,
      };
      const wgsl = generateWGSL(irProgram, config);
      const pipeline = this.createPipelineWithLayout(wgsl, 'visual-ramp');

      const readBuf = this.bufferManager.getReadBuffer();
      const writeBuf = this.bufferManager.getWriteBuffer();
      const paramsBuf = this.bufferManager.getParamsBuffer();
      const bg0 = this.createBindGroup(readBuf, writeBuf, paramsBuf);
      const bg1 = this.createBindGroup(writeBuf, readBuf, paramsBuf);

      this.expressionPasses.push({ name: 'visual-ramp', pipeline, bindGroups: [bg0, bg1] });
      this._hasVisualMappingPass = true;
      logGPU(`Visual mapping ramp compiled to GPU (${rampMappings.length} ramp(s))`);
    } catch (e) {
      logGPU(`Visual mapping ramp compilation failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Whether a visual mapping ramp compute pass is active */
  hasVisualMappingPass(): boolean { return this._hasVisualMappingPass; }

  /**
   * Execute one simulation tick on the GPU.
   * Dispatches the main rule pass, then all expression tag passes.
   */
  tick(): void {
    if (!this.pipeline || !this.bindGroups) {
      throw new Error('GPURuleRunner not initialized');
    }

    const { width, height } = this.grid.config;
    const depth = this.grid.config.depth ?? 1;
    const workgroups = ComputeDispatcher.calcWorkgroups(
      [width, height, depth],
      [8, 8, 1],
    );

    // Update params uniform (generation, dt, env params)
    this.generation++;
    this.bufferManager.updateParams(this.getEnvParamsObject());

    // Main rule pass
    this.computeDispatcher.dispatchAndSubmit(
      this.pipeline,
      this.bindGroups[this.currentBindGroup],
      workgroups,
    );

    // Swap after main rule
    this.currentBindGroup = this.currentBindGroup === 0 ? 1 : 0;
    this.bufferManager.swap();

    // Expression tag passes (each reads current, writes to other, then swaps)
    for (const pass of this.expressionPasses) {
      this.computeDispatcher.dispatchAndSubmit(
        pass.pipeline,
        pass.bindGroups[this.currentBindGroup],
        workgroups,
      );
      this.currentBindGroup = this.currentBindGroup === 0 ? 1 : 0;
      this.bufferManager.swap();
    }
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
   * Write a single cell's property value directly to the GPU buffer.
   * Immediate — no readback needed. Used for live cell editing.
   */
  writeCellDirect(propertyName: string, cellIndex: number, value: number): void {
    const prop = this.propertyLayout.find(p => p.name === propertyName);
    if (!prop) return;
    const stride = this.bufferManager.stride;
    const byteOffset = (cellIndex * stride + prop.offset) * 4; // Float32 = 4 bytes
    this.bufferManager.writeCellValue(byteOffset, value);
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
