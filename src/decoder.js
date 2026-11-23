import DecoderWorker from "./worker/decoder.js?worker";
import {
  openDecodeGallery,
  refreshOpenDecodeGallery,
} from "./decode-gallery.js";
import {
  loadAll,
  save,
  deleteById,
  clearAll,
} from "./decode-history-store.js";
import { showConfirmDialog } from "./confirm-dialog.js";

const audioInput = document.getElementById("audioInput");
const microphoneStartButton = document.getElementById("microphoneStartButton");
const microphoneStopButton = document.getElementById("microphoneStopButton");
const feedbackSuppressionButton = document.getElementById("feedbackSuppressionButton");
const microphoneStatus = document.getElementById("microphoneStatus");
const decodeAudioPlayback = document.getElementById("decodeAudioPlayback");
const playAudioWhileDecoding = document.getElementById("playAudioWhileDecoding");
const dropZone = document.getElementById("dropZone");
const audioFileNameDisplay = document.getElementById("audioFileNameDisplay");
const canvas = document.getElementById("sstvCanvas");
const ctx = canvas.getContext("2d");
const qualitySelect = document.getElementById("qualitySelect");
const decodeButton = document.getElementById("decodeButton");
const downloadImageButton = document.getElementById("downloadImageButton");
const feedbackCard = document.getElementById("feedbackCard");
const errorMessage = document.getElementById("errorMessage");
const CONTACT_URL = "https://erikraft.com/";
const MAX_AUDIO_FILE_SIZE = 50 * 1024 * 1024;
const MAX_AUDIO_DURATION_SECONDS = 600;
const MAX_AUDIO_SAMPLE_COUNT = 30_000_000;
const ALLOWED_AUDIO_EXTENSIONS = /\.(wav|mp3|ogg|opus|webm|m4a|aac|flac|aif|aiff)$/i;

let currentAudioUrl = null;
let audioLoadGeneration = 0;
let microphoneStream = null;
let microphoneRecorder = null;
let microphoneChunks = [];
let microphoneBytes = 0;
let microphoneRecordingTooLarge = false;
let microphoneRecordingTimer = null;
let feedbackSuppressionEnabled = true;

function showErrorMessage(message) {
  const messageText = document.createElement("span");
  messageText.className = "error-message__text";
  messageText.textContent = String(message);

  const contactText = document.createElement("span");
  contactText.className = "error-message__contact";
  const contactLink = document.createElement("a");
  contactLink.href = CONTACT_URL;
  contactLink.target = "_blank";
  contactLink.rel = "noopener noreferrer";
  contactLink.textContent = "contact me";
  contactText.append(
    "If you think this should work, feel free to ",
    contactLink,
    "."
  );

  errorMessage.replaceChildren(messageText, contactText);
  errorMessage.style.display = "block";
}

function hideErrorMessage() {
  errorMessage.style.display = "none";
  errorMessage.textContent = "";
}
const decodeProgressSlot = document.getElementById("decodeProgressSlot");
const decodeProgress = document.getElementById("decodeProgress");
const decodeProgressFill = decodeProgress?.querySelector(".decode-progress__fill");
const sstvCanvasWrap = document.getElementById("sstvCanvasWrap");
const sstvCanvasOpen = document.getElementById("sstvCanvasOpen");
const decodeGallery = document.getElementById("decodeGallery");
const decodeGalleryList = document.getElementById("decodeGalleryList");
const clearDecodeHistoryBtn = document.getElementById("clearDecodeHistoryBtn");
const decodeProgressPercent = decodeProgress?.querySelector(
  ".decode-progress__percent"
);
const imageScrollHint = document.getElementById("imageScrollHint");
const imageScrollHintBtn = document.getElementById("imageScrollHintBtn");
const imageScrollHintProgress = imageScrollHint?.querySelector(
  ".scroll-hint__progress"
);

const HINT_VISIBLE_MS = 5500;
const HINT_EXIT_MS = 300;
const DECODE_PROGRESS_EXIT_MS = 550;
const IMAGE_VISIBILITY_THRESHOLD = 0.7;

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
);

let displayedDecodeProgress = 0;
let targetDecodeProgress = 0;
let decodeProgressRafId = null;
let decodeProgressHideTimer = null;
let decodeProgressHideGeneration = 0;

let currentSamples = null;
let currentSampleRate = null;
let currentSourceFileName = null;
/** @type {{ id: string, width: number, height: number, sourceFileName: string | null, objectUrl: string, blob: Blob, imageData?: ImageData }[]} */
const decodedImages = [];

let decodeHistoryReady = false;

