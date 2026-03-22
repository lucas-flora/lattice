/**
 * Simulation: high-level facade that creates a Grid + RuleRunner from a PresetConfig.
 *
 * This is the primary entry point for loading and running a simulation.
 * It handles:
 *   1. Creating the Grid with correct dimensions and properties
 *   2. Applying initial cell state from the preset
 *   3. Creating the RuleRunner with the compiled rule
 *   4. Running tick cycles
 *
 * ExpressionTagRegistry is the sole authority for all computation:
 * links (JS fast-path), post-rule expressions (Pyodide), and scripts (Pyodide).
 */

import { Grid } from '../grid/Grid';
import type { GridConfig } from '../grid/types';
import type { PresetConfig } from '../preset/types';
import { CHANNELS_PER_TYPE } from '../cell/types';
import { CellTypeRegistry } from '../cell/CellTypeRegistry';
import { RuleRunner } from './RuleRunner';
import { PythonRuleRunner } from './PythonRuleRunner';
import { compileRule } from './RuleCompiler';
import type { PyodideBridge } from '../scripting/PyodideBridge';
import { GlobalVariableStore } from '../scripting/GlobalVariableStore';
import { ExpressionTagRegistry } from '../expression/ExpressionTagRegistry';
import { buildExpressionHarness } from '../scripting/expressionHarness';
import { buildScriptHarness } from '../scripting/scriptHarness';
import { extractGridBuffers, applyResultBuffers } from '../scripting/gridTransfer';
import type { TickResult } from './types';
import { logMin, logDbg } from '../../lib/debugLog';

export class Simulation {
  readonly grid: Grid;
  runner: RuleRunner | PythonRuleRunner;
  readonly preset: PresetConfig;
  readonly params: Map<string, number> = new Map();
  readonly typeRegistry: CellTypeRegistry;
  readonly variableStore: GlobalVariableStore = new GlobalVariableStore();
  readonly tagRegistry: ExpressionTagRegistry = new ExpressionTagRegistry();

  /** Optional PyodideBridge for evaluating post-rule expressions and scripts */
  pyodideBridge: PyodideBridge | null = null;

  constructor(preset: PresetConfig) {
    this.preset = preset;

    // Initialize params from preset defaults
    if (preset.params) {
      for (const p of preset.params) {
        this.params.set(p.name, p.default);
      }
    }

    // Build type registry from preset (backward compatible)
    this.typeRegistry = CellTypeRegistry.fromPreset(preset);

    // Build grid config from preset
    const gridConfig: GridConfig = {
      dimensionality: preset.grid.dimensionality,
      width: preset.grid.width,
      height: preset.grid.height ?? 1,
      depth: preset.grid.depth ?? 1,
      topology: preset.grid.topology,
      neighborhood: 'moore', // Default; could be added to preset schema later
    };

    this.grid = new Grid(gridConfig);

    // Register all cell properties on the grid (from type registry union)
    for (const prop of this.typeRegistry.getPropertyUnion()) {
      const channels = CHANNELS_PER_TYPE[prop.type];
      this.grid.addProperty(prop.name, channels, prop.default);
    }

    // Create the CPU rule runner (no-op for webgpu/python presets — GPU handles execution)
    try {
      this.runner = new RuleRunner(this.grid, preset, undefined, this.typeRegistry);
      this.runner.setParamsProvider(() => this.getParamsObject());
    } catch {
      // Python/webgpu rules can't compile as JS — create a passthrough runner
      const noopPreset = { ...preset, rule: { ...preset.rule, compute: 'return {};' } };
      this.runner = new RuleRunner(this.grid, noopPreset, undefined, this.typeRegistry);
      this.runner.setParamsProvider(() => this.getParamsObject());
    }

    // Load global variables from preset
    if (preset.global_variables) {
      this.variableStore.loadFromConfig(preset.global_variables);
    }

    // Load parameter links from preset into tag registry
    if (preset.parameter_links) {
      this.tagRegistry.loadLinksFromConfig(preset.parameter_links);
    }

    // Load expression tags from preset
    if (preset.expression_tags) {
      for (const tagDef of preset.expression_tags) {
        const outputs = tagDef.outputs ?? [];
        const name = tagDef.name ?? (outputs.length === 1
          ? `expr: ${outputs[0]?.replace('cell.', '') ?? 'unnamed'}`
          : 'unnamed');
        this.tagRegistry.add({
          name,
          owner: tagDef.owner ?? { type: 'cell-type' },
          code: tagDef.code,
          phase: (tagDef.phase as 'pre-rule' | 'post-rule' | 'rule') ?? 'post-rule',
          enabled: tagDef.enabled ?? true,
          source: (tagDef.source as 'code' | 'script') ?? 'code',
          inputs: (tagDef.inputs ?? []) as string[],
          outputs,
        });
      }
    }

    // Create a rule tag from the preset's compute body (SG-6: rule-as-tag)
    const computeBody = preset.rule.compute || '';
    if (computeBody) {
      this.tagRegistry.addFromRule(preset.meta.name, computeBody, preset.rule.type as 'typescript' | 'wasm' | 'python');
    }
  }

