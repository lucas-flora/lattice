/**
 * AppShell: top-level layout component that initializes the command infrastructure
 * and renders all surfaces (viewport, controls, terminal, panels).
 *
 * On mount: creates EventBus, SimulationController, registers all commands,
 * wires stores, and loads the default preset (Conway's GoL).
 */

'use client';

import { useRef, useEffect, useCallback } from 'react';
import { EventBus, eventBus } from '@/engine/core/EventBus';
import { SimulationController } from '@/commands/SimulationController';
import { commandRegistry, CommandRegistry } from '@/commands/CommandRegistry';
import { registerAllCommands } from '@/commands/definitions';
import { wireStores } from '@/commands/wireStores';
import { loadBuiltinPresetClient } from '@/engine/preset/builtinPresetsClient';
import { SimulationViewport } from '@/components/viewport/SimulationViewport';
import { HUD } from '@/components/hud/HUD';
import { ControlBar } from '@/components/hud/ControlBar';
import { PresetSelector } from '@/components/hud/PresetSelector';
import { Terminal } from '@/components/terminal/Terminal';
import { ParamPanel } from '@/components/panels/ParamPanel';
import { useSimStore } from '@/store/simStore';

/** Module-level singleton for the simulation controller */
let controllerSingleton: SimulationController | null = null;
let unwireFn: (() => void) | null = null;

export function getController(): SimulationController | null {
  return controllerSingleton;
}

/**
 * Initialize simulation with appropriate starting state per dimensionality.
 */
function initializeSimulation(controller: SimulationController): void {
  const sim = controller.getSimulation();
  if (!sim) return;

  const dim = sim.preset.grid.dimensionality;
  const firstProp = sim.preset.cell_properties[0].name;

  if (dim === '1d') {
    const centerX = Math.floor(sim.preset.grid.width / 2);
    sim.setCellDirect(firstProp, centerX, 1);
  } else if (dim === '2d') {
    for (let i = 0; i < sim.grid.cellCount; i++) {
      if (Math.random() < 0.2) {
        sim.setCellDirect(firstProp, i, 1);
      }
    }
  }
}

export function AppShell() {
  const initializedRef = useRef(false);
  const activePreset = useSimStore((s) => s.activePreset);

  // Initialize command infrastructure once
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Create controller with the global eventBus
    const controller = new SimulationController(eventBus, 100);
    controllerSingleton = controller;

    // Clear and re-register commands (idempotent)
    commandRegistry.clear();
    registerAllCommands(commandRegistry, controller, eventBus);

    // Wire stores
    unwireFn = wireStores(eventBus);

    // Load default preset (Conway's GoL) using client-safe loader
    const config = loadBuiltinPresetClient('conways-gol');
    controller.loadPresetConfig(config);
    initializeSimulation(controller);

    return () => {
      controller.dispose();
      controllerSingleton = null;
      if (unwireFn) {
        unwireFn();
        unwireFn = null;
      }
    };
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z: undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        commandRegistry.execute('edit.undo', {});
      }
      // Ctrl+Shift+Z: redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        commandRegistry.execute('edit.redo', {});
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden">
      {/* Viewport fills entire background */}
      <SimulationViewport />

      {/* HUD overlay - top left */}
      <HUD />

      {/* Preset selector - top right */}
      <PresetSelector />

      {/* Parameter panel - right side */}
      <ParamPanel />

      {/* Control bar - bottom center */}
      <ControlBar />

      {/* Terminal - bottom slide-up */}
      <Terminal />
    </div>
  );
}
