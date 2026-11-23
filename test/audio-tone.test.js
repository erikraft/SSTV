import test from "node:test";
import assert from "node:assert/strict";
import { createToneWriter, applyTransmissionEdgeFade } from "../src/tone-generator.js";

for (const scanTime of [0.146432, 0.073216]) {
  test(`preserves the total pixel scan duration for ${scanTime} second channels`, () => {
    const sampleRate = 11025;
    const samples = [];
    const tone = createToneWriter(sampleRate, samples);
    const pixelTime = scanTime / 320;

    for (let pixel = 0; pixel < 320; pixel++) tone(1900, pixelTime);

    assert.equal(samples.length, Math.round(scanTime * sampleRate));
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    assert.ok(rms > 0.4, `pixel signal should not be faded to near silence (RMS: ${rms})`);
  });
}

test("keeps phase and amplitude continuous across short pixel tones", () => {
  const samples = [];
  const tone = createToneWriter(11025, samples);
  for (let pixel = 0; pixel < 320; pixel++) tone(1500 + (pixel % 2) * 800, 0.146432 / 320);

  const nonZero = samples.filter((sample) => Math.abs(sample) > 0.2).length;
  assert.ok(nonZero > samples.length / 2);
});

test("fades only the beginning and end of the complete transmission", () => {
  const samples = new Array(1000).fill(0.5);
  applyTransmissionEdgeFade(samples, 10000, 0.01);
  assert.equal(samples[0], 0);
  assert.equal(samples[999], 0);
  assert.equal(samples[500], 0.5);
});
