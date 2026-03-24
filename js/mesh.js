/**
 * mesh.js
 * Converts a depth-map result into a textured Three.js Mesh and manages
 * its lifecycle (creation and disposal).
 */

import * as THREE from 'three';
import { DEPTH_RES, DEPTH_SCALE } from './constants.js';

/**
 * Build a depth-displaced PlaneGeometry mesh from a depth result and an image.
 * Adds the mesh to `scene` and repositions the camera to frame it.
 *
 * @param {{
 *   depthResult : { data: Float32Array, w: number, h: number },
 *   imgEl       : HTMLImageElement,
 *   scene       : THREE.Scene,
 *   camera      : THREE.PerspectiveCamera,
 *   controls    : import('three/addons/controls/OrbitControls.js').OrbitControls,
 * }} opts
 * @returns {THREE.Mesh}
 */
export function buildMesh({ depthResult, imgEl, scene, camera, controls }) {
  const { data, w, h } = depthResult;

  // Plane dimensions preserve the image aspect ratio
  const aspect = (imgEl.naturalWidth  || DEPTH_RES)
               / (imgEl.naturalHeight || DEPTH_RES);
  const planeW = 2 * aspect;
  const planeH = 2;

  // w×h grid of vertices; PlaneGeometry stores them row-major, top → bottom
  const geometry  = new THREE.PlaneGeometry(planeW, planeH, w - 1, h - 1);
  const positions = geometry.attributes.position.array;

  for (let i = 0; i < w * h; i++) {
    positions[i * 3 + 2] = data[i] * DEPTH_SCALE;   // Z = depth × scale
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();

  // Bake the original image (full resolution) into a canvas texture
  const texCanvas  = document.createElement('canvas');
  texCanvas.width  = imgEl.naturalWidth  || DEPTH_RES;
  texCanvas.height = imgEl.naturalHeight || DEPTH_RES;
  texCanvas.getContext('2d').drawImage(imgEl, 0, 0);

  const material = new THREE.MeshStandardMaterial({
    map:  new THREE.CanvasTexture(texCanvas),
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Frame the mesh in the viewport
  camera.position.set(0, 0, planeW * 1.25);
  controls.target.set(0, 0, 0);
  controls.update();

  return mesh;
}

/**
 * Remove `mesh` from `scene` and free all associated GPU resources.
 *
 * @param {THREE.Mesh|null} mesh
 * @param {THREE.Scene}     scene
 */
export function disposeMesh(mesh, scene) {
  if (!mesh) return;
  scene.remove(mesh);
  mesh.geometry.dispose();
  if (mesh.material.map) mesh.material.map.dispose();
  mesh.material.dispose();
}
