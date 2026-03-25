/**
 * api3d.js
 * Mode 3 — Tripo 3D API client.
 *
 * Converts 1–5 image Files into a downloadable GLB by:
 *   1. Uploading each image to get a file_token
 *   2. Creating a generation task (image_to_model or multiview_to_model)
 *   3. Polling until the task succeeds
 *   4. Fetching the resulting GLB blob
 *
 * Free tier: 2 000 credits on sign-up; each model costs 1 credit.
 * Get a key at https://platform.tripo3d.ai
 */

const TRIPO_ORIGIN = 'https://api.tripo3d.ai';
const API_PATH     = '/v2/openapi';

// Use a CORS proxy when running from a browser (Tripo's API does not send
// Access-Control-Allow-Origin headers, so direct browser→API calls are blocked).
// Set window.TRIPO_PROXY_URL to your own proxy if you have one (e.g. a
// Cloudflare Worker or local Express server).  The default uses the public
// allorigins service as a lightweight fallback.
function getBase() {
  if (typeof window !== 'undefined' && window.TRIPO_PROXY_URL) {
    return window.TRIPO_PROXY_URL;
  }
  return `${TRIPO_ORIGIN}${API_PATH}`;
}

const POLL_MS = 2500;   // poll interval

// Positional hints sent for multi-view tasks (up to 5 photos)
const POSITIONS = ['front', 'back', 'left', 'right', 'frontleft'];

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a 3D model from one or more images.
 *
 * @param {string}    apiKey      - Tripo 3D API key
 * @param {File[]}    imageFiles  - 1–5 image Files
 * @param {(msg: string, pct: number) => void} onProgress
 * @returns {Promise<Blob>}  GLB blob ready for display / download
 */
export async function generateFromImages(apiKey, imageFiles, onProgress) {
  if (!imageFiles.length) throw new Error('No images provided.');
  if (imageFiles.length > 5) throw new Error('Maximum 5 images supported.');

  // ── Step 1: Upload images ─────────────────────────────────────────────────
  onProgress('Uploading images…', 5);
  const tokens = await Promise.all(
    imageFiles.map((file, i) => uploadImage(apiKey, file, i, imageFiles.length, onProgress))
  );

  // ── Step 2: Create task ───────────────────────────────────────────────────
  onProgress('Submitting to Tripo 3D…', 30);
  const taskId = await createTask(apiKey, tokens, imageFiles);

  // ── Step 3: Poll ──────────────────────────────────────────────────────────
  const modelUrl = await pollUntilDone(apiKey, taskId, onProgress);

  // ── Step 4: Download GLB ──────────────────────────────────────────────────
  onProgress('Downloading model…', 95);
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  const blob = await response.blob();

  onProgress('Done!', 100);
  return blob;
}

// ── Private helpers ──────────────────────────────────────────────────────────

async function uploadImage(apiKey, file, index, total, onProgress) {
  const form = new FormData();
  form.append('file', file);

  const res = await tripoFetch(apiKey, 'POST', '/upload', form);
  const pct = 5 + Math.round(((index + 1) / total) * 20);
  onProgress(`Uploaded image ${index + 1} of ${total}…`, pct);
  return res.data.image_token;
}

async function createTask(apiKey, tokens, imageFiles) {
  const isSingle = tokens.length === 1;

  const body = isSingle
    ? {
        type: 'image_to_model',
        file: { type: imageFiles[0].type.includes('png') ? 'png' : 'jpg',
                file_token: tokens[0] },
        model_version: 'v2.5-20250123',
      }
    : {
        type: 'multiview_to_model',
        files: tokens.map((token, i) => ({
          type: imageFiles[i].type.includes('png') ? 'png' : 'jpg',
          file_token: token,
          position: POSITIONS[i],
        })),
        model_version: 'v2.5-20250123',
      };

  const res = await tripoFetch(apiKey, 'POST', '/task', body);
  return res.data.task_id;
}

async function pollUntilDone(apiKey, taskId, onProgress) {
  const TIMEOUT_MS = 5 * 60 * 1000;   // 5 min max
  const start      = Date.now();

  while (Date.now() - start < TIMEOUT_MS) {
    await sleep(POLL_MS);

    const res    = await tripoFetch(apiKey, 'GET', `/task/${taskId}`);
    const task   = res.data;
    const status = task.status;
    const pct    = status === 'running' ? Math.min(30 + Math.round((task.progress ?? 0) * 0.6), 90) : 30;

    if (status === 'success') {
      const url = task.output?.model ?? task.output?.pbr_model ?? task.output?.base_model;
      if (!url) throw new Error('Task succeeded but no model URL found in response.');
      return url;
    }

    if (status === 'failed' || status === 'cancelled') {
      throw new Error(`Tripo 3D task ${status}: ${task.message ?? 'unknown error'}`);
    }

    // still queued / running
    const label = status === 'queued' ? 'Queued — waiting for GPU…' : `Processing… ${Math.round((task.progress ?? 0) * 100)}%`;
    onProgress(label, pct);
  }

  throw new Error('Timed out waiting for Tripo 3D (5 min limit).');
}

async function tripoFetch(apiKey, method, path, body) {
  const isForm = body instanceof FormData;
  const url    = `${getBase()}${path}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // Only set Content-Type for non-FormData, non-GET requests
        ...(!isForm && method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch (networkErr) {
    // fetch() itself throws on network/CORS errors — surface this clearly
    throw new Error(
      `Network error calling Tripo API (${method} ${path}). ` +
      `This is usually a CORS issue — the browser blocks direct API calls. ` +
      `Set window.TRIPO_PROXY_URL to a CORS proxy, or run a local proxy server. ` +
      `(${networkErr.message})`
    );
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Tripo API returned non-JSON response (HTTP ${res.status}). Check your API key and proxy URL.`);
  }

  if (!res.ok || json.code !== 0) {
    const msg = json.message ?? json.error ?? `HTTP ${res.status}`;
    throw new Error(`Tripo API error: ${msg}`);
  }
  return json;
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }
