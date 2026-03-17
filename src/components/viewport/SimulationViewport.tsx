/**
 * SimulationViewport: React component wrapping the Three.js LatticeRenderer lifecycle.
 *
 * Manages the full rendering lifecycle: create -> animate -> dispose.
 * Uses the shared SimulationController (via getController()) instead of a local Simulation.
 * Handles pan/zoom via mouse events and responsive sizing via ResizeObserver.
 * Supports cell drawing (left-click) and erasing (right-click).
 * Supports multi-viewport with independent cameras (RNDR-08).
 * Supports 3D orbit controls for 3D grids (RNDR-10).
 * Supports per-viewport fullscreen toggle (RNDR-09).
 * Explicitly disposes all GPU resources on unmount (RNDR-11).
 */

'use client';

import { useRef, useEffect, useCallback } from 'react';
import { LatticeRenderer } from '@/renderer/LatticeRenderer';
import { CameraController } from '@/renderer/CameraController';
import { OrbitCameraController } from '@/renderer/OrbitCameraController';
import { getController } from '@/components/AppShell';
import { eventBus } from '@/engine/core/EventBus';
import { commandRegistry } from '@/commands/CommandRegistry';
import { useLayoutStore, layoutStoreActions } from '@/store/layoutStore';
import { useUiStore } from '@/store/uiStore';
import { useSimStore } from '@/store/simStore';
import { HUD } from '@/components/hud/HUD';

/** Props for multi-viewport support */
interface SimulationViewportProps {
  /** Unique viewport identifier */
  viewportId?: string;
}

/**
 * Sync camera controller state to renderer camera.
 */
function syncCamera(renderer: LatticeRenderer, controller: CameraController): void {
  const cam = renderer.camera;
  const ctrl = controller.camera;
  cam.left = ctrl.left;
  cam.right = ctrl.right;
  cam.top = ctrl.top;
  cam.bottom = ctrl.bottom;
  cam.position.copy(ctrl.position);
  cam.updateProjectionMatrix();
}

