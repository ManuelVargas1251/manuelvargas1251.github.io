// activeColor: readable text/link tone.
const dayColors = [
  '#b83b68',  // sunday (0)
  '#6b498f',  // monday (1)
  '#2a698a',  // tuesday (2)
  '#1b7a70',  // wednesday (3)
  '#437752',  // thursday (4)
  '#b26227',  // friday (5)
  '#ad454b'   // saturday (6)
];

// Distinct start and end gradient stops creating 3 distinct, iridescent stops per day:
// start (top-left) -> --day-tint (middle 12% alpha) -> end (bottom-right)
const dayGradients = [
  // Sunday
  { start: '#d8f3fe', end: '#fff3d1' },
  // Monday
  { start: '#dcfceb', end: '#ffe0d6' },
  // Tuesday
  { start: '#ffe3ec', end: '#d5f7e6' },
  // Wednesday
  { start: '#efe3fc', end: '#fff1d0' },
  // Thursday
  { start: '#ffe7d8', end: '#daeafc' },
  // Friday
  { start: '#dcf8f7', end: '#fbe0f3' },
  // Saturday
  { start: '#fff6d5', end: '#d7f2f8' }
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
  const activeColor = dayColors[today];
  const gradient = dayGradients[today];

  // Target all links inside the header (both the title and Projects/Contact)
  const headerLinks = document.querySelectorAll('header a');
  headerLinks.forEach(link => {
    link.style.color = activeColor;
    link.style.transition = 'color 0.5s ease';
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
}

// Run on page load
applyDayTheme();