function getDecodedImageDownloadName(sourceFileName) {
  const name = sourceFileName.split(/[/\\]/).pop() || "audio";
  const baseName = name.replace(/\.[^/.]+$/, "") || name;
  return `${baseName} - SSTV decoded.png`;
}
const decoderWorker = new DecoderWorker();

decodeButton.disabled = true;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clampDecodeProgress(percent) {
  return Math.max(0, Math.min(100, percent));
}

function applyDecodeProgressDisplay(percent) {
  if (!decodeProgress || !decodeProgressFill) return;

  const clamped = clampDecodeProgress(percent);
  decodeProgressFill.style.setProperty(
    "--decode-progress",
    String(clamped / 100)
  );
  decodeProgress.setAttribute("aria-valuenow", String(Math.round(clamped)));
  if (decodeProgressPercent) {
    decodeProgressPercent.textContent = `${Math.round(clamped)}%`;
  }
}

function stopDecodeProgressAnimation() {
  if (decodeProgressRafId !== null) {
    cancelAnimationFrame(decodeProgressRafId);
    decodeProgressRafId = null;
  }
}

function tickDecodeProgress() {
  const delta = targetDecodeProgress - displayedDecodeProgress;

  if (Math.abs(delta) < 0.5) {
    displayedDecodeProgress = targetDecodeProgress;
    applyDecodeProgressDisplay(displayedDecodeProgress);
    decodeProgressRafId = null;
    return;
  }

  displayedDecodeProgress += delta * 0.12;
  applyDecodeProgressDisplay(displayedDecodeProgress);
  decodeProgressRafId = requestAnimationFrame(tickDecodeProgress);
}

function setDecodeProgressTarget(percent) {
  targetDecodeProgress = clampDecodeProgress(percent);

  if (prefersReducedMotion.matches) {
    stopDecodeProgressAnimation();
    displayedDecodeProgress = targetDecodeProgress;
    applyDecodeProgressDisplay(displayedDecodeProgress);
    return;
  }

  if (decodeProgressRafId === null) {
    decodeProgressRafId = requestAnimationFrame(tickDecodeProgress);
  }
}

function resetDecodeProgress() {
  stopDecodeProgressAnimation();
  displayedDecodeProgress = 0;
  targetDecodeProgress = 0;
  applyDecodeProgressDisplay(0);
}

function clearDecodeProgressHideTimer() {
  if (decodeProgressHideTimer !== null) {
    clearTimeout(decodeProgressHideTimer);
    decodeProgressHideTimer = null;
  }
}

function showDecodeProgress({ reset = false } = {}) {
  if (!decodeProgress || !decodeProgressSlot) return;

  clearDecodeProgressHideTimer();
  decodeProgressHideGeneration += 1;

  if (reset) resetDecodeProgress();

  decodeProgress.classList.remove("decode-progress--leaving");
  decodeProgressSlot.classList.add("decode-progress-slot--open");
  decodeProgressSlot.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    decodeProgress.classList.add("decode-progress--visible");
  });
}

function hideDecodeProgress({ onComplete } = {}) {
  if (!decodeProgress || !decodeProgressSlot) return;
  if (!decodeProgressSlot.classList.contains("decode-progress-slot--open")) {
    onComplete?.();
    return;
  }

  const generation = ++decodeProgressHideGeneration;
  stopDecodeProgressAnimation();
  clearDecodeProgressHideTimer();
  decodeProgress.classList.remove("decode-progress--visible");
  decodeProgress.classList.add("decode-progress--leaving");
  decodeProgressSlot.classList.remove("decode-progress-slot--open");
  decodeProgressSlot.setAttribute("aria-hidden", "true");

  const finishHide = () => {
    if (generation !== decodeProgressHideGeneration) return;
    decodeProgress.classList.remove("decode-progress--leaving");
    resetDecodeProgress();
    onComplete?.();
  };

  const onTransitionEnd = (event) => {
    if (event.target !== decodeProgressSlot) return;
    if (event.propertyName !== "grid-template-rows") return;
    decodeProgressSlot.removeEventListener("transitionend", onTransitionEnd);
    if (decodeProgressHideTimer !== null) {
      clearTimeout(decodeProgressHideTimer);
      decodeProgressHideTimer = null;
    }
    finishHide();
  };

  decodeProgressSlot.addEventListener("transitionend", onTransitionEnd);
  decodeProgressHideTimer = setTimeout(() => {
    decodeProgressSlot.removeEventListener("transitionend", onTransitionEnd);
    decodeProgressHideTimer = null;
    finishHide();
  }, DECODE_PROGRESS_EXIT_MS + 50);
}

function hideDecodedCanvas() {
  if (!sstvCanvasWrap || decodedImages.length > 0) return;
  sstvCanvasWrap.classList.remove(
    "sstv-canvas-wrap--open",
    "sstv-canvas-wrap--entering"
  );
}

