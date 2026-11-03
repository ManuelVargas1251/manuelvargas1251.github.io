/**
 * Persistent Audio Player Controller
 * Features:
 * - local playlist
 * - Automatic progression to next track on ended
 * - Auto-fallback to live Radio on 404/missing files/end of playlist
 * - Instant manual source toggles ("Playlist" & "Radio")
 * - Idle startup - user interaction required to start playback
 **/
(function () {
  'use strict';

  // Local playlist tracks
  const PLAYLIST = [
    {
      title: 'Manuel - Me Now (Edit)',
      src: 'assets/audio/Meow.ogg'
    }
  ];

  // Bassdrive live stream endpoints
  const RADIO_URLS = [
    'https://chi2.bassdrive.net/stream',
    'https://bassdrive.radioca.st/stream'
  ];

  const audio = document.getElementById('site-audio-player');
  const trackTitle = document.getElementById('player-track-title');
  const btnPlaylist = document.getElementById('btn-src-playlist');
  const btnRadio = document.getElementById('btn-src-radio');
  const btnVisualizer = document.getElementById('visualizer-toggle-btn');

  if (!audio || !trackTitle || !btnPlaylist || !btnRadio) {
    return;
  }

  // Ensure idle state on load
  audio.preload = 'none';

  let currentSource = 'playlist'; // 'playlist' | 'radio'
  let playlistIndex = 0;
  let radioIndex = 0;

  function currentUrl() {
    return currentSource === 'radio' ? RADIO_URLS[radioIndex] : PLAYLIST[playlistIndex].src;
  }

  function currentLabel() {
    return currentSource === 'radio' ? 'Bassdrive Radio (Live)' : PLAYLIST[playlistIndex].title;
  }

  function updateActiveUI() {
    const isRadio = currentSource === 'radio';
    btnRadio.classList.toggle('active', isRadio);
    btnRadio.classList.toggle('is-active', isRadio);
    btnRadio.setAttribute('aria-pressed', String(isRadio));
    btnPlaylist.classList.toggle('active', !isRadio);
    btnPlaylist.classList.toggle('is-active', !isRadio);
    btnPlaylist.setAttribute('aria-pressed', String(!isRadio));
    trackTitle.textContent = currentLabel();
    updateMediaSessionMetadata(); // Update Media Session metadata with the current track information
  }

  // Updates the Media Session metadata with the current track information
  // Feeds iOS lock screen / Control Center
  function updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentLabel(),
      artist: 'Manuel Vargas',
      album: currentSource === 'radio' ? 'Live Radio' : 'Playlist',
      artwork: [
        { src: new URL('assets/img/artwork-512.png', document.baseURI).href, sizes: '512x512', type: 'image/png' }
      ]
    });
  }

  // load() clears any earlier error state so the native play button works again
  function loadAndPlay() {
    audio.src = currentUrl();
    audio.load();
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('Playback interrupted or blocked:', err);
      });
    }
  }

  function playRadioStream() {
    currentSource = 'radio';
    radioIndex = 0;
    updateActiveUI();
    loadAndPlay();
  }

  function playPlaylistTrack(index = 0) {
    currentSource = 'playlist';
    playlistIndex = index % PLAYLIST.length;
    updateActiveUI();
    loadAndPlay();
  }

  // Idle source so the native play button works before any toggle is clicked
  audio.src = currentUrl();
  updateActiveUI();

  // Set up Media Session action handlers for play, pause, next, and previous track actions
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', function () {
      // If it's live radio and the element is in an error or stalled state, refresh the source on play
      if (currentSource === 'radio' && (audio.error || audio.paused)) {
        audio.src = currentUrl();
        audio.load();
      }
      return audio.play().catch(function (err) {
        console.warn('Playback blocked:', err);
      });
    });
    navigator.mediaSession.setActionHandler('pause', function () {
      audio.pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', function () {
      if (currentSource === 'playlist') {
        playPlaylistTrack((playlistIndex - 1 + PLAYLIST.length) % PLAYLIST.length);
      }
    });
    navigator.mediaSession.setActionHandler('nexttrack', function () {
      if (currentSource === 'playlist') {
        playPlaylistTrack(playlistIndex + 1);
      }
    });
    audio.addEventListener('play', function () {
      navigator.mediaSession.playbackState = 'playing';
    });
    audio.addEventListener('pause', function () {
      navigator.mediaSession.playbackState = 'paused';
    });
  }

  // --- Live Stream Stall & Wake Recovery ---
  let radioStallTimeout = null;

  audio.addEventListener('waiting', function () {
    // If we are on the live radio and it gets stuck buffering after wake/pause
    if (currentSource === 'radio') {
      clearTimeout(radioStallTimeout);
      // Give it 4 seconds to recover on its own; if not, force-refresh the live stream connection
      radioStallTimeout = setTimeout(function () {
        console.warn('Radio stream stalled after sleep/wake. Reconnecting live socket...');
        audio.src = currentUrl();
        audio.load();
        audio.play().catch(function (err) {
          console.warn('Auto-reconnect play blocked:', err);
        });
      }, 4000);
    }
  });

  audio.addEventListener('playing', function () {
    // Clear the stall timeout once audio is flowing smoothly again
    clearTimeout(radioStallTimeout);
    trackTitle.textContent = currentLabel();
    // Update Media Session metadata with the current track information
    updateMediaSessionMetadata();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
  });

  // Playlist failure falls back to radio; radio failures walk through the mirrors
  audio.addEventListener('error', function () {
    console.warn(`Audio source failed: ${audio.src}`);
    if (currentSource === 'playlist') {
      playRadioStream();
    } else if (radioIndex + 1 < RADIO_URLS.length) {
      radioIndex += 1;
      loadAndPlay();
    } else {
      radioIndex = 0;
      trackTitle.textContent = 'Unavailable. Press play to retry';
    }
  });

  // Native play on a failed element does nothing, so reload the current source
  audio.addEventListener('play', function () {
    if (audio.error) {
      loadAndPlay();
    }
  });

  // Track finished handling
  audio.addEventListener('ended', function () {
    if (currentSource === 'playlist') {
      if (playlistIndex + 1 < PLAYLIST.length) {
        // Play next song in the folder
        console.log('Track finished. Playing next track in playlist...');
        playPlaylistTrack(playlistIndex + 1);
      } else {
        // End of playlist: auto-transition to live Radio
        console.log('Playlist finished. Auto-transitioning to live radio...');
        playRadioStream();
      }
    }
  });

  // Manual Radio button
  btnRadio.addEventListener('click', function () {
    playRadioStream();
  });

  // Manual Playlist button
  btnPlaylist.addEventListener('click', function () {
    playPlaylistTrack(0);
  });

  // Visualizer button hook
  if (btnVisualizer) {
    btnVisualizer.addEventListener('click', function () {
      const isExpanded = btnVisualizer.getAttribute('aria-expanded') === 'true';
      btnVisualizer.setAttribute('aria-expanded', String(!isExpanded));
      btnVisualizer.classList.toggle('active', !isExpanded);
      btnVisualizer.classList.toggle('is-active', !isExpanded);
      console.log('Visualizer slot toggled. Connected audio element:', audio);
    });
  }
})();
