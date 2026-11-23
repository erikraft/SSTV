import test from "node:test";
import assert from "node:assert/strict";
import { validateDecodeRequest, MAX_AUDIO_DURATION_SECONDS } from "../src/audio-validation.js";

test("accepts a bounded valid decoder request", () => {
  const samples = new Float32Array(8000);
  const request = validateDecodeRequest({
    samples,
    sampleRate: 8000,
    fftSize: 512,
    forcedMode: null,
  });
  assert.equal(request.samples, samples);
  assert.equal(request.sampleRate, 8000);
});

test("rejects non-Float32Array input", () => {
  assert.throws(
    () => validateDecodeRequest({ samples: [0, 1], sampleRate: 8000, fftSize: 512 }),
    /Float32Array/
  );
});

test("rejects unsupported sample rates, FFT sizes, and modes", () => {
  const samples = new Float32Array(8);
  assert.throws(() => validateDecodeRequest({ samples, sampleRate: 1000, fftSize: 512 }), /sample rate/);
  assert.throws(() => validateDecodeRequest({ samples, sampleRate: 8000, fftSize: 999 }), /FFT size/);
  assert.throws(() => validateDecodeRequest({ samples, sampleRate: 8000, fftSize: 512, forcedMode: 999 }), /mode/);
});

test("rejects audio exceeding the maximum duration", () => {
  const sampleRate = 8000;
  const samples = new Float32Array(sampleRate * MAX_AUDIO_DURATION_SECONDS + 1);
  assert.throws(
    () => validateDecodeRequest({ samples, sampleRate, fftSize: 512 }),
    /10-minute/
  );
});

test("rejects sample arrays above the hard memory cap", () => {
  class OversizedFloat32Array extends Float32Array {
    get length() {
      return 30_000_001;
    }
  }
  const samples = new OversizedFloat32Array(1);
  assert.throws(
    () => validateDecodeRequest({ samples, sampleRate: 192000, fftSize: 512 }),
    /30-million-sample/
  );
});
