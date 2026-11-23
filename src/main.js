import "./styles.css";
import { initCookieConsent } from "./cookieConsent.js";
initCookieConsent();
import "./theme.js";
import "./quality-ui.js";
import "./decoder.js";
import "./encoder.js";
import "./encoder.css";
import "./microphone.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
