/**
 * Audio-Reactive Background Gradients & Audio Inspector
 * 
 * Features:
 * - Hooks into existing #site-audio-player with a single Web Audio AudioContext & AnalyserNode (fftSize = 128).
 * - Calibrated analyser range (-80 to -20 dB) plus slow-release auto-gain for compressed radio and quiet playlist tracks.
 * - Live Audio Inspector (Waves and Gradient tabs) showing loudness, bass, wave bands and all animation parameters in real time.
 * - Layered visual animation: slow linear-gradient aurora drift (angle + stop positions) wide day-tint band that blooms with bass.
 * - Streamlined live status detection: Buffering, Live Radio, and Playlist awareness.
 * - Zero-waste lifecycle: pauses RAF on mobile screen lock/tab hide (document.visibilitychange).
 * - Respects prefers-reduced-motion accessibility preferences.
 * - Global Spacebar keyboard shortcut to toggle audio play/pause (ignoring text inputs and form fields).
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AudioReactiveGradient = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Baseline alpha matching colorchange.js resting day-tint state
  const BASELINE_ALPHA = 0.12;

  // Analyser node dynamic calibration constants
  const ANALYSER_MIN_DB = -80.0;
  const ANALYSER_MAX_DB = -20.0;

  // Measured Bassdrive radio peaks (normalized analyser output) with these dB bounds
  const LOUDNESS_REF = 0.34;
  const BASS_REF = 0.73;
  // Auto-gain peak tracker: floor limits amplification of near-silence, decay is per frame
  const PEAK_FLOOR_RATIO = 0.4;
  const PEAK_DECAY = 0.999;
  const PEAK_HEADROOM = 1.1;

  // Aurora drift (radians per second) and resting gradient geometry
  const BASE_SPEED = 0.25;
  const BASS_SPEED_BOOST = 0.9;
  const REST_ANGLE = 135;
  const REST_POS = 50;
  const MAX_ALPHA = 0.20;
  // Tint color is the day color mixed toward white; weight is its effective day-color strength
  const TINT_WHITE_MIX = 0.8;

  // Fallback day colors matching colorchange.js (Sunday = 0 .. Saturday = 6)
  const FALLBACK_DAY_COLORS = [
    '#b83b68', // Sunday
    '#6b498f', // Monday
    '#2a698a', // Tuesday
    '#1b7a70', // Wednesday
    '#437752', // Thursday
    '#b26227', // Friday
    '#ad454b'  // Saturday
  ];

  // Module state
  let audio = null;
  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;
  let dataArray = null;
  let bufferLength = 0;
  // Separate high-resolution analyser for the spectrum (same AudioContext and source)
  let spectrumAnalyser = null;
  let spectrumData = null;

  let isInitialized = false;
  let isLoopRunning = false;
  let animationFrameId = null;
  let isEnabled = true;

  // Interpolated visual values
  let currentLoudness = 0;
  let currentBass = 0;
  let currentAlpha = BASELINE_ALPHA;
  let currentAngle = REST_ANGLE;
  let currentPos = REST_POS;
  let currentSpeed = BASE_SPEED;
  let phase = 0;
  let lastTimestamp = 0;
  let peakLoudness = LOUDNESS_REF;
  let peakBass = BASS_REF;

  // Accessibility motion preference
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let prefersReducedMotion = motionQuery ? motionQuery.matches : false;

  // Audio Inspector DOM element cache
  const ui = {
    panel: null,
    status: null,
    sourceBadge: null,
    closeBtn: null,
    tabs: [],
    tabPanels: {},
    modeBtns: [],
    waveBassPct: null,
    waveBassBar: null,
    waveMidPct: null,
    waveMidBar: null,
    waveHighPct: null,
    waveHighBar: null,
    fftSize: null,
    sampleRate: null,
    waveBars: null,
    waveLayout: null,
    waveMode: null,
    loudnessDb: null,
    loudnessPct: null,
    loudnessBar: null,
    bassDb: null,
    bassPct: null,
    bassBar: null,
    tintAlpha: null,
    colorSwatch: null,
    dayColor: null,
    pulseRadius: null,
    pulseXy: null,
    gradientAngle: null,
    gradientPos: null,
    bgScale: null,
    audioContext: null
  };

  // Inspector tab state; the body only updates for the open panel's active tab
  let activeTab = 'waves';
  let lastInspectorArgs = null;
  const STORAGE_TAB = 'inspector-tab';
  const STORAGE_MODE = 'inspector-wave-mode';

  /**
   * Linear interpolation helper
   */
  function lerp(start, end, factor) {
    return start + (end - start) * factor;
  }

  /**
   * Convert normalized level [0..1] to real-world audio engineering dBFS:
   * dB = 20 * log10(amplitude), clamped at -60 dBFS noise floor.
   */
  function toDbFs(normalized) {
    if (normalized <= 0.005) return '-∞ dBFS';
    const db = Math.max(-60, 20 * Math.log10(normalized));
    return `${db.toFixed(1)} dBFS`;
  }

  /**
   * Parse hex or rgb color string into an { r, g, b } object
   */
  function parseColorToRgb(colorStr) {
    if (!colorStr) return null;
    const str = colorStr.trim();

    if (str.startsWith('#')) {
      let hex = str.slice(1);
      if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
      }
      if (hex.length >= 6) {
        return {
          r: parseInt(hex.substring(0, 2), 16),
          g: parseInt(hex.substring(2, 4), 16),
          b: parseInt(hex.substring(4, 6), 16)
        };
      }
    }

    const rgbMatch = str.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1], 10),
        g: parseInt(rgbMatch[2], 10),
        b: parseInt(rgbMatch[3], 10)
      };
    }

    return null;
  }

  /**
   * Light day-color tint: pulsing strength never darkens the page the way a raw dark day color would.
   */
  function pastelTint(rgb, weight) {
    const mix = (c) => Math.round(c * (1 - TINT_WHITE_MIX) + 255 * TINT_WHITE_MIX);
    const a = Math.min(1, weight / (1 - TINT_WHITE_MIX));
    return `rgba(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)}, ${a.toFixed(3)})`;
  }

  /**
   * Retrieve active day theme info
   */
  function getActiveDayInfo() {
    let rawColor = '';
    if (typeof document !== 'undefined' && document.documentElement) {
      rawColor = document.documentElement.style.getPropertyValue('--day-color') ||
                 getComputedStyle(document.documentElement).getPropertyValue('--day-color');
    }

    let parsed = parseColorToRgb(rawColor);
    let hexStr = rawColor ? rawColor.trim() : '';

    if (!parsed) {
      const today = new Date().getDay();
      hexStr = (window.dayColors && window.dayColors[today]) || FALLBACK_DAY_COLORS[today] || '#b83b68';
      parsed = parseColorToRgb(hexStr);
    }

    return {
      rgb: parsed || { r: 184, g: 59, b: 104 },
      hex: hexStr || '#b83b68'
    };
  }

  /**
   * Safely resume AudioContext if suspended
   */
  function ensureAudioContextResumed() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function (err) {
        console.warn('[AudioReactive] Failed to resume AudioContext:', err);
      });
    }
  }

  /**
   * Initialize Web Audio API components once on user interaction
   */
  function initAudioContext() {
    if (isInitialized) {
      ensureAudioContextResumed();
      return true;
    }

    if (!audio) {
      audio = document.getElementById('site-audio-player');
      if (!audio) return false;
    }

    // Ensure crossOrigin is set for live stream CORS headers
    if (!audio.crossOrigin) {
      audio.crossOrigin = 'anonymous';
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      console.warn('[AudioReactive] Web Audio API not supported in this browser.');
      return false;
    }

    try {
      audioCtx = new AudioContextClass();

      // AnalyserNode configuration: fftSize = 128 (64 frequency bins)
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;

      // Calibrated dynamic range for broadcast / normalized streams:
      // -75 dBFS noise floor to -10 dBFS peak ceiling prevents clipping
      analyser.minDecibels = ANALYSER_MIN_DB;
      analyser.maxDecibels = ANALYSER_MAX_DB;
      analyser.smoothingTimeConstant = 0.5;

      bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);

      // Prevent calling createMediaElementSource twice on same element
      if (audio.__mediaSourceNode) {
        sourceNode = audio.__mediaSourceNode;
      } else {
        sourceNode = audioCtx.createMediaElementSource(audio);
        audio.__mediaSourceNode = sourceNode;
      }

      // MediaElementSource -> AnalyserNode -> Destination (speakers)
      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);

      spectrumAnalyser = audioCtx.createAnalyser();
      spectrumAnalyser.fftSize = 1024;
      spectrumAnalyser.minDecibels = -90;
      spectrumAnalyser.maxDecibels = -20;
      spectrumAnalyser.smoothingTimeConstant = 0.6;
      spectrumData = new Uint8Array(spectrumAnalyser.frequencyBinCount);
      sourceNode.connect(spectrumAnalyser);

      isInitialized = true;
      ensureAudioContextResumed();
      return true;
    } catch (err) {
      console.warn('[AudioReactive] Error initializing Web Audio graph:', err);
      return false;
    }
  }

  /**
   * Get active audio source label for the inspector header
   */
  function getAudioSourceLabel() {
    if (!audio) return 'Playlist';
    const src = audio.src || '';
    if (src.includes('bassdrive') || src.includes('/stream')) {
      return '🔴 Bassdrive Radio (Live)';
    }
    const trackTitle = document.getElementById('player-track-title');
    if (trackTitle && trackTitle.textContent) {
      return trackTitle.textContent;
    }
    return 'Manuel - Me Now (Edit)';
  }

  /**
   * Update the Audio Inspector in index.html
   */
  function updateInspectorUI(loudness, bass, alpha, speed, angleDeg, posPercent, phaseDeg, gain, isPlaying) {
    lastInspectorArgs = [loudness, bass, alpha, speed, angleDeg, posPercent, phaseDeg, gain, isPlaying];
    const dayInfo = getActiveDayInfo();

    // Determine detailed playback state (buffering vs playing vs idle)
    const isBuffering = isPlaying && audio && audio.readyState < 3 && !audio.paused;

    if (ui.status) {
      if (isBuffering) {
        ui.status.textContent = '⏳ Buffering';
        ui.status.className = 'inspector-status is-buffering';
      } else if (isPlaying) {
        ui.status.textContent = '▶ Playing';
        ui.status.className = 'inspector-status is-active';
      } else {
        ui.status.textContent = '○ Idle';
        ui.status.className = 'inspector-status';
      }
    }

    if (ui.panel) {
      ui.panel.classList.toggle('is-active', isPlaying && !isBuffering);
    }

    if (ui.sourceBadge) {
      ui.sourceBadge.textContent = getAudioSourceLabel();
    }

    // Skip card updates while the panel is closed; only the active tab's cards are refreshed
    if (!ui.panel || ui.panel.classList.contains('is-collapsed')) return;
    if (activeTab === 'waves') {
      updateWavesTab();
      return;
    }

    // Loudness
    if (ui.loudnessDb) {
      ui.loudnessDb.textContent = toDbFs(loudness);
    }
    if (ui.loudnessPct) {
      ui.loudnessPct.textContent = `${(loudness * 100).toFixed(0)}%`;
    }
    if (ui.loudnessBar) {
      ui.loudnessBar.style.width = `${Math.min(100, loudness * 100).toFixed(1)}%`;
    }

    // Bass
    if (ui.bassDb) {
      ui.bassDb.textContent = toDbFs(bass);
    }
    if (ui.bassPct) {
      ui.bassPct.textContent = `${(bass * 100).toFixed(0)}%`;
    }
    if (ui.bassBar) {
      ui.bassBar.style.width = `${Math.min(100, bass * 100).toFixed(1)}%`;
    }

    // Day-Tint Alpha & Swatch
    if (ui.tintAlpha) {
      ui.tintAlpha.textContent = alpha.toFixed(3);
    }
    if (ui.colorSwatch) {
      ui.colorSwatch.style.backgroundColor = dayInfo.hex;
      ui.colorSwatch.style.boxShadow = `0 0 8px ${dayInfo.hex}`;
    }
    if (ui.dayColor) {
      ui.dayColor.textContent = dayInfo.hex;
      ui.dayColor.style.color = dayInfo.hex;
    }

    // Drift phase and auto-gain
    if (ui.pulseRadius) {
      ui.pulseRadius.textContent = `${phaseDeg.toFixed(0)}°`;
    }
    if (ui.pulseXy) {
      ui.pulseXy.textContent = `Auto-gain ×${gain.toFixed(2)}`;
    }

    // Gradient Sweep Angle
    if (ui.gradientAngle) {
      ui.gradientAngle.textContent = `${angleDeg.toFixed(1)}°`;
    }

    // Center Stop Pos
    if (ui.gradientPos) {
      ui.gradientPos.textContent = `${posPercent.toFixed(1)}%`;
    }

    // Drift speed
    if (ui.bgScale) {
      ui.bgScale.textContent = `${speed.toFixed(2)} rad/s`;
    }

    // Web Audio Engine State
    if (ui.audioContext) {
      const state = audioCtx ? audioCtx.state : 'idle';
      ui.audioContext.textContent = state;
      ui.audioContext.style.color = (state === 'running') ? '#219653' : '#888';
    }
  }

  /**
   * Apply CSS custom properties to :root for organic breathing and pulsing
   */
  function applyCssModulations(alpha, angleDeg, posPercent) {
    const root = document.documentElement;
    const dayInfo = getActiveDayInfo();
    const rgb = dayInfo.rgb;

    root.style.setProperty('--day-tint', pastelTint(rgb, alpha));
    root.style.setProperty('--gradient-angle', `${angleDeg.toFixed(1)}deg`);
    root.style.setProperty('--aurora-pos-a', `${posPercent.toFixed(1)}%`);

    // Raw reactive values for extended CSS styling
    root.style.setProperty('--audio-loudness', currentLoudness.toFixed(3));
    root.style.setProperty('--audio-bass', currentBass.toFixed(3));
  }

  /**
   * Reset CSS custom properties to default resting values
   */
  function resetCssModulations() {
    const root = document.documentElement;
    const dayInfo = getActiveDayInfo();
    const rgb = dayInfo.rgb;

    root.classList.remove('audio-reactive');
    root.style.setProperty('--day-tint', pastelTint(rgb, BASELINE_ALPHA));
    root.style.setProperty('--gradient-angle', `${REST_ANGLE}deg`);
    root.style.setProperty('--aurora-pos-a', `${REST_POS}%`);
    root.style.setProperty('--audio-loudness', '0');
    root.style.setProperty('--audio-bass', '0');

    currentLoudness = 0;
    currentBass = 0;
    currentAlpha = BASELINE_ALPHA;
    currentAngle = REST_ANGLE;
    currentPos = REST_POS;
    currentSpeed = BASE_SPEED;
    phase = 0;
    if (window.Waves) window.Waves.clear();

    updateInspectorUI(0, 0, BASELINE_ALPHA, BASE_SPEED, REST_ANGLE, REST_POS, 0, 1, false);
  }

  function resetPeakTracking() {
    peakLoudness = LOUDNESS_REF;
    peakBass = BASS_REF;
  }

  /**
   * Auto-gain: scale a raw level by its slowly decaying peak so compressed radio
   * and quieter local tracks both span the usable 0..1 range without pinning.
   */
  function normalizeLevels() {
    peakLoudness = Math.max(currentLoudness, peakLoudness * PEAK_DECAY, LOUDNESS_REF * PEAK_FLOOR_RATIO);
    peakBass = Math.max(currentBass, peakBass * PEAK_DECAY, BASS_REF * PEAK_FLOOR_RATIO);
    const loudRef = peakLoudness * PEAK_HEADROOM;
    // Bass is contrast-stretched so only hits near the tracked peak bloom the band
    const bassRatio = currentBass / peakBass;
    return {
      loud: Math.min(1, currentLoudness / loudRef),
      bass: Math.min(1, Math.max(0, (bassRatio - 0.5) / 0.5)),
      gain: LOUDNESS_REF / loudRef
    };
  }

  /**
   * Main requestAnimationFrame animation loop
   */
  function renderFrame(timestamp) {
    if (!isLoopRunning) return;

    const dt = lastTimestamp ? Math.min(0.1, (timestamp - lastTimestamp) / 1000) : 0.016;
    lastTimestamp = timestamp;

    const isPlaybackActive = audio && !audio.paused && !audio.ended;

    if (isPlaybackActive && analyser && dataArray && !prefersReducedMotion && isEnabled) {
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const targetLoudness = sum / (bufferLength * 255);

      // Bass: bins 1-3, centered on bin 2
      const targetBass = ((dataArray[1] || 0) * 0.25 + (dataArray[2] || 0) * 0.50 + (dataArray[3] || 0) * 0.25) / 255;

      currentLoudness = lerp(currentLoudness, targetLoudness, 0.14);
      currentBass = lerp(currentBass, targetBass, 0.20);
      const level = normalizeLevels();

      const targetAlpha = Math.min(MAX_ALPHA, BASELINE_ALPHA + level.loud * 0.02 + level.bass * 0.06);
      // Fast attack on kicks, slower release
      currentAlpha = lerp(currentAlpha, targetAlpha, targetAlpha > currentAlpha ? 0.30 : 0.08);

      // Integrated phase keeps the drift continuous when speed changes
      currentSpeed = lerp(currentSpeed, BASE_SPEED + level.bass * BASS_SPEED_BOOST, 0.05);
      phase += dt * currentSpeed;

      const targetAngle = REST_ANGLE + 25 * Math.sin(phase) + level.bass * 6;
      const targetPos = REST_POS + 15 * Math.sin(phase * 0.63 + 1.3) + level.bass * 4;
      currentAngle = lerp(currentAngle, targetAngle, 0.08);
      currentPos = lerp(currentPos, targetPos, 0.08);

      document.documentElement.classList.add('audio-reactive');
      applyCssModulations(currentAlpha, currentAngle, currentPos);
      if (window.Waves) {
        spectrumAnalyser.getByteFrequencyData(spectrumData);
        window.Waves.update(spectrumData, dt, getActiveDayInfo().rgb, true, audioCtx.sampleRate);
      }
      updateInspectorUI(currentLoudness, currentBass, currentAlpha, currentSpeed, currentAngle, currentPos, (phase * 180 / Math.PI) % 360, level.gain, true);

      animationFrameId = requestAnimationFrame(renderFrame);
    } else {
      // Decay to the static resting state, then stop the loop
      currentLoudness = lerp(currentLoudness, 0, 0.15);
      currentBass = lerp(currentBass, 0, 0.15);
      currentAlpha = lerp(currentAlpha, BASELINE_ALPHA, 0.12);
      currentSpeed = lerp(currentSpeed, BASE_SPEED, 0.1);
      currentAngle = lerp(currentAngle, REST_ANGLE, 0.1);
      currentPos = lerp(currentPos, REST_POS, 0.1);
      if (window.Waves) window.Waves.update(null, dt, getActiveDayInfo().rgb, false);

      const settled = Math.abs(currentAlpha - BASELINE_ALPHA) <= 0.002 &&
        currentBass <= 0.005 &&
        Math.abs(currentAngle - REST_ANGLE) <= 0.3 &&
        Math.abs(currentPos - REST_POS) <= 0.3 &&
        (!window.Waves || window.Waves.isSettled());

      if (!settled) {
        applyCssModulations(currentAlpha, currentAngle, currentPos);
        updateInspectorUI(currentLoudness, currentBass, currentAlpha, currentSpeed, currentAngle, currentPos, (phase * 180 / Math.PI) % 360, 1, false);
        animationFrameId = requestAnimationFrame(renderFrame);
      } else {
        resetCssModulations();
        stopAnimationLoop();
      }
    }
  }

  /**
   * Start requestAnimationFrame loop if not already running
   */
  function startAnimationLoop() {
    if (isLoopRunning) return;
    if (prefersReducedMotion || !isEnabled) return;
    if (document.visibilityState === 'hidden') return;
    if (!audio || audio.paused || audio.ended) return;

    isLoopRunning = true;
    lastTimestamp = 0;
    animationFrameId = requestAnimationFrame(renderFrame);
  }

  /**
   * Stop requestAnimationFrame loop and cancel pending frame
   */
  function stopAnimationLoop() {
    isLoopRunning = false;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  /**
   * Global Spacebar keyboard shortcut handler (toggles play/pause; ignores form inputs)
   */
  function handleKeyDown(event) {
    if (event.key !== ' ' && event.code !== 'Space') return;

    const target = event.target;
    const isInput = (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable ||
      (target.closest && target.closest('input, textarea, select, [contenteditable="true"]'))
    );

    if (isInput) return;

    // Preserve native button / link keyboard triggers
    if (target.tagName === 'BUTTON' || target.tagName === 'A') {
      return;
    }

    if (!audio) {
      audio = document.getElementById('site-audio-player');
      if (!audio) return;
    }

    // Prevent default browser page scrolling on Spacebar
    event.preventDefault();

    initAudioContext();

    if (audio.paused) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(function (err) {
          console.warn('[AudioReactive] Spacebar play prevented:', err);
        });
      }
    } else {
      audio.pause();
    }
  }

  /**
   * One-time user interaction listener to wake / initialize AudioContext
   */
  function handleFirstInteraction() {
    initAudioContext();
    ensureAudioContextResumed();

    // Clean up one-time wake listeners
    window.removeEventListener('pointerdown', handleFirstInteraction);
    window.removeEventListener('touchstart', handleFirstInteraction);
    window.removeEventListener('keydown', handleFirstInteraction);
  }

  function readStored(key) {
    try { return window.localStorage.getItem(key); } catch (err) { return null; }
  }

  function writeStored(key, value) {
    try { window.localStorage.setItem(key, value); } catch (err) { /* private mode: choice just won't persist */ }
  }

  function setBar(pctEl, barEl, level) {
    if (pctEl) pctEl.textContent = `${(level * 100).toFixed(0)}%`;
    if (barEl) barEl.style.width = `${Math.min(100, level * 100).toFixed(1)}%`;
  }

  /**
   * Refresh the Waves tab cards from the live wave bands
   */
  function updateWavesTab() {
    const waves = window.Waves;
    if (!waves) return;
    const levels = waves.getLevels();
    setBar(ui.waveBassPct, ui.waveBassBar, levels.bass);
    setBar(ui.waveMidPct, ui.waveMidBar, levels.mid);
    setBar(ui.waveHighPct, ui.waveHighBar, levels.high);
    if (ui.fftSize) ui.fftSize.textContent = spectrumAnalyser ? String(spectrumAnalyser.fftSize) : '1024';
    if (ui.sampleRate) ui.sampleRate.textContent = audioCtx ? `${audioCtx.sampleRate} Hz` : '- Hz';
    if (ui.waveBars) ui.waveBars.textContent = String(waves.getBarCount());
    if (ui.waveLayout) ui.waveLayout.textContent = waves.isMobile() ? 'mobile' : 'desktop';
    if (ui.waveMode) ui.waveMode.textContent = waves.getMode();
  }

  /**
   * Redraw the inspector with the last values, e.g. after the panel opens while playback is stopped
   */
  function refreshInspector() {
    if (lastInspectorArgs) updateInspectorUI.apply(null, lastInspectorArgs);
  }

  function setActiveTab(name, focusTab) {
    activeTab = name === 'gradient' ? 'gradient' : 'waves';
    ui.tabs.forEach(function (tab) {
      const selected = tab.dataset.tab === activeTab;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focusTab) tab.focus();
    });
    Object.keys(ui.tabPanels).forEach(function (key) {
      ui.tabPanels[key].hidden = key !== activeTab;
    });
    writeStored(STORAGE_TAB, activeTab);
    refreshInspector();
  }

  function setWaveMode(mode) {
    if (!window.Waves || !window.Waves.setMode(mode)) return;
    ui.modeBtns.forEach(function (btn) {
      const selected = btn.dataset.waveMode === mode;
      btn.classList.toggle('is-active', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
    writeStored(STORAGE_MODE, mode);
    refreshInspector();
  }

  /**
   * Cache Audio Inspector elements
   */
  function cacheInspectorElements() {
    ui.panel = document.getElementById('audio-inspector');
    ui.status = document.getElementById('inspector-audio-status');
    ui.sourceBadge = document.getElementById('inspector-source-badge');
    ui.closeBtn = document.getElementById('inspector-close-btn');
    ui.tabs = Array.prototype.slice.call(document.querySelectorAll('.inspector-tab'));
    ui.tabPanels = {
      waves: document.getElementById('inspector-tab-waves'),
      gradient: document.getElementById('inspector-tab-gradient')
    };
    ui.modeBtns = Array.prototype.slice.call(document.querySelectorAll('.inspector-mode-btn'));
    ui.waveBassPct = document.getElementById('pct-wave-bass');
    ui.waveBassBar = document.getElementById('bar-wave-bass');
    ui.waveMidPct = document.getElementById('pct-wave-mid');
    ui.waveMidBar = document.getElementById('bar-wave-mid');
    ui.waveHighPct = document.getElementById('pct-wave-high');
    ui.waveHighBar = document.getElementById('bar-wave-high');
    ui.fftSize = document.getElementById('val-fft-size');
    ui.sampleRate = document.getElementById('val-sample-rate');
    ui.waveBars = document.getElementById('val-wave-bars');
    ui.waveLayout = document.getElementById('val-wave-layout');
    ui.waveMode = document.getElementById('val-wave-mode');
    ui.loudnessDb = document.getElementById('val-loudness-db');
    ui.loudnessPct = document.getElementById('pct-loudness');
    ui.loudnessBar = document.getElementById('bar-loudness');
    ui.bassDb = document.getElementById('val-bass-db');
    ui.bassPct = document.getElementById('pct-bass');
    ui.bassBar = document.getElementById('bar-bass');
    ui.tintAlpha = document.getElementById('val-tint-alpha');
    ui.colorSwatch = document.getElementById('inspector-color-swatch');
    ui.dayColor = document.getElementById('val-day-color');
    ui.pulseRadius = document.getElementById('val-pulse-radius');
    ui.pulseXy = document.getElementById('val-pulse-xy');
    ui.gradientAngle = document.getElementById('val-gradient-angle');
    ui.gradientPos = document.getElementById('val-gradient-pos');
    ui.bgScale = document.getElementById('val-bg-scale');
    ui.audioContext = document.getElementById('val-audio-context');
  }

  /**
   * Hook lifecycle events to audio player and window
   */
  function setupEventListeners() {
    if (!audio) return;

    // Initialize context and start loop when audio starts playing
    audio.addEventListener('play', function () {
      initAudioContext();
      ensureAudioContextResumed();
      startAnimationLoop();
    });

    audio.addEventListener('playing', function () {
      ensureAudioContextResumed();
      startAnimationLoop();
    });

    // Stream reconnects and wake-from-sleep stalls can leave the context suspended
    audio.addEventListener('waiting', ensureAudioContextResumed);
    audio.addEventListener('stalled', ensureAudioContextResumed);

    // New source has a different loudness profile
    audio.addEventListener('loadstart', resetPeakTracking);

    // Gracefully handle pause and track end
    audio.addEventListener('pause', function () {
      // Loop continues momentarily to lerp gracefully to resting state, then halts
      if (!isLoopRunning && (currentBass > 0.005 || Math.abs(currentAlpha - BASELINE_ALPHA) > 0.002 || Math.abs(currentAngle - REST_ANGLE) > 0.3 || (window.Waves && !window.Waves.isSettled()))) {
        isLoopRunning = true;
        lastTimestamp = 0;
        animationFrameId = requestAnimationFrame(renderFrame);
      } else {
        updateInspectorUI(0, 0, BASELINE_ALPHA, BASE_SPEED, REST_ANGLE, REST_POS, 0, 1, false);
      }
    });

    audio.addEventListener('ended', function () {
      resetCssModulations();
      stopAnimationLoop();
    });

    // Mobile / tab switching optimization: document.visibilitychange
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        // Completely pause animation loop when tab is hidden or phone locked (Zero waste)
        stopAnimationLoop();
      } else if (document.visibilityState === 'visible') {
        ensureAudioContextResumed();
        if (audio && !audio.paused && !audio.ended && !prefersReducedMotion && isEnabled) {
          startAnimationLoop();
        } else if (!isLoopRunning) {
          // Paused while hidden: drop any frozen mid-decay frame
          resetCssModulations();
        }
      }
    });

    // Respect user accessibility prefers-reduced-motion setting dynamically
    if (motionQuery) {
      motionQuery.addEventListener('change', function (e) {
        prefersReducedMotion = e.matches;
        if (prefersReducedMotion) {
          stopAnimationLoop();
          resetCssModulations();
        } else if (audio && !audio.paused && !audio.ended && document.visibilityState === 'visible' && isEnabled) {
          startAnimationLoop();
        }
      });
    }

    // Attach global Spacebar listener
    document.addEventListener('keydown', handleKeyDown);

    // One-time interaction listeners for audio context initialization
    window.addEventListener('pointerdown', handleFirstInteraction, { passive: true, once: true });
    window.addEventListener('touchstart', handleFirstInteraction, { passive: true, once: true });
    window.addEventListener('keydown', handleFirstInteraction, { passive: true, once: true });

    // Close button on inspector header
    if (ui.closeBtn) {
      ui.closeBtn.addEventListener('click', function () {
        if (ui.panel) {
          ui.panel.classList.add('is-collapsed');
        }
        const btnVisualizer = document.getElementById('visualizer-toggle-btn');
        if (btnVisualizer) {
          btnVisualizer.setAttribute('aria-expanded', 'false');
          btnVisualizer.classList.remove('active', 'is-active');
        }
      });
    }

    // Visualizer button toggles the inspector panel
    const btnVisualizer = document.getElementById('visualizer-toggle-btn');
    if (btnVisualizer) {
      btnVisualizer.setAttribute('aria-expanded', 'false');
      btnVisualizer.classList.remove('active', 'is-active');

      btnVisualizer.addEventListener('click', function () {
        if (ui.panel) {
          const isCollapsed = ui.panel.classList.toggle('is-collapsed');
          btnVisualizer.setAttribute('aria-expanded', String(!isCollapsed));
          btnVisualizer.classList.toggle('active', !isCollapsed);
          btnVisualizer.classList.toggle('is-active', !isCollapsed);
          if (!isCollapsed) refreshInspector();
        }
      });
    }

    ui.tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { setActiveTab(tab.dataset.tab, false); });
      tab.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const next = ui.tabs[(index + step + ui.tabs.length) % ui.tabs.length];
        setActiveTab(next.dataset.tab, true);
      });
    });

    ui.modeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () { setWaveMode(btn.dataset.waveMode); });
    });
  }

  /**
   * Main module initialization
   */
  function init() {
    audio = document.getElementById('site-audio-player');
    if (!audio) {
      return false;
    }

    // Ensure audio element has crossorigin="anonymous" for Web Audio CORS compatibility
    if (!audio.crossOrigin) {
      audio.crossOrigin = 'anonymous';
    }

    cacheInspectorElements();
    setupEventListeners();
    setActiveTab(readStored(STORAGE_TAB), false);
    setWaveMode(readStored(STORAGE_MODE) === 'single' ? 'single' : 'bands');
    resetCssModulations();

    return true;
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public module API
  return {
    init: init,
    initAudioContext: initAudioContext,
    start: startAnimationLoop,
    stop: stopAnimationLoop,
    reset: resetCssModulations,
    getAudioContext: function () { return audioCtx; },
    getAnalyser: function () { return analyser; },
    getLoudness: function () { return currentLoudness; },
    getBass: function () { return currentBass; },
    setEnabled: function (enabled) {
      isEnabled = !!enabled;
      if (!isEnabled) {
        resetCssModulations();
        stopAnimationLoop();
      } else if (audio && !audio.paused && !audio.ended) {
        startAnimationLoop();
      }
    }
  };
});
