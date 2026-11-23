import SSTVDecoder from "../sstv/decoder.js";
import { validateDecodeRequest } from "../audio-validation.js";

self.onmessage = async (event) => {
  let request;

  try {
    request = validateDecodeRequest(event.data);
  } catch (error) {
    self.postMessage({
      type: "error",
      error: { message: error instanceof Error ? error.message : "Invalid decoder request." },
    });
    return;
  }

  const { samples, sampleRate, fftSize } = request;
  const decoder = new SSTVDecoder(
    samples,
    sampleRate,
    fftSize,
    (progress) => self.postMessage({ type: "progress", progress }),
    (width, height, mode) => {
      self.postMessage({ type: "start", width, height, mode });
    },
    (line, pixels) => {
      self.postMessage(
        { type: "line", line, width: pixels.length / 4, pixels: pixels.buffer },
        [pixels.buffer]
      );
    }
  );

  try {
    const { buffer, width, height } = await decoder.decode();
    self.postMessage(
      { type: "complete", imageData: buffer.buffer, width, height },
      [buffer.buffer]
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      error: { message: error instanceof Error ? error.message : "SSTV decoding failed." },
    });
  }
};
