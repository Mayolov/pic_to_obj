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
 * `ticks` is an array of `() => void` callbacks invoked every frame *before*
 * controls.update(). Push rotation or animation callbacks here.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement}       wrapEl  - parent element whose size drives the viewport
 * @returns {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera,
 *             renderer: THREE.WebGLRenderer, controls: OrbitControls,
 *             ticks: Array<() => void> }}
 */
export function initThree(canvas, wrapEl) {
  const W = wrapEl.clientWidth;
  const H = wrapEl.clientHeight;

  // ── Scene ──────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x17130F);   // matches --surface-1 token
  scene.fog = new THREE.FogExp2(0x17130F, 0.12);  // subtle depth fog

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
  scene.add(new THREE.AmbientLight(0xfff5e0, 0.7));   // warm ambient

  const keyLight = new THREE.DirectionalLight(0xfff0d0, 1.4);
  keyLight.position.set(1.5, 2, 2.5);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x8B6030, 0.5);
  fillLight.position.set(-2, -1, -1);
  scene.add(fillLight);

  // ── Grid floor ────────────────────────────────────────────────────────────
  // Warm subtle grid to ground objects and reinforce the 3-D space.
  const grid = new THREE.GridHelper(12, 18, 0x342B20, 0x211B14);
  grid.position.y = -1.4;
  scene.add(grid);

  // ── Per-frame tick callbacks ────────────────────────────────────────────────
  const ticks = [];

  // ── Render loop ────────────────────────────────────────────────────────────
  (function loop() {
    requestAnimationFrame(loop);
    ticks.forEach(fn => fn());
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

  return { scene, camera, renderer, controls, ticks };
}

/**
 * Create a warm-coloured torus knot to populate the viewer before the user
 * uploads a photo. The caller is responsible for adding it to the scene.
 *
 * @returns {THREE.Mesh}
 */
export function createDemoMesh() {
  const geometry = new THREE.TorusKnotGeometry(0.65, 0.22, 128, 16);
  const material = new THREE.MeshStandardMaterial({
    color:             new THREE.Color(0xC05A28),   // burnt orange
    roughness:         0.5,
    metalness:         0.15,
    emissive:          new THREE.Color(0x3D1A08),
    emissiveIntensity: 0.18,
  });
  return new THREE.Mesh(geometry, material);
}
