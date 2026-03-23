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
import { GPUGridRenderer, parseVisualMappingColors, type GPUCameraState, type ColorMappingConfig } from '@/renderer/GPUGridRenderer';
import { getController } from '@/components/AppShell';
import { eventBus } from '@/engine/core/EventBus';
import { commandRegistry } from '@/commands/CommandRegistry';
import { useLayoutStore, layoutStoreActions } from '@/store/layoutStore';
import { useUiStore } from '@/store/uiStore';
import { useSimStore } from '@/store/simStore';
import { HUD } from '@/components/hud/HUD';
import { GPUContext } from '@/engine/gpu/GPUContext';
import { logGPU } from '@/lib/debugLog';

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

    // If GPU rendering is likely (built-in IR exists), hide InstancedMesh immediately
    // to prevent the old grid flashing before the GPU renderer takes over
    if (!is3D && GPUContext.isAvailable() && (sim.preset.rule.compute || sim.preset.rule.stages)) {
      latticeRenderer.setGPURenderingActive(true);
    }

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
          if (gpuGridRenderer && gpuCanvas) {
            gpuGridRenderer.resize(w, h);
          }
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

        // Tear down old GPU renderer — dimensions/buffers changed.
        // It will be rebuilt when gpu:ruleRunnerReady fires.
        if (gpuGridRenderer) {
          gpuGridRenderer.destroy();
          gpuGridRenderer = null;
        }
        if (gpuCanvas && container?.contains(gpuCanvas)) {
          container.removeChild(gpuCanvas);
          gpuCanvas = null;
        }

        // Hide InstancedMesh if GPU is expected for this preset
        const is3DNew = newSim.preset.grid.dimensionality === '3d';
        if (!is3DNew && GPUContext.isAvailable() && (newSim.preset.rule.compute || newSim.preset.rule.stages)) {
          latticeRenderer.setGPURenderingActive(true);
        } else {
          latticeRenderer.setGPURenderingActive(false);
        }
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

    // Wire dead cell color from uiStore
    const unsubDeadColor = useUiStore.subscribe(
      (s) => s.deadCellColor,
      (color) => { latticeRenderer.setDeadCellColor(color); },
    );
    latticeRenderer.setDeadCellColor(useUiStore.getState().deadCellColor);

    // GPU Grid Renderer setup (if WebGPU available and GPU rule runner active)
    let gpuGridRenderer: GPUGridRenderer | null = null;
    let gpuCanvas: HTMLCanvasElement | null = null;

    function trySetupGPURenderer() {
      // Always read the CURRENT simulation (not stale closure `sim`)
      const currentSim = simController?.getSimulation();
      if (!simController || !container || !currentSim) return;
      const gpuRunner = simController.getGPURuleRunner();
      if (!gpuRunner || is3D || !GPUContext.isAvailable() || !GPUContext.tryGet()) {
        logGPU(`Renderer setup skipped (runner=${!!gpuRunner}, is3D=${is3D}, webgpu=${GPUContext.isAvailable()})`);
        return;
      }
      logGPU('Setting up GPU grid renderer (dual-canvas)');

      // Create WebGPU canvas underneath the Three.js canvas
      gpuCanvas = document.createElement('canvas');
      gpuCanvas.style.display = 'block';
      gpuCanvas.style.position = 'absolute';
      gpuCanvas.style.top = '0';
      gpuCanvas.style.left = '0';
      gpuCanvas.style.zIndex = '0';
      gpuCanvas.width = width;
      gpuCanvas.height = height;
      container.insertBefore(gpuCanvas, canvas);

      // Make Three.js canvas transparent so GPU canvas shows through
      canvas.style.zIndex = '1';
      latticeRenderer.scene.background = null;

      try {
        latticeRenderer.setGPURenderingActive(true);
        gpuGridRenderer = new GPUGridRenderer(gpuCanvas);
        const layout = gpuRunner.getPropertyLayout();
        // Primary property = what the renderer displays. Use visual_mappings color
        // property as the single source of truth, falling back to first cell property.
        const visualColorProp = currentSim.preset.visual_mappings?.find(m => m.channel === 'color')?.property;
        const presetPrimaryName = visualColorProp
          ?? currentSim.preset.cell_properties?.[0]?.name;
        const primaryProp = (presetPrimaryName && layout.find(p => p.name === presetPrimaryName)) || layout[0];

        // Determine color mapping from visual_mappings — the single source of truth
        const colorR = layout.find(p => p.name === 'colorR');
        const colorG = layout.find(p => p.name === 'colorG');
        const colorB = layout.find(p => p.name === 'colorB');
        const alpha = layout.find(p => p.name === 'alpha');

        // Check if rule or expression tags write to colorR/G/B → direct mode
        const exprTags = currentSim.preset.expression_tags ?? [];
        const exprOutputs = exprTags.flatMap(t => t.outputs ?? []);
        const ruleBodies = currentSim.preset.rule.stages
          ? currentSim.preset.rule.stages.map(s => s.compute).join('\n')
          : (currentSim.preset.rule.compute ?? '');
        const writesColor = exprOutputs.some(o => o.includes('colorR') || o.includes('colorG') || o.includes('colorB'))
          || ruleBodies.includes('self.colorR') || ruleBodies.includes('self.colorG') || ruleBodies.includes('self.colorB');
        const writesAlpha = exprOutputs.some(o => o.includes('alpha'))
          || ruleBodies.includes('self.alpha');
        const useDirectColor = (writesColor || writesAlpha) && colorR && colorG && colorB;

        // Parse visual_mappings to determine rendering mode and colors
        const colorVm = currentSim.preset.visual_mappings?.find(m => m.channel === 'color');
        const parsed = parseVisualMappingColors(colorVm?.mapping as Record<string, unknown> | undefined);

        let colorMapping: ColorMappingConfig;
        const baseConfig = {
          primaryOffset: primaryProp?.offset ?? 0,
          gradientOffset: primaryProp?.offset ?? 0,
          colorROffset: colorR?.offset ?? 0,
          colorGOffset: colorG?.offset ?? 0,
          colorBOffset: colorB?.offset ?? 0,
          alphaOffset: alpha?.offset ?? 0,
          deadColor: parsed.deadColor,
          aliveColor: parsed.aliveColor,
        };

        // Ramp visual mapping pass writes colorR/G/B via compute → force direct mode
        const hasRampPass = gpuRunner.hasVisualMappingPass();

        if (hasRampPass || useDirectColor) {
          colorMapping = { mode: 'direct', ...baseConfig };
        } else if (parsed.mode === 'gradient') {
          colorMapping = { mode: 'gradient', ...baseConfig };
        } else {
          colorMapping = { mode: 'binary', ...baseConfig };
        }
        logGPU(`Color mode: ${colorMapping.mode} (exprTags=${exprTags.length}, writesColor=${writesColor}, writesAlpha=${writesAlpha}, preset=${currentSim.preset.meta.name})`);

        gpuGridRenderer.setSimulation(
          gpuRunner.getReadBuffer(),
          gpuRunner.getParamsBuffer(),
          layout,
          colorMapping,
        );
        logGPU(`Renderer ready (mode=${colorMapping.mode}, stride=${gpuRunner.getStride()}, ${gpuRunner.getWidth()}×${gpuRunner.getHeight()})`);
      } catch (err) {
        logGPU(`Renderer setup FAILED: ${err}`);
        gpuGridRenderer = null;
        if (gpuCanvas && container?.contains(gpuCanvas)) {
          container.removeChild(gpuCanvas);
          gpuCanvas = null;
        }
      }
    }

    // Try immediately (in case GPU runner is already ready from a previous load)
    trySetupGPURenderer();

    // Also listen for the event when GPU runner finishes async init
    const onGPURuleRunnerReady = () => {
      trySetupGPURenderer();
    };
    eventBus.on('gpu:ruleRunnerReady', onGPURuleRunnerReady);

    // FPS tracking
    let fpsFrameCount = 0;
    let fpsLastTime = performance.now();

    // Animation loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      // Measure actual FPS (update every 500ms)
      fpsFrameCount++;
      const now = performance.now();
      const elapsed = now - fpsLastTime;
      if (elapsed >= 500) {
        const fps = Math.round((fpsFrameCount / elapsed) * 1000);
        useSimStore.setState({ measuredFps: fps });
        fpsFrameCount = 0;
        fpsLastTime = now;
      }

      const gpuRunner = simController.getGPURuleRunner();
      if (gpuGridRenderer && gpuRunner && cameraController) {
        // GPU path: tick simulation at render rate when playing
        // (playback mode / timeline bounds handled by controller's playbackTick)


        // GPU rendering path: read directly from sim buffer
        gpuGridRenderer.updateReadBuffer(gpuRunner.getReadBuffer());
        const cam = cameraController.camera;
        const camState: GPUCameraState = {
          // Left edge in grid coords. Three.js centers cells at integers
          // (cell 0 at x=0, grid line at x=-0.5) while the GPU shader places
          // cell 0 at gridX [0,1). The +0.5 aligns the two coordinate systems.
          offsetX: cam.position.x + cam.left + 0.5,
          // Bottom edge in grid coords (pixelY is flipped in shader)
          offsetY: cam.position.y + cam.bottom + 0.5,
          // Pixels per world unit
          scale: (gpuCanvas?.width ?? width) / (cam.right - cam.left),
          canvasWidth: gpuCanvas?.width ?? width,
          canvasHeight: gpuCanvas?.height ?? height,
        };
        gpuGridRenderer.render(
          camState,
          gpuRunner.getWidth(),
          gpuRunner.getHeight(),
          gpuRunner.getStride(),
        );
      }

      // Three.js renders overlays (grid lines) or full CPU path
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
      eventBus.off('gpu:ruleRunnerReady', onGPURuleRunnerReady);
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
      unsubDeadColor();

      if (gpuGridRenderer) {
        gpuGridRenderer.destroy();
        gpuGridRenderer = null;
      }

      latticeRenderer.dispose();
      rendererRef.current = null;
      cameraRef.current = null;
      orbitCameraRef.current = null;

      if (gpuCanvas && container.contains(gpuCanvas)) {
        container.removeChild(gpuCanvas);
      }
      if (container.contains(canvas)) {
        container.removeChild(canvas);
      }
    };
  }, [activePreset]);

  const viewportBgColor = useUiStore((s) => s.viewportBgColor);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full cursor-crosshair overflow-hidden"
      style={{ backgroundColor: viewportBgColor }}
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
