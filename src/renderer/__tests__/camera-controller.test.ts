import { describe, it, expect } from 'vitest';
import { CameraController } from '../CameraController';

describe('CameraController', () => {
  it('TestCameraController_InitializesWithDefaultZoom', () => {
    const ctrl = new CameraController(800, 600);

    expect(ctrl.getZoom()).toBe(1);
    expect(ctrl.camera.position.x).toBe(0);
    expect(ctrl.camera.position.y).toBe(0);
    expect(ctrl.camera.position.z).toBe(10);

    // Frustum should be half viewport in each direction
    expect(ctrl.camera.left).toBe(-400);
    expect(ctrl.camera.right).toBe(400);
    expect(ctrl.camera.top).toBe(300);
    expect(ctrl.camera.bottom).toBe(-300);
  });

  it('TestCameraController_PanUpdatesCameraPosition', () => {
    const ctrl = new CameraController(800, 600);

    ctrl.pan(100, 50);

    // At zoom=1, 100 pixels = 100 world units
    expect(ctrl.camera.position.x).toBeCloseTo(100);
    expect(ctrl.camera.position.y).toBeCloseTo(50);

    const state = ctrl.getState();
    expect(state.x).toBeCloseTo(100);
    expect(state.y).toBeCloseTo(50);
  });

  it('TestCameraController_PanScalesWithZoom', () => {
    const ctrl = new CameraController(800, 600);

    // Set zoom to 2 -- pan should move half the distance in world units
    ctrl.setZoom(2);
    ctrl.pan(100, 50);

    // At zoom=2, 100 pixels = 50 world units
    expect(ctrl.camera.position.x).toBeCloseTo(50);
    expect(ctrl.camera.position.y).toBeCloseTo(25);
  });

  it('TestCameraController_ZoomClampsToMin', () => {
    const ctrl = new CameraController(800, 600);

    // Try to set zoom below minimum
    ctrl.setZoom(0.01);
    expect(ctrl.getZoom()).toBe(CameraController.MIN_ZOOM);
    expect(ctrl.getZoom()).toBe(0.1);

    // zoomBy with large negative delta
    ctrl.setZoom(0.2);
    ctrl.zoomBy(-100);
    expect(ctrl.getZoom()).toBeGreaterThanOrEqual(CameraController.MIN_ZOOM);
  });

  it('TestCameraController_ZoomClampsToMax', () => {
    const ctrl = new CameraController(800, 600);

    // Try to set zoom above maximum
    ctrl.setZoom(100);
    expect(ctrl.getZoom()).toBe(CameraController.MAX_ZOOM);
    expect(ctrl.getZoom()).toBe(20);
  });

  it('TestCameraController_ZoomSupportsNonInteger', () => {
    const ctrl = new CameraController(800, 600);

    // Test various non-integer zoom levels (RNDR-05)
    ctrl.setZoom(1.5);
    expect(ctrl.getZoom()).toBeCloseTo(1.5);

    ctrl.setZoom(2.7);
    expect(ctrl.getZoom()).toBeCloseTo(2.7);

    ctrl.setZoom(0.3);
    expect(ctrl.getZoom()).toBeCloseTo(0.3);

    // Verify frustum is calculated correctly at non-integer zoom
    ctrl.setZoom(1.5);
    const halfW = 800 / (2 * 1.5);
    const halfH = 600 / (2 * 1.5);
    expect(ctrl.camera.left).toBeCloseTo(-halfW);
    expect(ctrl.camera.right).toBeCloseTo(halfW);
    expect(ctrl.camera.top).toBeCloseTo(halfH);
    expect(ctrl.camera.bottom).toBeCloseTo(-halfH);
  });

  it('TestCameraController_ZoomToFit_SquareGrid', () => {
    const ctrl = new CameraController(800, 600);

    ctrl.zoomToFit(128, 128);

    // Camera should be centered on the grid
    const state = ctrl.getState();
    expect(state.x).toBeCloseTo(63.5); // (128-1)/2
    expect(state.y).toBeCloseTo(63.5);

    // Zoom should fit the narrower axis (600px height for 128*1.05 = 134.4 units)
    const padding = 1 + CameraController.FIT_PADDING;
    const expectedZoomX = 800 / (128 * padding);
    const expectedZoomY = 600 / (128 * padding);
    const expectedZoom = Math.min(expectedZoomX, expectedZoomY);
    expect(state.zoom).toBeCloseTo(expectedZoom);

    // Verify the entire grid is visible within the frustum
    expect(ctrl.camera.left).toBeLessThan(0);
    expect(ctrl.camera.right).toBeGreaterThan(127);
    expect(ctrl.camera.bottom).toBeLessThan(0);
    expect(ctrl.camera.top).toBeGreaterThan(127);
  });

  it('TestCameraController_ZoomToFit_RectangularGrid', () => {
    const ctrl = new CameraController(800, 600);

    ctrl.zoomToFit(256, 64);

    const state = ctrl.getState();
    expect(state.x).toBeCloseTo(127.5); // (256-1)/2
    expect(state.y).toBeCloseTo(31.5); // (64-1)/2

    // Should use X axis zoom (wider grid relative to viewport)
    const padding = 1 + CameraController.FIT_PADDING;
    const zoomX = 800 / (256 * padding);
    const zoomY = 600 / (64 * padding);
    expect(state.zoom).toBeCloseTo(Math.min(zoomX, zoomY));
  });

  it('TestCameraController_ZoomToFit_1DGrid', () => {
    const ctrl = new CameraController(800, 600);

    // 1D grid: width=256, spacetime height=128
    ctrl.zoomToFit(256, 128);

    const state = ctrl.getState();
    expect(state.x).toBeCloseTo(127.5);
    expect(state.y).toBeCloseTo(63.5);

    // Grid should be fully visible
    expect(ctrl.camera.left).toBeLessThan(0);
    expect(ctrl.camera.right).toBeGreaterThan(255);
    expect(ctrl.camera.bottom).toBeLessThan(0);
    expect(ctrl.camera.top).toBeGreaterThan(127);
  });

  it('TestCameraController_ResizeUpdatesFrustum', () => {
    const ctrl = new CameraController(800, 600);

    ctrl.resize(1200, 900);

    const size = ctrl.getViewportSize();
    expect(size.width).toBe(1200);
    expect(size.height).toBe(900);

    // Frustum should reflect new size at zoom=1
    expect(ctrl.camera.left).toBeCloseTo(-600);
    expect(ctrl.camera.right).toBeCloseTo(600);
    expect(ctrl.camera.top).toBeCloseTo(450);
    expect(ctrl.camera.bottom).toBeCloseTo(-450);
  });

  it('TestCameraController_GetSetState_Roundtrips', () => {
    const ctrl = new CameraController(800, 600);

    // Set some state
    ctrl.pan(50, 30);
    ctrl.setZoom(2.5);

    const state = ctrl.getState();

    // Create new controller and restore state
    const ctrl2 = new CameraController(800, 600);
    ctrl2.setState(state);

    const state2 = ctrl2.getState();
    expect(state2.x).toBeCloseTo(state.x);
    expect(state2.y).toBeCloseTo(state.y);
    expect(state2.zoom).toBeCloseTo(state.zoom);
  });

  it('TestCameraController_ZoomAtCursor_KeepsPointFixed', () => {
    const ctrl = new CameraController(800, 600);

    // Zoom at the top-right quadrant of the screen
    const screenX = 600;
    const screenY = 150;

    // Calculate world position before zoom
    const ndcX = (screenX / 800) * 2 - 1; // 0.5
    const ndcY = -(screenY / 600) * 2 + 1; // 0.5

    const worldXBefore = ctrl.getState().x + (ndcX * 800) / (2 * ctrl.getZoom());
    const worldYBefore = ctrl.getState().y + (ndcY * 600) / (2 * ctrl.getZoom());

    // Zoom in
    ctrl.zoomAt(0.5, screenX, screenY);

    // Calculate world position after zoom
    const worldXAfter = ctrl.getState().x + (ndcX * 800) / (2 * ctrl.getZoom());
    const worldYAfter = ctrl.getState().y + (ndcY * 600) / (2 * ctrl.getZoom());

    // World point under cursor should be the same
    expect(worldXAfter).toBeCloseTo(worldXBefore, 1);
    expect(worldYAfter).toBeCloseTo(worldYBefore, 1);
  });
});
