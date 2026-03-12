/**
 * CameraController: smooth pan/zoom for orthographic camera.
 *
 * Provides pan (mouse drag), zoom (mouse wheel with cursor targeting),
 * and zoom-to-fit (auto-frame the entire grid).
 * Supports non-integer zoom levels (RNDR-05).
 * Zoom-to-fit correctly frames the entire grid (RNDR-06).
 *
 * All math is pure -- no DOM event binding here. Event binding
 * happens in the viewport component.
 */

import * as THREE from 'three';

/** Camera state for store persistence */
export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export class CameraController {
  readonly camera: THREE.OrthographicCamera;
  private zoom: number = 1;
  private panX: number = 0;
  private panY: number = 0;
  private viewportWidth: number;
  private viewportHeight: number;

  /** Minimum zoom level */
  static readonly MIN_ZOOM = 0.1;
  /** Maximum zoom level */
  static readonly MAX_ZOOM = 20;
  /** Zoom speed multiplier */
  static readonly ZOOM_SPEED = 0.1;
  /** Padding factor for zoom-to-fit (5% margin) */
  static readonly FIT_PADDING = 0.05;

  constructor(viewportWidth: number, viewportHeight: number) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;

    const halfW = viewportWidth / 2;
    const halfH = viewportHeight / 2;

    this.camera = new THREE.OrthographicCamera(
      -halfW,
      halfW,
      halfH,
      -halfH,
      0.1,
      1000,
    );
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * Pan by pixel delta (from mouse drag).
   * Converts pixel deltas to world units based on current zoom.
   */
  pan(deltaX: number, deltaY: number): void {
    // Convert pixel delta to world units
    const worldDeltaX = deltaX / this.zoom;
    const worldDeltaY = deltaY / this.zoom;

    this.panX += worldDeltaX;
    this.panY += worldDeltaY;

    this.camera.position.set(this.panX, this.panY, 10);
    this.updateFrustum();
  }

  /**
   * Zoom centered on a screen point (from mouse wheel).
   * The world point under the cursor stays fixed after zooming.
   */
  zoomAt(delta: number, screenX: number, screenY: number): void {
    const oldZoom = this.zoom;

    // Calculate new zoom with clamping
    const newZoom = Math.max(
      CameraController.MIN_ZOOM,
      Math.min(CameraController.MAX_ZOOM, this.zoom * (1 + delta)),
    );

    if (newZoom === oldZoom) return;

    // Convert screen position to world coordinates at old zoom
    const ndcX = (screenX / this.viewportWidth) * 2 - 1;
    const ndcY = -(screenY / this.viewportHeight) * 2 + 1;

    const worldXBefore = this.panX + (ndcX * this.viewportWidth) / (2 * oldZoom);
    const worldYBefore = this.panY + (ndcY * this.viewportHeight) / (2 * oldZoom);

    // Apply new zoom
    this.zoom = newZoom;

    // Convert same screen position to world coordinates at new zoom
    const worldXAfter = this.panX + (ndcX * this.viewportWidth) / (2 * newZoom);
    const worldYAfter = this.panY + (ndcY * this.viewportHeight) / (2 * newZoom);

    // Adjust pan to keep the world point under the cursor fixed
    this.panX += worldXBefore - worldXAfter;
    this.panY += worldYBefore - worldYAfter;

    this.camera.position.set(this.panX, this.panY, 10);
    this.updateFrustum();
  }

  /**
   * Simple zoom centered on viewport center.
   */
  zoomBy(delta: number): void {
    this.zoomAt(delta, this.viewportWidth / 2, this.viewportHeight / 2);
  }

  /**
   * Set absolute zoom level.
   */
  setZoom(zoom: number): void {
    this.zoom = Math.max(CameraController.MIN_ZOOM, Math.min(CameraController.MAX_ZOOM, zoom));
    this.updateFrustum();
  }

  /**
   * Zoom to fit a grid of given dimensions.
   * Centers the camera and adjusts zoom to frame the grid with padding.
   */
  zoomToFit(gridWidth: number, gridHeight: number): void {
    const padding = 1 + CameraController.FIT_PADDING;
    const zoomX = this.viewportWidth / (gridWidth * padding);
    const zoomY = this.viewportHeight / (gridHeight * padding);
    this.zoom = Math.min(zoomX, zoomY);

    // Clamp zoom
    this.zoom = Math.max(CameraController.MIN_ZOOM, Math.min(CameraController.MAX_ZOOM, this.zoom));

    // Center on grid (grid coordinates go from 0 to width-1)
    this.panX = (gridWidth - 1) / 2;
    this.panY = (gridHeight - 1) / 2;

    this.camera.position.set(this.panX, this.panY, 10);
    this.updateFrustum();
  }

  /**
   * Update camera frustum from current zoom, pan, and viewport.
   */
  private updateFrustum(): void {
    const halfW = this.viewportWidth / (2 * this.zoom);
    const halfH = this.viewportHeight / (2 * this.zoom);

    // Frustum bounds are in camera-local space (relative to camera.position).
    // camera.position already handles the world-space translation via panX/panY.
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Resize viewport.
   */
  resize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.updateFrustum();
  }

  /**
   * Get current camera state for store persistence.
   */
  getState(): CameraState {
    return { x: this.panX, y: this.panY, zoom: this.zoom };
  }

  /**
   * Restore camera state from store.
   */
  setState(state: CameraState): void {
    this.panX = state.x;
    this.panY = state.y;
    this.zoom = Math.max(CameraController.MIN_ZOOM, Math.min(CameraController.MAX_ZOOM, state.zoom));
    this.camera.position.set(this.panX, this.panY, 10);
    this.updateFrustum();
  }

  /**
   * Get the current zoom level.
   */
  getZoom(): number {
    return this.zoom;
  }

  /**
   * Get the viewport dimensions.
   */
  getViewportSize(): { width: number; height: number } {
    return { width: this.viewportWidth, height: this.viewportHeight };
  }
}
