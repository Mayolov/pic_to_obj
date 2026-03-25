/**
 * main.js
 * Application entry point.
 *
 * Manages three 3D generation modes:
 *   basic    — TF.js ARPortraitDepth / luminance fallback (existing, fast)
 *   enhanced — Depth Anything V2 via Transformers.js (client-side, better quality)
 *   api      — Tripo 3D API (proper full 3D model from 1-5 photos)
 */

import * as THREE from 'three';
import { GLTFLoader }                    from 'three/addons/loaders/GLTFLoader.js';
import { initThree, createDemoMesh }     from './viewer.js';
import { loadModel, estimateDepth }      from './depth.js';
import { loadDepthAnything,
         estimateDepthAnything }         from './depth-anything.js';
import { buildMesh, disposeMesh }        from './mesh.js';
import { downloadOBJ, downloadGLB }      from './export.js';
import { initCamera }                    from './camera.js';
import { generateFromImages }            from './api3d.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const uploadLabel       = document.getElementById('upload-label');
const fileInput         = document.getElementById('file-input');
const camBtn            = document.getElementById('cam-btn');
const camModal          = document.getElementById('cam-modal');
const camVideo          = document.getElementById('cam-video');
const shutterBtn        = document.getElementById('shutter');
const cancelCamBtn      = document.getElementById('cancel-cam');
const dlObjBtn          = document.getElementById('dl-obj');
const dlGlbBtn          = document.getElementById('dl-glb');
const viewerCanvas      = document.getElementById('viewer');
const procCanvas        = document.getElementById('proc-canvas');
const statusEl          = document.getElementById('status');
const statusText        = document.getElementById('status-text');
const spinner           = document.getElementById('spinner');
const orbitHint         = document.getElementById('orbit-hint');
const viewerBadge       = document.getElementById('viewer-badge');
const limitationNote    = document.getElementById('limitation-note');
// Mode tabs
const modeBasic         = document.getElementById('mode-basic');
const modeEnhanced      = document.getElementById('mode-enhanced');
const modeApi           = document.getElementById('mode-api');
// Sections toggled by mode
const inputSection      = document.getElementById('input-section');
const apiKeySection     = document.getElementById('api-key-section');
const photoQueueSection = document.getElementById('photo-queue-section');
const tipMultiview      = document.getElementById('tip-multiview');
// API key
const apiKeyInput       = document.getElementById('api-key-input');
const apiKeyToggle      = document.getElementById('api-key-toggle');
const apiStatusEl       = document.getElementById('api-status');
const apiStatusText     = document.getElementById('api-status-text');
// Photo queue
const photoQueueGrid    = document.getElementById('photo-queue-grid');
const queueEmptyHint    = document.getElementById('queue-empty-hint');
const queueCount        = document.getElementById('queue-count');
const addPhotosLabel    = document.getElementById('add-photos-label');
const addPhotosInput    = document.getElementById('add-photos-input');
const generateBtn       = document.getElementById('generate-btn');
// Progress
const progressBarWrap   = document.getElementById('progress-bar-wrap');
const progressBar       = document.getElementById('progress-bar');

// ── Three.js ──────────────────────────────────────────────────────────────────
const { scene, camera, controls, ticks } = initThree(
  viewerCanvas,
  viewerCanvas.parentElement,
);

// Demo mesh (rotating torus knot shown before user uploads anything)
const demoMesh = createDemoMesh();
scene.add(demoMesh);
orbitHint.classList.add('show');
ticks.push(() => {
  if (!demoMesh.parent) return;
  demoMesh.rotation.x += 0.003;
  demoMesh.rotation.y += 0.006;
});

// ── App state ─────────────────────────────────────────────────────────────────
let currentMode    = 'basic';         // 'basic' | 'enhanced' | 'api'
let basicEstimator = null;            // TF.js estimator (null → luminance)
let daLoaded       = false;           // has Depth Anything been loaded?
let currentMesh    = null;            // active user mesh (modes 1 & 2)
let currentScene   = null;            // active GLTF scene group (mode 3)
let apiGlbBlob     = null;            // raw GLB blob from Tripo (mode 3 download)
const photoQueue   = [];              // File[] for mode 3

