import type { Material, Object3D, Texture } from 'three';
import type { Disposable } from '@/engine/core/Presenter';

function disposeMaterial(material: Material): void {
  const record = material as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const val = record[key];
    if (
      val &&
      typeof val === 'object' &&
      'isTexture' in val &&
      (val as Texture).isTexture
    ) {
      (val as Texture).dispose();
    }
  }
  material.dispose();
}

export function disposeObject3D(root: Object3D): void {
  root.traverse((node) => {
    const meshLike = node as Object3D & {
      geometry?: { dispose: () => void };
      material?: Material | Material[];
      dispose?: () => void;
    };

    if (meshLike.geometry && typeof meshLike.geometry.dispose === 'function') {
      meshLike.geometry.dispose();
    }

    if (meshLike.material) {
      if (Array.isArray(meshLike.material)) {
        for (const mat of meshLike.material) {
          disposeMaterial(mat);
        }
      } else {
        disposeMaterial(meshLike.material);
      }
    }

    if (node !== root && typeof meshLike.dispose === 'function') {
      try {
        meshLike.dispose();
      } catch {
        // Ignore if already disposed
      }
    }
  });
  root.removeFromParent();
}

export class Disposables implements Disposable {
  private items: Array<Disposable | (() => void)> = [];

  add<T extends Disposable | (() => void)>(item: T): T {
    this.items.push(item);
    return item;
  }

  addObject3D<T extends Object3D>(obj: T): T {
    this.items.push(() => disposeObject3D(obj));
    return obj;
  }

  dispose(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (!item) continue;
      if (typeof item === 'function') {
        item();
      } else {
        item.dispose();
      }
    }
    this.items.length = 0;
  }
}
