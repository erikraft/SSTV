export const SSTV_SITE_NAME = "ErikrafT SSTV";
export const SSTV_SITE_HOST = "sstv.erikraft.com";

export function formatDownloadDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function getSstvDownloadBaseName(date = new Date()) {
  return `${SSTV_SITE_NAME} - ${SSTV_SITE_HOST} - ${formatDownloadDate(date)}`;
}

export function getSstvWavDownloadName(visCode, date = new Date()) {
  const mode = Number(visCode) === 40 ? "Martin 2" : "Martin 1";
  return `${getSstvDownloadBaseName(date)} - ${mode}.wav`;
}

export function getSstvDecodedImageDownloadName(date = new Date()) {
  return `${getSstvDownloadBaseName(date)} - SSTV decoded.png`;
}
