/**
 * Color-identity helpers. Kept free of Node imports so the scoring engine
 * can load unchanged in the browser as well as in the CLI/server.
 */

/** True if card's color identity fits inside the given identity (e.g. "WBG"). */
export function fitsColors(card, colors) {
  if (!colors) return true;
  const allowed = new Set(colors.toUpperCase().split(""));
  return card.color_identity.every((c) => allowed.has(c));
}
