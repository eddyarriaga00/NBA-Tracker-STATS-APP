// Team colors can be near-black or near-white; nudge them so they stay
// visible against the current background.
function lum(hex) {
  const h = hex.replace('#', '');
  if (h.length < 6) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Team color that shows up on the current background; falls back to the
 *  team's secondary color, then to neutral gray. */
export function visibleColor(hex, dark, alt) {
  const ok = (c) => {
    if (!c) return false;
    const l = lum(c);
    return dark ? l >= 0.12 : l <= 0.85;
  };
  if (ok(hex || '#888888')) return hex || '#888888';
  if (ok(alt)) return alt;
  return '#8e8e93';
}