// ── Mode switching ────────────────────────────────────────────────────────────
function switchMode(mode) {
  currentMode = mode;

  // Update tab active state
  [modeBasic, modeEnhanced, modeApi].forEach(btn => {
    btn.classList.toggle('active', btn.id === `mode-${mode}`);
    btn.setAttribute('aria-selected', btn.id === `mode-${mode}`);
  });

  const isApi = mode === 'api';
  inputSection.classList.toggle('mode-hidden', isApi);
  apiKeySection.classList.toggle('visible', isApi);
  photoQueueSection.classList.toggle('visible', isApi);
  tipMultiview.style.display = isApi ? '' : 'none';

  // Limitation note changes per mode
  limitationNote.innerHTML = isApi
    ? '✓&nbsp; <strong>Full 3D mode:</strong> Tripo 3D will build a proper multi-view 3D model. Add 1–5 photos, enter your API key, then click Generate.'
    : '⚠&nbsp; <strong>Basic / Enhanced:</strong> depth-displaced plane mesh — not full photogrammetry. Switch to <strong>Full 3D</strong> for a proper multi-view model via Tripo AI.';

  // Lazy-load Depth Anything when entering enhanced mode
  if (mode === 'enhanced' && !daLoaded) {
    setStatus('Loading Depth Anything V2 (~50 MB, cached after first load)…', 'busy');
    setInputsEnabled(false);
    loadDepthAnything()
      .then(() => {
        daLoaded = true;
        setStatus('Enhanced model ready — upload a photo.', 'ready');
        setInputsEnabled(true);
      })
      .catch(err => {
        setStatus('Depth Anything failed to load: ' + err.message, 'err');
        setInputsEnabled(true);
      });
  }
}

modeBasic.addEventListener('click',    () => switchMode('basic'));
modeEnhanced.addEventListener('click', () => switchMode('enhanced'));
modeApi.addEventListener('click',      () => switchMode('api'));

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

// ── File upload (Modes 1 & 2) ─────────────────────────────────────────────────
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onerror = () => setStatus('Could not load image.', 'err');
  img.onload  = () => processImage(img);
  img.src     = URL.createObjectURL(file);
  fileInput.value = '';
});

// ── API key management (Mode 3) ───────────────────────────────────────────────
// Persist across refreshes
apiKeyInput.value = localStorage.getItem('tripo_api_key') ?? '';

apiKeyInput.addEventListener('input', () => {
  const key = apiKeyInput.value.trim();
  localStorage.setItem('tripo_api_key', key);
  updateGenerateBtn();
});

apiKeyToggle.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
});

// ── Photo queue (Mode 3) ──────────────────────────────────────────────────────
addPhotosInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files ?? []);
  const remaining = 5 - photoQueue.length;
  files.slice(0, remaining).forEach(addToQueue);
  addPhotosInput.value = '';
});

function addToQueue(file) {
  if (photoQueue.length >= 5) return;
  photoQueue.push(file);

  const url  = URL.createObjectURL(file);
  const wrap = document.createElement('div');
  wrap.className = 'photo-thumb-wrap';

  const img  = document.createElement('img');
  img.className = 'photo-thumb';
  img.src = url;
  img.alt = file.name;

  const rm   = document.createElement('button');
  rm.className = 'photo-thumb-remove';
  rm.textContent = '×';
  rm.title = 'Remove';
  rm.addEventListener('click', () => {
    const idx = photoQueue.indexOf(file);
    if (idx !== -1) photoQueue.splice(idx, 1);
    URL.revokeObjectURL(url);
    wrap.remove();
    updateQueueUI();
  });

  wrap.appendChild(img);
  wrap.appendChild(rm);

  // Insert before the empty hint (which we hide separately)
  photoQueueGrid.appendChild(wrap);
  updateQueueUI();
}

function updateQueueUI() {
  const n = photoQueue.length;
  queueCount.textContent = `${n} / 5`;
  queueEmptyHint.style.display = n === 0 ? '' : 'none';
  addPhotosLabel.classList.toggle('disabled', n >= 5);
  addPhotosInput.disabled = n >= 5;
  updateGenerateBtn();
}

function updateGenerateBtn() {
  const hasKey    = apiKeyInput.value.trim().length > 0;
  const hasPhotos = photoQueue.length > 0;
  generateBtn.disabled = !(hasKey && hasPhotos);
}

generateBtn.addEventListener('click', submitApiJob);

// ── Downloads ─────────────────────────────────────────────────────────────────
dlObjBtn.addEventListener('click', () => {
  if (currentMode === 'api') {
    // Re-export the loaded GLTF scene with OBJExporter
    if (currentScene) downloadOBJ(currentScene);
  } else {
    if (currentMesh) downloadOBJ(currentMesh);
  }
});

