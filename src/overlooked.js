#!/usr/bin/env node
/**
 * The overlooked score: mechanically strong pairs that nobody actually plays.
 *
 *   node src/overlooked.js                  # top overlooked pairs
 *   node src/overlooked.js --colors UBG     # restrict to a colour identity
 *   node src/overlooked.js --card "Name"    # overlooked partners for one card
 *   node src/overlooked.js --playrate       # just the card play-rate table
 *
 * Card play-rate is derived by pushing each stored decklist's archetype
 * popularity down onto its cards, so a card in a 8%-of-meta deck inherits that
 * weight. Co-occurrence counts how often two cards appear in the same deck.
 *
 *   overlooked = synergy x (1 - co-occurrence) x plausibility
 *
 * where plausibility keeps at least one card of the pair something people
 * actually play — otherwise "nobody plays these together" just means "these
 * are both bad".
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./fetch-data.js";
import { loadCards, findCard } from "./cards.js";
import { scoreSynergy } from "./synergy.js";
import { fitsColors } from "./colors.js";

const DECKS_FILE = join(DATA_DIR, "meta-decks.json");
if (!existsSync(DECKS_FILE)) {
  console.error("No data/meta-decks.json — import some decklists first.");
  process.exit(1);
}
const { decks } = JSON.parse(readFileSync(DECKS_FILE, "utf8"));
const pool = loadCards();

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const has = (n) => process.argv.includes(`--${n}`);

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
const byNorm = new Map();
for (const c of pool) {
  byNorm.set(norm(c.name), c);
  byNorm.set(norm(c.name.split(" // ")[0]), c);
}
const resolve = (n) => byNorm.get(norm(n)) ?? findCard(pool, n);

/* ---------- card-level play rate + co-occurrence ---------- */

const playWeight = new Map(); // card name -> summed archetype popularity
const deckCount = new Map(); // card name -> number of decks containing it
const coDeck = new Map(); // "a|b" -> decks containing both
const totalShare = decks.reduce((s, d) => s + (d.meta_share ?? 0), 0) || 1;

for (const deck of decks) {
  const share = deck.meta_share ?? 0;
  const names = [];
  for (const raw of Object.keys(deck.main)) {
    const c = resolve(raw);
    if (!c || /Land/.test(c.type_line)) continue; // lands aren't synergy signal
    names.push(c.name);
    playWeight.set(c.name, (playWeight.get(c.name) ?? 0) + share);
    deckCount.set(c.name, (deckCount.get(c.name) ?? 0) + 1);
  }
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const k = [names[i], names[j]].sort().join("|");
      coDeck.set(k, (coDeck.get(k) ?? 0) + 1);
    }
}

/** 0..1 — how much of the observed meta plays this card. */
const playRate = (name) => (playWeight.get(name) ?? 0) / totalShare;

if (has("playrate")) {
  const rows = [...playWeight.entries()]
    .map(([name, w]) => ({ name, rate: w / totalShare, decks: deckCount.get(name), card: resolve(name) }))
    .sort((a, b) => b.rate - a.rate);
  console.log(`\nCard play-rate across ${decks.length} decks (${(totalShare * 100).toFixed(1)}% of meta covered)\n`);
  console.log(`  play%  decks  ourPower  card`);
  console.log("  " + "-".repeat(60));
  for (const r of rows.slice(0, 30)) {
    console.log(
      `  ${(r.rate * 100).toFixed(1).padStart(5)}  ${String(r.decks).padStart(5)}  ${String(r.card?.ai?.power ?? "?").padStart(8)}  ${r.name}`
    );
  }
  const mis = rows.filter((r) => r.rate > 0.05 && (r.card?.ai?.power ?? 5) <= 2);
  if (mis.length) {
    console.log(`\n  Cards with >5% play-rate that we rated power <=2 (our rating is wrong):`);
    for (const r of mis.slice(0, 12))
      console.log(`     ${(r.rate * 100).toFixed(1).padStart(5)}%  power ${r.card.ai.power}  ${r.name}`);
  }
  console.log("");
  process.exit(0);
}

/* ---------- overlooked pairs ---------- */

const colors = arg("colors");
const focusName = arg("card");
const TOP = Number(arg("top", 20));

const focus = focusName ? resolve(focusName) : null;
if (focusName && !focus) {
  console.error(`Card not found: ${focusName}`);
  process.exit(1);
}

// Only consider cards that are analyzed, nonland, and colour-legal.
const candidates = pool.filter(
  (c) => c.ai && !/Land/.test(c.type_line) && fitsColors(c, colors)
);

const results = [];
const consider = focus ? [focus] : candidates;

for (const a of consider) {
  for (const b of candidates) {
    if (a === b || a.name >= b.name) continue;
    const { score, reasons } = scoreSynergy(a, b);
    if (score < 4) continue; // only genuinely strong mechanical pairs

    const key = [a.name, b.name].sort().join("|");
    const together = coDeck.get(key) ?? 0;
    const pa = playRate(a.name);
    const pb = playRate(b.name);

    // At least one half should be a card people actually play, else "unplayed
    // together" is just "both unplayable".
    const plausibility = Math.max(pa, pb);
    if (plausibility < 0.03) continue;

    // The *unplayed* half still has to be worth sleeving. Without this the
    // list fills with technically-synergistic junk that nobody plays for good
    // reason. (power is a weak signal, so this is a floor, not a ranking.)
    const quiet = pa < pb ? a : b;
    if ((quiet.ai?.power ?? 0) < 3) continue;

    // Already played together in the observed meta -> not overlooked.
    if (together > 0) continue;

    const overlooked = score * plausibility;
    results.push({ a, b, score, reasons, pa, pb, overlooked });
  }
}

results.sort((x, y) => y.overlooked - x.overlooked);

/**
 * Enforce variety. One popular card with a common synergy axis (a counters
 * payoff, say) pairs identically with dozens of partners, which would fill the
 * whole list with the same suggestion reworded. Cap how often any single card
 * may appear so the output spans different ideas.
 */
const CAP = focus ? Infinity : 2;
const seen = new Map();
const diverse = [];
for (const r of results) {
  const na = seen.get(r.a.name) ?? 0;
  const nb = seen.get(r.b.name) ?? 0;
  if (na >= CAP || nb >= CAP) continue;
  seen.set(r.a.name, na + 1);
  seen.set(r.b.name, nb + 1);
  diverse.push(r);
}
results.length = 0;
results.push(...diverse);

console.log(
  `\nOverlooked pairs — strong synergy, never seen together in ${decks.length} real decks` +
    (colors ? `  [${colors}]` : "") +
    (focus ? `  [partners for ${focus.name}]` : "")
);
console.log("=".repeat(76));
console.log(`covering ${(totalShare * 100).toFixed(1)}% of the tracked meta\n`);

if (!results.length) {
  console.log("  Nothing found. Import more decklists, or loosen --colors.\n");
  process.exit(0);
}

for (const r of results.slice(0, TOP)) {
  console.log(
    `[${r.overlooked.toFixed(2)}]  ${r.a.name}  +  ${r.b.name}    (synergy ${r.score})`
  );
  console.log(
    `        played: ${(r.pa * 100).toFixed(0)}% / ${(r.pb * 100).toFixed(0)}% of meta — but never in the same deck`
  );
  for (const rs of r.reasons.slice(0, 2)) {
    console.log(
      rs.deck_want
        ? `        ◆ ${rs.consumer} wants a deck of ${rs.label}; ${rs.provider} fits`
        : `        → ${rs.provider} gives ${rs.label} to ${rs.consumer}`
    );
  }
  console.log("");
}
