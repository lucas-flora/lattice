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
import { BrushDispatcher } from '../gpu/BrushDispatcher';
import type { Brush } from '../../store/brushStore';
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
  /** Unique ID (stage name for rules, pass name for ops) */
  id: string;
  /** Display name */
  name: string;
  /** Pipeline category */
  type: 'interaction-op' | 'pre-rule-op' | 'rule-stage' | 'post-rule-op';
  /** Pipeline phase */
  phase: 'interaction' | 'pre-rule' | 'rule' | 'post-rule';
  enabled: boolean;
  /** CPU for pre-rule link ops, GPU for everything else */
  executionContext: 'cpu' | 'gpu';
  /** Cross-reference ID (op ID, stage name) */
  sourceId?: string;
  /** Expression store operator ID (tag_N) for cross-selection with Tree/CardView */
  opId?: string;
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
  /** Current env param values (updated by controller, read during tick) */
  private currentEnvParams: Record<string, number> = {};
  /** GPU brush dispatcher — applies brush before rule stages */
  private brushDispatcher: BrushDispatcher;
  /** Current brush drawing state (set by controller each frame) */
  private brushState: {
    isDrawing: boolean;
    cursorX: number;
    cursorY: number;
    brush: Brush | null;
    radius: number;
  } = { isDrawing: false, cursorX: 0, cursorY: 0, brush: null, radius: 3 };

  constructor(grid: Grid, preset: PresetConfig) {
    this.grid = grid;
    this.preset = preset;
    this.bufferManager = new BufferManager();
    this.shaderCompiler = new ShaderCompiler();
    this.computeDispatcher = new ComputeDispatcher(this.shaderCompiler);
    this.brushDispatcher = new BrushDispatcher(this.shaderCompiler);
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

    // 9. Initialize brush dispatcher (writes in-place to read buffer before rule stages)
    // NOTE: Expression/visual passes are compiled externally via recompileExpressionTags()
    // after initialize(). The caller (SimulationController) handles this.
    this.brushDispatcher.initialize(width, height, this.bufferManager.getReadBuffer());

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
   * Compile all ops into compute passes. Clears expression passes and rebuilds.
   * Also recompiles rule-phase tags by replacing their corresponding rule stages.
   * Handles ALL ops uniformly — rule stages, expression tags, visual mappings, everything.
   */
  recompileExpressionTags(liveTags: Array<{ name: string; code: string; phase?: string; enabled?: boolean }>): void {
    // Clear ALL expression passes and rebuild from scratch
    this.expressionPasses = [];

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

    const readBuf = this.bufferManager.getReadBuffer();
    const writeBuf = this.bufferManager.getWriteBuffer();
    const paramsBuf = this.bufferManager.getParamsBuffer();

    // --- Recompile rule-phase tags by replacing their rule stages ---
    const ruleTags = liveTags.filter(t => t.phase === 'rule' && t.code);
    for (const tag of ruleTags) {
      try {
        const result = parsePython(tag.code, context);
        const irProgram = result.program;

        const validation = validateIR(irProgram);
        if (!validation.valid) {
          logGPU(`Rule "${tag.name}" IR validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
          continue;
        }

        const wgsl = generateWGSL(irProgram, wgslConfig);
        const pipeline = this.createPipelineWithLayout(wgsl, `rule-${tag.name}`);

        const bg0 = this.createBindGroup(readBuf, writeBuf, paramsBuf);
        const bg1 = this.createBindGroup(writeBuf, readBuf, paramsBuf);

        // Match to existing rule stage — for single-stage presets this is ruleStages[0].
        // For multi-stage, match by name suffix (tag name ends with "— stageName").
        if (this.ruleStages.length === 1 && ruleTags.length === 1) {
          // Single rule → replace the only stage
          this.ruleStages[0] = {
            ...this.ruleStages[0],
            pipeline,
            bindGroups: [bg0, bg1],
            enabled: tag.enabled !== false,
          };
          logGPU(`Rule "${tag.name}" recompiled to GPU (replaced single stage)`);
        } else {
          // Multi-stage — find matching stage by name
          const idx = this.ruleStages.findIndex(s => tag.name.includes(s.name));
          if (idx >= 0) {
            this.ruleStages[idx] = {
              ...this.ruleStages[idx],
              pipeline,
              bindGroups: [bg0, bg1],
              enabled: tag.enabled !== false,
            };
            logGPU(`Rule "${tag.name}" recompiled to GPU (replaced stage "${this.ruleStages[idx].name}")`);
          } else {
            logGPU(`Rule "${tag.name}" has no matching stage — skipped`);
          }
        }
      } catch (e) {
        logGPU(`Rule "${tag.name}" recompile failed: ${e instanceof Error ? e.message : e}`);
      }
    }

    // --- Compile all enabled post-rule tags (expression tags, visual mappings, everything) ---
    const postRuleTags = liveTags.filter(t => t.enabled !== false && t.phase === 'post-rule' && t.code);
    for (const tag of postRuleTags) {
      try {
        const result = parsePython(tag.code, context);
        const irProgram = result.program;

        const validation = validateIR(irProgram);
        if (!validation.valid) {
          logGPU(`Op "${tag.name}" IR validation failed: ${validation.errors.map(e => e.message).join('; ')}`);
          continue;
        }

        const wgsl = generateWGSL(irProgram, wgslConfig);
        const pipeline = this.createPipelineWithLayout(wgsl, `expr-${tag.name}`);

        const bg0 = this.createBindGroup(readBuf, writeBuf, paramsBuf);
        const bg1 = this.createBindGroup(writeBuf, readBuf, paramsBuf);

        this.expressionPasses.push({ name: tag.name, pipeline, bindGroups: [bg0, bg1], enabled: true });
        logGPU(`Op "${tag.name}" compiled to GPU`);
      } catch (e) {
        logGPU(`Op "${tag.name}" compile failed: ${e instanceof Error ? e.message : e}`);
      }
    }

    logGPU(`Ops recompiled (${ruleTags.length} rule, ${postRuleTags.length} post-rule, ${this.expressionPasses.length} expr passes)`);
  }

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

    // Brush dispatch — writes in-place to read buffer before rule stages process it
    if (this.brushState.isDrawing && this.brushState.brush) {
      this.brushDispatcher.rebindGridBuffer(this.bufferManager.getReadBuffer());
      const encoder = this.computeDispatcher.beginCommandEncoder('brush');
      this.brushDispatcher.dispatch(
        encoder,
        this.brushState.cursorX,
        this.brushState.cursorY,
        this.brushState.brush,
        this.brushState.radius,
        this.bufferManager.stride,
        this.propertyLayout,
      );
      this.computeDispatcher.submit(encoder);
    }

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
  getExecutionOrder(allTags?: Array<{ id: string; name: string; phase: string; enabled: boolean }>): PipelineEntry[] {
    const entries: PipelineEntry[] = [];
    let idx = 0;

    // 0. Interaction ops — brush-driven, run when drawing (before everything)
    if (allTags) {
      for (const tag of allTags) {
        if (tag.phase === 'interaction') {
          entries.push({
            id: `interaction-${tag.name}`,
            name: tag.name,
            type: 'interaction-op',
            phase: 'interaction',
            enabled: tag.enabled !== false,
            executionContext: 'gpu',
            sourceId: tag.name,
            opId: tag.id,
            index: idx++,
          });
        }
      }
    }

    // 1. Pre-rule ops — link-sourced fast-path evaluations (CPU)
    // Use allTags (live registry) when available, fall back to preset for backward compat
    const preRuleSrc = allTags ?? this.preset.expression_tags ?? [];
    for (const tag of preRuleSrc) {
      if (tag.phase === 'pre-rule') {
        entries.push({
          id: `pre-rule-${tag.name}`,
          name: tag.name,
          type: 'pre-rule-op',
          phase: 'pre-rule',
          enabled: tag.enabled !== false,
          executionContext: 'cpu',
          sourceId: tag.name,
          opId: (tag as { id?: string }).id,
          index: idx++,
        });
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

    // 3. Post-rule ops (GPU) — use allTags so disabled ops still appear
    if (allTags) {
      for (const tag of allTags) {
        if (tag.phase === 'post-rule') {
          entries.push({
            id: `post-rule-${tag.name}`,
            name: tag.name,
            type: 'post-rule-op',
            phase: 'post-rule',
            enabled: tag.enabled !== false,
            executionContext: 'gpu',
            sourceId: tag.name,
            opId: tag.id,
            index: idx++,
          });
        }
      }
    } else {
      // Fallback: use compiled passes (no allTags available)
      for (const pass of this.expressionPasses) {
        entries.push({
          id: `post-rule-${pass.name}`,
          name: pass.name,
          type: 'post-rule-op',
          phase: 'post-rule',
          enabled: pass.enabled,
          executionContext: 'gpu',
          sourceId: pass.name,
          index: idx++,
        });
      }
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
   * Reorder a rule stage within the compiled ruleStages array.
   * Changes actual GPU dispatch order — no recompilation needed.
   * Also reorders the preset config stages array to stay in sync.
   */
  reorderStage(name: string, newIndex: number): boolean {
    const curIdx = this.ruleStages.findIndex((s) => s.name === name);
    if (curIdx < 0 || newIndex < 0 || newIndex >= this.ruleStages.length || curIdx === newIndex) return false;
    const [moved] = this.ruleStages.splice(curIdx, 1);
    this.ruleStages.splice(newIndex, 0, moved);
    // Keep preset config in sync
    if (this.preset.rule.stages) {
      const presetIdx = this.preset.rule.stages.findIndex((s) => s.name === name);
      if (presetIdx >= 0) {
        const [presetMoved] = this.preset.rule.stages.splice(presetIdx, 1);
        this.preset.rule.stages.splice(newIndex, 0, presetMoved);
      }
    }
    return true;
  }

  /**
   * Reorder an expression pass within the compiled expressionPasses array.
   * Changes actual GPU dispatch order — no recompilation needed.
   * Also reorders the preset config expression_tags array to stay in sync.
   */
  reorderPass(name: string, newIndex: number): boolean {
    const curIdx = this.expressionPasses.findIndex(p => p.name === name);
    if (curIdx < 0 || newIndex < 0 || newIndex >= this.expressionPasses.length || curIdx === newIndex) return false;

    const [moved] = this.expressionPasses.splice(curIdx, 1);
    this.expressionPasses.splice(newIndex, 0, moved);

    // Keep preset config expression_tags in sync (same-phase reorder)
    if (this.preset.expression_tags) {
      const phase = 'post-rule';
      const phaseIndices: number[] = [];
      for (let i = 0; i < this.preset.expression_tags.length; i++) {
        if (this.preset.expression_tags[i].phase === phase) {
          phaseIndices.push(i);
        }
      }
      const presetLocalIdx = phaseIndices.findIndex(
        (gi) => this.preset.expression_tags![gi].name === name,
      );
      if (presetLocalIdx >= 0) {
        const presetGlobalIdx = phaseIndices[presetLocalIdx];
        const [presetMoved] = this.preset.expression_tags.splice(presetGlobalIdx, 1);
        // Recompute after removal
        const updatedPhaseIndices: number[] = [];
        for (let i = 0; i < this.preset.expression_tags.length; i++) {
          if (this.preset.expression_tags[i].phase === phase) {
            updatedPhaseIndices.push(i);
          }
        }
        const presetInsert = newIndex < updatedPhaseIndices.length
          ? updatedPhaseIndices[newIndex]
          : (updatedPhaseIndices.length > 0 ? updatedPhaseIndices[updatedPhaseIndices.length - 1] + 1 : this.preset.expression_tags.length);
        this.preset.expression_tags.splice(presetInsert, 0, presetMoved);
      }
    }
    return true;
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
   * Upload already-interleaved data directly to the GPU read buffer.
   * Used for restoring circular buffer snapshots — skip the per-property packing step.
   */
  uploadInterleaved(data: Float32Array): void {
    this.bufferManager.uploadToRead(data);
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

  /**
   * Set the brush drawing state. Called by the controller each frame.
   * When isDrawing is true, the brush compute shader runs before rule stages.
   */
  setBrushState(isDrawing: boolean, cursorX: number, cursorY: number, brush: Brush | null, radius: number): void {
    this.brushState = { isDrawing, cursorX, cursorY, brush, radius };
  }

  /** Update env params in the uniform buffer */
  updateParams(envParams: Record<string, number>, generation: number, dt: number): void {
    this.generation = generation;
    this.bufferManager.updateParams(envParams);
  }

  /** Clean up all GPU resources */
  destroy(): void {
    this.brushDispatcher.destroy();
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
