//   js/dragDrop.js
//   Window‑level drag‑and‑drop handling for image files and image URLs,
//   with public‑CORS‑proxy fallbacks so most cross‑origin images can still
//   be loaded when the source server does not send Access‑Control‑Allow‑Origin.

// ----- Constants -----
const DRAG_TYPES = {
  FILES: 'Files',
  URI_LIST: 'text/uri-list',
  PLAIN: 'text/plain',
  HTML: 'text/html',
};

// Per‑attempt timeout for network requests. Long enough for large images on
// slow links, short enough that a dead proxy does not hang the UI.
const FETCH_TIMEOUT_MS = 10000;

// Public CORS proxies tried in order when a direct fetch is blocked.
// The first successful image response wins. Notes:
//   - wsrv.nl is an image‑focused CDN — the most reliable of the three for
//     binary image payloads, and the only one that reliably handles large files.
//   - codetabs / allorigins are general‑purpose relays used as fallbacks.
//   - corsproxy.io was removed: it now returns 401 without an API key.
//
// Caveat: URLs dropped by the user are relayed through these third parties.
// Images are still processed entirely client‑side; only the download of the
// source bytes is outsourced.
const CORS_PROXIES = [
  (url) => `https://wsrv.nl/?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

// ----- Helpers -----

/**
 * Determine whether a drag event carries content this app can consume:
 * OS files, or a URI / plain‑text URL (e.g. an image dragged from another page).
 *
 * @param {DragEvent} e
 * @returns {boolean}
 */
const isRelevantDrag = (e) => {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  const list = Array.from(types);
  return (
    list.includes(DRAG_TYPES.FILES) ||
    list.includes(DRAG_TYPES.URI_LIST) ||
    list.includes(DRAG_TYPES.PLAIN) ||
    list.includes(DRAG_TYPES.HTML)
  );
};

/**
 * Extract the first URI from a `text/uri-list` payload
 * (skips comments starting with '#' and blank lines, per RFC 2483)
 *
 * @param {string} raw
 * @returns {string|null}
 */
const firstUriFromList = (raw) => {
  if (!raw) return null;
  const line = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  return line || null;
};

/**
 * Extract the first image / link URL from a `text/html` payload.
 * Browsers attach this when an image or link is dragged from within a page;
 * it acts as a fallback when `text/uri-list` / `text/plain` are unavailable.
 *
 * @param {string} raw
 * @returns {string|null}
 */
const firstUrlFromHtml = (raw) => {
  if (!raw) return null;
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const img = doc.querySelector('img');
    if (img?.src) return img.src;
    const link = doc.querySelector('a');
    if (link?.href) return link.href;
    return null;
  } catch {
    return null;
  }
};

/**
 * Validate that a File is a non‑empty image
 *
 * @param {File|null|undefined} file
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateImageFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file detected. Please drop a valid image file.' };
  }
  if (file.size === 0) {
    return { valid: false, error: `"${file.name}" is empty (0 bytes).` };
  }
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: `"${file.name}" is not a valid image file.` };
  }
  return { valid: true };
};

/**
 * Whether a Blob looks like an image.
 * Accepts `application/octet-stream` as well, since some proxies strip or
 * genericise content‑type headers; the browser's image decoder will make the
 * final call when the File is loaded.
 *
 * @param {Blob} blob
 * @returns {boolean}
 */
const isImageBlob = (blob) => {
  if (!blob || blob.size === 0) return false;
  if (blob.type.startsWith('image/')) return true;
  return blob.type === 'application/octet-stream';
};

/**
 * Fetch a URL with an abort timeout.
 *
 * @param {string} url
 * @returns {Promise<Response>}
 */
const fetchWithTimeout = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { mode: 'cors', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Derive a reasonable filename from a URL.
 *
 * @param {string} url
 * @param {string} fallback
 * @returns {string}
 */
const filenameFromUrl = (url, fallback = 'dropped-image') => {
  try {
    const path = new URL(url).pathname;
    const base = decodeURIComponent(path.split('/').pop() || fallback);
    return base || fallback;
  } catch {
    return fallback;
  }
};

/**
 * Fetch a URL and wrap the response body in a File.
 *
 * @param {string} fetchUrl - The URL to actually fetch (may be a proxy)
 * @param {string} originalUrl - The URL the user dropped (used for naming)
 * @returns {Promise<File>}
 */
const fetchAsFile = async (fetchUrl, originalUrl) => {
  const res = await fetchWithTimeout(fetchUrl);
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}.`);
  }
  const blob = await res.blob();
  if (!isImageBlob(blob)) {
    throw new Error('The URL did not resolve to an image.');
  }
  return new File([blob], filenameFromUrl(originalUrl), { type: blob.type || 'image/png' });
};

