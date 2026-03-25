/**
 * depth-anything.js
 * Mode 2 — Enhanced depth estimation using Depth Anything V2 via
 * Transformers.js. Produces a significantly better depth map than the
 * TF.js ARPortraitDepth model for general objects.
 *
 * First call to loadDepthAnything() downloads ~50 MB of ONNX weights from
 * HuggingFace and caches them in the browser's Cache API.
 *
 * Output interface is identical to depth.js so mesh.js can be reused as-is.
 */

import { pipeline, env } from '@huggingface/transformers';

// Use remote HuggingFace models (required for static hosting)
env.allowLocalModels  = false;
env.useBrowserCache   = true;   // cache ONNX weights after first download

let depthPipeline = null;

/**
 * Download and initialise the Depth Anything V2 Small model.
 * Call once; subsequent calls are no-ops.
 *
 * @returns {Promise<void>}
 * @throws  {Error} if the model or Transformers.js cannot be loaded
 */
export async function loadDepthAnything() {
  if (depthPipeline) return;   // already loaded

  depthPipeline = await pipeline(
    'depth-estimation',
    'onnx-community/depth-anything-v2-small-hf',
    { dtype: 'fp32' },          // fp32 for maximum compatibility across browsers
  );
}

/**
 * Estimate per-pixel depth for `imgEl` using Depth Anything V2.
 * Must call loadDepthAnything() first.
 *
 * @param {HTMLImageElement}   imgEl
 * @param {HTMLCanvasElement}  procCanvas  - off-screen scratch canvas
 * @returns {Promise<{ data: Float32Array, w: number, h: number }>}
 */
export async function estimateDepthAnything(imgEl, procCanvas) {
  if (!depthPipeline) {
    throw new Error('Depth Anything model not loaded. Call loadDepthAnything() first.');
  }

  // ── 1. Produce a blob URL from the image ──────────────────────────────────
  // Transformers.js accepts an image URL, HTMLImageElement, or HTMLCanvasElement.
  // We pass the canvas directly (version ≥ 3 supports this).
  const INPUT_SIZE = 518;   // Depth Anything V2 native input size
  procCanvas.width  = INPUT_SIZE;
  procCanvas.height = INPUT_SIZE;
  procCanvas.getContext('2d').drawImage(imgEl, 0, 0, INPUT_SIZE, INPUT_SIZE);

  // ── 2. Run inference ──────────────────────────────────────────────────────
  // result.predicted_depth: Tensor2D [H, W] — raw (unnormalized) inverse depth
  const result = await depthPipeline(procCanvas);
  const tensor  = result.predicted_depth;

  // Tensor dims may be [H, W] or [1, H, W] depending on Transformers.js version
  const dims = tensor.dims ?? tensor.shape;
  const h    = dims[dims.length - 2];
  const w    = dims[dims.length - 1];
  const raw  = await tensor.data();   // Float32Array, row-major top→bottom

  // ── 3. Normalise to [0, 1] ────────────────────────────────────────────────
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] < min) min = raw[i];
    if (raw[i] > max) max = raw[i];
  }
  const range = max - min || 1;
  const data  = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    data[i] = (raw[i] - min) / range;
  }

  return { data, w, h };
}
