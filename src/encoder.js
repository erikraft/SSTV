import {
  readImageDimensions,
  MAX_IMAGE_FILE_SIZE,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_DIMENSION,
} from "./image-validation.js";

const input = document.getElementById("imageInput");
const name = document.getElementById("imageFileName");
const mode = document.getElementById("encodeMode");
const button = document.getElementById("encodeButton");
const link = document.getElementById("downloadAudio");
const status = document.getElementById("encodeStatus");
const canvas = document.getElementById("encodePreview");
const ctx = canvas.getContext("2d");
const audioPlayback = document.getElementById("encodeAudioPlayback");
const framing = document.getElementById("imageFraming");
const positionX = document.getElementById("imagePositionX");
const positionY = document.getElementById("imagePositionY");
const positionControls = document.getElementById("imagePositionControls");

let image = null;
let objectUrl = null;
let imageLoadGeneration = 0;

function renderImagePreview() {
  if (!image) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const fill = framing.value === "cover";
  const scale = (fill ? Math.max : Math.min)(
    canvas.width / width,
    canvas.height / height
  );
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const horizontal = Number(positionX.value) / 100;
  const vertical = Number(positionY.value) / 100;
  const x = (canvas.width - drawWidth) * (fill ? horizontal : 0.5);
  const y = (canvas.height - drawHeight) * (fill ? vertical : 0.5);

  ctx.fillStyle = "#08090c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
  positionControls.hidden = !fill;
}

framing.addEventListener("change", renderImagePreview);
positionX.addEventListener("input", renderImagePreview);
positionY.addEventListener("input", renderImagePreview);

input.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file) return;

  const loadGeneration = ++imageLoadGeneration;
  image = null;
  button.disabled = true;

  audioPlayback.pause();
  audioPlayback.hidden = true;
  audioPlayback.removeAttribute("src");
  link.hidden = true;
  link.removeAttribute("href");

  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/x-ms-bmp"].includes(file.type) ||
    file.size <= 0 ||
    file.size > MAX_IMAGE_FILE_SIZE
  ) {
    image = null;
    button.disabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    status.textContent =
      "Choose a supported raster image (PNG, JPEG, WebP, GIF, or BMP) smaller than 15 MB.";
    input.value = "";
    return;
  }

  button.disabled = true;
  status.textContent = "Checking image dimensions…";

  try {
    await readImageDimensions(file);
  } catch (error) {
    if (loadGeneration !== imageLoadGeneration) return;
    image = null;
    button.disabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    status.textContent = error instanceof Error
      ? error.message
      : "Could not verify this image safely.";
    input.value = "";
    return;
  }

  if (loadGeneration !== imageLoadGeneration) return;
  status.textContent = "Loading image…";
  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    if (loadGeneration !== imageLoadGeneration) {
      URL.revokeObjectURL(url);
      return;
    }

    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const pixelCount = width * height;

    if (
      !width ||
      !height ||
      width > MAX_IMAGE_DIMENSION ||
      height > MAX_IMAGE_DIMENSION ||
      pixelCount > MAX_IMAGE_PIXELS
    ) {
      URL.revokeObjectURL(url);
      image = null;
      input.value = "";
      button.disabled = true;
      status.textContent =
        "Image dimensions are too large. Maximum: 8192 × 8192 pixels and 16 megapixels.";
      return;
    }

    image = img;
    renderImagePreview();

    URL.revokeObjectURL(url);
    name.textContent = file.name;
    button.disabled = false;
    status.textContent = "Image ready. Adjust the framing, then encode locally.";
    link.hidden = true;
  };

  img.onerror = () => {
    if (loadGeneration !== imageLoadGeneration) return;
    URL.revokeObjectURL(url);
    image = null;
    input.value = "";
    button.disabled = true;
    status.textContent = "Could not read this image.";
  };

  img.src = url;
});

function makeWav(samples, rate) {
  const b = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(b);
  const s = (o, t) => {
    for (let i = 0; i < t.length; i++) {
      v.setUint8(o + i, t.charCodeAt(i));
    }
  };

  s(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  s(8, "WAVE");
  s(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  s(36, "data");
  v.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    v.setInt16(
      44 + i * 2,
      Math.max(-32768, Math.min(32767, samples[i] * 32767)),
      true
    );
  }

  return new Blob([b], { type: "audio/wav" });
}

button.addEventListener("click", async () => {
  if (!image) return;

  button.disabled = true;
  link.hidden = true;
  audioPlayback.pause();
  audioPlayback.hidden = true;

  status.textContent = "Generating SSTV audio…";
  await new Promise((resolve) => setTimeout(resolve, 20));

  try {
    const rate = 11025;
    const vis = Number(mode.value);
    const scan = vis === 40 ? 0.073216 : 0.146432;
    const pixel = scan / 320;
    const samples = [];
    const tone = createToneWriter(rate, samples);

    tone(1900, 0.3);
    tone(1200, 0.01);
    tone(1900, 0.3);
    tone(1200, 0.03);

    let parity = 0;
    for (let bit = 0; bit < 7; bit++) {
      const one = (vis >> bit) & 1;
      parity ^= one;
      tone(one ? 1100 : 1300, 0.03);
    }

    tone(parity ? 1100 : 1300, 0.03);
    tone(1200, 0.03);

    const data = ctx.getImageData(0, 0, 320, 256).data;
    const scanChannel = (y, channel) => {
      for (let x = 0; x < 320; x++) {
        tone(
          1500 + (data[(y * 320 + x) * 4 + channel] / 255) * 800,
          pixel
        );
      }
    };

    for (let y = 0; y < 256; y++) {
      tone(1200, 0.004862);
      tone(1500, 0.000572);
      scanChannel(y, 1);
      tone(1500, 0.000572);
      scanChannel(y, 2);
      tone(1500, 0.000572);
      scanChannel(y, 0);
      tone(1500, 0.000572);
    }

    applyTransmissionEdgeFade(samples, rate);
    const blob = makeWav(samples, rate);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download =
      "erikraft-" + (vis === 40 ? "martin2" : "martin1") + ".wav";
    link.hidden = false;

    audioPlayback.src = objectUrl;
    audioPlayback.hidden = false;

    const playback = audioPlayback.play();
    if (playback && typeof playback.catch === "function") {
      playback.catch(() => {
        status.textContent += " · Press Play to listen to the generated transmission.";
      });
    }

    status.textContent =
      "WAV ready · " +
      (blob.size / 1048576).toFixed(2) +
      " MB · " +
      Math.round(samples.length / rate) +
      " seconds · playing SSTV transmission";
  } catch (error) {
    console.error(error);
    status.textContent = "Encoding failed. Try another image.";
  } finally {
    button.disabled = !image;
  }
});

window.addEventListener("beforeunload", () => {
  audioPlayback.pause();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});
