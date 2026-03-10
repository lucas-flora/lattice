/**
 * AppShell: top-level layout component that initializes the command infrastructure
 * and renders all surfaces (viewport, controls, terminal, panels).
 *
 * On mount: creates EventBus, SimulationController, registers all commands,
 * wires stores, loads the default preset (Conway's GoL), and attaches keyboard shortcuts.
 *
 * Supports multi-viewport layout (RNDR-08) and per-viewport fullscreen (RNDR-09).
 * GUIP-04: Keyboard shortcuts attached via KeyboardShortcutManager.
 */

'use client';

import { useRef, useEffect } from 'react';
import { eventBus } from '@/engine/core/EventBus';
import { SimulationController } from '@/commands/SimulationController';
import { commandRegistry } from '@/commands/CommandRegistry';
import { registerAllCommands } from '@/commands/definitions';
import { wireStores } from '@/commands/wireStores';
import { loadBuiltinPresetClient } from '@/engine/preset/builtinPresetsClient';
import { KeyboardShortcutManager } from '@/commands/KeyboardShortcutManager';
import { SimulationViewport } from '@/components/viewport/SimulationViewport';
import { HUD } from '@/components/hud/HUD';
import { ControlBar } from '@/components/hud/ControlBar';
import { PresetSelector } from '@/components/hud/PresetSelector';
import { HotkeyHelp } from '@/components/hud/HotkeyHelp';
import { Terminal } from '@/components/terminal/Terminal';
import { ParamPanel } from '@/components/panels/ParamPanel';
import { useSimStore } from '@/store/simStore';
import { useUiStore } from '@/store/uiStore';

/** Module-level singleton for the simulation controller */
let controllerSingleton: SimulationController | null = null;
let unwireFn: (() => void) | null = null;
let shortcutManager: KeyboardShortcutManager | null = null;

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
  } else if (dim === '3d') {
    // Sparse random initialization for 3D
    for (let i = 0; i < sim.grid.cellCount; i++) {
      if (Math.random() < 0.1) {
        sim.setCellDirect(firstProp, i, 1);
      }
    }
  }
}

export function AppShell() {
  const initializedRef = useRef(false);
  const activePreset = useSimStore((s) => s.activePreset);
  const viewportCount = useUiStore((s) => s.viewportCount);
  const fullscreenViewportId = useUiStore((s) => s.fullscreenViewportId);

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

    // Attach keyboard shortcuts (GUIP-04)
    shortcutManager = new KeyboardShortcutManager(commandRegistry);
    shortcutManager.attach(window);

    // Load default preset (Conway's GoL) using client-safe loader
    const config = loadBuiltinPresetClient('conways-gol');
    controller.loadPresetConfig(config);
    initializeSimulation(controller);

    return () => {
      if (shortcutManager) {
        shortcutManager.detach(window);
        shortcutManager = null;
      }
      controller.dispose();
      controllerSingleton = null;
      if (unwireFn) {
        unwireFn();
        unwireFn = null;
      }
    };
  }, []);

  const isAnyFullscreen = fullscreenViewportId !== null;

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden">
      {/* Viewport area */}
      <div className="flex w-full h-full">
        {/* Primary viewport: always visible unless a different viewport is fullscreen */}
        {(!isAnyFullscreen || fullscreenViewportId === 'viewport-1') && (
          <div
            className={`${viewportCount === 2 && !isAnyFullscreen ? 'w-1/2 border-r border-zinc-700' : 'w-full'} h-full`}
          >
            <SimulationViewport viewportId="viewport-1" />
          </div>
        )}

        {/* Secondary viewport: only visible in split mode or when it's fullscreen */}
        {(viewportCount === 2 || fullscreenViewportId === 'viewport-2') &&
          (!isAnyFullscreen || fullscreenViewportId === 'viewport-2') && (
            <div
              className={`${viewportCount === 2 && !isAnyFullscreen ? 'w-1/2' : 'w-full'} h-full`}
            >
              <SimulationViewport viewportId="viewport-2" />
            </div>
          )}
      </div>

      {/* HUD and controls: hidden when any viewport is fullscreen */}
      {!isAnyFullscreen && (
        <>
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
        </>
      )}

      {/* Hotkey help overlay -- always rendered (visibility controlled internally) */}
      <HotkeyHelp />
    </div>
  );
}
