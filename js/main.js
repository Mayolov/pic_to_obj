/**
 * main.js
 * Application entry point.
 *
 * Responsibilities:
 *  - Boot: initialise Three.js viewer and load the depth model.
 *  - State: hold references to the active estimator and current mesh.
 *  - Orchestration: wire UI events to the depth → mesh → export pipeline.
 *  - Status: provide a single setStatus() helper consumed throughout the flow.
 *
 * This module intentionally contains no domain logic; all heavy lifting is
 * delegated to the specialised modules below.
 */

import { initThree }                     from './viewer.js';
import { loadModel, estimateDepth }      from './depth.js';
import { buildMesh, disposeMesh }        from './mesh.js';
import { downloadOBJ, downloadGLB }      from './export.js';
import { initCamera }                    from './camera.js';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const uploadLabel  = document.getElementById('upload-label');
const fileInput    = document.getElementById('file-input');
const camBtn       = document.getElementById('cam-btn');
const camModal     = document.getElementById('cam-modal');
const camVideo     = document.getElementById('cam-video');
const shutterBtn   = document.getElementById('shutter');
const cancelCamBtn = document.getElementById('cancel-cam');
const dlObjBtn     = document.getElementById('dl-obj');
const dlGlbBtn     = document.getElementById('dl-glb');
const viewerCanvas = document.getElementById('viewer');
const procCanvas   = document.getElementById('proc-canvas');
const statusEl     = document.getElementById('status');
const statusText   = document.getElementById('status-text');
const spinner      = document.getElementById('spinner');
const orbitHint    = document.getElementById('orbit-hint');

// ── App state ─────────────────────────────────────────────────────────────────
let estimator   = null;   // TF.js depth estimator (null → luminance fallback)
let currentMesh = null;   // active Three.js Mesh

// ── Three.js ──────────────────────────────────────────────────────────────────
const { scene, camera, controls } = initThree(
  viewerCanvas,
  viewerCanvas.parentElement,
);

// ── Camera capture ────────────────────────────────────────────────────────────
initCamera({
  camBtn,
  camModal,
  camVideo,
  shutterBtn,
  cancelBtn: cancelCamBtn,
  onCapture: (img) => processImage(img),
  onError:   (msg) => setStatus(msg, 'err'),
});

// ── File upload ───────────────────────────────────────────────────────────────
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  img.onerror = () => setStatus('Could not load image.', 'err');
  img.onload  = () => processImage(img);
  img.src     = URL.createObjectURL(file);

  fileInput.value = '';   // allow re-selecting the same file
});

// ── Download ──────────────────────────────────────────────────────────────────
dlObjBtn.addEventListener('click', () => {
  if (currentMesh) downloadOBJ(currentMesh);
});

dlGlbBtn.addEventListener('click', () => {
  if (!currentMesh) return;
  downloadGLB(currentMesh).catch((err) => {
    setStatus('GLB export failed: ' + err.message, 'err');
    console.error(err);
  });
});

// ── Core pipeline ─────────────────────────────────────────────────────────────

/**
 * Full photo-to-mesh pipeline for a single image element.
 * Runs: depth estimation → mesh build → enable downloads.
 *
 * @param {HTMLImageElement} imgEl
 */
async function processImage(imgEl) {
  // Ensure the image is fully decoded before processing
  if (!imgEl.complete || !imgEl.naturalWidth) {
    await new Promise((res) => { imgEl.onload = res; });
  }

  setStatus('Estimating depth…', 'busy');
  setDownloadsEnabled(false);
  orbitHint.classList.remove('show');

  try {
    const depthResult = await estimateDepth(estimator, imgEl, procCanvas);

    setStatus('Building mesh…', 'busy');

    // Dispose the previous mesh before creating a new one
    disposeMesh(currentMesh, scene);
    currentMesh = buildMesh({ depthResult, imgEl, scene, camera, controls });

    setStatus('Done! Drag to rotate, scroll to zoom.', 'ready');
    setDownloadsEnabled(true);
    orbitHint.classList.add('show');
  } catch (err) {
    setStatus('Error: ' + err.message, 'err');
    console.error(err);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

setInputsEnabled(false);
setStatus('Loading depth model (first load ~10 MB, cached after)…', 'busy');

loadModel()
  .then((est) => {
    estimator = est;
    setStatus('Ready — upload a photo or use camera.', 'ready');
  })
  .catch((err) => {
    console.warn('Depth model unavailable, using luminance fallback:', err);
    setStatus('Ready (luminance depth) — upload a photo or use camera.', 'ready');
  })
  .finally(() => {
    setInputsEnabled(true);
  });

// ── UI helpers ────────────────────────────────────────────────────────────────

function setStatus(msg, type = 'busy') {
  statusText.textContent   = msg;
  statusEl.className       = type;
  spinner.style.display    = (type === 'busy') ? '' : 'none';
}

function setInputsEnabled(enabled) {
  camBtn.disabled = !enabled;
  uploadLabel.classList.toggle('disabled', !enabled);
}

function setDownloadsEnabled(enabled) {
  dlObjBtn.disabled = !enabled;
  dlGlbBtn.disabled = !enabled;
}