function imageDataToPngBlob(imageData) {
  const offscreen = new OffscreenCanvas(imageData.width, imageData.height);
  const offCtx = offscreen.getContext("2d");
  offCtx.putImageData(imageData, 0, 0);
  return offscreen.convertToBlob({ type: "image/png" }).then((blob) => {
    if (!blob) throw new Error("Failed to create image blob");
    return blob;
  });
}

async function blobToImageData(blob, width, height) {
  const bitmap = await createImageBitmap(blob);
  const offscreen = new OffscreenCanvas(width, height);
  const offCtx = offscreen.getContext("2d");
  offCtx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return offCtx.getImageData(0, 0, width, height);
}

function revokeEntry(entry) {
  URL.revokeObjectURL(entry.objectUrl);
}

function revokeAllDecodedImages() {
  for (const item of decodedImages) {
    revokeEntry(item);
  }
}

function removeEvictedFromMemory(evictedIds) {
  if (!evictedIds.length) return;
  const evicted = new Set(evictedIds);
  for (let i = decodedImages.length - 1; i >= 0; i--) {
    if (evicted.has(decodedImages[i].id)) {
      revokeEntry(decodedImages[i]);
      decodedImages.splice(i, 1);
    }
  }
}

function getLatestEntry() {
  return decodedImages[0] ?? null;
}

async function ensureLatestImageData() {
  const latest = getLatestEntry();
  if (!latest) return null;
  if (latest.imageData) return latest.imageData;
  latest.imageData = await blobToImageData(
    latest.blob,
    latest.width,
    latest.height
  );
  return latest.imageData;
}

async function showLatestOnCanvas() {
  const latest = getLatestEntry();
  if (!latest) return;

  const imgData = await ensureLatestImageData();
  canvas.width = latest.width;
  canvas.height = latest.height;
  ctx.putImageData(imgData, 0, 0);
}

function updateHistoryChrome() {
  if (!decodeGallery) return;
  decodeGallery.hidden = decodedImages.length === 0;
  if (clearDecodeHistoryBtn) {
    clearDecodeHistoryBtn.disabled = decodedImages.length === 0;
  }

  if (decodedImages.length === 0) {
    downloadImageButton.style.display = "none";
    feedbackCard.style.display = "none";
    hideDecodedCanvas();
    return;
  }

  downloadImageButton.style.display = "inline-flex";
  feedbackCard.style.display = "block";
  if (!sstvCanvasWrap?.classList.contains("sstv-canvas-wrap--open")) {
    revealDecodedCanvas();
  }
}

async function downloadDecodedEntry(entry) {
  if (!entry) return;

  const blob =
    entry.blob ??
    (entry === getLatestEntry()
      ? await imageDataToPngBlob(await ensureLatestImageData())
      : null);
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = entry.sourceFileName
    ? getDecodedImageDownloadName(entry.sourceFileName)
    : "SSTV decoded.png";
  a.click();
  URL.revokeObjectURL(url);
}

function openGalleryAt(index) {
  openDecodeGallery(decodedImages, index, {
    onDeleteImage: (id) => {
      removeDecodedImage(id);
    },
    onDownloadImage: (id) => {
      const entry = decodedImages.find((item) => item.id === id);
      downloadDecodedEntry(entry);
    },
  });
}

async function removeDecodedImage(id) {
  const index = decodedImages.findIndex((item) => item.id === id);
  if (index < 0) return;

  revokeEntry(decodedImages[index]);
  decodedImages.splice(index, 1);

  try {
    await deleteById(id);
  } catch (err) {
    console.error("Failed to delete decode from storage:", err);
  }

  if (decodedImages.length === 0) {
    updateHistoryChrome();
    renderDecodeGallery();
    refreshOpenDecodeGallery(decodedImages);
    return;
  }

  await showLatestOnCanvas();
  updateHistoryChrome();
  renderDecodeGallery();
  refreshOpenDecodeGallery(decodedImages);
}

async function clearDecodeHistory() {
  if (decodedImages.length === 0) return;

  const confirmed = await showConfirmDialog({
    title: "Clear decode history?",
    message:
      "Remove all decoded images from this browser. This cannot be undone.",
    confirmLabel: "Clear history",
    cancelLabel: "Cancel",
    danger: true,
  });
  if (!confirmed) return;

  revokeAllDecodedImages();
  decodedImages.length = 0;

  try {
    await clearAll();
  } catch (err) {
    console.error("Failed to clear decode history:", err);
  }

  updateHistoryChrome();
  renderDecodeGallery();
  refreshOpenDecodeGallery(decodedImages);
}

function createDeleteIconSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("decode-gallery__delete-icon");

  const line1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line1.setAttribute("d", "M4 4 L12 12");
  line1.setAttribute("stroke", "currentColor");
  line1.setAttribute("stroke-width", "2");
  line1.setAttribute("stroke-linecap", "round");

  const line2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line2.setAttribute("d", "M12 4 L4 12");
  line2.setAttribute("stroke", "currentColor");
  line2.setAttribute("stroke-width", "2");
  line2.setAttribute("stroke-linecap", "round");

  svg.append(line1, line2);
  return svg;
}

function renderDecodeGallery() {
  if (!decodeGalleryList) return;

  const previous = decodedImages.slice(1);
  decodeGalleryList.replaceChildren();

  for (let i = 0; i < previous.length; i++) {
    const entry = previous[i];
    const decodeIndex = i + 1;
    const decodeNumber = decodedImages.length - i - 1;

    const li = document.createElement("li");
    li.className = "decode-gallery__item";

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "decode-gallery__thumb-wrap";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "decode-gallery__btn";
    const label = entry.sourceFileName
      ? `Open ${entry.sourceFileName} in gallery`
      : `Open decode ${decodeNumber} in gallery`;
    btn.setAttribute("aria-label", label);
    if (entry.sourceFileName) btn.title = entry.sourceFileName;

    const thumb = document.createElement("img");
    thumb.src = entry.objectUrl;
    thumb.width = entry.width;
    thumb.height = entry.height;
    thumb.alt = "";
    thumb.className = "decode-gallery__thumb";

    const srOnly = document.createElement("span");
    srOnly.className = "decode-gallery__sr-only";
    srOnly.textContent = label;

    btn.append(thumb, srOnly);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "decode-gallery__delete";
    const deleteLabel = entry.sourceFileName
      ? `Remove ${entry.sourceFileName} from history`
      : `Remove decode ${decodeNumber} from history`;
    deleteBtn.setAttribute("aria-label", deleteLabel);
    deleteBtn.title = deleteLabel;
    deleteBtn.append(createDeleteIconSvg());
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      removeDecodedImage(entry.id);
    });

    btn.addEventListener("click", () => {
      openGalleryAt(decodeIndex);
    });

    thumbWrap.append(btn);
    li.append(thumbWrap, deleteBtn);
    decodeGalleryList.append(li);
  }

  decodeGalleryList.scrollLeft = 0;
}

window.addEventListener("beforeunload", revokeAllDecodedImages);

clearDecodeHistoryBtn?.addEventListener("click", () => {
  clearDecodeHistory();
});

sstvCanvasOpen?.addEventListener("click", () => {
  if (!decodedImages.length) return;
  openGalleryAt(0);
});

async function initDecodeHistory() {
  try {
    const records = await loadAll();
    for (const record of [...records].reverse()) {
      decodedImages.push({
        id: record.id,
        width: record.width,
        height: record.height,
        sourceFileName: record.sourceFileName,
        blob: record.blob,
        objectUrl: URL.createObjectURL(record.blob),
      });
    }

    if (decodedImages.length > 0) {
      await showLatestOnCanvas();
      updateHistoryChrome();
      renderDecodeGallery();
    }
  } catch (err) {
    console.error("Failed to load decode history:", err);
  } finally {
    decodeHistoryReady = true;
    if (currentSamples && currentSampleRate) {
      decodeButton.disabled = false;
    }
  }
}

initDecodeHistory();

function revealDecodedCanvas() {
  if (!sstvCanvasWrap) return;
  if (sstvCanvasWrap.classList.contains("sstv-canvas-wrap--open")) return;

  sstvCanvasWrap.classList.add("sstv-canvas-wrap--entering", "sstv-canvas-wrap--open");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      sstvCanvasWrap.classList.remove("sstv-canvas-wrap--entering");
    });
  });
}

function getImageVisibilityRatio(element) {
  const rect = element.getBoundingClientRect();
  const elementArea = rect.width * rect.height;
  if (elementArea <= 0) return 0;

  const visibleTop = Math.max(0, rect.top);
  const visibleBottom = Math.min(window.innerHeight, rect.bottom);
  const visibleLeft = Math.max(0, rect.left);
  const visibleRight = Math.min(window.innerWidth, rect.right);
  const visibleWidth = Math.max(0, visibleRight - visibleLeft);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);

  return (visibleWidth * visibleHeight) / elementArea;
}

function getScrollHintDirection(element) {
  const rect = element.getBoundingClientRect();
  const elementCenter = rect.top + rect.height / 2;
  return elementCenter < window.innerHeight / 2 ? "up" : "down";
}

