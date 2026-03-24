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
  enabled: boolean;
}

/** A compiled rule stage with iteration count */
interface RuleStage {
  name: string;
  pipeline: GPUComputePipeline;
  bindGroups: [GPUBindGroup, GPUBindGroup];
  /** Number of times to dispatch this stage per tick (default 1) */
  iterations: number;
  enabled: boolean;
}

/** A single entry in the pipeline execution order */
export interface PipelineEntry {
  /** Unique ID (stage name for rules, pass name for ops, 'visual-ramp'/'visual-script' for visual) */
  id: string;
  /** Display name */
  name: string;
  /** Pipeline category */
  type: 'pre-rule-op' | 'rule-stage' | 'post-rule-op' | 'visual-mapping';
  /** Pipeline phase */
  phase: 'pre-rule' | 'rule' | 'post-rule' | 'visual';
  enabled: boolean;
  /** CPU for pre-rule link ops, GPU for everything else */
  executionContext: 'cpu' | 'gpu';
  /** Cross-reference ID (op ID, stage name) */
  sourceId?: string;
  /** For rule stages with iterations > 1 */
  iterations?: number;
  /** Position in the full pipeline (0-based) */
  index: number;
}

export class GPURuleRunner {
  private grid: Grid;
  private preset: PresetConfig;
  private bufferManager: BufferManager;
  private shaderCompiler: ShaderCompiler;
  private computeDispatcher: ComputeDispatcher;
  /** Rule stages — single-pass rules have 1 stage, multi-pass have N */
  private ruleStages: RuleStage[] = [];
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
  /** Current env param values (updated by controller, read during tick) */
  private currentEnvParams: Record<string, number> = {};

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

    // 4. Build parse context (shared by rule and expression tags)
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

    const wgslConfig: WGSLCodegenConfig = {
      workgroupSize: [8, 8, 1],
      topology: this.grid.config.topology ?? 'toroidal',
      propertyLayout: this.propertyLayout,
      envParams: this.envParamNames,
      globalParams: [],
      copyAllProperties: true,
    };

