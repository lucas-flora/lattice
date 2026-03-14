/**
 * AppShell: top-level layout component that initializes the command infrastructure
 * and renders all surfaces (viewport, controls, terminal, panels).
 *
 * On mount: creates EventBus, SimulationController, registers all commands,
 * wires stores, loads the default preset (Conway's GoL), and attaches keyboard shortcuts.
 *
 * Uses zone-based layout: left drawer, center (viewports), right drawer,
 * pinned Timeline+ControlBar, bottom drawer (terminal).
 */

'use client';

import { useRef, useEffect, useCallback } from 'react';
import { eventBus } from '@/engine/core/EventBus';
import { SimulationController } from '@/commands/SimulationController';
import { commandRegistry } from '@/commands/CommandRegistry';
import { registerAllCommands } from '@/commands/definitions';
import { wireStores } from '@/commands/wireStores';
import { loadBuiltinPresetClient } from '@/engine/preset/builtinPresetsClient';
import { KeyboardShortcutManager } from '@/commands/KeyboardShortcutManager';
import { SimulationViewport } from '@/components/viewport/SimulationViewport';
import { HUD } from '@/components/hud/HUD';
import { HotkeyHelp } from '@/components/hud/HotkeyHelp';
import { BottomTray } from '@/components/layout/BottomTray';
import { Terminal } from '@/components/terminal/Terminal';
import { ParamPanel } from '@/components/panels/ParamPanel';
import { useUiStore } from '@/store/uiStore';
import { useLayoutStore, layoutStoreActions } from '@/store/layoutStore';
import { DrawerShell } from '@/components/layout/DrawerShell';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { CellPanel } from '@/components/panels/CellPanel';

/** Module-level singleton for the simulation controller */
let controllerSingleton: SimulationController | null = null;
let unwireFn: (() => void) | null = null;
let shortcutManager: KeyboardShortcutManager | null = null;

export function getController(): SimulationController | null {
  return controllerSingleton;
}

/**
 * Initialize simulation with appropriate starting state per preset.
 * Each preset needs domain-specific initialization — random binary isn't
 * meaningful for reaction-diffusion or fluid systems.
 */
function initializeSimulation(controller: SimulationController): void {
  const sim = controller.getSimulation();
  if (!sim) return;

  const presetName = sim.preset.meta.name;
  const dim = sim.preset.grid.dimensionality;
  const firstProp = sim.preset.cell_properties[0].name;
  const w = sim.preset.grid.width;
  const h = sim.preset.grid.height ?? 1;

  if (presetName === 'Gray-Scott') {
    // Reaction-diffusion: u=1.0 everywhere, v=0.25 in a small center square
    const uBuf = sim.grid.getCurrentBuffer('u');
    const vBuf = sim.grid.getCurrentBuffer('v');
    uBuf.fill(1.0);
    vBuf.fill(0.0);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const r = Math.max(4, Math.floor(w / 16));
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x >= 0 && x < w && y >= 0 && y < h) {
          const idx = y * w + x;
          uBuf[idx] = 0.5 + (Math.random() - 0.5) * 0.1;
          vBuf[idx] = 0.25 + (Math.random() - 0.5) * 0.1;
        }
      }
    }
    return;
  }

  if (presetName === 'Navier-Stokes') {
    // Fluid dynamics: density blob in center with initial velocity
    const densityBuf = sim.grid.getCurrentBuffer('density');
    densityBuf.fill(0.0);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const r = Math.max(3, Math.floor(w / 8));
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x >= 0 && x < w && y >= 0 && y < h) {
          const idx = y * w + x;
          densityBuf[idx] = 1.0;
        }
      }
    }
    // Small initial velocity perturbation
    try {
      const vxBuf = sim.grid.getCurrentBuffer('vx');
      const vyBuf = sim.grid.getCurrentBuffer('vy');
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x >= 0 && x < w && y >= 0 && y < h) {
            const idx = y * w + x;
            vxBuf[idx] = (Math.random() - 0.5) * 0.1;
            vyBuf[idx] = (Math.random() - 0.5) * 0.1;
          }
        }
      }
    } catch { /* velocity properties may not exist */ }
    return;
  }

  if (presetName === "Langton's Ant") {
    // Place ant at center with direction=0
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const centerIdx = cy * w + cx;
    sim.setCellDirect('ant', centerIdx, 1);
    sim.setCellDirect('ant_dir', centerIdx, 0);
    return;
  }

  // Default initialization based on dimensionality
  if (dim === '1d') {
    const centerX = Math.floor(w / 2);
    sim.setCellDirect(firstProp, centerX, 1);
  } else if (dim === '2d') {
    for (let i = 0; i < sim.grid.cellCount; i++) {
      if (Math.random() < 0.2) {
        sim.setCellDirect(firstProp, i, 1);
      }
    }
  } else if (dim === '3d') {
    for (let i = 0; i < sim.grid.cellCount; i++) {
      if (Math.random() < 0.1) {
        sim.setCellDirect(firstProp, i, 1);
      }
    }
  }
}

