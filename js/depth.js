/**
 * depth.js
 * Handles loading the TF.js depth-estimation model and running inference.
 * Falls back to a BT.709 luminance estimate if the model is unavailable.
 */

import { DEPTH_RES } from './constants.js';

/**
 * Load the ARPortraitDepth model via the window.depthEstimation global exposed
 * by the @tensorflow-models/depth-estimation CDN script.
 *
 * @returns {Promise<object>} Resolves with the TF.js estimator instance.
 * @throws  {Error}          If the package or model is not available.
 */
export async function loadModel() {
  await tf.setBackend('webgl');
  await tf.ready();

  const de = window.depthEstimation;
  if (!de?.createEstimator || !de.SupportedModels) {
    throw new Error('depthEstimation package not found on window');
  }

  return de.createEstimator(
    de.SupportedModels.ARPortraitDepth,
    { outputDepthRange: [0, 1] },
  );
}

/**
 * Estimate per-pixel depth for the given image element.
 * Uses the TF.js estimator when available, otherwise falls back to luminance.
 *
 * @param {object|null}    estimator   - TF.js estimator (null → luminance fallback)
 * @param {HTMLImageElement} imgEl
 * @param {HTMLCanvasElement} procCanvas - off-screen scratch canvas
 * @returns {Promise<{ data: Float32Array, w: number, h: number }>}
 */
export async function estimateDepth(estimator, imgEl, procCanvas) {
  // Draw image into the processing canvas at the target resolution
  procCanvas.width  = DEPTH_RES;
  procCanvas.height = DEPTH_RES;
  procCanvas.getContext('2d').drawImage(imgEl, 0, 0, DEPTH_RES, DEPTH_RES);

  if (estimator) {
    try {
      const depthMap = await estimator.estimateDepth(procCanvas, { minDepth: 0, maxDepth: 1 });
      const tensor   = depthMap.depthTensor;
      const h        = tensor.shape[0];
      const w        = tensor.shape[1];
      const data     = await tensor.data();   // Float32Array, row-major top→bottom
      tensor.dispose();
      return { data, w, h };
    } catch (err) {
      console.warn('TF.js depth estimation threw — falling back to luminance:', err);
    }
  }

  return luminanceDepth(procCanvas);
}

// ── Private helpers ──────────────────────────────────────────────────────────

/**
 * Generate a pseudo-depth map from the BT.709 luma of the canvas contents.
 * Brighter areas are treated as "closer" (higher depth value).
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {{ data: Float32Array, w: number, h: number }}
 */
function luminanceDepth(canvas) {
  const ctx  = canvas.getContext('2d');
  const { data: px, width: w, height: h } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = new Float32Array(w * h);

  for (let i = 0; i < data.length; i++) {
    data[i] = 0.2126 * (px[i * 4]     / 255)
            + 0.7152 * (px[i * 4 + 1] / 255)
            + 0.0722 * (px[i * 4 + 2] / 255);
  }

  return { data, w, h };
}
