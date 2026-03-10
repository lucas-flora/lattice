/**
 * OrbitCameraController: orbit/zoom/pan for perspective camera in 3D viewports.
 *
 * Provides rotate (left-drag), zoom (scroll), and pan (shift+drag) for 3D grids.
 * Uses simple spherical coordinate math -- no dependency on Three.js OrbitControls addon.
 * Falls back gracefully: only instantiated for 3D grids (RNDR-10).
 */

import * as THREE from 'three';

/** Camera state for store persistence */
export interface OrbitCameraState {
  theta: number;
  phi: number;
  radius: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

export class OrbitCameraController {
  readonly camera: THREE.PerspectiveCamera;
  private theta: number = Math.PI / 4; // Azimuthal angle
  private phi: number = Math.PI / 3; // Polar angle (from top)
  private radius: number;
  private targetX: number = 0;
  private targetY: number = 0;
  private targetZ: number = 0;
  private viewportWidth: number;
  private viewportHeight: number;

  /** Minimum orbit radius */
  static readonly MIN_RADIUS = 2;
  /** Maximum orbit radius */
  static readonly MAX_RADIUS = 500;
  /** Rotation speed multiplier */
  static readonly ROTATE_SPEED = 0.005;
  /** Pan speed multiplier */
  static readonly PAN_SPEED = 0.5;
  /** Zoom speed multiplier */
  static readonly ZOOM_SPEED = 0.1;
  /** Minimum polar angle (prevent gimbal lock at top) */
  static readonly MIN_PHI = 0.1;
  /** Maximum polar angle (prevent gimbal lock at bottom) */
  static readonly MAX_PHI = Math.PI - 0.1;

  constructor(viewportWidth: number, viewportHeight: number) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.radius = 50;

    this.camera = new THREE.PerspectiveCamera(
      60,
      viewportWidth / viewportHeight,
      0.1,
      2000,
    );

    this.updateCameraPosition();
  }

  /**
   * Orbit: rotate around the target by pixel delta (from mouse drag).
   */
  orbit(deltaX: number, deltaY: number): void {
    this.theta -= deltaX * OrbitCameraController.ROTATE_SPEED;
    this.phi -= deltaY * OrbitCameraController.ROTATE_SPEED;

    // Clamp phi to prevent gimbal lock
    this.phi = Math.max(
      OrbitCameraController.MIN_PHI,
      Math.min(OrbitCameraController.MAX_PHI, this.phi),
    );

    this.updateCameraPosition();
  }

  /**
   * Zoom: change orbit radius by delta.
   */
  zoom(delta: number): void {
    this.radius *= 1 - delta * OrbitCameraController.ZOOM_SPEED;
    this.radius = Math.max(
      OrbitCameraController.MIN_RADIUS,
      Math.min(OrbitCameraController.MAX_RADIUS, this.radius),
    );

    this.updateCameraPosition();
  }

  /**
   * Pan: translate the orbit target by pixel delta.
   */
  pan(deltaX: number, deltaY: number): void {
    // Calculate camera-relative right and up vectors
    const forward = new THREE.Vector3(
      this.targetX - this.camera.position.x,
      this.targetY - this.camera.position.y,
      this.targetZ - this.camera.position.z,
    ).normalize();

    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    const panScale = (this.radius / this.viewportWidth) * OrbitCameraController.PAN_SPEED;

    this.targetX += (-deltaX * right.x + deltaY * up.x) * panScale;
    this.targetY += (-deltaX * right.y + deltaY * up.y) * panScale;
    this.targetZ += (-deltaX * right.z + deltaY * up.z) * panScale;

    this.updateCameraPosition();
  }

  /**
   * Frame the camera to fit a 3D grid of given dimensions.
   */
  fitToGrid(gridWidth: number, gridHeight: number, gridDepth: number): void {
    // Center on grid
    this.targetX = (gridWidth - 1) / 2;
    this.targetY = (gridHeight - 1) / 2;
    this.targetZ = (gridDepth - 1) / 2;

    // Calculate radius to fit the grid
    const maxDim = Math.max(gridWidth, gridHeight, gridDepth);
    this.radius = maxDim * 1.5;
    this.radius = Math.max(
      OrbitCameraController.MIN_RADIUS,
      Math.min(OrbitCameraController.MAX_RADIUS, this.radius),
    );

    // Reset viewing angles
    this.theta = Math.PI / 4;
    this.phi = Math.PI / 3;

    this.updateCameraPosition();
  }

  /**
   * Resize the viewport and update camera aspect ratio.
   */
  resize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Get current camera state for persistence.
   */
  getState(): OrbitCameraState {
    return {
      theta: this.theta,
      phi: this.phi,
      radius: this.radius,
      targetX: this.targetX,
      targetY: this.targetY,
      targetZ: this.targetZ,
    };
  }

  /**
   * Restore camera state.
   */
  setState(state: OrbitCameraState): void {
    this.theta = state.theta;
    this.phi = state.phi;
    this.radius = Math.max(
      OrbitCameraController.MIN_RADIUS,
      Math.min(OrbitCameraController.MAX_RADIUS, state.radius),
    );
    this.targetX = state.targetX;
    this.targetY = state.targetY;
    this.targetZ = state.targetZ;
    this.updateCameraPosition();
  }

  /**
   * Get the current orbit radius (equivalent to zoom level).
   */
  getRadius(): number {
    return this.radius;
  }

  /**
   * Get the viewport dimensions.
   */
  getViewportSize(): { width: number; height: number } {
    return { width: this.viewportWidth, height: this.viewportHeight };
  }

  /**
   * Update camera position from spherical coordinates.
   */
  private updateCameraPosition(): void {
    const x = this.targetX + this.radius * Math.sin(this.phi) * Math.cos(this.theta);
    const y = this.targetY + this.radius * Math.cos(this.phi);
    const z = this.targetZ + this.radius * Math.sin(this.phi) * Math.sin(this.theta);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.targetX, this.targetY, this.targetZ);
    this.camera.updateProjectionMatrix();
  }
}