  /**
   * Create a Simulation with async WASM module loading.
   * Falls back to TypeScript silently if WASM loading fails.
   * Accepts optional PyodideBridge for Python rule support.
   */
  static async create(preset: PresetConfig, pyodideBridge?: PyodideBridge): Promise<Simulation> {
    const sim = new Simulation(preset);
    if (preset.rule.type === 'python' && pyodideBridge) {
      const pythonRunner = new PythonRuleRunner(sim.grid, preset, pyodideBridge);
      pythonRunner.setParamsProvider(() => sim.getParamsObject());
      (sim as { runner: RuleRunner | PythonRuleRunner }).runner = pythonRunner;
    } else if (preset.rule.type === 'wasm') {
      const wasmRunner = await RuleRunner.create(sim.grid, preset, sim.typeRegistry);
      wasmRunner.setParamsProvider(() => sim.getParamsObject());
      (sim as { runner: RuleRunner | PythonRuleRunner }).runner = wasmRunner;
    }

    // Store bridge for post-rule expression/script evaluation
    if (pyodideBridge) {
      sim.pyodideBridge = pyodideBridge;

      // Load expressions from preset cell properties into tag registry
      const allProps = sim.typeRegistry.getPropertyUnion();
      for (const prop of allProps) {
        if (prop.expression) {
          sim.tagRegistry.addFromExpression(prop.name, prop.expression);
        }
      }

      // Load global scripts from preset into tag registry
      if (preset.global_scripts) {
        for (const scriptDef of preset.global_scripts) {
          sim.tagRegistry.addFromScript(
            scriptDef.name,
            scriptDef.code,
            scriptDef.inputs ?? [],
            scriptDef.outputs ?? [],
            scriptDef.enabled ?? true,
          );
        }
      }
    }

    return sim;
  }

  /**
   * Resolve all parameter links. Called before the rule in both sync and async paths.
   * Uses ExpressionTagRegistry.resolvePreRule() for JS fast-path resolution.
   */
  private resolveLinks(): void {
    if (this.tagRegistry.hasPreRuleTags()) {
      this.tagRegistry.resolvePreRule(this.grid, this.params, this.variableStore);
    }
  }

  /**
   * Check whether the rule tag is enabled. If no rule tag exists, rule runs (legacy).
   * If a rule tag exists but is disabled, the rule is skipped (no-op tick).
   */
  private isRuleEnabled(): boolean {
    const ruleTag = this.tagRegistry.getRuleTag();
    const allRuleTags = this.tagRegistry.getAll().filter(t => t.phase === 'rule');
    if (allRuleTags.length === 0) return true; // no rule tag → legacy
    return ruleTag !== undefined; // tag exists → only run if enabled
  }

  /**
   * Run one tick of the simulation.
   * Throws if the runner is Python-only (use tickAsync instead).
   */
  tick(): TickResult {
    this.resolveLinks();
    if (!this.isRuleEnabled()) {
      // Rule tag disabled → no-op tick (just swap buffers + advance generation)
      this.grid.swap();
      const gen = this.runner.getGeneration() + 1;
      this.runner.setGeneration(gen);
      return { generation: gen };
    }
    return this.runner.tick();
  }

