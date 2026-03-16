/**
 * Simulation: high-level facade that creates a Grid + RuleRunner from a PresetConfig.
 *
 * This is the primary entry point for loading and running a simulation.
 * It handles:
 *   1. Creating the Grid with correct dimensions and properties
 *   2. Applying initial cell state from the preset
 *   3. Creating the RuleRunner with the compiled rule
 *   4. Running tick cycles
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
import { ExpressionEngine } from '../scripting/ExpressionEngine';
import { GlobalScriptRunner } from '../scripting/GlobalScriptRunner';
import { LinkRegistry } from '../linking/LinkRegistry';
import { ExpressionTagRegistry } from '../expression/ExpressionTagRegistry';
import type { TickResult } from './types';

export class Simulation {
  readonly grid: Grid;
  runner: RuleRunner | PythonRuleRunner;
  readonly preset: PresetConfig;
  readonly params: Map<string, number> = new Map();
  readonly typeRegistry: CellTypeRegistry;
  readonly variableStore: GlobalVariableStore = new GlobalVariableStore();
  readonly linkRegistry: LinkRegistry = new LinkRegistry();
  readonly tagRegistry: ExpressionTagRegistry = new ExpressionTagRegistry();
  expressionEngine: ExpressionEngine | null = null;
  globalScriptRunner: GlobalScriptRunner | null = null;

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

    // Create the rule runner (synchronous path -- always uses TS fallback)
    this.runner = new RuleRunner(this.grid, preset, undefined, this.typeRegistry);
    this.runner.setParamsProvider(() => this.getParamsObject());

    // Load global variables from preset
    if (preset.global_variables) {
      this.variableStore.loadFromConfig(preset.global_variables);
    }

    // Load parameter links from preset (into both old and new registries)
    if (preset.parameter_links) {
      this.linkRegistry.loadFromConfig(preset.parameter_links);
      this.tagRegistry.loadLinksFromConfig(preset.parameter_links);
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

    // Set up scripting engines if a bridge is available
    if (pyodideBridge) {
      sim.expressionEngine = new ExpressionEngine(pyodideBridge);
      sim.globalScriptRunner = new GlobalScriptRunner(pyodideBridge);

      // Load expressions from preset cell properties
      const allProps = sim.typeRegistry.getPropertyUnion();
      sim.expressionEngine.loadFromProperties(allProps);

      // Load global scripts from preset
      if (preset.global_scripts) {
        sim.globalScriptRunner.loadFromConfig(preset.global_scripts);
      }
    }

    return sim;
  }

  /**
   * Resolve all parameter links. Called before the rule in both sync and async paths.
   *
   * During the migration period, both LinkRegistry (deprecated) and ExpressionTagRegistry
   * are called. Once LinkRegistry is removed (SG-5 completion), only
   * ExpressionTagRegistry.resolvePreRule() will remain.
   */
  private resolveLinks(): void {
    // TODO(SG-5): Remove linkRegistry.resolveAll() once LinkRegistry is fully phased out.
    // ExpressionTagRegistry.resolvePreRule() handles the same resolution via JS fast-path.
    if (this.linkRegistry.hasLinks()) {
      this.linkRegistry.resolveAll(this.grid, this.params, this.variableStore);
    }
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
    // getRuleTag() returns enabled tags only. If no rule-phase tag exists at all,
    // fall back to legacy behavior (always run). If one exists but is disabled,
    // getRuleTag() returns undefined while the tag is still present.
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
   * Pipeline: rule → expressions (post-rule) → global scripts
   *
   * Expressions run AFTER the rule so they can derive values from the rule's
   * output (e.g. alpha = age / 50.0). They read from the current buffer
   * (which contains the rule's newly-swapped output) and write back to current.
   * This can be made configurable (pre/post) when the dependency graph lands.
   */
  async tickAsync(): Promise<TickResult> {
    const generation = this.getGeneration();
    const dt = 1.0;
    const envParams = this.getParamsObject();
    const globalVars = this.variableStore.getNumericAll();

    // Step 0: Resolve parameter links (before rule)
    this.resolveLinks();

    // Step 1: Execute rule (skip if rule tag is disabled)
    let result: TickResult;
    if (!this.isRuleEnabled()) {
      this.grid.swap();
      const gen = this.runner.getGeneration() + 1;
      this.runner.setGeneration(gen);
      result = { generation: gen };
    } else if (this.runner instanceof PythonRuleRunner) {
      result = await this.runner.tickAsync();
    } else {
      result = this.runner.tick();
    }

    // Step 2: Evaluate expressions (post-rule, reads rule output from current buffer)
    if (this.expressionEngine?.hasExpressions()) {
      await this.expressionEngine.evaluate(this.grid, result.generation, dt, envParams, globalVars);
    }

    // Step 3: Run global scripts (after rule + expressions)
    if (this.globalScriptRunner?.hasEnabledScripts()) {
      const { width, height, depth } = this.grid.config;
      const scriptResult = await this.globalScriptRunner.runAll(
        envParams,
        this.variableStore.getNumericAll(),
        result.generation,
        dt,
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
      }
    }

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
   * True if any scripting feature is active (expressions, scripts, or Python rule).
   */
  needsAsyncTick(): boolean {
    if (this.runner instanceof PythonRuleRunner) return true;
    if (this.expressionEngine?.hasExpressions()) return true;
    if (this.globalScriptRunner?.hasEnabledScripts()) return true;
    return false;
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
