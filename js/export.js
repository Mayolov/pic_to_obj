/**
 * export.js
 * Provides OBJ and GLB download functions for a Three.js Mesh.
 * Each function is independent — add new formats here without touching other modules.
 */

import { OBJExporter  } from 'three/addons/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/**
 * Serialise `mesh` to Wavefront OBJ text and trigger a browser download.
 * The OBJ contains vertex positions, normals, and UV coordinates.
 * Texture is not embedded (use GLB if you need the texture bundled).
 *
 * @param {THREE.Mesh} mesh
 */
export function downloadOBJ(mesh) {
  const text = new OBJExporter().parse(mesh);
  triggerDownload(new Blob([text], { type: 'text/plain' }), 'model.obj');
}

/**
 * Serialise `mesh` to binary GLTF (GLB) — texture included — and trigger a
 * browser download. Returns a Promise that resolves once the download is queued.
 *
 * @param {THREE.Mesh} mesh
 * @returns {Promise<void>}
 */
export function downloadGLB(mesh) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      mesh,
      (glb) => {
        triggerDownload(new Blob([glb], { type: 'model/gltf-binary' }), 'model.glb');
        resolve();
      },
      reject,
      { binary: true },
    );
  });
}

// ── Private helpers ──────────────────────────────────────────────────────────

/**
 * Create a temporary object URL, click an invisible anchor to download it,
 * then revoke the URL after a short delay.
 *
 * @param {Blob}   blob
 * @param {string} filename
 */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
