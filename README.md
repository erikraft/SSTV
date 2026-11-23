# ErikrafT SSTV

Browser-based SSTV Decoder & Encoder. Audio decoding and image encoding run locally in the browser; files are not uploaded to a server.

## Features
- Decode SSTV audio recordings supported by the browser.
- Automatic VIS detection and manual mode override: Robot 36/72, Martin 1/2, Scottie 1/2/DX.
- FFT quality control, progress, and decoded image download.
- Encode images into Martin 1 / Martin 2 WAV audio.

## Development
Run `npm install`, `npm run dev`, and `npm run build`.

## Deploy on Vercel
1. Import this GitHub repository into Vercel.
2. Keep the Vite framework preset and the default project root.
3. Vercel uses `npm run build` to build the app and publishes the `dist` directory.
4. The included `vercel.json` handles direct navigation and refreshes by routing application paths to `index.html`.

No environment variables or backend services are required. Decoding and encoding are performed in the user's browser.

## Credits
Decoder implementation adapted from https://github.com/Equinoxis/sstv-decoder. See `THIRD_PARTY_NOTICES.md` for license and attribution details.
