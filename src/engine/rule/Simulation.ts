/**
 * Simulation: high-level facade that creates a Grid from a PresetConfig.
 *
 * This is the primary entry point for loading a simulation.
 * It handles:
 *   1. Creating the Grid with correct dimensions and properties
 *   2. Building the CellTypeRegistry
 *   3. Loading expression tags, parameter links, and global variables
 *
 * Rule execution is handled by GPURuleRunner (GPU compute shaders).
 * This class owns the grid metadata and generation counter.
 */

import { Grid } from '../grid/Grid';
import type { GridConfig } from '../grid/types';
import type { PresetConfig } from '../preset/types';
import { CHANNELS_PER_TYPE } from '../cell/types';
import { CellTypeRegistry } from '../cell/CellTypeRegistry';
import { GlobalVariableStore } from '../scripting/GlobalVariableStore';
import { ExpressionTagRegistry } from '../expression/ExpressionTagRegistry';
import type { TickResult } from './types';

export class Simulation {
  readonly grid: Grid;
  readonly preset: PresetConfig;
  readonly params: Map<string, number> = new Map();
  readonly typeRegistry: CellTypeRegistry;
  readonly variableStore: GlobalVariableStore = new GlobalVariableStore();
  readonly tagRegistry: ExpressionTagRegistry = new ExpressionTagRegistry();

  /** Generation counter (owned by Simulation, synced with GPURuleRunner) */
  private generation: number = 0;

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
      neighborhood: 'moore',
    };

    this.grid = new Grid(gridConfig);

    // Register all cell properties on the grid (from type registry union)
    for (const prop of this.typeRegistry.getPropertyUnion()) {
      const channels = CHANNELS_PER_TYPE[prop.type];
      this.grid.addProperty(prop.name, channels, prop.default);
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
      this.tagRegistry.addFromRule(preset.meta.name, computeBody, 'webgpu');
    }
  }

  /**
   * Resolve all parameter links. Called before the rule in both sync and async paths.
   */
  resolveLinks(): void {
    if (this.tagRegistry.hasPreRuleTags()) {
      this.tagRegistry.resolvePreRule(this.grid, this.params, this.variableStore);
    }
  }

  /**
   * Get the current generation.
   */
  getGeneration(): number {
    return this.generation;
  }

  /**
   * Set the generation counter directly.
   */
  setGeneration(gen: number): void {
    this.generation = gen;
  }

  /**
   * Check whether the tick pipeline requires async execution.
   * With GPU-only architecture, this is always false — GPU handles everything.
   */
  needsAsyncTick(): boolean {
    return false;
  }

  /**
   * Reset the simulation to initial state.
   */
  reset(): void {
    this.grid.reset();
    this.generation = 0;
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
   * Get all params as a plain object.
   */
  getParamsObject(): Record<string, number> {
    const obj: Record<string, number> = {};
    for (const [k, v] of this.params) {
      obj[k] = v;
    }
    return obj;
  }
}
