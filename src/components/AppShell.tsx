/**
 * AppShell: top-level layout with numbered drawers.
 *
 * Drawer layout:
 *   ` = Terminal (bottom tray)
 *   1 = Object Manager + Inspector (left, vertically split)
 *   2 = Card View (left, filtered node cards)
 *   3 = Tags + Globals card view (right)
 *   4 = Metrics/Charts (far right)
 *
 * On mount: creates EventBus, SimulationController, registers all commands,
 * wires stores, loads default preset, builds scene tree, attaches hotkeys.
 */

'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { eventBus } from '@/engine/core/EventBus';
import { SimulationController } from '@/commands/SimulationController';
import { commandRegistry } from '@/commands/CommandRegistry';
import { registerAllCommands } from '@/commands/definitions';
import { wireStores } from '@/commands/wireStores';
import { GPUContext } from '@/engine/gpu/GPUContext';
import { loadBuiltinPresetClient } from '@/engine/preset/builtinPresetsClient';
import { KeyboardShortcutManager } from '@/commands/KeyboardShortcutManager';
import { SimulationViewport } from '@/components/viewport/SimulationViewport';
import { LayoutRenderer } from '@/components/layout/LayoutRenderer';
import { HotkeyHelp } from '@/components/hud/HotkeyHelp';
import { BottomTray } from '@/components/layout/BottomTray';
import { Terminal } from '@/components/terminal/Terminal';
import { useUiStore } from '@/store/uiStore';
import { useLayoutStore, layoutStoreActions } from '@/store/layoutStore';
import { DrawerShell } from '@/components/layout/DrawerShell';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
// ScriptPanel replaced by CardViewPanel with defaultFilters={['tags', 'globals']}
import { ObjectManagerPanel } from '@/components/panels/ObjectManagerPanel';
import { InspectorPanel } from '@/components/panels/InspectorPanel';
import { CardViewPanel } from '@/components/panels/CardViewPanel';
import { MetricsPanel } from '@/components/panels/MetricsPanel';
import { useSceneStore } from '@/store/sceneStore';
import { registerPanels } from '@/layout/registerPanels';
import { logMin, logDbg } from '@/lib/debugLog';

// Register all panel types so PanelHost can resolve them
registerPanels();

/** Module-level singleton for the simulation controller */
let controllerSingleton: SimulationController | null = null;
let unwireFn: (() => void) | null = null;
let shortcutManager: KeyboardShortcutManager | null = null;

export function getController(): SimulationController | null {
  return controllerSingleton;
}

/**
 * Initialize simulation with appropriate starting state per preset.
 */
