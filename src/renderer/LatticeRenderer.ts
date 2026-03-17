/**
 * LatticeRenderer: unified Three.js renderer for 1D/2D/3D grids using InstancedMesh.
 *
 * Single render path for all grid dimensionalities (RNDR-04).
 * Uses InstancedMesh for efficient GPU-instanced rendering -- no per-frame object allocation.
 * Reads typed arrays directly from Grid.getCurrentBuffer() -- zero-copy (RNDR-12).
 * All GPU resources explicitly disposed via disposeObject/disposeRenderer (RNDR-11).
 */

import * as THREE from 'three';
import type { Grid } from '@/engine/grid/Grid';
import type { PresetConfig } from '@/engine/preset/types';
import { VisualMapper } from './VisualMapper';
import { disposeObject, disposeRenderer } from '@/lib/three-dispose';
import type { RendererConfig, GridRenderMode } from './types';

export class LatticeRenderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  private _renderer: THREE.WebGLRenderer | null;
  private instancedMesh: THREE.InstancedMesh | null = null;
  private visualMapper: VisualMapper | null = null;
  private grid: Grid | null = null;
  private preset: PresetConfig | null = null;
  private renderMode: GridRenderMode = '2d';

  // Reusable temporaries -- no per-frame allocation
  private readonly tempMatrix: THREE.Matrix4 = new THREE.Matrix4();
  private readonly tempColor: THREE.Color = new THREE.Color();
  private readonly tempPosition: THREE.Vector3 = new THREE.Vector3();
  private readonly tempQuaternion: THREE.Quaternion = new THREE.Quaternion();
  private readonly tempScale: THREE.Vector3 = new THREE.Vector3(1, 1, 1);

  // 1D spacetime state
  private historyBuffers: Float32Array[] = [];
  private maxHistory: number = 128;

  // 3D lighting (added lazily for 3D mode)
  private ambientLight: THREE.AmbientLight | null = null;
  private directionalLight: THREE.DirectionalLight | null = null;

  // Grid lines overlay
  private gridLinesMesh: THREE.LineSegments | null = null;
  private gridLinesVisible: boolean = false;

  constructor(config: RendererConfig) {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(config.backgroundColor ?? 0x000000);

    // Orthographic camera (default; 3D viewports use an external PerspectiveCamera)
    this.camera = new THREE.OrthographicCamera(
      -config.width / 2,
      config.width / 2,
      config.height / 2,
      -config.height / 2,
      0.1,
      1000,
    );
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    // WebGL renderer
    this._renderer = new THREE.WebGLRenderer({
      canvas: config.canvas,
      antialias: config.antialias ?? true,
    });
    this._renderer.setSize(config.width, config.height);
  }

  /**
   * Initialize or reinitialize for a new simulation.
   * Creates InstancedMesh sized to the grid.
   */
  setSimulation(grid: Grid, preset: PresetConfig): void {
    // Clean up existing mesh
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.geometry.dispose();
      if (this.instancedMesh.material instanceof THREE.Material) {
        this.instancedMesh.material.dispose();
      }
      this.instancedMesh = null;
    }

    this.grid = grid;
    this.preset = preset;
    this.visualMapper = new VisualMapper(preset);
    this.historyBuffers = [];

    // Determine render mode
    if (preset.grid.dimensionality === '1d') {
      this.renderMode = '1d-spacetime';
    } else if (preset.grid.dimensionality === '3d') {
      this.renderMode = '3d';
    } else {
      this.renderMode = '2d';
    }

    // Create geometry: BoxGeometry for 3D voxels, PlaneGeometry for 1D/2D
    let geometry: THREE.BufferGeometry;
    if (this.renderMode === '3d') {
      geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    } else {
      geometry = new THREE.PlaneGeometry(1, 1);
    }

    // Material: MeshLambertMaterial for 3D (needs lighting), MeshBasicMaterial for 1D/2D
    let material: THREE.Material;
    if (this.renderMode === '3d') {
      material = new THREE.MeshLambertMaterial();
      this.setup3DLighting();
    } else {
      material = new THREE.MeshBasicMaterial();
      this.remove3DLighting();
    }

    // Instance count
    let instanceCount: number;
    if (this.renderMode === '1d-spacetime') {
      instanceCount = grid.config.width * this.maxHistory;
    } else {
      instanceCount = grid.cellCount;
    }

    // Create instanced mesh
    this.instancedMesh = new THREE.InstancedMesh(geometry, material, instanceCount);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Initialize instance positions
    this.initializePositions();

    // Initialize all colors to default
    this.initializeColors();

    this.scene.add(this.instancedMesh);

    // Recreate grid lines if they were visible
    if (this.gridLinesVisible) {
      this.createGridLines();
    }
  }

  /**
   * Set instance positions based on grid coordinates.
   */
  private initializePositions(): void {
    if (!this.instancedMesh || !this.grid) return;

    if (this.renderMode === '2d') {
      // 2D mode: position each cell at its (x, y) coordinate
      for (let i = 0; i < this.grid.cellCount; i++) {
        const [x, y] = this.grid.indexToCoord(i);
        this.tempPosition.set(x, y, 0);
        this.tempScale.set(1, 1, 1);
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        this.instancedMesh.setMatrixAt(i, this.tempMatrix);
      }
    } else if (this.renderMode === '3d') {
      // 3D mode: all instances start hidden (scale 0), update3D shows alive voxels
      this.tempScale.set(0, 0, 0);
      for (let i = 0; i < this.instancedMesh.count; i++) {
        this.tempPosition.set(0, 0, 0);
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        this.instancedMesh.setMatrixAt(i, this.tempMatrix);
      }
    } else {
      // 1D spacetime: initially all instances at origin with scale 0 (hidden)
      this.tempScale.set(0, 0, 0);
      for (let i = 0; i < this.instancedMesh.count; i++) {
        this.tempPosition.set(0, 0, 0);
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        this.instancedMesh.setMatrixAt(i, this.tempMatrix);
      }
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Initialize all instance colors to black.
   */
  private initializeColors(): void {
    if (!this.instancedMesh) return;
    this.tempColor.set(0x000000);
    for (let i = 0; i < this.instancedMesh.count; i++) {
      this.instancedMesh.setColorAt(i, this.tempColor);
    }
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Update instance matrices and colors from current grid state.
   * Reads typed arrays directly from Grid -- zero-copy (RNDR-12).
   */
  update(): void {
    if (!this.grid || !this.instancedMesh || !this.visualMapper) return;

    const colorProp = this.visualMapper.getPrimaryColorProperty();
    const sizeProp = this.visualMapper.getPrimarySizeProperty();

    if (this.renderMode === '3d') {
      this.update3D(colorProp);
    } else if (this.renderMode === '2d') {
      this.update2D(colorProp, sizeProp);
    } else {
      this.update1DSpacetime(colorProp);
    }
  }

  /**
   * Update 2D grid: read current buffer and apply visual mappings.
   * If colorR/G/B buffers have been written to (by tags/expressions), use direct RGB.
   * Otherwise fall back to VisualMapper discrete mapping.
   */
  private update2D(colorProp: string | null, sizeProp: string | null): void {
    if (!this.grid || !this.instancedMesh || !this.visualMapper) return;

    // Read from display buffer (returns locked snapshot during async compute, live buffer otherwise)
    const colorBuffer = colorProp ? this.grid.getDisplayBuffer(colorProp) : null;
    const sizeBuffer = sizeProp ? this.grid.getDisplayBuffer(sizeProp) : null;
    // Read alpha buffer if the grid has an alpha property
    const alphaBuffer = this.grid.hasProperty('alpha') ? this.grid.getDisplayBuffer('alpha') : null;

    // Direct RGB buffers (inherent properties — always exist)
    const colorR = this.grid.hasProperty('colorR') ? this.grid.getDisplayBuffer('colorR') : null;
    const colorG = this.grid.hasProperty('colorG') ? this.grid.getDisplayBuffer('colorG') : null;
    const colorB = this.grid.hasProperty('colorB') ? this.grid.getDisplayBuffer('colorB') : null;
    const hasDirectColor = colorR !== null && colorG !== null && colorB !== null;

    for (let i = 0; i < this.grid.cellCount; i++) {
      let r: number, g: number, b: number;

      // Check if this cell has direct RGB color set (by tags/expressions)
      // Only use direct RGB for "visible" cells — if the primary visual property
      // (e.g. alive) maps to 0, the cell is dead and should stay black.
      const primaryValue = colorBuffer ? colorBuffer[i] : 1;
      if (hasDirectColor && primaryValue > 0 && (colorR![i] + colorG![i] + colorB![i]) > 0.001) {
        r = colorR![i];
        g = colorG![i];
        b = colorB![i];
      } else if (colorBuffer && colorProp) {
        // Fall back to VisualMapper discrete mapping
        const value = colorBuffer[i];
        const color = this.visualMapper.getColor(colorProp, value);
        r = color.r;
        g = color.g;
        b = color.b;
      } else {
        r = 0;
        g = 0;
        b = 0;
      }

      // Apply alpha: multiply RGB toward black (premultiplied fade)
      if (alphaBuffer) {
        const a = Math.max(0, Math.min(1, alphaBuffer[i]));
        r *= a;
        g *= a;
        b *= a;
      }

      this.tempColor.set(r, g, b);
      this.instancedMesh.setColorAt(i, this.tempColor);

      // Size mapping: update instance matrix if needed
      if (sizeBuffer && sizeProp) {
        const value = sizeBuffer[i];
        const scale = this.visualMapper.getSize(sizeProp, value);
        const [x, y] = this.grid.indexToCoord(i);
        this.tempPosition.set(x, y, 0);
        this.tempScale.set(scale, scale, 1);
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        this.instancedMesh.setMatrixAt(i, this.tempMatrix);
      }
    }

    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
    if (sizeBuffer) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Update 1D spacetime diagram: snapshot current generation, rebuild display.
   */
  private update1DSpacetime(colorProp: string | null): void {
    if (!this.grid || !this.instancedMesh || !this.visualMapper || !colorProp) return;

    // Snapshot current generation buffer (use display buffer for locked state)
    const currentBuffer = this.grid.getDisplayBuffer(colorProp);
    const snapshot = new Float32Array(currentBuffer.length);
    snapshot.set(currentBuffer);

    // Add to history
    this.historyBuffers.push(snapshot);
    if (this.historyBuffers.length > this.maxHistory) {
      this.historyBuffers.shift();
    }

    const width = this.grid.config.width;
    const historyLen = this.historyBuffers.length;

    // Update all visible instances
    let instanceIdx = 0;
    for (let gen = 0; gen < historyLen; gen++) {
      const buffer = this.historyBuffers[gen];
      for (let x = 0; x < width; x++) {
        const value = buffer[x];
        const color = this.visualMapper.getColor(colorProp, value);
        this.instancedMesh.setColorAt(instanceIdx, color);

        // Position: x = cell index, y = generation (newest at top)
        this.tempPosition.set(x, historyLen - 1 - gen, 0);
        this.tempScale.set(1, 1, 1);
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        this.instancedMesh.setMatrixAt(instanceIdx, this.tempMatrix);

        instanceIdx++;
      }
    }

    // Hide remaining instances
    this.tempScale.set(0, 0, 0);
    for (let i = instanceIdx; i < this.instancedMesh.count; i++) {
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      this.instancedMesh.setMatrixAt(i, this.tempMatrix);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Update 3D voxel grid: only render alive (non-zero) cells as visible voxels.
   * Uses the same InstancedMesh path as 2D -- unified renderer (RNDR-04).
   */
  private update3D(colorProp: string | null): void {
    if (!this.grid || !this.instancedMesh || !this.visualMapper || !colorProp) return;

    const colorBuffer = this.grid.getCurrentBuffer(colorProp);
    let visibleIdx = 0;

    for (let i = 0; i < this.grid.cellCount; i++) {
      const value = colorBuffer[i];
      if (value !== 0) {
        const [x, y, z] = this.grid.indexToCoord(i);
        this.tempPosition.set(x, y, z);
        this.tempScale.set(1, 1, 1);
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        this.instancedMesh.setMatrixAt(visibleIdx, this.tempMatrix);

        const color = this.visualMapper.getColor(colorProp, value);
        this.instancedMesh.setColorAt(visibleIdx, color);
        visibleIdx++;
      }
    }

    // Hide remaining instances
    this.tempScale.set(0, 0, 0);
    for (let i = visibleIdx; i < this.instancedMesh.count; i++) {
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      this.instancedMesh.setMatrixAt(i, this.tempMatrix);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Add ambient and directional lighting for 3D mode.
   */
  private setup3DLighting(): void {
    if (!this.ambientLight) {
      this.ambientLight = new THREE.AmbientLight(0x404040);
      this.scene.add(this.ambientLight);
    }
    if (!this.directionalLight) {
      this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      this.directionalLight.position.set(1, 1.5, 1);
      this.scene.add(this.directionalLight);
    }
  }

  /**
   * Remove 3D lighting when switching back to 2D mode.
   */
  private remove3DLighting(): void {
    if (this.ambientLight) {
      this.scene.remove(this.ambientLight);
      this.ambientLight = null;
    }
    if (this.directionalLight) {
      this.scene.remove(this.directionalLight);
      this.directionalLight = null;
    }
  }

  /**
   * Render one frame.
   */
  render(): void {
    if (this._renderer) {
      this._renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Render one frame with an external camera (used by multi-viewport and 3D orbit camera).
   */
  renderWithCamera(camera: THREE.Camera): void {
    if (this._renderer) {
      this._renderer.render(this.scene, camera);
    }
  }

  /**
   * Resize the renderer and update camera aspect.
   */
  resize(width: number, height: number): void {
    if (this._renderer) {
      this._renderer.setSize(width, height);
    }
  }

  /**
   * Dispose all GPU resources. Must be called on component unmount (RNDR-11).
   */
  dispose(): void {
    this.removeGridLines();
    disposeObject(this.scene);
    if (this._renderer) {
      disposeRenderer(this._renderer);
      this._renderer = null;
    }
    this.instancedMesh = null;
    this.grid = null;
    this.preset = null;
    this.visualMapper = null;
    this.historyBuffers = [];
  }

  /**
   * Get renderer memory info for leak verification.
   */
  getMemoryInfo(): { geometries: number; textures: number } {
    if (!this._renderer) {
      return { geometries: 0, textures: 0 };
    }
    return {
      geometries: this._renderer.info.memory.geometries,
      textures: this._renderer.info.memory.textures,
    };
  }

  /**
   * Get the current render mode.
   */
  getRenderMode(): GridRenderMode {
    return this.renderMode;
  }

  /**
   * Get the max history depth for 1D spacetime diagrams.
   */
  getMaxHistory(): number {
    return this.maxHistory;
  }

  /**
   * Set the max history depth for 1D spacetime diagrams.
   */
  setMaxHistory(depth: number): void {
    this.maxHistory = Math.max(1, depth);
  }

  /**
   * Show or hide grid lines overlay.
   */
  setGridLines(visible: boolean): void {
    this.gridLinesVisible = visible;
    if (visible && !this.gridLinesMesh && this.grid) {
      this.createGridLines();
    }
    if (this.gridLinesMesh) {
      this.gridLinesMesh.visible = visible;
    }
  }

  /**
   * Create grid lines geometry for the current grid.
   */
  private createGridLines(): void {
    if (!this.grid) return;
    this.removeGridLines();

    const { width, height } = this.grid.config;
    const points: number[] = [];

    // Vertical lines
    for (let x = -0.5; x <= width - 0.5; x++) {
      points.push(x, -0.5, 0.01, x, height - 0.5, 0.01);
    }
    // Horizontal lines
    for (let y = -0.5; y <= height - 0.5; y++) {
      points.push(-0.5, y, 0.01, width - 0.5, y, 0.01);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.3 });
    this.gridLinesMesh = new THREE.LineSegments(geometry, material);
    this.gridLinesMesh.visible = this.gridLinesVisible;
    this.scene.add(this.gridLinesMesh);
  }

  /**
   * Remove grid lines from the scene.
   */
  private removeGridLines(): void {
    if (this.gridLinesMesh) {
      this.scene.remove(this.gridLinesMesh);
      this.gridLinesMesh.geometry.dispose();
      if (this.gridLinesMesh.material instanceof THREE.Material) {
        this.gridLinesMesh.material.dispose();
      }
      this.gridLinesMesh = null;
    }
  }
}