export function AppShell() {
  const initializedRef = useRef(false);
  const viewportCount = useLayoutStore((s) => s.viewportCount);
  const fullscreenViewportId = useLayoutStore((s) => s.fullscreenViewportId);
  const isTerminalOpen = useLayoutStore((s) => s.isTerminalOpen);
  const terminalMode = useLayoutStore((s) => s.terminalMode);
  const isLeftDrawerOpen = useLayoutStore((s) => s.isLeftDrawerOpen);
  const leftDrawerMode = useLayoutStore((s) => s.leftDrawerMode);
  const leftDrawerWidth = useLayoutStore((s) => s.leftDrawerWidth);
  const isParamPanelOpen = useLayoutStore((s) => s.isParamPanelOpen);
  const paramPanelMode = useLayoutStore((s) => s.paramPanelMode);

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

    // Re-initialize grid data on every preset load, then capture for seek/reset
    // and aggressively start caching ahead
    const onPresetLoaded = () => {
      initializeSimulation(controller);
      const { timelineDuration } = useUiStore.getState();
      controller.captureInitialState(timelineDuration);
    };
    eventBus.on('sim:presetLoaded', onPresetLoaded);

    // Load default preset (Conway's GoL) using client-safe loader
    const config = loadBuiltinPresetClient('conways-gol');
    controller.loadPresetConfig(config);
    initializeSimulation(controller);
    const { timelineDuration } = useUiStore.getState();
    controller.captureInitialState(timelineDuration);

    return () => {
      eventBus.off('sim:presetLoaded', onPresetLoaded);
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
  const leftDocked = leftDrawerMode === 'docked' && isLeftDrawerOpen && !isAnyFullscreen;
  const paramDocked = paramPanelMode === 'docked' && isParamPanelOpen && !isAnyFullscreen;
  const terminalFloating = terminalMode === 'floating';

  const toggleLeftDrawer = useCallback(() => {
    commandRegistry.execute('ui.toggleLeftDrawer', {});
  }, []);

  const toggleRightDrawer = useCallback(() => {
    commandRegistry.execute('ui.toggleParamPanel', {});
  }, []);

  const openLeftDocked = useCallback(() => {
    commandRegistry.execute('ui.toggleLeftDrawer', { docked: true });
  }, []);

  const openRightDocked = useCallback(() => {
    commandRegistry.execute('ui.toggleParamPanel', { docked: true });
  }, []);

  // Peeking grip dots — reusable for left/right edges when panels are closed
  const gripDots = (
    <div className="flex flex-col gap-[3px]">
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-[2px] h-1 rounded-full bg-zinc-700 group-hover:bg-zinc-500 transition-colors" />
      ))}
    </div>
  );

  return (
    <div className="w-screen h-screen bg-black overflow-hidden flex flex-row">
      {/* Left drawer — docked: full height, sits outside center column */}
      {leftDocked && (
        <DrawerShell
          position="left"
          size={leftDrawerWidth}
          collapsed={false}
          onResize={(size) => layoutStoreActions.setLeftDrawerWidth(size)}
          onClose={toggleLeftDrawer}
        >
          <CellPanel panelId="cell-panel" />
        </DrawerShell>
      )}

      {/* Center column: viewports + bottom tray */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Viewports */}
        <div className="flex flex-1 min-h-0 relative">
          {/* Primary viewport */}
          {(!isAnyFullscreen || fullscreenViewportId === 'viewport-1') && (
            <div
              className={`${viewportCount === 2 && !isAnyFullscreen ? 'w-1/2 border-r border-zinc-700' : 'w-full'} h-full`}
            >
              <SimulationViewport viewportId="viewport-1" />
            </div>
          )}

          {/* Secondary viewport */}
          {(viewportCount === 2 || fullscreenViewportId === 'viewport-2') &&
            (!isAnyFullscreen || fullscreenViewportId === 'viewport-2') && (
              <div
                className={`${viewportCount === 2 && !isAnyFullscreen ? 'w-1/2' : 'w-full'} h-full`}
              >
                <SimulationViewport viewportId="viewport-2" />
              </div>
            )}

          {/* Peeking grips — at screen edges when side panels are closed */}
          {!isAnyFullscreen && !isLeftDrawerOpen && (
            <button
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 group cursor-pointer pl-[2px] pr-[4px] py-4 rounded-r-sm bg-zinc-800/30 hover:bg-zinc-700/50 transition-colors"
              onClick={openLeftDocked}
              title="Cells (1)"
            >
              {gripDots}
            </button>
          )}
          {!isAnyFullscreen && !isParamPanelOpen && (
            <button
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 group cursor-pointer pr-[2px] pl-[4px] py-4 rounded-l-sm bg-zinc-800/30 hover:bg-zinc-700/50 transition-colors"
              onClick={openRightDocked}
              title="Parameters (2)"
            >
              {gripDots}
            </button>
          )}

          {/* Floating side panels — inside viewport container so they don't cover bottom tray */}
          {!leftDocked && isLeftDrawerOpen && !isAnyFullscreen && (
            <div
              className="absolute top-0 left-0 bottom-0 z-15 transition-transform duration-200 ease-out pointer-events-auto"
              style={{ width: leftDrawerWidth }}
            >
              <div className="absolute inset-0 overflow-hidden">
                <CellPanel panelId="cell-panel" />
              </div>
              <div className="absolute right-1 top-0 bottom-0 z-10 flex">
                <ResizeHandle direction="horizontal" onResize={(delta) => layoutStoreActions.setLeftDrawerWidth(leftDrawerWidth + delta)} onDoubleClick={toggleLeftDrawer} />
              </div>
            </div>
          )}
          {!paramDocked && isParamPanelOpen && !isAnyFullscreen && <ParamPanel />}
        </div>

        {/* Bottom tray: timeline + controls + terminal */}
        {!isAnyFullscreen && terminalMode === 'docked' && <BottomTray />}
      </div>

      {/* Right drawer — docked: full height */}
      {paramDocked && <ParamPanel docked />}

      {/* HUD overlay — pointer-events: none status display */}
      {!isAnyFullscreen && (
        <div className="absolute inset-0 z-10 pointer-events-none">
          <HUD />
          {/* Floating terminal */}
          {terminalFloating && <Terminal />}
        </div>
      )}

      {/* Hotkey help overlay -- always rendered (visibility controlled internally) */}
      <HotkeyHelp />
    </div>
  );
}
