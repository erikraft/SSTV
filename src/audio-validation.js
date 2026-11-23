export const MAX_AUDIO_DURATION_SECONDS = 600;
export const MAX_AUDIO_SAMPLE_COUNT = 30_000_000;

const ALLOWED_FFT_SIZES = new Set([64, 128, 256, 512, 1024, 2048]);

/**
 * Validate the structured-clone payload received by the decoder worker.
 * @param {unknown} payload
 * @returns {{ samples: Float32Array, sampleRate: number, fftSize: number }}
 */
export function validateDecodeRequest(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("Invalid decoder request.");
  }

  const { samples, sampleRate, fftSize } = payload;

  if (!(samples instanceof Float32Array) || samples.length === 0) {
    throw new TypeError("Audio samples must be a non-empty Float32Array.");
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new RangeError("Unsupported audio sample rate.");
  }
  if (
    samples.length > sampleRate * MAX_AUDIO_DURATION_SECONDS ||
    samples.length > MAX_AUDIO_SAMPLE_COUNT
  ) {
    throw new RangeError("Audio exceeds the 10-minute or 30-million-sample decoding limit.");
  }
  if (!Number.isInteger(fftSize) || !ALLOWED_FFT_SIZES.has(fftSize)) {
    throw new RangeError("Unsupported FFT size.");
  }

  return { samples, sampleRate, fftSize };
}
