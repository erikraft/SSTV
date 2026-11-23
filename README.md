# ErikrafT SSTV

Browser-based SSTV Decoder & Encoder. Audio decoding and image encoding run locally in the browser; files are not uploaded to a server.

## Features
- Decode SSTV audio recordings supported by the browser, with line-by-line live image reconstruction while the audio plays.
- Record SSTV audio from the microphone with browser echo cancellation, noise suppression, and automatic gain control options.
- Automatic VIS detection for Robot 36/72, Martin 1/2, Scottie 1/2/DX.
- FFT quality control, progress, decoded image download, and local browser history.
- Encode images into Martin 1 / Martin 2 WAV audio and play the generated transmission.

## Development
Run `npm install`, `npm run dev`, and `npm run build`.

## Credits
Some decoder components include MIT-licensed third-party code. See THIRD_PARTY_NOTICES.md for the required license and copyright notice.

## Browser permissions and limits

Microphone capture requires HTTPS (or localhost) and explicit browser permission. Feedback suppression uses the browser's supported echo-cancellation, noise-suppression, and automatic-gain-control constraints; device/browser support varies and it cannot guarantee elimination of every acoustic feedback source.

Audio decoding is limited to 50 MB, 10 minutes, and 30 million decoded samples. Image encoding is processed locally and keeps the existing file/dimension limits.
