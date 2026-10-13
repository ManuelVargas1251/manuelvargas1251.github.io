const dayColors = [
  '#a63d52',  // sunday - Deep Dusty Rose
  '#784488',  // monday - Muted Plum / Vintage Violet
  '#3d608a',  // tuesday - Slate Periwinkle Blue
  '#2d7a82',  // wednesday - Deep Peacock / Dusty Teal
  '#3d7055',  // thursday - Deep Sage / Forest Moss
  '#9e7a2b',  // friday - Warm Honey Gold
  '#aa563f'   // saturday - Muted Terracotta / Vintage Coral
];

function hexToRgba(hex, alpha) {
  let cleanHex = hex.replace('#', '');
  let r = parseInt(cleanHex.substring(0, 2), 16);
  let g = parseInt(cleanHex.substring(2, 4), 16);
  let b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyDayTheme() {
  const today = new Date().getDay(); // 0-6
  const activeColor = dayColors[today];

  // Target all links inside the header (both the title and Projects/Contact)
  const headerLinks = document.querySelectorAll('header a');
  headerLinks.forEach(link => {
    link.style.color = activeColor;
    link.style.transition = 'color 0.5s ease';
  });

  // 2. Dynamically update the CSS variable for the background gradient tint
  const softTint = hexToRgba(activeColor, 0.12);
  document.documentElement.style.setProperty('--day-tint', softTint);
}

// Run on page load
applyDayTheme();