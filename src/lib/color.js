// Team colors can be near-black or near-white; nudge them so they stay
// visible against the current background.
function lum(hex) {
  const h = hex.replace('#', '');
  if (h.length < 6) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function visibleColor(hex, dark) {
  const l = lum(hex || '#888888');
  if (dark && l < 0.12) return '#8e8e93';
  if (!dark && l > 0.85) return '#8e8e93';
  return hex;
}
