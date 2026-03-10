import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { disposeObject } from '../three-dispose';

describe('disposeObject', () => {
  it('TestDisposeObject_DisposesGeometry', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    const group = new THREE.Group();
    group.add(mesh);

    const geoDisposeSpy = vi.spyOn(geometry, 'dispose');
    const matDisposeSpy = vi.spyOn(material, 'dispose');

    disposeObject(group);

    expect(geoDisposeSpy).toHaveBeenCalledOnce();
    expect(matDisposeSpy).toHaveBeenCalledOnce();
  });

  it('TestDisposeObject_DisposesArrayMaterials', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mat1 = new THREE.MeshBasicMaterial();
    const mat2 = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, [mat1, mat2]);
    const group = new THREE.Group();
    group.add(mesh);

    const mat1Spy = vi.spyOn(mat1, 'dispose');
    const mat2Spy = vi.spyOn(mat2, 'dispose');

    disposeObject(group);

    expect(mat1Spy).toHaveBeenCalledOnce();
    expect(mat2Spy).toHaveBeenCalledOnce();
  });

  it('TestDisposeObject_DisposesTextures', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    const group = new THREE.Group();
    group.add(mesh);

    const texDisposeSpy = vi.spyOn(texture, 'dispose');

    disposeObject(group);

    expect(texDisposeSpy).toHaveBeenCalledOnce();
  });

  it('TestDisposeObject_HandlesEmptyObject', () => {
    const group = new THREE.Group();

    // Should not throw
    expect(() => disposeObject(group)).not.toThrow();
  });

  it('TestDisposeObject_TraversesDeepHierarchy', () => {
    // Create a 3-level hierarchy: root > child > grandchild
    const root = new THREE.Group();
    const child = new THREE.Group();
    const grandchildGeo = new THREE.BoxGeometry(1, 1, 1);
    const grandchildMat = new THREE.MeshBasicMaterial();
    const grandchild = new THREE.Mesh(grandchildGeo, grandchildMat);

    root.add(child);
    child.add(grandchild);

    const geoSpy = vi.spyOn(grandchildGeo, 'dispose');
    const matSpy = vi.spyOn(grandchildMat, 'dispose');

    disposeObject(root);

    expect(geoSpy).toHaveBeenCalledOnce();
    expect(matSpy).toHaveBeenCalledOnce();
  });

  it('TestDisposeObject_HandlesMultipleMeshes', () => {
    const group = new THREE.Group();
    const spies: ReturnType<typeof vi.spyOn>[] = [];

    for (let i = 0; i < 3; i++) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshBasicMaterial();
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);

      spies.push(vi.spyOn(geo, 'dispose'));
      spies.push(vi.spyOn(mat, 'dispose'));
    }

    disposeObject(group);

    for (const spy of spies) {
      expect(spy).toHaveBeenCalledOnce();
    }
  });
});
