/**
 * Three.js GPU resource disposal utilities.
 *
 * Three.js does NOT garbage-collect GPU resources automatically.
 * Every geometry, material, and texture must be explicitly disposed.
 * Without this, VRAM leaks accumulate and WebGL contexts get killed.
 *
 * This utility must exist BEFORE any dynamic scene content is created.
 */

import * as THREE from 'three';

/**
 * Dispose a material and all its textures.
 */
function disposeMaterial(material: THREE.Material): void {
  material.dispose();

  // Iterate all properties to find and dispose textures
  const mat = material as unknown as Record<string, unknown>;
  for (const key of Object.keys(mat)) {
    const value = mat[key];
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
}

/**
 * Recursively dispose all GPU resources in an Object3D hierarchy.
 *
 * Handles:
 * - Geometry disposal
 * - Single and array materials
 * - Textures found in material properties
 * - Nested children (full scene graph traversal)
 *
 * @param obj - The root Object3D to dispose (typically a Scene or Group)
 */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    // Handle Mesh (most common renderable)
    if (child instanceof THREE.Mesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }

      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(disposeMaterial);
        } else {
          disposeMaterial(child.material);
        }
      }
      return; // Don't process further — Mesh is fully handled
    }

    // Handle Line, Points, and other non-Mesh renderable objects
    const renderable = child as unknown as {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };

    if (renderable.geometry instanceof THREE.BufferGeometry) {
      renderable.geometry.dispose();
    }
    if (renderable.material) {
      if (Array.isArray(renderable.material)) {
        renderable.material.forEach(disposeMaterial);
      } else if (renderable.material instanceof THREE.Material) {
        disposeMaterial(renderable.material);
      }
    }
  });
}

/**
 * Dispose a WebGL renderer and release its GPU context.
 *
 * Calls renderer.dispose() then forces GPU release via WEBGL_lose_context.
 * Essential during Next.js hot-reload to prevent "Too many active WebGL contexts".
 *
 * @param renderer - The WebGLRenderer to dispose
 */
export function disposeRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.dispose();

  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_lose_context');
  if (ext) {
    ext.loseContext();
  }
}