/**
 * Turn a `data:` URL into a File without a network round‑trip.
 *
 * @param {string} dataUrl
 * @returns {Promise<File>}
 */
const fileFromDataUrl = async (dataUrl) => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('The data URL did not contain an image.');
  }
  const ext = blob.type.split('/')[1] || 'png';
  return new File([blob], `dropped-image.${ext}`, { type: blob.type });
};

/**
 * Turn a `blob:` URL into a File. Blob URLs are origin‑bound and therefore
 * fetch directly without any CORS concerns.
 *
 * @param {string} blobUrl
 * @returns {Promise<File>}
 */
const fileFromBlobUrl = async (blobUrl) => {
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('The blob URL did not contain an image.');
  }
  const ext = blob.type.split('/')[1] || 'png';
  return new File([blob], `dropped-image.${ext}`, { type: blob.type });
};

/**
 * Resolve a dropped URL into a File, trying multiple strategies so that any
 * publicly accessible image loads regardless of its CORS configuration.
 *
 * Order of attempts:
 *   1. `data:` URLs — decoded locally, no network
 *   2. `blob:` URLs — origin‑bound, fetch directly
 *   3. http(s) — direct fetch, then each CORS proxy in sequence
 *   4. Anything else (`file:`, `about:`, …) — rejected with a clear message,
 *      because browsers will not expose these bytes to an http(s) page
 *
 * @param {string} url
 * @returns {Promise<File>}
 */
const fileFromUrl = async (url) => {
  if (url.startsWith('data:')) return fileFromDataUrl(url);
  if (url.startsWith('blob:')) return fileFromBlobUrl(url);

  let parsed;
  try {
    parsed = new URL(url, window.location.href);
  } catch {
    throw new Error('The dropped URL is malformed.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      'That image can\'t be loaded from its current location. ' +
      'If it\'s on your device, drag the file directly from your OS file manager ' +
      '(Finder, Explorer, etc.) — not from a browser tab.'
    );
  }

  // 1) Direct fetch — fastest path when the server sends CORS headers
  try {
    return await fetchAsFile(url, url);
  } catch (directErr) {
    console.info('[ImgTemplate] Direct fetch failed; trying CORS proxies.', directErr.message);
  }

  // 2) Public CORS proxies — transparent workaround for blocked sources
  for (const makeProxyUrl of CORS_PROXIES) {
    const proxyUrl = makeProxyUrl(url);
    try {
      console.info('[ImgTemplate] Trying proxy:', proxyUrl);
      return await fetchAsFile(proxyUrl, url);
    } catch (proxyErr) {
      console.warn('[ImgTemplate] Proxy failed:', proxyUrl, proxyErr.message);
    }
  }

  throw new Error(
    'The image could not be loaded from its source or via any proxy. ' +
    'Save the image to your device, then drag the file in.'
  );
};

// ----- Public API -----

/**
 * Setup drag‑and‑drop handling for image files and image URLs.
 * Drops are accepted anywhere on the page; the drop zone is highlighted while
 * any relevant drag is active so the drop target stays obvious.
 *
 * @param {Object} options
 * @param {HTMLElement} options.dropZone - Element to apply the drag‑over style to
 * @param {Function} options.onFile - Invoked with the first dropped File
 * @param {Function} [options.onError] - Invoked with a human‑readable error string
 * @returns {Function} Cleanup function that removes all listeners
 */
