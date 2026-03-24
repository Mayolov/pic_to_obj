/**
 * viewer.js
 * Owns the Three.js scene, camera, renderer, and render loop.
 * Call initThree() once and keep the returned handles.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Initialise the Three.js renderer inside `canvas` and observe `wrapEl` for
 * resize events. Returns the live scene/camera/controls handles used by other
 * modules.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement}       wrapEl  - parent element whose size drives the viewport
 * @returns {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera,
 *             renderer: THREE.WebGLRenderer, controls: OrbitControls }}
 */
export function initThree(canvas, wrapEl) {
  const W = wrapEl.clientWidth;
  const H = wrapEl.clientHeight;

  // ── Scene ──────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141420);

  // ── Camera ─────────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(48, W / H, 0.01, 200);
  camera.position.set(0, 0, 3);

  // ── Renderer ───────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  // ── Orbit controls ─────────────────────────────────────────────────────────
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance   = 0.3;
  controls.maxDistance   = 20;

  // ── Lighting ───────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
  keyLight.position.set(1, 1.5, 2.5);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x8090cc, 0.4);
  fillLight.position.set(-2, -1, -1);
  scene.add(fillLight);

  // ── Render loop ────────────────────────────────────────────────────────────
  (function loop() {
    requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  })();

  // ── Responsive resize ──────────────────────────────────────────────────────
  new ResizeObserver(() => {
    const W = wrapEl.clientWidth;
    const H = wrapEl.clientHeight;
    if (!W || !H) return;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  }).observe(wrapEl);

  return { scene, camera, renderer, controls };
}
