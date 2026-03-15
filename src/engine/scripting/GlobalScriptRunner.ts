/**
 * GlobalScriptRunner: manages per-frame global scripts.
 *
 * Global scripts run after the rule in the tick pipeline.
 * They can read/write env params and global variables.
 */

import { eventBus } from '../core/EventBus';
import type { PyodideBridge } from './PyodideBridge';
import type { GlobalScriptDef } from './types';
import { buildScriptHarness } from './scriptHarness';

export interface ScriptRunResult {
  envChanges: Record<string, number>;
  varChanges: Record<string, number | string>;
}

export class GlobalScriptRunner {
  private scripts = new Map<string, GlobalScriptDef>();
  private bridge: PyodideBridge;

  constructor(bridge: PyodideBridge) {
    this.bridge = bridge;
  }

  addScript(def: GlobalScriptDef): void {
    this.scripts.set(def.name, { ...def });
    eventBus.emit('script:scriptAdded', {
      name: def.name,
      enabled: def.enabled,
      code: def.code,
      inputs: def.inputs,
      outputs: def.outputs,
    });
  }

  removeScript(name: string): boolean {
    const existed = this.scripts.delete(name);
    if (existed) {
      eventBus.emit('script:scriptRemoved', { name });
    }
    return existed;
  }

  enableScript(name: string): void {
    const script = this.scripts.get(name);
    if (script) {
      script.enabled = true;
      eventBus.emit('script:scriptToggled', { name, enabled: true });
    }
  }

  disableScript(name: string): void {
    const script = this.scripts.get(name);
    if (script) {
      script.enabled = false;
      eventBus.emit('script:scriptToggled', { name, enabled: false });
    }
  }

  getScript(name: string): GlobalScriptDef | undefined {
    const s = this.scripts.get(name);
    return s ? { ...s } : undefined;
  }

  getAllScripts(): GlobalScriptDef[] {
    return Array.from(this.scripts.values()).map((s) => ({ ...s }));
  }

  getEnabledScripts(): GlobalScriptDef[] {
    return this.getAllScripts().filter((s) => s.enabled);
  }

  hasEnabledScripts(): boolean {
    for (const s of this.scripts.values()) {
      if (s.enabled) return true;
    }
    return false;
  }

  /**
   * Run all enabled scripts sequentially. Returns combined env/var changes.
   */
  async runAll(
    envParams: Record<string, number>,
    globalVars: Record<string, number>,
    generation: number,
    dt: number,
    gridWidth: number,
    gridHeight: number,
    gridDepth: number,
  ): Promise<ScriptRunResult> {
    const enabled = this.getEnabledScripts();
    if (enabled.length === 0) return { envChanges: {}, varChanges: {} };

    const combinedEnvChanges: Record<string, number> = {};
    const combinedVarChanges: Record<string, number | string> = {};

    const params = { ...envParams, _generation: generation, _dt: dt };

    for (const script of enabled) {
      const harness = buildScriptHarness(
        script.code,
        script.inputs ?? [],
        script.outputs ?? [],
        gridWidth,
        gridHeight,
        gridDepth,
      );

      const result = await this.bridge.execScript(
        harness,
        params,
        { ...globalVars, ...combinedVarChanges as Record<string, number> },
        gridWidth,
        gridHeight,
        gridDepth,
      );

      Object.assign(combinedEnvChanges, result.envChanges);
      Object.assign(combinedVarChanges, result.varChanges);
    }

    return { envChanges: combinedEnvChanges, varChanges: combinedVarChanges };
  }

  loadFromConfig(defs: GlobalScriptDef[]): void {
    this.scripts.clear();
    for (const def of defs) {
      this.scripts.set(def.name, { ...def });
    }
  }
}
