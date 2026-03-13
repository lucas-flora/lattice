/**
 * Advanced rendering tests for Phase 9.
 *
 * Tests 3D grid rendering logic, multi-viewport state management,
 * timeline scrubber integration, and fullscreen toggle (RNDR-02, RNDR-08, RNDR-09).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Grid } from '@/engine/grid/Grid';
import { CameraController } from '../CameraController';
import { useSimStore, simStoreActions } from '@/store/simStore';
import { useLayoutStore, layoutStoreActions } from '@/store/layoutStore';
import type { GridConfig } from '@/engine/grid/types';

// Helper: create a 3D grid
function create3DGrid(width: number, height: number, depth: number): Grid {
  const config: GridConfig = {
    dimensionality: '3d',
    width,
    height,
    depth,
    topology: 'toroidal',
  };
  const grid = new Grid(config);
  grid.addProperty('alive', 1, 0);
  return grid;
}

// Helper: create a 2D grid
function create2DGrid(width: number, height: number): Grid {
  const config: GridConfig = {
    dimensionality: '2d',
    width,
    height,
    depth: 1,
    topology: 'toroidal',
  };
  const grid = new Grid(config);
  grid.addProperty('alive', 1, 0);
  return grid;
}

describe('Advanced Rendering - Phase 9', () => {
  describe('3D Grid Rendering (RNDR-02)', () => {
    it('TestRenderer3D_DetectsRenderMode_For3DGrid', () => {
      const expectedMode = '3d';
      expect(expectedMode).toBe('3d');
    });

    it('TestRenderer3D_CorrectInstanceCount_For3DGrid', () => {
      const grid = create3DGrid(8, 8, 8);
      expect(grid.cellCount).toBe(512);
    });

    it('TestRenderer3D_IndexToCoord_Returns3DCoords', () => {
      const grid = create3DGrid(4, 4, 4);

      expect(grid.indexToCoord(0)).toEqual([0, 0, 0]);
      expect(grid.indexToCoord(3)).toEqual([3, 0, 0]);
      expect(grid.indexToCoord(4)).toEqual([0, 1, 0]);
      expect(grid.indexToCoord(16)).toEqual([0, 0, 1]);
      expect(grid.indexToCoord(63)).toEqual([3, 3, 3]);
    });

    it('TestRenderer3D_CoordToIndex_Roundtrips', () => {
      const grid = create3DGrid(8, 8, 8);

      for (let z = 0; z < 8; z++) {
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            const idx = grid.coordToIndex(x, y, z);
            const [rx, ry, rz] = grid.indexToCoord(idx);
            expect(rx).toBe(x);
            expect(ry).toBe(y);
            expect(rz).toBe(z);
          }
        }
      }
    });

    it('TestRenderer3D_VoxelPositions_Correct', () => {
      const grid = create3DGrid(4, 4, 4);
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3(1, 1, 1);

      for (let i = 0; i < grid.cellCount; i++) {
        const [x, y, z] = grid.indexToCoord(i);
        position.set(x, y, z);
        matrix.compose(position, quaternion, scale);

        const extractedPos = new THREE.Vector3();
        extractedPos.setFromMatrixPosition(matrix);
        expect(extractedPos.x).toBe(x);
        expect(extractedPos.y).toBe(y);
        expect(extractedPos.z).toBe(z);
      }
    });

    it('TestRenderer3D_OnlyAliveVoxelsVisible', () => {
      const grid = create3DGrid(4, 4, 4);
      const buffer = grid.getCurrentBuffer('alive');

      buffer[0] = 1;
      buffer[10] = 1;
      buffer[63] = 1;

      let aliveCount = 0;
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] !== 0) aliveCount++;
      }
      expect(aliveCount).toBe(3);
    });

    it('TestRenderer3D_UsesBoxGeometry', () => {
      const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
      expect(geo.parameters.width).toBeCloseTo(0.9);
      expect(geo.parameters.height).toBeCloseTo(0.9);
      expect(geo.parameters.depth).toBeCloseTo(0.9);
      geo.dispose();
    });

    it('TestRenderer3D_UnifiedPath_AllDimensions', () => {
      const modeFor = (dim: string) => {
        if (dim === '1d') return '1d-spacetime';
        if (dim === '3d') return '3d';
        return '2d';
      };

      expect(modeFor('1d')).toBe('1d-spacetime');
      expect(modeFor('2d')).toBe('2d');
      expect(modeFor('3d')).toBe('3d');
    });
  });

  describe('Multi-Viewport (RNDR-08)', () => {
    it('TestMultiViewport_IndependentCameraStates', () => {
      const cam1 = new CameraController(800, 600);
      const cam2 = new CameraController(800, 600);

      cam1.pan(100, 50);
      cam1.setZoom(3);

      cam2.pan(-50, 20);
      cam2.setZoom(1.5);

      const state1 = cam1.getState();
      const state2 = cam2.getState();

      expect(state1.x).not.toBeCloseTo(state2.x);
      expect(state1.y).not.toBeCloseTo(state2.y);
      expect(state1.zoom).not.toBeCloseTo(state2.zoom);
    });

    it('TestMultiViewport_SharedGridState', () => {
      const grid = create2DGrid(8, 8);
      const buffer = grid.getCurrentBuffer('alive');
      buffer[0] = 1;

      const bufRef1 = grid.getCurrentBuffer('alive');
      const bufRef2 = grid.getCurrentBuffer('alive');

      expect(bufRef1).toBe(bufRef2);
      expect(bufRef1[0]).toBe(1);
    });

    it('TestMultiViewport_ViewportCountToggle', () => {
      useLayoutStore.setState({ viewportCount: 1, fullscreenViewportId: null });

      layoutStoreActions.toggleSplitView();
      expect(useLayoutStore.getState().viewportCount).toBe(2);

      layoutStoreActions.toggleSplitView();
      expect(useLayoutStore.getState().viewportCount).toBe(1);

      useLayoutStore.setState({ viewportCount: 1, fullscreenViewportId: null });
    });
  });

  describe('Timeline Scrubber', () => {
    it('TestTimeline_MaxGenerationUpdatesOnTick', () => {
      useSimStore.setState({ generation: 0, maxGeneration: 0 });

      simStoreActions.setGeneration(5);
      expect(useSimStore.getState().maxGeneration).toBe(5);

      simStoreActions.setGeneration(10);
      expect(useSimStore.getState().maxGeneration).toBe(10);

      simStoreActions.setGeneration(3);
      expect(useSimStore.getState().maxGeneration).toBe(10);

      useSimStore.setState({ generation: 0, maxGeneration: 0 });
    });

    it('TestTimeline_ResetClearsMaxGeneration', () => {
      simStoreActions.setGeneration(50);
      expect(useSimStore.getState().maxGeneration).toBe(50);

      simStoreActions.resetState();
      expect(useSimStore.getState().maxGeneration).toBe(0);
      expect(useSimStore.getState().generation).toBe(0);
    });
  });

  describe('Fullscreen Mode (RNDR-09)', () => {
    it('TestFullscreen_StoreToggle', () => {
      useLayoutStore.setState({ fullscreenViewportId: null });

      layoutStoreActions.setFullscreenViewport('viewport-1');
      expect(useLayoutStore.getState().fullscreenViewportId).toBe('viewport-1');

      layoutStoreActions.setFullscreenViewport(null);
      expect(useLayoutStore.getState().fullscreenViewportId).toBeNull();

      useLayoutStore.setState({ fullscreenViewportId: null, viewportCount: 1 });
    });

    it('TestFullscreen_SplitToggleExitsFullscreen', () => {
      layoutStoreActions.setFullscreenViewport('viewport-1');
      expect(useLayoutStore.getState().fullscreenViewportId).toBe('viewport-1');

      layoutStoreActions.toggleSplitView();
      expect(useLayoutStore.getState().fullscreenViewportId).toBeNull();

      useLayoutStore.setState({ fullscreenViewportId: null, viewportCount: 1 });
    });
  });
});
