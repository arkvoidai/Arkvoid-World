import * as THREE from 'three';
import { Wanderer, type FormId } from '@/engine/actors/Wanderer';

const cachedThumbnails = new Map<number, string>();
let isPrewarming = false;

/**
 * Renders a 256x256 thumbnail of a Wanderer form to an offscreen WebGL target once, cached.
 */
export function renderFormThumbnail(form: FormId): string {
  if (cachedThumbnails.has(form)) {
    return cachedThumbnails.get(form)!;
  }

  if (typeof document === 'undefined') {
    return '';
  }

  try {
    const width = 256;
    const height = 256;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
    // Position to frame the upper torso and head of the figure
    camera.position.set(0, 1.25, 2.3);
    camera.lookAt(0, 1.05, 0);

    // Warm key light and soft ambient
    const keyLight = new THREE.DirectionalLight('#FFF2DE', 2.8);
    keyLight.position.set(1.5, 3.0, 2.0);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#D8D0E8', 1.2);
    fillLight.position.set(-2.0, 1.5, -1.0);
    scene.add(fillLight);

    const hemiLight = new THREE.HemisphereLight('#FAF7F2', '#E2DCD2', 1.0);
    scene.add(hemiLight);

    const wanderer = new Wanderer({
      form,
      leaning: 'dawn',
      castShadow: false,
    });
    wanderer.position.set(0, 0, 0);
    wanderer.rotation.y = 0.35; // gentle angle
    scene.add(wanderer);

    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');

    cachedThumbnails.set(form, dataUrl);

    // Cleanup resources
    wanderer.dispose();
    renderer.dispose();
    renderer.forceContextLoss();

    return dataUrl;
  } catch (err) {
    console.warn('Arkvoid form thumbnail generation fallback:', err);
    return '';
  }
}

/**
 * Prewarm all 4 form thumbnails during Step 1.
 */
export function prewarmFormThumbnails(): void {
  if (isPrewarming || typeof window === 'undefined') return;
  isPrewarming = true;
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => {
      for (let f = 0; f < 4; f++) {
        renderFormThumbnail(f as FormId);
      }
    });
  } else {
    setTimeout(() => {
      for (let f = 0; f < 4; f++) {
        renderFormThumbnail(f as FormId);
      }
    }, 50);
  }
}