function initializeSimulation(controller: SimulationController): void {
  const sim = controller.getSimulation();
  if (!sim) return;
  logMin('ctrl', `initializeSimulation("${sim.preset.meta.name}") — tags=${sim.tagRegistry.getAll().length}, needsAsync=${sim.needsAsyncTick()}`);

  const presetName = sim.preset.meta.name;
  const dim = sim.preset.grid.dimensionality;
  const firstProp = sim.preset.cell_properties[0].name;
  const w = sim.preset.grid.width;
  const h = sim.preset.grid.height ?? 1;

  if (presetName === 'Gray-Scott') {
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
    const densityBuf = sim.grid.getCurrentBuffer('density');
    densityBuf.fill(0.0);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const r = Math.max(3, Math.floor(w / 8));
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x >= 0 && x < w && y >= 0 && y < h) {
          densityBuf[y * w + x] = 1.0;
        }
      }
    }
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
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    sim.setCellDirect('ant', cy * w + cx, 1);
    sim.setCellDirect('ant_dir', cy * w + cx, 0);
    return;
  }

  if (dim === '1d') {
    sim.setCellDirect(firstProp, Math.floor(w / 2), 1);
  } else if (dim === '2d') {
    for (let i = 0; i < sim.grid.cellCount; i++) {
      if (Math.random() < 0.2) sim.setCellDirect(firstProp, i, 1);
    }
  } else if (dim === '3d') {
    for (let i = 0; i < sim.grid.cellCount; i++) {
      if (Math.random() < 0.1) sim.setCellDirect(firstProp, i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Drawer 1: Object Manager (top) + Inspector (bottom), vertically split
// ---------------------------------------------------------------------------

function Drawer1Content() {
  const splitRatio = useLayoutStore((s) => s.drawer1SplitRatio);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSplitDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);

    const container = containerRef.current;
    if (!container) return;

    const onMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const ratio = (ev.clientY - rect.top) / rect.height;
      layoutStoreActions.setDrawer1SplitRatio(ratio);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* Object Manager (top) */}
      <div className="overflow-hidden" style={{ height: `${splitRatio * 100}%` }}>
        <ObjectManagerPanel panelId="object-manager" />
      </div>

      {/* Resize handle */}
      <div
        className={`h-[3px] shrink-0 cursor-row-resize hover:bg-green-500/30 transition-colors ${dragging ? 'bg-green-500/40' : 'bg-zinc-700/50'}`}
        onMouseDown={handleSplitDrag}
      />

      {/* Inspector (bottom) */}
      <div className="flex-1 overflow-hidden">
        <div className="flex flex-col h-full bg-zinc-900 text-zinc-300 overflow-hidden border-t border-zinc-700/30">
          <div className="flex items-center px-3 py-1 border-b border-zinc-700/50 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 font-mono">
              Inspector
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <InspectorPanel panelId="inspector" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------

export function AppShell() {
  const initializedRef = useRef(false);
  const viewportCount = useLayoutStore((s) => s.viewportCount);
  const fullscreenViewportId = useLayoutStore((s) => s.fullscreenViewportId);
  const centerLayout = useLayoutStore((s) => s.zones.center);
  const isTerminalOpen = useLayoutStore((s) => s.isTerminalOpen);
  const terminalMode = useLayoutStore((s) => s.terminalMode);

  // Drawer state
  const d1Open = useLayoutStore((s) => s.isDrawer1Open);
  const d1Mode = useLayoutStore((s) => s.drawer1Mode);
  const d1Width = useLayoutStore((s) => s.drawer1Width);
  const d2Open = useLayoutStore((s) => s.isDrawer2Open);
  const d2Mode = useLayoutStore((s) => s.drawer2Mode);
  const d2Width = useLayoutStore((s) => s.drawer2Width);
  const d3Open = useLayoutStore((s) => s.isDrawer3Open);
  const d3Mode = useLayoutStore((s) => s.drawer3Mode);
  const d3Width = useLayoutStore((s) => s.drawer3Width);
  const d4Open = useLayoutStore((s) => s.isDrawer4Open);
  const d4Mode = useLayoutStore((s) => s.drawer4Mode);
  const d4Width = useLayoutStore((s) => s.drawer4Width);

  // Initialize command infrastructure once
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const controller = new SimulationController(eventBus, 100);
    controllerSingleton = controller;

    commandRegistry.clear();
    registerAllCommands(commandRegistry, controller, eventBus);

    unwireFn = wireStores(eventBus);

    // Attempt GPU initialization (non-blocking — app works without it)
    GPUContext.initialize().catch(() => {
      // Silently degrade — CPU paths still work. Error already emitted via EventBus.
    });

    shortcutManager = new KeyboardShortcutManager(commandRegistry);
    shortcutManager.attach(window);

    const onPresetLoaded = () => {
      logMin('ctrl', `onPresetLoaded event fired — calling initializeSimulation + captureInitialState`);
      initializeSimulation(controller);
      const { timelineDuration } = useUiStore.getState();
      logMin('ctrl', `captureInitialState(${timelineDuration}) — controller.needsAsync=${controller.needsAsyncTick()}`);
      controller.captureInitialState(timelineDuration);
      commandRegistry.execute('scene.buildTree', {}).then(() => {
        // Sync initial state after tree is built (scene store now has sim-root)
        controller.syncInitialStateToScene();
        const { rootIds } = useSceneStore.getState();
        if (rootIds.length > 0) {
          commandRegistry.execute('scene.select', { id: rootIds[0] });
        }
      });
    };
    eventBus.on('sim:presetLoaded', onPresetLoaded);

    logMin('ctrl', 'AppShell boot — loading default preset conways-gol');
    const config = loadBuiltinPresetClient('conways-gol');
    controller.loadPresetConfig(config);
    initializeSimulation(controller);
    const { timelineDuration } = useUiStore.getState();
    logMin('ctrl', `AppShell boot — captureInitialState(${timelineDuration})`);
    controller.captureInitialState(timelineDuration);

    commandRegistry.execute('scene.buildTree', {}).then(() => {
      // Sync initial state after tree is built (scene store now has sim-root)
      controller.syncInitialStateToScene();
      const { rootIds } = useSceneStore.getState();
      if (rootIds.length > 0) {
        commandRegistry.execute('scene.select', { id: rootIds[0] });
      }
    });

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

  // Docked state per drawer
  const d1Docked = d1Mode === 'docked' && d1Open && !isAnyFullscreen;
  const d2Docked = d2Mode === 'docked' && d2Open && !isAnyFullscreen;
  const d3Docked = d3Mode === 'docked' && d3Open && !isAnyFullscreen;
  const d4Docked = d4Mode === 'docked' && d4Open && !isAnyFullscreen;
  const terminalFloating = terminalMode === 'floating';

  const toggleD1 = useCallback(() => layoutStoreActions.toggleDrawer1(), []);
  const toggleD2 = useCallback(() => layoutStoreActions.toggleDrawer2(), []);

  const openD1Docked = useCallback(() => layoutStoreActions.toggleDrawer1({ docked: true }), []);
  const openD3Docked = useCallback(() => layoutStoreActions.toggleDrawer3({ docked: true }), []);

  const gripDots = (
    <div className="flex flex-col gap-[3px]">
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-[2px] h-1 rounded-full bg-zinc-700 group-hover:bg-zinc-500 transition-colors" />
      ))}
    </div>
  );

  // Check if any right-side drawer is open for right grip
  const anyRightOpen = d3Open || d4Open;

  return (
    <div className="w-screen h-screen bg-black overflow-hidden flex flex-row">
      {/* === LEFT DOCKED DRAWERS === */}

      {/* Drawer 1 — Object Manager + Inspector (docked) */}
      {d1Docked && (
        <DrawerShell
          position="left"
          size={d1Width}
          collapsed={false}
          onResize={(size) => layoutStoreActions.setDrawer1Width(size)}
          onClose={toggleD1}
        >
          <Drawer1Content />
        </DrawerShell>
      )}

      {/* Drawer 2 — Card View (docked) */}
      {d2Docked && (
        <DrawerShell
          position="left"
          size={d2Width}
          collapsed={false}
          onResize={(size) => layoutStoreActions.setDrawer2Width(size)}
          onClose={toggleD2}
        >
          <CardViewPanel defaultFilters={['cells']} />
        </DrawerShell>
      )}

      {/* === CENTER COLUMN === */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <div className="flex flex-1 min-h-0 relative">
          {/* Center zone: fullscreen bypass or LayoutRenderer tree */}
          {isAnyFullscreen ? (
            <div className="w-full h-full">
              <SimulationViewport viewportId={fullscreenViewportId!} />
            </div>
          ) : (
            <LayoutRenderer
              node={centerLayout}
              onLayoutChange={(node) => layoutStoreActions.setZoneLayout('center', node)}
            />
          )}

          {/* Peeking grips — edges when drawers closed */}
          {!isAnyFullscreen && !d1Open && !d2Open && (
            <button
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 group cursor-pointer pl-[2px] pr-[4px] py-4 rounded-r-sm bg-zinc-800/30 hover:bg-zinc-700/50 transition-colors"
              onClick={openD1Docked}
              title="Drawer 1 (Objects + Inspector)"
            >
              {gripDots}
            </button>
          )}
          {!isAnyFullscreen && !anyRightOpen && (
            <button
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 group cursor-pointer pr-[2px] pl-[4px] py-4 rounded-l-sm bg-zinc-800/30 hover:bg-zinc-700/50 transition-colors"
              onClick={openD3Docked}
              title="Drawer 3 (Tags + Globals)"
            >
              {gripDots}
            </button>
          )}

          {/* Floating drawers (left side) */}
          {!d1Docked && d1Open && !isAnyFullscreen && (
            <div
              className="absolute top-0 left-0 bottom-0 z-15 pointer-events-auto"
              style={{ width: d1Width }}
            >
              <div className="absolute inset-0 overflow-hidden bg-zinc-900/95 backdrop-blur-sm border-r border-zinc-700">
                <Drawer1Content />
              </div>
              <div className="absolute right-1 top-0 bottom-0 z-10 flex">
                <ResizeHandle direction="horizontal" onResize={(delta) => layoutStoreActions.setDrawer1Width(d1Width + delta)} onDoubleClick={toggleD1} />
              </div>
            </div>
          )}
          {!d2Docked && d2Open && !isAnyFullscreen && (
            <div
              className="absolute top-0 bottom-0 z-14 pointer-events-auto"
              style={{ width: d2Width, left: d1Open ? d1Width : 0 }}
            >
              <div className="absolute inset-0 overflow-hidden bg-zinc-900/95 backdrop-blur-sm border-r border-zinc-700">
                <CardViewPanel defaultFilters={['cells']} />
              </div>
            </div>
          )}

          {/* Floating drawers (right side) */}
          {!d3Docked && d3Open && !isAnyFullscreen && (
            <div
              className="absolute top-0 bottom-0 z-15 pointer-events-auto"
              style={{ width: d3Width, right: d4Open ? d4Width : 0 }}
            >
              <div className="absolute inset-0 overflow-hidden bg-zinc-900/95 backdrop-blur-sm border-l border-zinc-700">
                <CardViewPanel defaultFilters={['tags', 'globals']} />
              </div>
            </div>
          )}
          {!d4Docked && d4Open && !isAnyFullscreen && (
            <div
              className="absolute top-0 right-0 bottom-0 z-15 pointer-events-auto"
              style={{ width: d4Width }}
            >
              <div className="absolute inset-0 overflow-hidden bg-zinc-900/95 backdrop-blur-sm border-l border-zinc-700">
                <MetricsPanel />
              </div>
            </div>
          )}
        </div>

        {/* Bottom tray: timeline + controls + terminal */}
        {!isAnyFullscreen && terminalMode === 'docked' && <BottomTray />}
      </div>

      {/* === RIGHT DOCKED DRAWERS === */}

      {/* Drawer 3 — Tags + Globals (docked) */}
      {d3Docked && (
        <DrawerShell
          position="right"
          size={d3Width}
          collapsed={false}
          onResize={(size) => layoutStoreActions.setDrawer3Width(size)}
          onClose={() => layoutStoreActions.toggleDrawer3()}
        >
          <CardViewPanel defaultFilters={['tags', 'globals']} />
        </DrawerShell>
      )}

      {/* Drawer 4 — Metrics (docked) */}
      {d4Docked && (
        <div className="relative shrink-0 h-full" style={{ width: d4Width }}>
          <div className="absolute inset-0 overflow-hidden bg-zinc-900 border-l border-zinc-700">
            <MetricsPanel />
          </div>
          <div className="absolute left-1 top-0 bottom-0 z-10 flex">
            <ResizeHandle
              direction="horizontal"
              onResize={(delta) => layoutStoreActions.setDrawer4Width(d4Width - delta)}
              onDoubleClick={() => layoutStoreActions.toggleDrawer4()}
            />
          </div>
        </div>
      )}

      {/* Floating overlays (terminal only — HUD is now inside SimulationViewport) */}
      {!isAnyFullscreen && terminalFloating && (
        <div className="absolute inset-0 z-10 pointer-events-none">
          <Terminal />
        </div>
      )}

      <HotkeyHelp />
    </div>
  );
}