function scrollToCenterElement(element, { duration = 800 } = {}) {
  const rect = element.getBoundingClientRect();
  const elementCenter = rect.top + rect.height / 2;
  const viewportCenter = window.innerHeight / 2;

  const maxScroll =
    document.documentElement.scrollHeight - window.innerHeight;
  const targetY = Math.max(
    0,
    Math.min(maxScroll, window.scrollY + elementCenter - viewportCenter)
  );

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo(0, targetY);
    return;
  }

  const startY = window.scrollY;
  const delta = targetY - startY;
  if (delta === 0) return;

  const start = performance.now();

  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    window.scrollTo(0, startY + delta * easeInOutCubic(t));
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

let hintDismissTimer = null;
let hintExitTimer = null;
let hintScrollTarget = null;
let hintIntersectionObserver = null;
let hintHideGeneration = 0;

function clearImageScrollHintTimers() {
  if (hintDismissTimer !== null) {
    clearTimeout(hintDismissTimer);
    hintDismissTimer = null;
  }
  if (hintExitTimer !== null) {
    clearTimeout(hintExitTimer);
    hintExitTimer = null;
  }
}

function disconnectImageScrollHintObserver() {
  if (hintIntersectionObserver) {
    hintIntersectionObserver.disconnect();
    hintIntersectionObserver = null;
  }
}

function restartHintProgressAnimation() {
  if (!imageScrollHintProgress) return;
  imageScrollHintProgress.style.animation = "none";
  void imageScrollHintProgress.offsetWidth;
  imageScrollHintProgress.style.animation = "";
}

function hideImageScrollHint({ immediate = false } = {}) {
  if (!imageScrollHint || imageScrollHint.hidden) return;

  const generation = ++hintHideGeneration;
  clearImageScrollHintTimers();
  disconnectImageScrollHintObserver();
  hintScrollTarget = null;

  const finishHide = () => {
    if (generation !== hintHideGeneration) return;
    imageScrollHint.classList.remove(
      "scroll-hint--leaving",
      "scroll-hint--visible",
      "scroll-hint--down"
    );
    imageScrollHint.hidden = true;
    imageScrollHintBtn?.setAttribute("tabindex", "-1");
  };

  if (immediate) {
    finishHide();
    return;
  }

  imageScrollHint.classList.remove("scroll-hint--visible");
  imageScrollHint.classList.add("scroll-hint--leaving");

  const onTransitionEnd = (event) => {
    if (event.target !== imageScrollHint || event.propertyName !== "opacity")
      return;
    imageScrollHint.removeEventListener("transitionend", onTransitionEnd);
    if (hintExitTimer !== null) {
      clearTimeout(hintExitTimer);
      hintExitTimer = null;
    }
    finishHide();
  };

  imageScrollHint.addEventListener("transitionend", onTransitionEnd);
  hintExitTimer = setTimeout(() => {
    imageScrollHint.removeEventListener("transitionend", onTransitionEnd);
    hintExitTimer = null;
    finishHide();
  }, HINT_EXIT_MS + 50);
}

function showImageScrollHint(target, direction) {
  if (!imageScrollHint || !imageScrollHintBtn) return;

  hintHideGeneration += 1;
  clearImageScrollHintTimers();
  disconnectImageScrollHintObserver();

  hintScrollTarget = target;
  imageScrollHint.hidden = false;
  imageScrollHint.classList.remove("scroll-hint--leaving");
  imageScrollHint.classList.toggle(
    "scroll-hint--down",
    direction === "down"
  );
  imageScrollHintBtn.setAttribute(
    "aria-label",
    direction === "down"
      ? "Scroll down to decoded image"
      : "Scroll up to decoded image"
  );
  imageScrollHintBtn.setAttribute("tabindex", "0");

  restartHintProgressAnimation();

  requestAnimationFrame(() => {
    imageScrollHint.classList.add("scroll-hint--visible");
    imageScrollHintBtn.focus({ preventScroll: true });
  });

  hintIntersectionObserver = new IntersectionObserver(
    (entries) => {
      if (
        entries.some(
          (entry) =>
            entry.intersectionRatio >= IMAGE_VISIBILITY_THRESHOLD
        )
      ) {
        hideImageScrollHint();
      }
    },
    { threshold: IMAGE_VISIBILITY_THRESHOLD }
  );
  hintIntersectionObserver.observe(target);

  hintDismissTimer = setTimeout(hideImageScrollHint, HINT_VISIBLE_MS);
}

function handlePostDecodeScroll(canvasEl) {
  if (getImageVisibilityRatio(canvasEl) >= IMAGE_VISIBILITY_THRESHOLD) return;
  showImageScrollHint(canvasEl, getScrollHintDirection(canvasEl));
}

