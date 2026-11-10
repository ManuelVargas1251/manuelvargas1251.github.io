/**
 * Waves: three overlapping pastel frequency curves (bass, mid, high), or one continuous curve, on a fixed
 * canvas behind the page. Switch with setMode('bands' | 'single').
 * X axis is log frequency (low Hz left, high Hz right); each curve's height at x comes straight from
 * analyser bin energy, weighted so each band owns its own region of the axis.
 * Driven by js/audio-reactive.js, which owns the animation loop, analyser and audio lifecycle.
 * The baseline sits on top of the now-playing bar. Colors are mixed toward white and floored at
 * MIN_CHANNEL, so the layer only brightens the page.
 */
(function () {
  'use strict';

  // Half-resolution buffer; CSS scales it up and the soft shapes hide the difference
  const RENDER_SCALE = 0.5;
  const MOBILE_QUERY = '(max-width: 768px)';
  const MIN_CHANNEL = 214;
  const MAX_ALPHA = 0.35;
  const FADE_RATE = 0.08;
  // Ignore small height changes from mobile browser toolbars so the canvas is not cleared mid-scroll
  const HEIGHT_JITTER_PX = 120;
  // Re-measure the player bar periodically since fonts and controls can change its height
  const PLAYER_MEASURE_FRAMES = 60;

  const F_MIN = 40;
  const F_MAX = 16000;
  const BARS_DESKTOP = 64;
  const BARS_MOBILE = 32;
  // Heights are fractions of the free space above the player bar
  const REST_HEIGHT = 0.02;
  const MOBILE_HEIGHT_SCALE = 0.86;
  // Highs carry less energy; tilt lifts them so the right side of the graph stays alive
  const HIGH_TILT = 0.8;
  const PEAK_DECAY = 0.999;

  // Crossovers as fractions of the log-frequency axis (about 250 Hz and 2.5 kHz); bands overlap by 2 * CROSSFADE
  const CROSS_LOW = Math.log(250 / F_MIN) / Math.log(F_MAX / F_MIN);
  const CROSS_HIGH = Math.log(2500 / F_MIN) / Math.log(F_MAX / F_MIN);
  const CROSSFADE = 0.15;

  // Drawn back to front. attack/release are per-frame lerp factors; floor stops quiet bands being over-amplified.
  // whiteMix range: 0.0 - 1.111
  const BANDS = [
    { name: 'bass', maxHeight: 0.94, attack: 0.35, release: 0.08, floor: 0.30, whiteMix: 1.111, alpha: 1.6 },
    { name: 'mid', maxHeight: 0.44, attack: 0.45, release: 0.12, floor: 0.25, whiteMix: 1.111, alpha: 1.2 },
    { name: 'high', maxHeight: 0.7, attack: 0.60, release: 0.20, floor: 0.20, whiteMix: 1.111, alpha: 1.5 }
  ];
  // Below 1 lifts typical levels so everyday peaks reach about mid-page, not just the loudest hits
  const LEVEL_CURVE = 0.75;

  // Single continuous curve mode: one shared peak tracker across all bars
  const SINGLE = { maxHeight: 0.8, attack: 0.5, release: 0.12, floor: 0.35, whiteMix: 1.0, alpha: 1.6 };
  // Per-frame lerp for the crossfade between render modes
  const MODE_BLEND_RATE = 0.15;

  let canvas = null;
  let ctx = null;
  let width = 0;
  let height = 0;
  let mobile = false;
  let fade = 0;
  let resizeTimer = null;
  let playerTopPx = 0;
  let framesSinceMeasure = 0;
  let bandLevels = [];
  let weights = [];
  let peaks = BANDS.map(function () { return 0.6; });
  let mode = 'bands';
  let bandsAlpha = 1;
  let singleAlpha = 0;
  let singleLevels = new Float32Array(BARS_DESKTOP);
  let singlePeak = 0.6;
  let barCount = BARS_DESKTOP;
  let edges = null;
  let edgesKey = '';
  const mobileQuery = window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;

  function pastel(rgb, mixAmount) {
    function mix(c) {
      return Math.min(255, Math.max(MIN_CHANNEL, Math.round(c * (1 - mixAmount) + 255 * mixAmount)));
    }
    return { r: mix(rgb.r), g: mix(rgb.g), b: mix(rgb.b) };
  }

  function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  /**
   * Per-bar weight of each band along the x axis; crossfades overlap so the curves blend without seams.
   */
  function allocateBands(bars) {
    bandLevels = BANDS.map(function () { return new Float32Array(bars); });
    weights = BANDS.map(function () { return new Float32Array(bars); });
    singleLevels = new Float32Array(bars);
    barCount = bars;
    for (let i = 0; i < bars; i++) {
      const t = i / (bars - 1);
      const rise = smoothstep(CROSS_LOW - CROSSFADE, CROSS_LOW + CROSSFADE, t);
      const fall = smoothstep(CROSS_HIGH - CROSSFADE, CROSS_HIGH + CROSSFADE, t);
      weights[0][i] = 1 - rise;
      weights[1][i] = rise * (1 - fall);
      weights[2][i] = fall;
    }
  }

  /**
   * Top edge of the now-playing bar in canvas pixels; the spectrum sits on top of it.
   */
  function measurePlayerTop() {
    framesSinceMeasure = 0;
    const bar = document.querySelector('.audio-player-bar');
    const cssTop = bar ? bar.getBoundingClientRect().top : canvas.clientHeight;
    playerTopPx = Math.max(1, Math.min(height, Math.round(cssTop * RENDER_SCALE)));
  }

  function resize() {
    if (!canvas) return;
    const nextMobile = mobileQuery ? mobileQuery.matches : false;
    const nextWidth = Math.max(1, Math.round(canvas.clientWidth * RENDER_SCALE));
    const nextHeight = Math.max(1, Math.round(canvas.clientHeight * RENDER_SCALE));

    const smallHeightChange = Math.abs(nextHeight - height) / RENDER_SCALE < HEIGHT_JITTER_PX;
    if (width && nextWidth === width && smallHeightChange && nextMobile === mobile) {
      measurePlayerTop();
      return;
    }

    mobile = nextMobile;
    width = nextWidth;
    height = nextHeight;
    canvas.width = width;
    canvas.height = height;
    canvas.dataset.layout = mobile ? 'mobile' : 'desktop';
    allocateBands(mobile ? BARS_MOBILE : BARS_DESKTOP);
    measurePlayerTop();
  }

  function clear() {
    fade = 0;
    peaks = BANDS.map(function () { return 0.6; });
    bandLevels.forEach(function (arr) { arr.fill(0); });
    singleLevels.fill(0);
    singlePeak = 0.6;
    if (ctx) ctx.clearRect(0, 0, width, height);
  }

  /**
   * Bin ranges per bar on a log-frequency axis, rebuilt when bar count, FFT size or sample rate change.
   */
  function buildEdges(bars, binCount, sampleRate) {
    const key = bars + ':' + binCount + ':' + sampleRate;
    if (key === edgesKey) return;
    edgesKey = key;
    const binHz = sampleRate / 2 / binCount;
    const ratio = F_MAX / F_MIN;
    edges = new Float32Array(bars + 1);
    for (let i = 0; i <= bars; i++) {
      edges[i] = (F_MIN * Math.pow(ratio, i / bars)) / binHz;
    }
  }

  /**
   * Mean bin value (0..1) over [lo, hi), interpolating between bins when the range is narrower than one bin.
   */
  function sampleRange(data, lo, hi) {
    const last = data.length - 1;
    if (hi - lo < 1) {
      const center = Math.min(last, Math.max(0, (lo + hi) / 2));
      const i = Math.floor(center);
      const frac = center - i;
      return ((data[i] * (1 - frac)) + (data[Math.min(last, i + 1)] * frac)) / 255;
    }
    let sum = 0;
    let count = 0;
    for (let i = Math.floor(lo); i < Math.min(last + 1, Math.ceil(hi)); i++) {
      sum += data[i];
      count++;
    }
    return count ? sum / (count * 255) : 0;
  }

  function updateLevels(data, sampleRate) {
    const bars = weights[0].length;
    if (!data) {
      bandLevels.forEach(function (arr) {
        for (let i = 0; i < bars; i++) arr[i] += (0 - arr[i]) * 0.15;
      });
      for (let i = 0; i < bars; i++) singleLevels[i] += (0 - singleLevels[i]) * 0.15;
      return;
    }

    buildEdges(bars, data.length, sampleRate);
    const raw = new Float32Array(bars);
    let frameMax = 0;
    for (let i = 0; i < bars; i++) {
      const tilt = 1 + HIGH_TILT * (i / (bars - 1));
      raw[i] = sampleRange(data, edges[i], edges[i + 1]) * tilt;
      if (raw[i] > frameMax) frameMax = raw[i];
    }

    singlePeak = Math.max(frameMax, singlePeak * PEAK_DECAY, SINGLE.floor);
    for (let i = 0; i < bars; i++) {
      const target = Math.min(1, raw[i] / singlePeak);
      singleLevels[i] += (target - singleLevels[i]) * (target > singleLevels[i] ? SINGLE.attack : SINGLE.release);
    }

    // Each band tracks its own slow-release peak so loud bass cannot flatten the highs
    for (let b = 0; b < BANDS.length; b++) {
      const band = BANDS[b];
      const arr = bandLevels[b];
      let bandMax = 0;
      for (let i = 0; i < bars; i++) bandMax = Math.max(bandMax, raw[i] * weights[b][i]);
      peaks[b] = Math.max(bandMax, peaks[b] * PEAK_DECAY, band.floor);
      for (let i = 0; i < bars; i++) {
        const target = Math.min(1, (raw[i] * weights[b][i]) / peaks[b]);
        arr[i] += (target - arr[i]) * (target > arr[i] ? band.attack : band.release);
      }
    }
  }

  /**
   * Filled, smoothed curve from per-bar levels. `weight` (optional) scales the rest height so a band's
   * curve sits on the baseline outside its own region.
   */
  function drawCurve(arr, weight, maxHeight, whiteMix, alphaScale, rgb) {
    const bars = arr.length;
    const crest = pastel(rgb, whiteMix);
    const baseline = playerTopPx;
    const maxPx = baseline * maxHeight * (mobile ? MOBILE_HEIGHT_SCALE : 1);
    const restPx = baseline * REST_HEIGHT;
    const stepX = width / (bars - 1);

    function yAt(i) {
      return baseline - (restPx * (weight ? weight[i] : 1) + Math.pow(arr[i], LEVEL_CURVE) * maxPx);
    }

    ctx.beginPath();
    ctx.moveTo(0, baseline);
    ctx.lineTo(0, yAt(0));
    // Quadratic smoothing through midpoints gives a soft curve instead of jagged bars
    for (let i = 1; i < bars; i++) {
      const mx = ((i - 1) * stepX + i * stepX) / 2;
      const my = (yAt(i - 1) + yAt(i)) / 2;
      ctx.quadraticCurveTo((i - 1) * stepX, yAt(i - 1), mx, my);
    }
    ctx.lineTo(width, yAt(bars - 1));
    ctx.lineTo(width, baseline);
    ctx.closePath();

    let top = baseline;
    for (let i = 0; i < bars; i++) top = Math.min(top, yAt(i));
    const a = MAX_ALPHA * alphaScale;
    const gradient = ctx.createLinearGradient(0, top, 0, baseline);
    gradient.addColorStop(0, `rgba(${crest.r}, ${crest.g}, ${crest.b}, ${a.toFixed(3)})`);
    gradient.addColorStop(0.5, `rgba(255, 255, 255, ${(a * 0.5).toFixed(3)})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  function draw(rgb) {
    ctx.clearRect(0, 0, width, height);
    if (bandsAlpha > 0.01) {
      ctx.globalAlpha = fade * bandsAlpha;
      for (let b = 0; b < BANDS.length; b++) {
        drawCurve(bandLevels[b], weights[b], BANDS[b].maxHeight, BANDS[b].whiteMix, BANDS[b].alpha, rgb);
      }
    }
    if (singleAlpha > 0.01) {
      ctx.globalAlpha = fade * singleAlpha;
      drawCurve(singleLevels, null, SINGLE.maxHeight, SINGLE.whiteMix, SINGLE.alpha, rgb);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Update bar levels from analyser frequency data (null while decaying) and draw one frame.
   */
  function update(data, dt, rgb, active, sampleRate) {
    if (!ctx) return;

    fade += ((active ? 1 : 0) - fade) * FADE_RATE;
    if (!active && fade < 0.01) {
      clear();
      return;
    }

    if (++framesSinceMeasure >= PLAYER_MEASURE_FRAMES) measurePlayerTop();
    const singleTarget = mode === 'single' ? 1 : 0;
    singleAlpha += (singleTarget - singleAlpha) * MODE_BLEND_RATE;
    bandsAlpha += ((1 - singleTarget) - bandsAlpha) * MODE_BLEND_RATE;
    updateLevels(active ? data : null, sampleRate || 44100);
    draw(rgb);
  }

  function isSettled() {
    return fade < 0.01;
  }

  function bandPeak(b) {
    let max = 0;
    const arr = mode === 'single' ? singleLevels : bandLevels[b];
    for (let i = 0; i < arr.length; i++) {
      // Single mode has one curve, so each band reads the bars where its weight dominates
      if (mode === 'single' && weights[b][i] < 0.5) continue;
      max = Math.max(max, arr[i]);
    }
    return max;
  }

  function getLevels() {
    return { bass: bandPeak(0), mid: bandPeak(1), high: bandPeak(2) };
  }

  /**
   * Switch render mode ('bands' or 'single'); crossfades while playing, switches instantly when idle.
   */
  function setMode(next) {
    if (next !== 'bands' && next !== 'single') return false;
    mode = next;
    if (fade < 0.01) {
      singleAlpha = mode === 'single' ? 1 : 0;
      bandsAlpha = 1 - singleAlpha;
    }
    return true;
  }

  function init() {
    canvas = document.getElementById('waves');
    if (!canvas) return false;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    });
    return true;
  }

  window.Waves = {
    init: init,
    update: update,
    clear: clear,
    isSettled: isSettled,
    getLevels: getLevels,
    setMode: setMode,
    getMode: function () { return mode; },
    getBarCount: function () { return barCount; },
    isMobile: function () { return mobile; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