dlGlbBtn.addEventListener('click', () => {
  if (currentMode === 'api') {
    // Re-download the original GLB blob from Tripo
    if (apiGlbBlob) {
      const url = URL.createObjectURL(apiGlbBlob);
      Object.assign(document.createElement('a'), { href: url, download: 'model.glb' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
    return;
  }
  if (!currentMesh) return;
  downloadGLB(currentMesh).catch(err => {
    setStatus('GLB export failed: ' + err.message, 'err');
  });
});

// ── Core pipeline — Modes 1 & 2 ──────────────────────────────────────────────
async function processImage(imgEl) {
  if (!imgEl.complete || !imgEl.naturalWidth) {
    await new Promise(res => { imgEl.onload = res; });
  }

  setStatus('Estimating depth…', 'busy');
  setDownloadsEnabled(false);

  try {
    let depthResult;
    if (currentMode === 'enhanced') {
      depthResult = await estimateDepthAnything(imgEl, procCanvas);
    } else {
      depthResult = await estimateDepth(basicEstimator, imgEl, procCanvas);
    }

    setStatus('Building mesh…', 'busy');

    // Remove demo on first real photo
    if (demoMesh.parent) {
      scene.remove(demoMesh);
      demoMesh.geometry.dispose();
      demoMesh.material.dispose();
    }

    // Remove any previous GLTF scene from mode 3
    if (currentScene) { scene.remove(currentScene); currentScene = null; }

    disposeMesh(currentMesh, scene);
    currentMesh = buildMesh({ depthResult, imgEl, scene, camera, controls });

    setStatus('Done! Drag to rotate, scroll to zoom.', 'ready');
    setDownloadsEnabled(true);
    viewerBadge.textContent = `Your 3D mesh (${currentMode === 'enhanced' ? 'enhanced' : 'basic'})`;
    orbitHint.classList.add('show');
  } catch (err) {
    setStatus('Error: ' + err.message, 'err');
    console.error(err);
  }
}

// ── Core pipeline — Mode 3 (API) ──────────────────────────────────────────────
async function submitApiJob() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey || !photoQueue.length) return;

  generateBtn.disabled = true;
  generateBtn.classList.add('running');
  setDownloadsEnabled(false);
  progressBarWrap.style.display = '';
  setProgress(0);

  const onProgress = (msg, pct) => {
    apiStatusText.textContent = msg;
    apiStatusEl.className = 'busy';
    setProgress(pct);
  };

  try {
    const blob = await generateFromImages(apiKey, [...photoQueue], onProgress);
    apiGlbBlob = blob;

    apiStatusText.textContent = 'Loading model into viewer…';
    const group = await loadGLB(blob);

    // Remove demo / previous meshes
    if (demoMesh.parent) {
      scene.remove(demoMesh);
      demoMesh.geometry.dispose();
      demoMesh.material.dispose();
    }
    disposeMesh(currentMesh, scene);
    if (currentScene) scene.remove(currentScene);

    currentScene = group;
    scene.add(currentScene);

    camera.position.set(0, 0, 3);
    controls.target.set(0, 0, 0);
    controls.update();

    apiStatusEl.className = 'ready';
    apiStatusText.textContent = 'Model ready!';
    viewerBadge.textContent = 'Full 3D model — drag to rotate';
    orbitHint.classList.add('show');
    setDownloadsEnabled(true);
    setProgress(100);
    setTimeout(() => { progressBarWrap.style.display = 'none'; }, 1500);

  } catch (err) {
    apiStatusEl.className = 'err';
    apiStatusText.textContent = 'Error: ' + err.message;
    console.error(err);
    progressBarWrap.style.display = 'none';
  } finally {
    generateBtn.classList.remove('running');
    updateGenerateBtn();
  }
}

// ── GLTF loader helper ────────────────────────────────────────────────────────
function loadGLB(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    new GLTFLoader().load(
      url,
      (gltf) => {
        URL.revokeObjectURL(url);
        const group  = gltf.scene;
        const box    = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        const size   = box.getSize(new THREE.Vector3());
        group.position.sub(center);
        group.scale.setScalar(2 / Math.max(size.x, size.y, size.z));
        resolve(group);
      },
      undefined,
      (err) => { URL.revokeObjectURL(url); reject(err); },
    );
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
setInputsEnabled(false);
setStatus('Loading depth model…', 'busy');

loadModel()
  .then(est => {
    basicEstimator = est;
    setStatus('Ready — upload a photo or use camera.', 'ready');
  })
  .catch(err => {
    console.warn('Depth model unavailable, using luminance fallback:', err);
    setStatus('Ready (luminance depth) — upload a photo.', 'ready');
  })
  .finally(() => {
    setInputsEnabled(true);
    updateQueueUI();
  });

// ── UI helpers ────────────────────────────────────────────────────────────────
function setStatus(msg, type = 'busy') {
  statusText.textContent = msg;
  statusEl.className     = type;
  spinner.style.display  = type === 'busy' ? '' : 'none';
}

function setInputsEnabled(enabled) {
  camBtn.disabled = !enabled;
  uploadLabel.classList.toggle('disabled', !enabled);
}

function setDownloadsEnabled(enabled) {
  dlObjBtn.disabled = !enabled;
  dlGlbBtn.disabled = !enabled;
}

function setProgress(pct) {
  progressBar.style.width = `${pct}%`;
}