imageScrollHintBtn?.addEventListener("click", () => {
  const target = hintScrollTarget;
  hideImageScrollHint({ immediate: true });
  if (target) scrollToCenterElement(target);
});

audioInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) void handleAudioFile(file);
});

dropZone.addEventListener("click", () => audioInput.click());

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("active");
});

dropZone.addEventListener("dragleave", () =>
  dropZone.classList.remove("active")
);

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("active");
  const file = event.dataTransfer.files?.[0];
  if (file) void handleAudioFile(file);
});

async function handleAudioFile(file) {
  const loadGeneration = ++audioLoadGeneration;
  currentSamples = null;
  currentSampleRate = null;
  decodeButton.disabled = true;
  decodeAudioPlayback.pause();
  decodeAudioPlayback.removeAttribute("src");
  decodeAudioPlayback.hidden = true;
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }

  if (!(file instanceof Blob) || file.size <= 0) {
    showErrorMessage("Choose a valid audio file.");
    return false;
  }

  if (file.size > MAX_AUDIO_FILE_SIZE) {
    showErrorMessage("Audio file is too large. The maximum supported size is 50 MB.");
    return false;
  }

  const fileName = typeof file.name === "string" ? file.name : "audio-recording";
  if (file.type && !file.type.startsWith("audio/") && !ALLOWED_AUDIO_EXTENSIONS.test(fileName)) {
    showErrorMessage("Choose a supported audio file.");
    return false;
  }
  if (!file.type && !ALLOWED_AUDIO_EXTENSIONS.test(fileName)) {
    showErrorMessage("Choose a supported audio file.");
    return false;
  }

  hideErrorMessage();
  decodeButton.disabled = true;
  currentSamples = null;
  currentSampleRate = null;
  currentSourceFileName = fileName;
  dropZone.classList.add("has-file");
  audioFileNameDisplay.replaceChildren(document.createTextNode("Selected file: "));
  const selectedFileName = document.createElement("span");
  selectedFileName.className = "font-medium text-app-accent";
  selectedFileName.textContent = fileName;
  audioFileNameDisplay.append(selectedFileName);

  const nextAudioUrl = URL.createObjectURL(file);
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    URL.revokeObjectURL(nextAudioUrl);
    showErrorMessage("This browser does not support Web Audio decoding.");
    return false;
  }

  let audioContext;
  try {
    audioContext = new AudioContextClass();
    const decoded = await audioContext.decodeAudioData(await file.arrayBuffer());
    if (loadGeneration !== audioLoadGeneration) {
      URL.revokeObjectURL(nextAudioUrl);
      return false;
    }
    if (
      !Number.isFinite(decoded.duration) ||
      decoded.duration <= 0 ||
      decoded.duration > MAX_AUDIO_DURATION_SECONDS
    ) {
      throw new Error("Audio exceeds the 10-minute decoding limit.");
    }

    const samples = decoded.getChannelData(0).slice();
    if (
      !Number.isInteger(decoded.sampleRate) ||
      decoded.sampleRate < 8000 ||
      decoded.sampleRate > 192000 ||
      samples.length > decoded.sampleRate * MAX_AUDIO_DURATION_SECONDS ||
      samples.length > MAX_AUDIO_SAMPLE_COUNT
    ) {
      throw new Error("Audio exceeds the supported sample limits.");
    }

    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = nextAudioUrl;
    decodeAudioPlayback.src = currentAudioUrl;
    decodeAudioPlayback.hidden = false;
    currentSamples = samples;
    currentSampleRate = decoded.sampleRate;

    if (decodeHistoryReady) decodeButton.disabled = false;
    if (microphoneStatus) microphoneStatus.textContent = "Audio ready. Press Decode SSTV to start.";
    return true;
  } catch (error) {
    URL.revokeObjectURL(nextAudioUrl);
    if (loadGeneration !== audioLoadGeneration) return false;
    console.error("Error decoding audio file:", error);
    showErrorMessage(error instanceof Error ? error.message : "Failed to decode the audio file.");
    return false;
  } finally {
    await audioContext?.close().catch(() => {});
  }
}

function updateMicrophoneControls(isRecording) {
  if (microphoneStartButton) microphoneStartButton.disabled = isRecording;
  if (microphoneStopButton) microphoneStopButton.disabled = !isRecording;
}

function stopMicrophoneTracks() {
  if (microphoneRecordingTimer !== null) {
    clearTimeout(microphoneRecordingTimer);
    microphoneRecordingTimer = null;
  }
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
}