  /**
   * Run one tick asynchronously. Required for Python rules, expressions, or scripts.
   * Falls back to sync tick() for TS/WASM runners without scripting.
   *
   * Pipeline: pre-rule links → rule → post-rule expressions → scripts
   */
  async tickAsync(): Promise<TickResult> {
    const generation = this.getGeneration();
    const dt = 1.0;
    const envParams = this.getParamsObject();
    const globalVars = this.variableStore.getNumericAll();
    logDbg('sim', `tickAsync() START — gen=${generation}, bridge=${this.pyodideBridge?.getStatus()}`);

    // Step 0: Resolve parameter links (before rule)
    this.resolveLinks();

    // Step 1: Execute rule (skip if rule tag is disabled)
    let result: TickResult;
    if (!this.isRuleEnabled()) {
      logDbg('sim', `tickAsync step1: rule DISABLED — no-op tick`);
      this.grid.swap();
      const gen = this.runner.getGeneration() + 1;
      this.runner.setGeneration(gen);
      result = { generation: gen };
    } else if (this.runner instanceof PythonRuleRunner) {
      logDbg('sim', `tickAsync step1: Python rule`);
      result = await this.runner.tickAsync();
    } else {
      logDbg('sim', `tickAsync step1: TS/WASM rule`);
      result = this.runner.tick();
    }
    logDbg('sim', `tickAsync step1 done — resultGen=${result.generation}`);

    // Step 2: Evaluate post-rule expressions via Pyodide
    if (this.pyodideBridge) {
      const postRuleExprs = this.tagRegistry.getPostRuleExpressions();
      const exprCount = Object.keys(postRuleExprs).length;
      if (exprCount > 0) {
        logDbg('sim', `tickAsync step2: ${exprCount} post-rule expressions`);
        const { width, height, depth } = this.grid.config;
        const propertyNames = this.grid.getPropertyNames();
        const harness = buildExpressionHarness(postRuleExprs, propertyNames, width, height, depth);
        const inputBuffers = extractGridBuffers(this.grid);
        const params = { ...envParams, _generation: result.generation, _dt: dt };

        const resultBuffers = await this.pyodideBridge.execExpressions(
          harness,
          inputBuffers,
          width,
          height,
          depth,
          params,
          globalVars,
        );

        applyResultBuffers(this.grid, resultBuffers, 'current');
        logDbg('sim', `tickAsync step2 done — applied ${Object.keys(resultBuffers).length} buffers`);
      }
    }

    // Step 3: Run script tags via Pyodide
    if (this.pyodideBridge) {
      const scriptTags = this.tagRegistry.getAll().filter(
        t => t.enabled && t.source === 'script' && t.phase === 'post-rule',
      );
      if (scriptTags.length > 0) {
        logDbg('sim', `tickAsync step3: ${scriptTags.length} script tags`);
        const { width, height, depth } = this.grid.config;
        const params = { ...envParams, _generation: result.generation, _dt: dt };
        let currentVars = { ...globalVars };

        for (const tag of scriptTags) {
          const harness = buildScriptHarness(
            tag.code,
            tag.inputs,
            tag.outputs,
            width,
            height,
            depth,
          );

          const scriptResult = await this.pyodideBridge.execScript(
            harness,
            params,
            currentVars,
            width,
            height,
            depth,
          );

          // Apply env changes
          for (const [k, v] of Object.entries(scriptResult.envChanges)) {
            this.params.set(k, v);
          }
          // Apply var changes
          for (const [k, v] of Object.entries(scriptResult.varChanges)) {
            this.variableStore.set(k, v);
            if (typeof v === 'number') {
              currentVars[k] = v;
            }
          }
        }
        logDbg('sim', `tickAsync step3 done`);
      }
    }

    logDbg('sim', `tickAsync() END — gen=${result.generation}`);
    return result;
  }

  /**
   * Check whether the simulation is using a Python rule.
   */
  isUsingPython(): boolean {
    return this.runner instanceof PythonRuleRunner;
  }

  /**
   * Check whether the tick pipeline requires async execution.
   * True if Python rule, or any post-rule expressions/scripts exist.
   */
  needsAsyncTick(): boolean {
    if (this.runner instanceof PythonRuleRunner) return true;
    if (!this.pyodideBridge) return false;
    if (this.tagRegistry.hasPostRuleTags()) return true;
    const hasScriptTags = this.tagRegistry.getAll().some(
      t => t.enabled && t.source === 'script',
    );
    return hasScriptTags;
  }

  /**
   * Run multiple ticks.
   */
  tickN(n: number): TickResult {
    let result: TickResult = { generation: 0 };
    for (let i = 0; i < n; i++) {
      result = this.tick();
    }
    return result;
  }

  /**
   * Get the current generation.
   */
  getGeneration(): number {
    return this.runner.getGeneration();
  }

  /**
   * Reset the simulation to initial state.
   */
  reset(): void {
    this.runner.reset();
  }

  /**
   * Set a cell's value in the current (read) buffer directly.
   * Used for initial state setup and cell editing.
   */
  setCellDirect(propertyName: string, index: number, value: number, channel: number = 0): void {
    const currentBuf = this.grid.getCurrentBuffer(propertyName);
    const prop = this.typeRegistry.getPropertyUnion().find((p) => p.name === propertyName);
    if (!prop) throw new Error(`Property '${propertyName}' not found`);
    const channels = CHANNELS_PER_TYPE[prop.type];
    currentBuf[index * channels + channel] = value;
  }

  /**
   * Get a cell's value from the current (read) buffer.
   */
  getCellDirect(propertyName: string, index: number, channel: number = 0): number {
    return this.grid.getCellValue(propertyName, index, channel);
  }

  /**
   * Set a runtime parameter value.
   */
  setParam(name: string, value: number): void {
    this.params.set(name, value);
  }

  /**
   * Get a runtime parameter value.
   */
  getParam(name: string): number | undefined {
    return this.params.get(name);
  }

  /**
   * Get all params as a plain object (for passing to RuleContext).
   */
  getParamsObject(): Record<string, number> {
    const obj: Record<string, number> = {};
    for (const [k, v] of this.params) {
      obj[k] = v;
    }
    return obj;
  }

  /**
   * Replace the compute body and recompile the rule runner.
   */
  updateRule(newBody: string): void {
    // Validate that it compiles
    compileRule(newBody);
    // Create updated preset config with new compute body
    const updatedPreset = {
      ...this.preset,
      rule: { ...this.preset.rule, compute: newBody },
    };
    // Replace runner with recompiled one
    const gen = this.getGeneration();
    this.runner = new RuleRunner(this.grid, updatedPreset, undefined, this.typeRegistry);
    this.runner.setGeneration(gen);
    this.runner.setParamsProvider(() => this.getParamsObject());
  }
}
