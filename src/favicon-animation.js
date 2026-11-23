/**
 * Blink the official ErikrafT Minecraft-skin favicon.
 * Keep favicon.ico as the initial/static icon so crawlers can discover it.
 */
(() => {
  "use strict";

  const openEyes = "/favicon.ico";
  const closedEyes = "/favicon2.ico";
  const iconSelector = 'link[rel="icon"], link[rel="shortcut icon"]';
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const preload = (src) => {
    const image = new Image();
    image.src = src;
  };

  preload(openEyes);
  preload(closedEyes);

  let timer = null;
  let closed = false;

  const updateIcon = (src) => {
    document.querySelectorAll(iconSelector).forEach((link) => {
      link.href = src;
    });
  };

  const stop = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = (delay) => {
    stop();
    timer = window.setTimeout(() => {
      if (document.visibilityState === "visible" && !reducedMotion.matches && !window.pauseFaviconAnimation) {
        closed = !closed;
        updateIcon(closed ? closedEyes : openEyes);
      }
      schedule(closed ? 800 : 150);
    }, delay);
  };

  const start = () => {
    if (reducedMotion.matches) return;
    closed = false;
    updateIcon(openEyes);
    schedule(800);
  };

  window.restartFaviconAnimation = () => {
    stop();
    start();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (!reducedMotion.matches) window.restartFaviconAnimation();
    } else {
      stop();
    }
  });

  if (document.readyState === "complete") {
    start();
  } else {
    window.addEventListener("load", start, { once: true });
  }
})();
