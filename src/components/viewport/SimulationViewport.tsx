/**
 * SimulationViewport: React component wrapping the Three.js LatticeRenderer lifecycle.
 *
 * Manages the full rendering lifecycle: create -> animate -> dispose.
 * Runs a Simulation directly in the main thread (Worker integration comes in Phase 5).
 * Handles pan/zoom via mouse events and responsive sizing via ResizeObserver.
 * Explicitly disposes all GPU resources on unmount (RNDR-11).
 */

'use client';

import { useRef, useEffect } from 'react';
import { Simulation } from '@/engine/rule/Simulation';
import type { PresetConfig } from '@/engine/preset/types';
import { LatticeRenderer } from '@/renderer/LatticeRenderer';
import { CameraController } from '@/renderer/CameraController';

interface SimulationViewportProps {
  /** Preset configuration to simulate */
  preset: PresetConfig;
  /** Whether the simulation is running (default: true) */
  running?: boolean;
  /** Tick interval in milliseconds (default: 100) */
  tickInterval?: number;
  /** Callback when generation changes */
  onGenerationChange?: (generation: number) => void;
}

/**
 * Initialize simulation with appropriate starting state per dimensionality.
 */
function initializeSimulation(sim: Simulation, preset: PresetConfig): void {
  const dim = preset.grid.dimensionality;
  const firstProp = preset.cell_properties[0].name;

  if (dim === '1d') {
    // For 1D: set center cell to active state
    const centerX = Math.floor(preset.grid.width / 2);
    sim.setCellDirect(firstProp, centerX, 1);
  } else if (dim === '2d') {
    // For 2D: random seed with ~20% density for interesting patterns
    for (let i = 0; i < sim.grid.cellCount; i++) {
      if (Math.random() < 0.2) {
        sim.setCellDirect(firstProp, i, 1);
      }
    }
  }
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

export function SimulationViewport({
  preset,
  running = true,
  tickInterval = 100,
  onGenerationChange,
}: SimulationViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<LatticeRenderer | null>(null);
  const simulationRef = useRef<Simulation | null>(null);
  const cameraRef = useRef<CameraController | null>(null);
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const runningRef = useRef(running);

  // Keep runningRef in sync with prop
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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
      // WebGL not available (e.g., in tests) -- fail gracefully
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

    // Create simulation
    const simulation = new Simulation(preset);
    simulationRef.current = simulation;

    // Initialize with appropriate state
    initializeSimulation(simulation, preset);

    // Connect simulation grid to renderer
    latticeRenderer.setSimulation(simulation.grid, preset);

    // Zoom to fit on load (RNDR-06)
    const gridW = preset.grid.width;
    const gridH = preset.grid.height ?? 1;
    const fitH = preset.grid.dimensionality === '1d' ? latticeRenderer.getMaxHistory() : gridH;
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
    let lastMouseX = 0;
    let lastMouseY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      // Invert X for natural drag panning, Y inverted for screen->world coords
      cameraController.pan(-dx, dy);
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      syncCamera(latticeRenderer, cameraController);
    };

    const onMouseUp = () => {
      isDragging = false;
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

    // Animation loop
    const animate = (time: number) => {
      rafRef.current = requestAnimationFrame(animate);

      // Tick simulation at the configured interval
      if (runningRef.current && time - lastTickRef.current >= tickInterval) {
        simulation.tick();
        onGenerationChange?.(simulation.getGeneration());
        lastTickRef.current = time;
      }

      latticeRenderer.update();
      latticeRenderer.render();
    };
    rafRef.current = requestAnimationFrame(animate);

    // Cleanup -- CRITICAL: dispose all GPU resources (RNDR-11)
    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      resizeObserver.disconnect();

      latticeRenderer.dispose();
      rendererRef.current = null;
      simulationRef.current = null;
      cameraRef.current = null;

      if (container.contains(canvas)) {
        container.removeChild(canvas);
      }
    };
  }, [preset, tickInterval]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: '400px' }}
      data-testid="simulation-viewport"
    />
  );
}