export const setupDragAndDrop = ({ dropZone, onFile, onError = () => {} }) => {
  // Counter prevents the drag‑over style from flickering when the pointer
  // moves over child elements (a dragleave on the parent is paired with a
  // dragenter on the child; at window level both bubble through here).
  let dragDepth = 0;

  const handleDragEnter = (e) => {
    if (!isRelevantDrag(e)) return;
    e.preventDefault();
    dragDepth += 1;
    if (dragDepth === 1) dropZone.classList.add('drag-over');
  };

  const handleDragOver = (e) => {
    // Always prevent the browser's default (open the URI / file in a new tab).
    // This is what allows the drop target to receive the event at all.
    e.preventDefault();
    if (!isRelevantDrag(e)) return;
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e) => {
    if (!isRelevantDrag(e)) return;
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropZone.classList.remove('drag-over');
  };

  const handleDrop = async (e) => {
    // Always prevent the browser's default (navigate to the dropped URL).
    e.preventDefault();
    dragDepth = 0;
    dropZone.classList.remove('drag-over');

    const dt = e.dataTransfer;
    if (!dt) {
      console.error('[ImgTemplate] Drop event contained no dataTransfer.');
      onError('No data received. Please drop a valid image file.');
      return;
    }

    // 1) Prefer an actual File (OS file drops, same‑origin drags, etc.)
    const files = dt.files;
    if (files && files.length > 0) {
      if (files.length > 1) {
        console.warn('[ImgTemplate] Multiple files dropped – using the first only.');
        onError('Multiple files detected – only the first will be used.');
      }
      onFile(files[0]);
      return;
    }

    // 2) Fall back to a URL. Browsers may place the real image address in
    //    any of several flavours — try them all, in order of specificity.
    const rawCandidates = [
      firstUriFromList(dt.getData(DRAG_TYPES.URI_LIST)),
      firstUrlFromHtml(dt.getData(DRAG_TYPES.HTML)),
      (dt.getData(DRAG_TYPES.PLAIN) || '').trim(),
    ].filter(Boolean);

    // Browsers substitute `about:blank#blocked` for resources they refuse
    // to expose (e.g. a local file shown in another tab). Those entries are
    // unusable; skip them rather than surfacing a confusing error.
    const candidates = rawCandidates.filter((u) => !u.startsWith('about:'));

    if (candidates.length === 0) {
      console.error('[ImgTemplate] Drop event contained no usable URL.');
      if (rawCandidates.length > 0) {
        onError(
          'The dropped image is displayed in a browser tab, which the browser ' +
          'blocks for security. Drag the file directly from your OS file manager ' +
          '(Finder, Explorer, etc.) instead.'
        );
      } else {
        onError('No file or image URL detected. Please drop a valid image.');
      }
      return;
    }

    // Try every candidate until one succeeds.
    let lastError = null;
    for (const uri of candidates) {
      try {
        const file = await fileFromUrl(uri);
        onFile(file);
        return;
      } catch (err) {
        lastError = err;
        console.warn('[ImgTemplate] Candidate failed:', uri, err);
      }
    }

    onError(lastError?.message || 'The dropped image could not be loaded.');
  };

  // Window‑level listeners enable drops anywhere on the page
  window.addEventListener('dragenter', handleDragEnter);
  window.addEventListener('dragover', handleDragOver);
  window.addEventListener('dragleave', handleDragLeave);
  window.addEventListener('drop', handleDrop);

  return () => {
    window.removeEventListener('dragenter', handleDragEnter);
    window.removeEventListener('dragover', handleDragOver);
    window.removeEventListener('dragleave', handleDragLeave);
    window.removeEventListener('drop', handleDrop);
  };
};