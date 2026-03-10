/**
 * OrbitCameraController tests: orbit/zoom/pan for 3D viewports.
 *
 * Verifies spherical coordinate camera math, clamping, fit-to-grid,
 * resize, and state persistence (RNDR-10).
 */

import { describe, it, expect } from 'vitest';
import { OrbitCameraController } from '../OrbitCameraController';

describe('OrbitCameraController', () => {
  it('TestOrbitCamera_InitializesWithDefaultState', () => {
    const ctrl = new OrbitCameraController(800, 600);

    expect(ctrl.getRadius()).toBe(50);
    expect(ctrl.camera.position.z).not.toBe(0);
    expect(ctrl.camera.fov).toBe(60);
    expect(ctrl.camera.aspect).toBeCloseTo(800 / 600);
  });

  it('TestOrbitCamera_OrbitChangesPosition', () => {
    const ctrl = new OrbitCameraController(800, 600);
    const initialX = ctrl.camera.position.x;
    const initialZ = ctrl.camera.position.z;

    ctrl.orbit(100, 0); // Rotate horizontally

    // Camera position should change
    expect(ctrl.camera.position.x).not.toBeCloseTo(initialX, 0);
    expect(ctrl.camera.position.z).not.toBeCloseTo(initialZ, 0);
    // Radius should remain the same
    expect(ctrl.getRadius()).toBe(50);
  });

  it('TestOrbitCamera_OrbitClampsPhi', () => {
    const ctrl = new OrbitCameraController(800, 600);

    // Try to orbit past the top (phi -> 0)
    ctrl.orbit(0, -10000);
    const stateTop = ctrl.getState();
    expect(stateTop.phi).toBeGreaterThanOrEqual(OrbitCameraController.MIN_PHI);

    // Try to orbit past the bottom (phi -> PI)
    ctrl.orbit(0, 10000);
    const stateBottom = ctrl.getState();
    expect(stateBottom.phi).toBeLessThanOrEqual(OrbitCameraController.MAX_PHI);
  });

  it('TestOrbitCamera_ZoomChangesRadius', () => {
    const ctrl = new OrbitCameraController(800, 600);
    const initialRadius = ctrl.getRadius();

    ctrl.zoom(5); // Zoom in (positive delta = closer)
    const afterZoomIn = ctrl.getRadius();
    expect(afterZoomIn).toBeLessThan(initialRadius);

    // Reset to known state
    ctrl.setState({
      theta: Math.PI / 4,
      phi: Math.PI / 3,
      radius: 50,
      targetX: 0,
      targetY: 0,
      targetZ: 0,
    });

    ctrl.zoom(-5); // Zoom out (negative delta = farther)
    expect(ctrl.getRadius()).toBeGreaterThan(50);
  });

  it('TestOrbitCamera_ZoomClampsToMinMax', () => {
    const ctrl = new OrbitCameraController(800, 600);

    // Zoom in past minimum
    for (let i = 0; i < 100; i++) {
      ctrl.zoom(10);
    }
    expect(ctrl.getRadius()).toBeGreaterThanOrEqual(OrbitCameraController.MIN_RADIUS);

    // Zoom out past maximum
    for (let i = 0; i < 100; i++) {
      ctrl.zoom(-10);
    }
    expect(ctrl.getRadius()).toBeLessThanOrEqual(OrbitCameraController.MAX_RADIUS);
  });

  it('TestOrbitCamera_PanMovesTarget', () => {
    const ctrl = new OrbitCameraController(800, 600);
    const initialState = ctrl.getState();

    ctrl.pan(100, 0); // Pan horizontally

    const newState = ctrl.getState();
    // Target should have moved
    const targetMoved =
      Math.abs(newState.targetX - initialState.targetX) > 0.01 ||
      Math.abs(newState.targetY - initialState.targetY) > 0.01 ||
      Math.abs(newState.targetZ - initialState.targetZ) > 0.01;
    expect(targetMoved).toBe(true);
  });

  it('TestOrbitCamera_FitToGrid_CentersOnGrid', () => {
    const ctrl = new OrbitCameraController(800, 600);

    ctrl.fitToGrid(16, 16, 16);

    const state = ctrl.getState();
    expect(state.targetX).toBeCloseTo(7.5); // (16-1)/2
    expect(state.targetY).toBeCloseTo(7.5);
    expect(state.targetZ).toBeCloseTo(7.5);
    expect(state.radius).toBeCloseTo(16 * 1.5); // maxDim * 1.5
  });

  it('TestOrbitCamera_FitToGrid_RectangularGrid', () => {
    const ctrl = new OrbitCameraController(800, 600);

    ctrl.fitToGrid(32, 8, 4);

    const state = ctrl.getState();
    expect(state.targetX).toBeCloseTo(15.5);
    expect(state.targetY).toBeCloseTo(3.5);
    expect(state.targetZ).toBeCloseTo(1.5);
    expect(state.radius).toBeCloseTo(32 * 1.5); // maxDim is 32
  });

  it('TestOrbitCamera_ResizeUpdatesAspect', () => {
    const ctrl = new OrbitCameraController(800, 600);
    expect(ctrl.camera.aspect).toBeCloseTo(800 / 600);

    ctrl.resize(1200, 900);

    expect(ctrl.camera.aspect).toBeCloseTo(1200 / 900);
    const size = ctrl.getViewportSize();
    expect(size.width).toBe(1200);
    expect(size.height).toBe(900);
  });

  it('TestOrbitCamera_GetSetState_Roundtrips', () => {
    const ctrl = new OrbitCameraController(800, 600);

    ctrl.orbit(50, 30);
    ctrl.zoom(3);
    ctrl.pan(20, 10);

    const state = ctrl.getState();

    const ctrl2 = new OrbitCameraController(800, 600);
    ctrl2.setState(state);

    const state2 = ctrl2.getState();
    expect(state2.theta).toBeCloseTo(state.theta);
    expect(state2.phi).toBeCloseTo(state.phi);
    expect(state2.radius).toBeCloseTo(state.radius);
    expect(state2.targetX).toBeCloseTo(state.targetX);
    expect(state2.targetY).toBeCloseTo(state.targetY);
    expect(state2.targetZ).toBeCloseTo(state.targetZ);
  });

  it('TestOrbitCamera_SetState_ClampsRadius', () => {
    const ctrl = new OrbitCameraController(800, 600);

    ctrl.setState({
      theta: 0,
      phi: Math.PI / 2,
      radius: 0.5, // Below minimum
      targetX: 0,
      targetY: 0,
      targetZ: 0,
    });

    expect(ctrl.getRadius()).toBe(OrbitCameraController.MIN_RADIUS);

    ctrl.setState({
      theta: 0,
      phi: Math.PI / 2,
      radius: 1000, // Above maximum
      targetX: 0,
      targetY: 0,
      targetZ: 0,
    });

    expect(ctrl.getRadius()).toBe(OrbitCameraController.MAX_RADIUS);
  });

  it('TestOrbitCamera_CameraLooksAtTarget', () => {
    const ctrl = new OrbitCameraController(800, 600);
    ctrl.fitToGrid(10, 10, 10);

    // The camera should be looking roughly at the target
    // We can verify by checking the camera's world direction points toward the target
    const state = ctrl.getState();
    const dx = state.targetX - ctrl.camera.position.x;
    const dy = state.targetY - ctrl.camera.position.y;
    const dz = state.targetZ - ctrl.camera.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Distance from camera to target should equal radius
    expect(dist).toBeCloseTo(state.radius, 1);
  });
});
