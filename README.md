# ErikrafT SSTV

Browser-based SSTV Decoder & Encoder. Audio decoding and image encoding run locally in the browser; files are not uploaded to a server.

## Features
- Decode SSTV audio recordings supported by the browser.
- Automatic VIS detection and manual mode override: Robot 36/72, Martin 1/2, Scottie 1/2/DX.
- FFT quality control, progress, and decoded image download.
- Encode images into Martin 1 / Martin 2 WAV audio.

## Development
Run `npm install`, `npm run dev`, and `npm run build`.

## Credits
Decoder implementation adapted from https://github.com/Equinoxis/sstv-decoder. Manual mode selection follows https://github.com/Equinoxis/sstv-decoder/pull/1/commits. See THIRD_PARTY_NOTICES.md.
