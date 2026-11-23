import test from "node:test";
import assert from "node:assert/strict";
import {
  getSstvWavDownloadName,
  getSstvDecodedImageDownloadName,
} from "../src/download-name.js";

test("SSTV WAV downloads include the site, host, date, and mode", () => {
  const date = new Date("2026-11-23T21:06:05.939Z");
  assert.equal(
    getSstvWavDownloadName(44, date),
    "ErikrafT SSTV - sstv.erikraft.com - 2026-11-23 - Martin 1.wav"
  );
  assert.equal(
    getSstvWavDownloadName(40, date),
    "ErikrafT SSTV - sstv.erikraft.com - 2026-11-23 - Martin 2.wav"
  );
});

test("decoded image downloads use the branded name", () => {
  const date = new Date("2026-11-23T21:06:05.939Z");
  assert.equal(
    getSstvDecodedImageDownloadName(date),
    "ErikrafT SSTV - sstv.erikraft.com - 2026-11-23 - SSTV decoded.png"
  );
});