async function startMicrophoneCapture() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    showErrorMessage("Microphone recording is not supported by this browser. Use HTTPS or localhost and a modern browser.");
    return;
  }

  try {
    microphoneStartButton.disabled = true;
    if (microphoneStatus) microphoneStatus.textContent = "Requesting microphone permission…";

    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: feedbackSuppressionEnabled,
        noiseSuppression: feedbackSuppressionEnabled,
        autoGainControl: feedbackSuppressionEnabled,
        channelCount: 1,
      },
    });

    const mimeCandidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    const mimeType =
      typeof MediaRecorder.isTypeSupported === "function"
        ? mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type))
        : null;
    microphoneRecorder = new MediaRecorder(
      microphoneStream,
      mimeType ? { mimeType } : undefined
    );
    microphoneChunks = [];
    microphoneBytes = 0;
    microphoneRecordingTooLarge = false;

    microphoneRecorder.addEventListener("dataavailable", (event) => {
      if (!event.data || event.data.size <= 0) return;
      microphoneBytes += event.data.size;
      if (microphoneBytes > MAX_AUDIO_FILE_SIZE) {
        microphoneRecordingTooLarge = true;
        if (microphoneRecorder?.state === "recording") microphoneRecorder.stop();
        return;
      }
      microphoneChunks.push(event.data);
    });

    microphoneRecorder.addEventListener("error", (event) => {
      showErrorMessage(event.error?.message || "Microphone recording failed.");
      stopMicrophoneTracks();
      updateMicrophoneControls(false);
    });

    microphoneRecorder.addEventListener("stop", async () => {
      stopMicrophoneTracks();
      updateMicrophoneControls(false);

      if (microphoneRecordingTooLarge) {
        showErrorMessage("Microphone recording exceeded the 50 MB limit.");
        if (microphoneStatus) microphoneStatus.textContent = "Recording stopped: size limit reached.";
        return;
      }

      const mime = microphoneRecorder?.mimeType || microphoneChunks[0]?.type || "audio/webm";
      const recording = new Blob(microphoneChunks, { type: mime });
      microphoneChunks = [];
      if (!recording.size) {
        showErrorMessage("No microphone audio was captured.");
        return;
      }

      const extension = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
      const file = new File([recording], `microphone-recording.${extension}`, { type: mime });
      const loaded = await handleAudioFile(file);
      if (loaded) decodeButton.click();
    });

    microphoneRecorder.start(250);
    updateMicrophoneControls(true);
    if (microphoneStatus) microphoneStatus.textContent = "Recording from microphone… Press Stop & decode when finished.";
    microphoneRecordingTimer = window.setTimeout(() => {
      if (microphoneRecorder?.state === "recording") microphoneRecorder.stop();
    }, MAX_AUDIO_DURATION_SECONDS * 1000);
  } catch (error) {
    stopMicrophoneTracks();
    updateMicrophoneControls(false);
    showErrorMessage(error instanceof Error ? error.message : "Could not access the microphone.");
    if (microphoneStatus) microphoneStatus.textContent = "Microphone unavailable.";
  }
}

microphoneStartButton?.addEventListener("click", () => {
  void startMicrophoneCapture();
});

microphoneStopButton?.addEventListener("click", () => {
  if (microphoneRecorder?.state === "recording") {
    microphoneRecorder.stop();
    if (microphoneStatus) microphoneStatus.textContent = "Finishing recording…";
  }
});

feedbackSuppressionButton?.addEventListener("click", async () => {
  feedbackSuppressionEnabled = !feedbackSuppressionEnabled;
  feedbackSuppressionButton.setAttribute("aria-pressed", String(feedbackSuppressionEnabled));
  feedbackSuppressionButton.textContent = feedbackSuppressionEnabled
    ? "Feedback suppression: ON"
    : "Feedback suppression: OFF";

  const track = microphoneStream?.getAudioTracks()[0];
  if (track) {
    try {
      await track.applyConstraints({
        echoCancellation: feedbackSuppressionEnabled,
        noiseSuppression: feedbackSuppressionEnabled,
        autoGainControl: feedbackSuppressionEnabled,
      });
    } catch {
      showErrorMessage("This browser could not change microphone feedback suppression while recording.");
    }
  }
});

window.addEventListener("beforeunload", () => {
  stopMicrophoneTracks();
  if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
});

