/**
 * Ambient gradient drift for mobile devices: the CSS animation only starts once audio is actually
 * playing, and freezes in place whenever playback stops, stalls or the tab is hidden.
 */
(function () {
  'use strict';

  if (!(window.Device && window.Device.isMobile())) return;

  const audio = document.getElementById('site-audio-player');
  if (!audio) return;

  const root = document.documentElement;
  // Events after which no audio is coming out
  const STOP_EVENTS = ['pause', 'ended', 'waiting', 'stalled', 'emptied', 'error'];
  let playing = false;

  function sync() {
    root.classList.toggle('ambient-paused', document.hidden || !playing);
  }

  // 'playing' fires only once playback is really advancing, not on the first tap alone
  audio.addEventListener('playing', function () {
    playing = true;
    root.classList.add('ambient-started');
    sync();
  });

  STOP_EVENTS.forEach(function (name) {
    audio.addEventListener(name, function () {
      playing = false;
      sync();
    });
  });

  // Hidden tabs freeze the animation to save battery
  document.addEventListener('visibilitychange', sync);
})();
