/**
 * Device detection. Loaded in <head> so the is-mobile-device class is set before first paint.
 * Mobile browsers restrict real-time audio analysis of streams, so audio-reactive visuals,
 * the Audio Inspector and the waves canvas are disabled there; CSS provides an ambient drift instead.
 */
(function () {
  'use strict';

  const MOBILE_MAX_WIDTH = 768;

  function isMobileDevice() {
    const ua = navigator.userAgent || '';
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    // iPadOS reports a desktop Safari user agent but is touch-only
    const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    // A narrow window alone (desktop resize) does not count; it must also be a touch device
    const touchNarrow = navigator.maxTouchPoints > 0 && window.innerWidth <= MOBILE_MAX_WIDTH;
    return uaMobile || iPadOS || touchNarrow;
  }

  // Evaluated once so the layout does not change mid-session
  const mobile = isMobileDevice();
  const root = document.documentElement;

  if (mobile) {
    root.classList.add('is-mobile-device');
  }

  window.Device = { isMobile: function () { return mobile; } };
})();
