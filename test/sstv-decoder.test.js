import test from "node:test";
import assert from "node:assert/strict";
import SSTVDecoder from "../src/sstv/decoder.js";
import { parabolicPeakInterp } from "../src/utils.js";

function makeSstvHeader(visCode, sampleRate = 11025, leadingSilenceSeconds = 0.123) {
  const samples = new Array(Math.round(sampleRate * leadingSilenceSeconds)).fill(0);
  let phase = 0;
  const tone = (frequency, duration) => {
    const count = Math.round(sampleRate * duration);
    for (let index = 0; index < count; index++) {
      samples.push(Math.sin(phase) * 0.8);
      phase += (2 * Math.PI * frequency) / sampleRate;
      if (phase >= Math.PI * 2) phase -= Math.PI * 2;
    }
  };
  tone(1900, 0.3);
  tone(1200, 0.01);
  tone(1900, 0.3);
  tone(1200, 0.03);
  let parity = 0;
  for (let bit = 0; bit < 7; bit++) {
    const value = (visCode >> bit) & 1;
    parity ^= value;
    tone(value ? 1100 : 1300, 0.03);
  }
  tone(parity ? 1100 : 1300, 0.03);
  tone(1200, 0.03);
  tone(1700, 0.06);
  return new Float32Array(samples);
}

for (const [visCode, expectedName] of [
  [8, "Robot 36"],
  [12, "Robot 72"],
  [40, "Martin 2"],
  [44, "Martin 1"],
  [56, "Scottie 2"],
  [60, "Scottie 1"],
  [76, "Scottie DX"],
]) {
  test(`automatically detects ${expectedName} after leading silence`, async () => {
    const sampleRate = 11025;
    const samples = makeSstvHeader(visCode, sampleRate);
    let detectedMode = null;
    const decoder = new SSTVDecoder(samples, 11025, 512, () => {}, (_w, _h, name) => {
      detectedMode = name;
    });
    const headerEnd = decoder._findHeader();
    assert.ok(
      Math.abs(headerEnd / sampleRate - (0.123 + 0.64)) < 0.001,
      "header alignment should be within one millisecond"
    );
    await decoder.decode();
    assert.equal(detectedMode, expectedName);
  });
}

test("parabolic peak interpolation estimates a fractional FFT bin", () => {
  const bins = new Float64Array([0, 2, 6, 10, 8, 1, 0]);
  const peak = parabolicPeakInterp(bins, 3);
  assert.ok(peak > 3);
  assert.ok(peak < 3.5);
});

test("rejects audio without an SSTV header", async () => {
  const decoder = new SSTVDecoder(new Float32Array(11025), 11025, 512);
  await assert.rejects(() => decoder.decode(), /header not found/);
});

test("refines automatic header alignment at 44.1 kHz", () => {
  const sampleRate = 44100;
  const decoder = new SSTVDecoder(
    makeSstvHeader(44, sampleRate),
    sampleRate,
    512
  );
  const headerEnd = decoder._findHeader();
  assert.ok(Math.abs(headerEnd / sampleRate - (0.123 + 0.64)) < 0.001);
  assert.equal(decoder._decodeVIS(headerEnd).NAME, "Martin 1");
});

test("keeps the correct header origin when the recording starts with the SSTV leader", () => {
  const sampleRate = 11025;
  const decoder = new SSTVDecoder(makeSstvHeader(44, sampleRate, 0), sampleRate, 512);
  const headerEnd = decoder._findHeader();
  assert.ok(Math.abs(headerEnd / sampleRate - 0.64) < 0.001);
});
