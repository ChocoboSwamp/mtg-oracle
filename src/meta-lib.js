/**
 * Shared meta analysis: card play-rate, pair co-occurrence, and the overlooked
 * score. Node-free so the CLI, the build step and the browser all run the same
 * implementation.
 */
import { scoreSynergy } from "./synergy.js";
import { fitsColors } from "./colors.js";

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

/** Build a name->card resolver over the pool, tolerant of DFC front-face names. */
export function makeResolver(pool) {
  const by = new Map();
  for (const c of pool) {
    by.set(norm(c.name), c);
    by.set(norm(c.name.split(" // ")[0]), c);
  }
  return (n) => by.get(norm(n)) ?? null;
}

/**
 * Push each deck's archetype popularity down onto its cards.
 * Returns per-card play-rate (0..1 of the tracked meta), deck counts, and
 * pair co-occurrence counts.
 */
export function computePlayRate(decks, resolve) {
  const weight = new Map();
  const deckCount = new Map();
  const co = new Map();
  const totalShare = decks.reduce((s, d) => s + (d.meta_share ?? 0), 0) || 1;

  for (const deck of decks) {
    const share = deck.meta_share ?? 0;
    const names = [];
    for (const raw of Object.keys(deck.main ?? {})) {
      const c = resolve(raw);
      if (!c || /Land/.test(c.type_line)) continue;
      names.push(c.name);
      weight.set(c.name, (weight.get(c.name) ?? 0) + share);
      deckCount.set(c.name, (deckCount.get(c.name) ?? 0) + 1);
    }
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const k = [names[i], names[j]].sort().join("|");
        co.set(k, (co.get(k) ?? 0) + 1);
      }
  }

  const rate = new Map();
  for (const [name, w] of weight) rate.set(name, w / totalShare);
  return { rate, deckCount, co, totalShare, deckTotal: decks.length };
}

/**
 * Find pairs that are mechanically strong but never appear together in the
 * observed meta.
 *
 * Guards, each learned from a bad first run:
 *  - one half must actually be played, else "unplayed together" just means
 *    "both unplayable";
 *  - the quieter half must clear a power floor, or the list fills with
 *    technically-synergistic cards nobody sleeves for good reason;
 *  - no card may appear more than `cap` times, or a single hub card with a
 *    common synergy axis floods the list with reworded duplicates.
 */
export function findOverlooked(pool, playData, opts = {}) {
  const {
    colors,
    focus = null,
    minSynergy = 4,
    minPlay = 0.03,
    minQuietPower = 3,
    cap = 2,
    limit = 40,
  } = opts;
  const { rate, co } = playData;
  const playOf = (n) => rate.get(n) ?? 0;

  const candidates = pool.filter(
    (c) => c.ai && !/Land/.test(c.type_line) && fitsColors(c, colors)
  );
  const consider = focus ? [focus] : candidates;

  const out = [];
  for (const a of consider) {
    for (const b of candidates) {
      if (a === b) continue;
      if (!focus && a.name >= b.name) continue;
      const { score, reasons } = scoreSynergy(a, b);
      if (score < minSynergy) continue;

      const pa = playOf(a.name);
      const pb = playOf(b.name);
      const plausibility = Math.max(pa, pb);
      if (plausibility < minPlay) continue;

      const quiet = pa < pb ? a : b;
      if ((quiet.ai?.power ?? 0) < minQuietPower) continue;

      if ((co.get([a.name, b.name].sort().join("|")) ?? 0) > 0) continue;

      out.push({
        a: a.name,
        b: b.name,
        score,
        reasons,
        play_a: pa,
        play_b: pb,
        overlooked: Math.round(score * plausibility * 100) / 100,
      });
    }
  }
  out.sort((x, y) => y.overlooked - x.overlooked);

  const seen = new Map();
  const diverse = [];
  const effectiveCap = focus ? Infinity : cap;
  for (const r of out) {
    const na = seen.get(r.a) ?? 0;
    const nb = seen.get(r.b) ?? 0;
    if (na >= effectiveCap || nb >= effectiveCap) continue;
    seen.set(r.a, na + 1);
    seen.set(r.b, nb + 1);
    diverse.push(r);
    if (diverse.length >= limit) break;
  }
  return diverse;
}
