// The single day-palette source for static and audio-reactive consumers.
const dayThemes = [
  { accent: '#b83b68', gradient: { start: '#d8f3fe', end: '#fff3d1' } }, // Sunday
  { accent: '#6b498f', gradient: { start: '#dcfceb', end: '#ffe0d6' } }, // Monday
  { accent: '#2a698a', gradient: { start: '#ffe3ec', end: '#d5f7e6' } }, // Tuesday
  { accent: '#1b7a70', gradient: { start: '#efe3fc', end: '#fff1d0' } }, // Wednesday
  { accent: '#437752', gradient: { start: '#ffe7d8', end: '#daeafc' } }, // Thursday
  { accent: '#b26227', gradient: { start: '#dcf8f7', end: '#fbe0f3' } }, // Friday
  { accent: '#ad454b', gradient: { start: '#fff6d5', end: '#d7f2f8' } }  // Saturday
];

function hexToRgba(hex, alpha) {
  let cleanHex = hex.replace('#', '');
  let r = parseInt(cleanHex.substring(0, 2), 16);
  let g = parseInt(cleanHex.substring(2, 4), 16);
  let b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyDayTheme(dayIndex) {
  const today = typeof dayIndex === 'number' ? dayIndex : new Date().getDay(); // 0-6
  const theme = dayThemes[today];
  const activeColor = theme.accent;
  const gradient = theme.gradient;

  // Target all links inside the header (both the title and Projects/Contact)
  const headerLinks = document.querySelectorAll('header a');
  headerLinks.forEach(link => {
    link.style.color = activeColor;
    link.style.transition = 'color 0.6s ease-in-out';
  });

  // Dynamically update CSS variables for gradient stops and active day color
  const softTint = hexToRgba(activeColor, 0.12);
  document.documentElement.style.setProperty('--gradient-start', gradient.start);
  document.documentElement.style.setProperty('--day-tint', softTint);
  document.documentElement.style.setProperty('--gradient-end', gradient.end);
  document.documentElement.style.setProperty('--day-color', activeColor);
}

if (typeof window !== 'undefined') {
  window.applyDayTheme = applyDayTheme;
  window.dayThemes = dayThemes;
}

// Run on page load
applyDayTheme();

// Must match the 0.6s :root transition in styles.css
const TRANSITION_MS = 600;
const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function initThemeToy() {
  const toy = document.getElementById('theme-toy');
  if (!toy) return;
  const toggle = toy.querySelector('.theme-toy-btn');
  const radius = 130;
  let current = new Date().getDay();
  let locked = false;
  let dragging = false;
  let wasOpen = false;
  let hovered = null;

  // Fan the days out over the quarter-arc from left (180deg) to up (270deg)
  const items = dayLabels.map((label, i) => {
    const btn = document.createElement('button');
    const angle = (180 + 90 * i / 6) * Math.PI / 180;
    const theme = dayThemes[i];
    const tint = hexToRgba(theme.accent, 0.18);
    btn.type = 'button';
    btn.className = 'theme-day';
    btn.textContent = label;
    btn.dataset.day = i;
    btn.setAttribute('aria-label', dayNames[i]);
    btn.style.setProperty('--x', `${Math.round(radius * Math.cos(angle))}px`);
    btn.style.setProperty('--y', `${Math.round(radius * Math.sin(angle))}px`);
    btn.style.background = `linear-gradient(${tint}, ${tint}), #fff`;
    btn.style.color = theme.accent;
    btn.addEventListener('click', () => select(i));
    toy.appendChild(btn);
    return btn;
  });

  function markCurrent() {
    items.forEach((btn, i) => btn.classList.toggle('is-current', i === current));
  }

  function setOpen(open) {
    toy.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  function setHover(btn) {
    if (hovered === btn) return;
    if (hovered) hovered.classList.remove('is-hover');
    hovered = btn;
    if (hovered) hovered.classList.add('is-hover');
  }

  function select(i) {
    if (locked) return;
    locked = true;
    toy.classList.add('is-locked');
    current = i;
    markCurrent();
    setOpen(false);
    applyDayTheme(i);
    setTimeout(() => {
      locked = false;
      toy.classList.remove('is-locked');
    }, TRANSITION_MS);
  }

  toggle.addEventListener('pointerdown', e => {
    if (locked) return;
    wasOpen = toy.classList.contains('is-open');
    dragging = true;
    toggle.setPointerCapture(e.pointerId);
    if (!wasOpen) setOpen(true);
  });

  toggle.addEventListener('pointermove', e => {
    if (!dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    setHover(el && el.closest('.theme-day'));
  });

  toggle.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    const target = hovered;
    setHover(null);
    if (target) select(Number(target.dataset.day));
    else if (wasOpen) setOpen(false);
  });

  toggle.addEventListener('pointercancel', () => {
    dragging = false;
    setHover(null);
  });

  // detail === 0 means keyboard activation; pointer input is handled above
  toggle.addEventListener('click', e => {
    if (e.detail === 0 && !locked) setOpen(!toy.classList.contains('is-open'));
  });

  document.addEventListener('pointerdown', e => {
    if (!toy.contains(e.target)) setOpen(false);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') setOpen(false);
  });

  markCurrent();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThemeToy);
} else {
  initThemeToy();
}