export function SimulationViewport({ viewportId = 'viewport-1' }: SimulationViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<LatticeRenderer | null>(null);
  const cameraRef = useRef<CameraController | null>(null);
  const orbitCameraRef = useRef<OrbitCameraController | null>(null);
  const rafRef = useRef<number>(0);
  const fullscreenViewportId = useLayoutStore((s) => s.fullscreenViewportId);
  const isFullscreen = fullscreenViewportId === viewportId;
  const activePreset = useSimStore((s) => s.activePreset);
  const viewportCount = useLayoutStore((s) => s.viewportCount);

  const handleFullscreenToggle = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (isFullscreen) {
      // Exit fullscreen
      layoutStoreActions.setFullscreenViewport(null);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } else {
      // Enter fullscreen
      layoutStoreActions.setFullscreenViewport(viewportId);
      container.requestFullscreen().catch(() => {
        // Fullscreen not supported, just toggle the state
      });
    }
  }, [isFullscreen, viewportId]);

  useEffect(() => {
    // Listen for Escape key to exit fullscreen
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && fullscreenViewportId === viewportId) {
        layoutStoreActions.setFullscreenViewport(null);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [fullscreenViewportId, viewportId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const simController = getController();
    if (!simController) return;

    const sim = simController.getSimulation();
    if (!sim) return;

    // Create canvas — absolute positioning ensures it fills the container
    // and participates in normal CSS stacking (prevents WebGL compositing issues)
    const canvas = document.createElement('canvas');
    canvas.setAttribute('data-testid', 'viewport-canvas');
    canvas.style.display = 'block';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '0';
    container.appendChild(canvas);
    const rect = container.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 600;

    // Create renderer
    let latticeRenderer: LatticeRenderer;
    try {
      latticeRenderer = new LatticeRenderer({
        canvas,
        width,
        height,
        antialias: true,
        backgroundColor: 0x000000,
      });
    } catch {
      console.warn('WebGL not available -- rendering disabled');
      return () => {
        if (container.contains(canvas)) {
          container.removeChild(canvas);
        }
      };
    }
    rendererRef.current = latticeRenderer;

    // Connect simulation grid to renderer
    latticeRenderer.setSimulation(sim.grid, sim.preset);

    // Determine if 3D mode
    const is3D = sim.preset.grid.dimensionality === '3d';

    // Create appropriate camera controller
    let cameraController: CameraController | null = null;
    let orbitController: OrbitCameraController | null = null;

    if (is3D) {
      orbitController = new OrbitCameraController(width, height);
      orbitCameraRef.current = orbitController;
      const gridW = sim.preset.grid.width;
      const gridH = sim.preset.grid.height ?? 1;
      const gridD = sim.preset.grid.depth ?? 1;
      orbitController.fitToGrid(gridW, gridH, gridD);
    } else {
      cameraController = new CameraController(width, height);
      cameraRef.current = cameraController;

      // Zoom to fit on load
      const gridW = sim.preset.grid.width;
      const gridH = sim.preset.grid.height ?? 1;
      const fitH = sim.preset.grid.dimensionality === '1d' ? latticeRenderer.getMaxHistory() : gridH;
      cameraController.zoomToFit(gridW, fitH);
      syncCamera(latticeRenderer, cameraController);
    }

    // ResizeObserver for responsive sizing
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          latticeRenderer.resize(w, h);
          if (cameraController) {
            cameraController.resize(w, h);
            syncCamera(latticeRenderer, cameraController);
          }
          if (orbitController) {
            orbitController.resize(w, h);
          }
        }
      }
    });
    resizeObserver.observe(container);

    // Mouse event handlers for pan/zoom/orbit
    let isDragging = false;
    let isDrawing = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    /**
     * Convert screen coordinates to grid coordinates.
     */
    function screenToGrid(screenX: number, screenY: number): [number, number] | null {
      if (is3D) return null; // No grid clicking in 3D mode
      const ctrl = getController();
      if (!ctrl || !cameraController) return null;

      const canvasRect = canvas.getBoundingClientRect();
      const x = screenX - canvasRect.left;
      const y = screenY - canvasRect.top;

      const ndcX = (x / canvasRect.width) * 2 - 1;
      const ndcY = -(y / canvasRect.height) * 2 + 1;

      const cam = cameraController.camera;
      const worldX = cam.position.x + ndcX * (cam.right - cam.left) / 2;
      const worldY = cam.position.y + ndcY * (cam.top - cam.bottom) / 2;

      const gridX = Math.round(worldX);
      const gridY = Math.round(worldY);

      const currentSim = ctrl.getSimulation();
      if (!currentSim) return null;
      if (gridX < 0 || gridX >= currentSim.grid.config.width) return null;
      if (gridY < 0 || gridY >= currentSim.grid.config.height) return null;

      return [gridX, gridY];
    }

    const onMouseDown = (e: MouseEvent) => {
      if (is3D) {
        // 3D: left-drag to orbit, shift+left or middle to pan
        if (e.button === 0 && !e.shiftKey) {
          isDragging = true;
          lastMouseX = e.clientX;
          lastMouseY = e.clientY;
        } else if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
          isDragging = true;
          lastMouseX = e.clientX;
          lastMouseY = e.clientY;
        }
      } else {
        // 2D: existing behavior
        if (e.button === 0 && !e.shiftKey) {
          const coords = screenToGrid(e.clientX, e.clientY);
          if (coords) {
            isDrawing = true;
            commandRegistry.execute('edit.draw', { x: coords[0], y: coords[1] });
          }
        } else if (e.button === 2) {
          const coords = screenToGrid(e.clientX, e.clientY);
          if (coords) {
            isDrawing = true;
            commandRegistry.execute('edit.erase', { x: coords[0], y: coords[1] });
          }
        } else if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
          isDragging = true;
          lastMouseX = e.clientX;
          lastMouseY = e.clientY;
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;

        if (is3D && orbitController) {
          if (e.shiftKey || e.buttons === 4) {
            // Pan in 3D
            orbitController.pan(dx, dy);
          } else {
            // Orbit in 3D
            orbitController.orbit(dx, dy);
          }
        } else if (cameraController) {
          cameraController.pan(-dx, dy);
          syncCamera(latticeRenderer, cameraController);
        }

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      } else if (isDrawing && e.buttons === 1) {
        const coords = screenToGrid(e.clientX, e.clientY);
        if (coords) {
          commandRegistry.execute('edit.draw', { x: coords[0], y: coords[1] });
        }
      } else if (isDrawing && e.buttons === 2) {
        const coords = screenToGrid(e.clientX, e.clientY);
        if (coords) {
          commandRegistry.execute('edit.erase', { x: coords[0], y: coords[1] });
        }
      }
    };

    const onMouseUp = () => {
      isDragging = false;
      isDrawing = false;
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (is3D && orbitController) {
        const delta = -e.deltaY * 0.01;
        orbitController.zoom(delta);
      } else if (cameraController) {
        const canvasRect = canvas.getBoundingClientRect();
        const screenX = e.clientX - canvasRect.left;
        const screenY = e.clientY - canvasRect.top;
        const delta = -e.deltaY * CameraController.ZOOM_SPEED * 0.01;
        cameraController.zoomAt(delta, screenX, screenY);
        syncCamera(latticeRenderer, cameraController);
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    // Subscribe to preset loaded events to reinitialize renderer
    const onPresetLoaded = () => {
      const newSim = simController.getSimulation();
      if (newSim && latticeRenderer) {
        latticeRenderer.setSimulation(newSim.grid, newSim.preset);
        const newIs3D = newSim.preset.grid.dimensionality === '3d';

        if (newIs3D) {
          // Switch to orbit controller if needed
          if (!orbitController) {
            const r = container.getBoundingClientRect();
            orbitController = new OrbitCameraController(r.width || 800, r.height || 600);
            orbitCameraRef.current = orbitController;
          }
          const w = newSim.preset.grid.width;
          const h = newSim.preset.grid.height ?? 1;
          const d = newSim.preset.grid.depth ?? 1;
          orbitController.fitToGrid(w, h, d);
          cameraController = null;
          cameraRef.current = null;
        } else {
          // Switch to orthographic controller
          if (!cameraController) {
            const r = container.getBoundingClientRect();
            cameraController = new CameraController(r.width || 800, r.height || 600);
            cameraRef.current = cameraController;
          }
          const w = newSim.preset.grid.width;
          const h = newSim.preset.grid.height ?? 1;
          const fh = newSim.preset.grid.dimensionality === '1d' ? latticeRenderer.getMaxHistory() : h;
          cameraController.zoomToFit(w, fh);
          syncCamera(latticeRenderer, cameraController);
          orbitController = null;
          orbitCameraRef.current = null;
        }
      }
    };
    eventBus.on('sim:presetLoaded', onPresetLoaded);

    // Subscribe to view:change events so CLI commands (view.zoom, view.pan, view.fit) move the camera
    const onViewChange = (payload: { zoom?: number; cameraX?: number; cameraY?: number }) => {
      if (!cameraController || !latticeRenderer) return;

      const hasZoom = payload.zoom !== undefined;
      const hasPan = payload.cameraX !== undefined || payload.cameraY !== undefined;

      if (!hasZoom && !hasPan) {
        // view.fit — re-fit to grid
        const currentSim = simController.getSimulation();
        if (currentSim) {
          const gw = currentSim.preset.grid.width;
          const gh = currentSim.preset.grid.height ?? 1;
          const fh = currentSim.preset.grid.dimensionality === '1d' ? latticeRenderer.getMaxHistory() : gh;
          cameraController.zoomToFit(gw, fh);
        }
      } else {
        if (hasZoom) {
          cameraController.setZoom(payload.zoom!);
        }
        if (hasPan) {
          const state = cameraController.getState();
          cameraController.setState({
            x: payload.cameraX ?? state.x,
            y: payload.cameraY ?? state.y,
            zoom: cameraController.getZoom(),
          });
        }
      }
      syncCamera(latticeRenderer, cameraController);
    };
    eventBus.on('view:change', onViewChange);

    // Wire grid lines toggle from uiStore
    const unsubGridLines = useUiStore.subscribe(
      (s) => s.gridLinesVisible,
      (visible) => { latticeRenderer.setGridLines(visible); },
    );
    // Initialize grid lines state
    latticeRenderer.setGridLines(useUiStore.getState().gridLinesVisible);

    // Animation loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      latticeRenderer.update();
      if (orbitController) {
        latticeRenderer.renderWithCamera(orbitController.camera);
      } else {
        latticeRenderer.render();
      }
    };
    rafRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      resizeObserver.disconnect();
      eventBus.off('sim:presetLoaded', onPresetLoaded);
      eventBus.off('view:change', onViewChange);
      unsubGridLines();

      latticeRenderer.dispose();
      rendererRef.current = null;
      cameraRef.current = null;
      orbitCameraRef.current = null;

      if (container.contains(canvas)) {
        container.removeChild(canvas);
      }
    };
  }, [activePreset]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full cursor-crosshair"
      style={{ minHeight: '200px' }}
      data-testid={`simulation-viewport-${viewportId}`}
    >
      {/* Viewport label — only shown in split view */}
      {viewportCount > 1 && (
        <div className="absolute top-2 left-2 z-10 text-xs font-mono text-zinc-500 pointer-events-none select-none">
          {viewportId.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </div>
      )}

      {/* HUD — scoped to this viewport */}
      <HUD />

      {/* Fullscreen toggle */}
      <button
        onClick={handleFullscreenToggle}
        className="absolute top-2 right-2 z-10 text-zinc-400 hover:text-white p-1 rounded bg-zinc-800/50 hover:bg-zinc-700/80 transition-colors"
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        data-testid={`btn-fullscreen-${viewportId}`}
      >
        {isFullscreen ? '\u2716' : '\u26F6'}
      </button>
    </div>
  );
}