decodeButton.addEventListener("click", () => {
  if (!currentSamples || !currentSampleRate || !decodeHistoryReady) return;

  decodeButton.disabled = true;
  hideErrorMessage();
  showDecodeProgress({ reset: true });

  if (playAudioWhileDecoding?.checked && decodeAudioPlayback?.src) {
    decodeAudioPlayback.currentTime = 0;
    void decodeAudioPlayback.play().catch(() => {
      if (microphoneStatus) {
        microphoneStatus.textContent = "Decoding started. Press Play in the audio controls if playback did not start.";
      }
    });
  }

  const fftQuality = Number(qualitySelect.value);
  try {
    decoderWorker.postMessage({
      samples: currentSamples,
      sampleRate: currentSampleRate,
      fftSize: fftQuality,
    });
  } catch (error) {
    console.error("Could not start decoder worker:", error);
    hideDecodeProgress();
    showErrorMessage("Could not start decoding. The audio may exceed this device's available memory.");
    decodeButton.disabled = !decodeHistoryReady;
  }
});

decoderWorker.onmessage = (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "progress") {
    showDecodeProgress();
    setDecodeProgressTarget(data.progress);
    return;
  }

  if (data.type === "start") {
    if (
      !Number.isInteger(data.width) ||
      !Number.isInteger(data.height) ||
      data.width <= 0 ||
      data.height <= 0 ||
      data.width * data.height > 16_000_000
    ) {
      hideDecodeProgress();
      showErrorMessage("The decoder returned invalid image dimensions.");
      decodeButton.disabled = !decodeHistoryReady;
      return;
    }
    canvas.width = data.width;
    canvas.height = data.height;
    ctx.clearRect(0, 0, data.width, data.height);
    revealDecodedCanvas();
    if (microphoneStatus) {
      microphoneStatus.textContent = `Decoding ${data.mode || "SSTV"} — image is being reconstructed line by line.`;
    }
    return;
  }

  if (data.type === "line") {
    if (
      !Number.isInteger(data.line) ||
      !Number.isInteger(data.width) ||
      data.line < 0 ||
      data.line >= canvas.height ||
      data.width !== canvas.width ||
      !(data.pixels instanceof ArrayBuffer) ||
      data.pixels.byteLength !== data.width * 4
    ) return;

    const row = new ImageData(new Uint8ClampedArray(data.pixels), data.width, 1);
    ctx.putImageData(row, 0, data.line);
    return;
  }

  if (data.type === "error") {
    const message = typeof data.error?.message === "string"
      ? data.error.message.slice(0, 500)
      : "SSTV decoding failed.";
    hideDecodeProgress({
      onComplete: () => {
        hideImageScrollHint({ immediate: true });
        showErrorMessage(`Error: ${message}`);
        updateHistoryChrome();
        decodeButton.disabled = !decodeHistoryReady;
      },
    });
    return;
  }

  if (data.type !== "complete") return;

  const { imageData, width, height } = data;
  if (
    !(imageData instanceof ArrayBuffer) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > 16_000_000 ||
    imageData.byteLength !== width * height * 4
  ) {
    hideDecodeProgress({
      onComplete: () => {
        showErrorMessage("The decoder returned invalid image data.");
        decodeButton.disabled = !decodeHistoryReady;
      },
    });
    return;
  }

  const imgData = new ImageData(new Uint8ClampedArray(imageData), width, height);

  hideDecodeProgress({
    onComplete: async () => {
      try {
        const blob = await imageDataToPngBlob(imgData);
        const objectUrl = URL.createObjectURL(blob);
        const id = crypto.randomUUID();
        const createdAt = Date.now();

        decodedImages.unshift({
          id,
          imageData: imgData,
          width,
          height,
          sourceFileName: currentSourceFileName,
          objectUrl,
          blob,
        });

        const { evictedIds, error: saveError } = await save({
          id,
          createdAt,
          width,
          height,
          sourceFileName: currentSourceFileName,
          blob,
        });

        removeEvictedFromMemory(evictedIds);
        if (saveError) showErrorMessage(saveError);

        const isFirstReveal = !sstvCanvasWrap?.classList.contains(
          "sstv-canvas-wrap--open"
        );
        canvas.width = width;
        canvas.height = height;
        ctx.putImageData(imgData, 0, 0);

        if (isFirstReveal) revealDecodedCanvas();
        updateHistoryChrome();
        renderDecodeGallery();
        refreshOpenDecodeGallery(decodedImages);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => handlePostDecodeScroll(canvas));
        });
        if (microphoneStatus) microphoneStatus.textContent = "Decoding finished.";
      } catch (error) {
        console.error("Failed to prepare decoded image:", error);
        showErrorMessage("Error: Failed to display decoded image.");
      }

      decodeButton.disabled = false;
    },
  });
};
decoderWorker.onerror = (event) => {
  console.error("Worker error:", event.message, event);
  hideDecodeProgress();
  showErrorMessage("The decoder worker stopped unexpectedly. Try loading the audio again.");
  decodeButton.disabled = !decodeHistoryReady;
};

downloadImageButton.addEventListener("click", () => {
  downloadDecodedEntry(getLatestEntry());
});