    // 5. Create explicit bind group layout shared by all compute pipelines.
    const ctx = GPUContext.get();
    this.bindGroupLayout = ctx.device.createBindGroupLayout({
      label: `${presetName}-bgl`,
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    const readBuf = this.bufferManager.getReadBuffer();
    const writeBuf = this.bufferManager.getWriteBuffer();
    const paramsBuf = this.bufferManager.getParamsBuffer();

    // 6. Compile rule — either single compute or multi-stage
    const stages = this.preset.rule.stages;
    const computeBodies = stages && stages.length > 0
      ? stages.map(s => ({ name: s.name, compute: s.compute, iterations: s.iterations ?? 1 }))
      : [{ name: 'main', compute: this.preset.rule.compute ?? '', iterations: 1 }];

    for (const stage of computeBodies) {
      try {
        const result = parsePython(stage.compute, context);
        const irProgram = result.program;

        const validation = validateIR(irProgram);
        if (!validation.valid) {
          throw new Error(`IR validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
        }

        const wgsl = generateWGSL(irProgram, wgslConfig);
        if (stage.name === 'main' && computeBodies.length === 1) {
          this.wgsl = wgsl; // Store for debugging (single-pass)
        }

        const pipeline = this.createPipelineWithLayout(wgsl, `${presetName}-${stage.name}`);
        const bg0 = this.createBindGroup(readBuf, writeBuf, paramsBuf);
        const bg1 = this.createBindGroup(writeBuf, readBuf, paramsBuf);

        this.ruleStages.push({
          name: stage.name,
          pipeline,
          bindGroups: [bg0, bg1],
          iterations: stage.iterations,
          enabled: true,
        });

        logGPU(`Transpiled "${presetName}/${stage.name}" → IR (${irProgram.statements.length} stmts)${stage.iterations > 1 ? ` ×${stage.iterations}` : ''}`);
      } catch (e) {
        const msg = e instanceof ParseError ? e.message : String(e);
        throw new Error(`Transpilation failed for "${presetName}/${stage.name}": ${msg}`);
      }
    }

    this.currentBindGroup = 0;

    // 7. Pack grid state from CPU into interleaved GPU format and upload
    this.uploadFromGrid();

    // 8. Write initial params
    this.updateParams({}, 0, 1.0);

    // 9. Compile expression tags (post-rule passes)
    this.compileExpressionTags();

    // 10. Compile visual mapping (runs after all expression tags)
    this.compileVisualMapping();

    // 11. Run expression/visual passes once to compute colorR/G/B for the initial frame
    this.runExpressionPasses();

    const totalDispatches = this.ruleStages.reduce((n, s) => n + s.iterations, 0);
    logGPU(`GPURuleRunner initialized: ${presetName} (${width}×${height}, stride=${this.bufferManager.stride}, ${this.ruleStages.length} rule stages (${totalDispatches} dispatches/tick), ${this.expressionPasses.length} expr passes)`);
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

        this.expressionPasses.push({ name: tag.name, pipeline, bindGroups: [bg0, bg1], enabled: true });
        logGPU(`Expression tag "${tag.name}" compiled to GPU`);
      } catch (e) {
        logGPU(`Expression tag "${tag.name}" transpile failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  /**
   * Recompile visual mapping from updated configuration (e.g. after user edits stops).
   * Removes old visual passes and compiles new ones.
   */
  recompileVisualMapping(mappings: PresetConfig['visual_mappings']): void {
    // Remove old visual mapping passes
    this.expressionPasses = this.expressionPasses.filter(
      p => p.name !== 'visual-ramp' && p.name !== 'visual-script',
    );
    this._hasVisualMappingPass = false;

    // Compile new ones
    this.compileVisualMappingFrom(mappings ?? []);

    // Re-run expression passes to update colorR/G/B immediately
    this.runExpressionPasses();

    logGPU(`Visual mapping recompiled (${this.expressionPasses.filter(p => p.name.startsWith('visual-')).length} visual passes)`);
  }

  /**
   * Compile visual mappings into final compute passes.
   * Supports two modes:
   *   - type: 'ramp'   → multi-stop gradient compiled via RampCompiler
   *   - type: 'script'  → freeform Python code compiled via PythonParser
   * Runs after all expression tags so the visual mapping has the last word on colorR/G/B.
   */
  private compileVisualMapping(): void {
    this.compileVisualMappingFrom(this.preset.visual_mappings ?? []);
  }

  private compileVisualMappingFrom(mappings: NonNullable<PresetConfig['visual_mappings']>): void {
    if (mappings.length === 0) return;

    const readBuf = this.bufferManager.getReadBuffer();
    const writeBuf = this.bufferManager.getWriteBuffer();
    const paramsBuf = this.bufferManager.getParamsBuffer();

    const baseConfig: WGSLCodegenConfig = {
      workgroupSize: [8, 8, 1],
      topology: this.grid.config.topology ?? 'toroidal',
      propertyLayout: this.propertyLayout,
      envParams: this.envParamNames,
      globalParams: [],
      copyAllProperties: true,
    };

    // --- Ramp-type mappings ---
    const rampMappings: RampMapping[] = mappings
      .filter(m => m.type === 'ramp' && m.stops && m.stops.length > 0)
      .map(m => ({
        property: m.property!,
        channel: m.channel as 'color' | 'alpha',
        type: 'ramp' as const,
        range: m.range as [number, number] | undefined,
        stops: m.stops!,
        cell_type: m.cell_type,
      }));

    if (rampMappings.length > 0) {
      try {
        const irProgram = compileRampToIR(rampMappings);
        if (irProgram.statements.length > 0) {
          const validation = validateIR(irProgram);
          if (!validation.valid) {
            logGPU(`Visual mapping ramp IR validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
          } else {
            const wgsl = generateWGSL(irProgram, baseConfig);
            const pipeline = this.createPipelineWithLayout(wgsl, 'visual-ramp');
            const bg0 = this.createBindGroup(readBuf, writeBuf, paramsBuf);
            const bg1 = this.createBindGroup(writeBuf, readBuf, paramsBuf);
            this.expressionPasses.push({ name: 'visual-ramp', pipeline, bindGroups: [bg0, bg1], enabled: true });
            this._hasVisualMappingPass = true;
            logGPU(`Visual mapping ramp compiled to GPU (${rampMappings.length} ramp(s))`);
          }
        }
      } catch (e) {
        logGPU(`Visual mapping ramp compilation failed: ${e instanceof Error ? e.message : e}`);
      }
    }

    // --- Script-type mappings ---
    const scriptMappings = mappings.filter(m => m.type === 'script' && m.code);

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

    for (const mapping of scriptMappings) {
      try {
        const result = parsePython(mapping.code!, context);
        const irProgram = result.program;

        const validation = validateIR(irProgram);
        if (!validation.valid) {
          logGPU(`Visual mapping script IR validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
          continue;
        }

        const wgsl = generateWGSL(irProgram, baseConfig);
        const pipeline = this.createPipelineWithLayout(wgsl, 'visual-script');
        const bg0 = this.createBindGroup(readBuf, writeBuf, paramsBuf);
        const bg1 = this.createBindGroup(writeBuf, readBuf, paramsBuf);
        this.expressionPasses.push({ name: 'visual-script', pipeline, bindGroups: [bg0, bg1], enabled: true });
        this._hasVisualMappingPass = true;
        logGPU(`Visual mapping script compiled to GPU`);
      } catch (e) {
        logGPU(`Visual mapping script compilation failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  /** Whether a visual mapping ramp compute pass is active */
  hasVisualMappingPass(): boolean { return this._hasVisualMappingPass; }

  /**
   * Run only the expression/visual passes without the main rule.
   * Used to compute colorR/G/B on the initial frame and after draw edits.
   */
  runExpressionPasses(): void {
    if (this.expressionPasses.length === 0) return;

    const { width, height } = this.grid.config;
    const depth = this.grid.config.depth ?? 1;
    const workgroups = ComputeDispatcher.calcWorkgroups(
      [width, height, depth],
      [8, 8, 1],
    );

    this.bufferManager.updateParams(this.getEnvParamsObject());

    for (const pass of this.expressionPasses) {
      if (!pass.enabled) continue;
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
   * Execute one simulation tick on the GPU.
   * Dispatches all rule stages, then all expression tag passes.
   */
  tick(): void {
    if (this.ruleStages.length === 0) {
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

    // Rule stages (each dispatches N iterations with buffer swaps)
    for (const stage of this.ruleStages) {
      if (!stage.enabled) continue;
      for (let i = 0; i < stage.iterations; i++) {
        this.computeDispatcher.dispatchAndSubmit(
          stage.pipeline,
          stage.bindGroups[this.currentBindGroup],
          workgroups,
        );
        this.currentBindGroup = this.currentBindGroup === 0 ? 1 : 0;
        this.bufferManager.swap();
      }
    }

    // Expression tag passes (each reads current, writes to other, then swaps)
    for (const pass of this.expressionPasses) {
      if (!pass.enabled) continue;
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

  /** Get the preset (for pipeline introspection) */
  getPreset(): PresetConfig { return this.preset; }

  /**
   * Return the full dispatch sequence as an ordered list.
   * Matches the actual execution order in tick():
   *   pre-rule ops (CPU) → rule stages (GPU) → post-rule expression passes (GPU) → visual mapping (GPU)
   */
  getExecutionOrder(): PipelineEntry[] {
    const entries: PipelineEntry[] = [];
    let idx = 0;

    // 1. Pre-rule ops — link-sourced fast-path evaluations (CPU)
    const tags = this.preset.expression_tags;
    if (tags) {
      for (const tag of tags) {
        if (tag.phase === 'pre-rule') {
          entries.push({
            id: `pre-rule-${tag.name}`,
            name: tag.name,
            type: 'pre-rule-op',
            phase: 'pre-rule',
            enabled: tag.enabled !== false,
            executionContext: 'cpu',
            sourceId: tag.name,
            index: idx++,
          });
        }
      }
    }

    // 2. Rule stages (GPU)
    for (const stage of this.ruleStages) {
      entries.push({
        id: `rule-${stage.name}`,
        name: stage.name,
        type: 'rule-stage',
        phase: 'rule',
        enabled: stage.enabled,
        executionContext: 'gpu',
        sourceId: stage.name,
        iterations: stage.iterations > 1 ? stage.iterations : undefined,
        index: idx++,
      });
    }

    // 3. Post-rule expression passes + visual mapping passes (GPU)
    // expressionPasses contains both post-rule ops AND visual mapping passes in order
    for (const pass of this.expressionPasses) {
      const isVisual = pass.name === 'visual-ramp' || pass.name === 'visual-script';
      entries.push({
        id: isVisual ? pass.name : `post-rule-${pass.name}`,
        name: isVisual ? (pass.name === 'visual-ramp' ? 'Color Ramp' : 'Color Script') : pass.name,
        type: isVisual ? 'visual-mapping' : 'post-rule-op',
        phase: isVisual ? 'visual' : 'post-rule',
        enabled: pass.enabled,
        executionContext: 'gpu',
        sourceId: pass.name,
        index: idx++,
      });
    }

    return entries;
  }

  /**
   * Enable or disable a rule stage by name. No recompilation — just skips at dispatch time.
   */
  setStageEnabled(name: string, enabled: boolean): void {
    const stage = this.ruleStages.find((s) => s.name === name);
    if (stage) stage.enabled = enabled;
  }

  /**
   * Enable or disable an expression/visual pass by name. No recompilation.
   */
  setPassEnabled(name: string, enabled: boolean): void {
    const pass = this.expressionPasses.find((p) => p.name === name);
    if (pass) pass.enabled = enabled;
  }

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
    this.ruleStages = [];
  }

  /**
   * Update the current env param values. Called by the controller
   * when params change (slider, command, etc.).
   */
  setEnvParams(params: Record<string, number>): void {
    this.currentEnvParams = params;
  }

  private getEnvParamsObject(): Record<string, number> {
    // Use current values if available, fall back to preset defaults
    if (Object.keys(this.currentEnvParams).length > 0) {
      return this.currentEnvParams;
    }
    const params: Record<string, number> = {};
    if (this.preset.params) {
      for (const p of this.preset.params) {
        params[p.name] = p.default;
      }
    }
    return params;
  }
}
