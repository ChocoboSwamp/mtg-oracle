#!/usr/bin/env node
/**
 * Cross-source card frequency and deck comparison.
 *   node src/compare-decks.js                       # card play-rates across all stored decks
 *   node src/compare-decks.js "Selesnya" "Arena Bo3 Selesnya"   # diff two decks
 *
 * With enough decks this becomes the playability prior the `power` rating
 * should have been: how often a card actually shows up in real lists.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./fetch-data.js";
import { loadCards, findCard } from "./cards.js";

const DECKS_FILE = join(DATA_DIR, "meta-decks.json");
if (!existsSync(DECKS_FILE)) {
  console.error("No data/meta-decks.json.");
  process.exit(1);
}
const { decks } = JSON.parse(readFileSync(DECKS_FILE, "utf8"));
const pool = loadCards();
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
const byNorm = new Map();
for (const c of pool) {
  byNorm.set(norm(c.name), c);
  byNorm.set(norm(c.name.split(" // ")[0]), c);
}
const resolve = (n) => byNorm.get(norm(n)) ?? findCard(pool, n);
const isLand = (n) => /Land/.test(resolve(n)?.type_line ?? "");

const [aName, bName] = process.argv.slice(2);

/* ---------- two-deck diff ---------- */
if (aName && bName) {
  const a = decks.find((d) => d.name.toLowerCase().includes(aName.toLowerCase()));
  const b = decks.find((d) => d.name.toLowerCase().includes(bName.toLowerCase()));
  if (!a || !b) {
    console.error(`Could not find both decks. Available:\n  ${decks.map((d) => d.name).join("\n  ")}`);
    process.exit(1);
  }
  const canon = (deck) => {
    const o = {};
    for (const [n, q] of Object.entries(deck.main)) {
      const c = resolve(n);
      o[c ? c.name : n] = q;
    }
    return o;
  };
  const A = canon(a);
  const B = canon(b);
  const names = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort();

  let shared = 0;
  let totalA = 0;
  let totalB = 0;
  const rows = [];
  for (const n of names) {
    const qa = A[n] ?? 0;
    const qb = B[n] ?? 0;
    totalA += qa;
    totalB += qb;
    shared += Math.min(qa, qb);
    rows.push({ n, qa, qb, land: isLand(n) });
  }
  const overlap = (2 * shared) / (totalA + totalB);

  console.log(`\n${a.name}   vs   ${b.name}`);
  console.log("=".repeat(72));
  console.log(`Card overlap: ${(overlap * 100).toFixed(1)}%  (${shared} shared cards of ${totalA}/${totalB})\n`);

  const fmt = (r) =>
    `  ${String(r.qa || "·").padStart(2)}  ${String(r.qb || "·").padStart(2)}   ${r.n}${r.land ? "  (land)" : ""}`;
  console.log(`  ${"A".padStart(2)}  ${"B".padStart(2)}   card`);
  console.log("  " + "-".repeat(60));
  console.log("\n  -- in both --");
  rows.filter((r) => r.qa && r.qb).forEach((r) => console.log(fmt(r)));
  console.log(`\n  -- only in ${a.name} --`);
  rows.filter((r) => r.qa && !r.qb).forEach((r) => console.log(fmt(r)));
  console.log(`\n  -- only in ${b.name} --`);
  rows.filter((r) => !r.qa && r.qb).forEach((r) => console.log(fmt(r)));
  console.log("");
  process.exit(0);
}

/* ---------- play-rate across all decks ---------- */
const nDecks = decks.length;
const appear = new Map(); // canonical name -> {decks, copies}
for (const d of decks) {
  const seen = new Set();
  for (const [n, q] of Object.entries(d.main)) {
    const c = resolve(n);
    const key = c ? c.name : n;
    if (seen.has(key)) continue;
    seen.add(key);
    const rec = appear.get(key) ?? { decks: 0, copies: 0 };
    rec.decks++;
    rec.copies += q;
    appear.set(key, rec);
  }
}

console.log(`\nCard play-rate across ${nDecks} stored decks`);
console.log("=".repeat(72));
console.log("(this is the playability signal `power` was guessing at)\n");
console.log(`  decks  avg   our    card`);
console.log(`   seen  cop  power`);
console.log("  " + "-".repeat(62));

const rows = [...appear.entries()]
  .filter(([n]) => !isLand(n))
  .map(([n, r]) => ({ n, ...r, power: resolve(n)?.ai?.power ?? null }))
  .sort((x, y) => y.decks - x.decks || y.copies - x.copies);

for (const r of rows.filter((r) => r.decks > 1)) {
  const pct = ((r.decks / nDecks) * 100).toFixed(0);
  console.log(
    `  ${String(r.decks).padStart(3)}/${nDecks}  ${(r.copies / r.decks).toFixed(1)}   ${String(r.power ?? "?").padStart(3)}    ${r.n}`
  );
}

// Where our power rating disagrees with observed play
const disagree = rows.filter((r) => r.decks >= 2 && (r.power ?? 3) <= 2);
if (disagree.length) {
  console.log(`\n  ⚠ Played in 2+ decks but rated power ≤2 by us — likely mis-rated:`);
  for (const r of disagree) console.log(`      power ${r.power}  ${r.n}  (in ${r.decks} decks)`);
}
console.log("");
