/**
 * Card lookup. Node-free so the browser build can reuse it.
 */

/** Case-insensitive exact-then-prefix name lookup. */
export function findCard(cards, query) {
  const q = query.toLowerCase();
  return (
    cards.find((c) => c.name.toLowerCase() === q) ??
    cards.find((c) => c.name.toLowerCase().split(" // ")[0] === q) ??
    cards.find((c) => c.name.toLowerCase().startsWith(q))
  );
}
