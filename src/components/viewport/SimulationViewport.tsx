/**
 * SimulationViewport: React component wrapping the Three.js LatticeRenderer lifecycle.
 *
 * Manages the full rendering lifecycle: create -> animate -> dispose.
 * Uses the shared SimulationController (via getController()) instead of a local Simulation.
 * Handles pan/zoom via mouse events and responsive sizing via ResizeObserver.
 * Supports cell drawing (left-click) and erasing (right-click).
 * Explicitly disposes all GPU resources on unmount (RNDR-11).
 */

'use client';

import { useRef, useEffect } from 'react';
import { LatticeRenderer } from '@/renderer/LatticeRenderer';
import { CameraController } from '@/renderer/CameraController';
import { getController } from '@/components/AppShell';
import { eventBus } from '@/engine/core/EventBus';
import { commandRegistry } from '@/commands/CommandRegistry';
import { useUiStore } from '@/store/uiStore';

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

export function SimulationViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<LatticeRenderer | null>(null);
  const cameraRef = useRef<CameraController | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const simController = getController();
    if (!simController) return;

    const sim = simController.getSimulation();
    if (!sim) return;

    // Create canvas
    const canvas = document.createElement('canvas');
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

    // Create camera controller
    const cameraController = new CameraController(width, height);
    cameraRef.current = cameraController;

    // Connect simulation grid to renderer
    latticeRenderer.setSimulation(sim.grid, sim.preset);

    // Zoom to fit on load
    const gridW = sim.preset.grid.width;
    const gridH = sim.preset.grid.height ?? 1;
    const fitH = sim.preset.grid.dimensionality === '1d' ? latticeRenderer.getMaxHistory() : gridH;
    cameraController.zoomToFit(gridW, fitH);
    syncCamera(latticeRenderer, cameraController);

    // ResizeObserver for responsive sizing
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          latticeRenderer.resize(w, h);
          cameraController.resize(w, h);
          syncCamera(latticeRenderer, cameraController);
        }
      }
    });
    resizeObserver.observe(container);

    // Mouse event handlers for pan/zoom
    let isDragging = false;
    let isDrawing = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    /**
     * Convert screen coordinates to grid coordinates.
     */
    function screenToGrid(screenX: number, screenY: number): [number, number] | null {
      const ctrl = getController();
      if (!ctrl) return null;

      const canvasRect = canvas.getBoundingClientRect();
      const x = screenX - canvasRect.left;
      const y = screenY - canvasRect.top;

      // Convert to NDC
      const ndcX = (x / canvasRect.width) * 2 - 1;
      const ndcY = -(y / canvasRect.height) * 2 + 1;

      // Convert NDC to world coordinates using camera
      const cam = cameraController.camera;
      const worldX = cam.position.x + ndcX * (cam.right - cam.left) / 2;
      const worldY = cam.position.y + ndcY * (cam.top - cam.bottom) / 2;

      // Round to grid coordinates
      const gridX = Math.round(worldX);
      const gridY = Math.round(worldY);

      // Bounds check
      const currentSim = ctrl.getSimulation();
      if (!currentSim) return null;
      if (gridX < 0 || gridX >= currentSim.grid.config.width) return null;
      if (gridY < 0 || gridY >= currentSim.grid.config.height) return null;

      return [gridX, gridY];
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && !e.shiftKey) {
        // Left click: draw
        const coords = screenToGrid(e.clientX, e.clientY);
        if (coords) {
          isDrawing = true;
          commandRegistry.execute('edit.draw', { x: coords[0], y: coords[1] });
        }
      } else if (e.button === 2) {
        // Right click: erase
        const coords = screenToGrid(e.clientX, e.clientY);
        if (coords) {
          isDrawing = true;
          commandRegistry.execute('edit.erase', { x: coords[0], y: coords[1] });
        }
      } else if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        // Middle click or shift+left click: pan
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        cameraController.pan(-dx, dy);
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        syncCamera(latticeRenderer, cameraController);
      } else if (isDrawing && e.buttons === 1) {
        // Continue drawing while dragging
        const coords = screenToGrid(e.clientX, e.clientY);
        if (coords) {
          commandRegistry.execute('edit.draw', { x: coords[0], y: coords[1] });
        }
      } else if (isDrawing && e.buttons === 2) {
        // Continue erasing while dragging
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
      e.preventDefault(); // Prevent right-click context menu
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const canvasRect = canvas.getBoundingClientRect();
      const screenX = e.clientX - canvasRect.left;
      const screenY = e.clientY - canvasRect.top;
      const delta = -e.deltaY * CameraController.ZOOM_SPEED * 0.01;
      cameraController.zoomAt(delta, screenX, screenY);
      syncCamera(latticeRenderer, cameraController);
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
        const w = newSim.preset.grid.width;
        const h = newSim.preset.grid.height ?? 1;
        const fh = newSim.preset.grid.dimensionality === '1d' ? latticeRenderer.getMaxHistory() : h;
        cameraController.zoomToFit(w, fh);
        syncCamera(latticeRenderer, cameraController);
      }
    };
    eventBus.on('sim:presetLoaded', onPresetLoaded);

    // Animation loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      latticeRenderer.update();
      latticeRenderer.render();
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

      latticeRenderer.dispose();
      rendererRef.current = null;
      cameraRef.current = null;

      if (container.contains(canvas)) {
        container.removeChild(canvas);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full cursor-crosshair"
      style={{ minHeight: '400px' }}
      data-testid="simulation-viewport"
    />
  );
}
