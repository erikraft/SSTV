import test from "node:test";
import assert from "node:assert/strict";
import { mergeAudioChunks } from "../src/microphone-audio.js";

test("merges microphone sample chunks in order", () => {
  const samples = mergeAudioChunks([
    new Float32Array([0.1, 0.2]),
    new Float32Array([-0.3]),
  ]);

  assert.deepEqual(samples, new Float32Array([0.1, 0.2, -0.3]));
});

test("returns an empty sample array when no audio was captured", () => {
  assert.deepEqual(mergeAudioChunks([]), new Float32Array());
});
