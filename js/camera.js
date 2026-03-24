/**
 * camera.js
 * Manages the camera-capture modal: requesting getUserMedia, displaying the
 * live preview, and snapping a frame on demand.
 *
 * All DOM interaction is injected via the options object so this module has
 * no direct dependency on the global document structure.
 */

/**
 * Wire up camera-capture behaviour.
 *
 * @param {{
 *   camBtn    : HTMLButtonElement,      // button that opens the modal
 *   camModal  : HTMLElement,            // overlay element
 *   camVideo  : HTMLVideoElement,       // live preview
 *   shutterBtn: HTMLButtonElement,      // capture button inside modal
 *   cancelBtn : HTMLButtonElement,      // cancel button inside modal
 *   onCapture : (img: HTMLImageElement) => void,  // called with snapshot
 *   onError   : (msg: string) => void,            // called on getUserMedia failure
 * }} opts
 */
export function initCamera({ camBtn, camModal, camVideo, shutterBtn, cancelBtn, onCapture, onError }) {
  let stream = null;

  // ── Open modal ─────────────────────────────────────────────────────────────
  camBtn.addEventListener('click', async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      });
      camVideo.srcObject = stream;
      camModal.classList.add('open');
    } catch {
      onError('Camera access denied or not available.');
    }
  });

  // ── Capture frame ──────────────────────────────────────────────────────────
  shutterBtn.addEventListener('click', () => {
    const snap = document.createElement('canvas');
    snap.width  = camVideo.videoWidth;
    snap.height = camVideo.videoHeight;
    snap.getContext('2d').drawImage(camVideo, 0, 0);

    stopCamera();

    const img = new Image();
    img.onload = () => onCapture(img);
    img.src = snap.toDataURL('image/jpeg', 0.92);
  });

  // ── Cancel ─────────────────────────────────────────────────────────────────
  cancelBtn.addEventListener('click', stopCamera);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function stopCamera() {
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    camVideo.srcObject = null;
    camModal.classList.remove('open');
  }
}
