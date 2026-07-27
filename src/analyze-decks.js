#!/usr/bin/env node
/**
 * Analyze real meta decklists with the synergy engine.
 *   node src/analyze-decks.js            # all decks
 *   node src/analyze-decks.js "Izzet"    # decks matching a name
 *
 * Answers "why is this deck strong?" from structured data rather than opinion:
 *  - which card pairs inside the deck score highest (the actual engine of the deck)
 *  - what the deck's role composition is (removal / threats / card advantage ...)
 *  - the mana curve
 *  - what our power ratings say about it, which is also a calibration check:
 *    if a deck winning tournaments is full of cards we rated 2, our ratings are wrong.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./fetch-data.js";
import { loadCards, findCard } from "./cards.js";
import { scoreSynergy } from "./synergy.js";

const DECKS_FILE = join(DATA_DIR, "meta-decks.json");

if (!existsSync(DECKS_FILE)) {
  console.error("No data/meta-decks.json — nothing to analyze.");
  process.exit(1);
}

const filter = (process.argv[2] ?? "").toLowerCase();
const { fetched, meta_snapshot, decks } = JSON.parse(readFileSync(DECKS_FILE, "utf8"));
const pool = loadCards();

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
const byNorm = new Map();
for (const c of pool) {
  byNorm.set(norm(c.name), c);
  byNorm.set(norm(c.name.split(" // ")[0]), c);
}
const resolve = (name) => byNorm.get(norm(name)) ?? findCard(pool, name);

function bar(n, max, width = 24) {
  return "█".repeat(Math.max(0, Math.round((n / Math.max(max, 1)) * width)));
}

console.log(`\nMeta snapshot — ${meta_snapshot.window}, ${meta_snapshot.sample_decks} decks (fetched ${fetched})\n`);
const maxShare = Math.max(...Object.values(meta_snapshot.shares));
for (const [arch, share] of Object.entries(meta_snapshot.shares)) {
  console.log(`  ${arch.padEnd(20)} ${(share * 100).toFixed(0).padStart(3)}%  ${bar(share, maxShare)}`);
}
console.log(`\n  ${meta_snapshot.note}\n`);

for (const deck of decks) {
  if (filter && !deck.name.toLowerCase().includes(filter)) continue;

  console.log("\n" + "=".repeat(72));
  const prov = [
    deck.finish,
    deck.event,
    deck.source,
    deck.meta_share != null ? `${(deck.meta_share * 100).toFixed(1)}% of meta` : null,
    deck.win_rate != null ? `${(deck.win_rate * 100).toFixed(0)}% WR` : null,
    deck.sample != null ? `n=${deck.sample}` : null,
  ].filter(Boolean);
  console.log(`${deck.name}  —  ${prov.join(" · ")} (${deck.date})`);
  if (deck.sample != null && deck.sample < 100) {
    console.log(`  ⚠ small sample (${deck.sample}) — win rate is not statistically meaningful`);
  }
  console.log("=".repeat(72));

  // Resolve maindeck into {card, qty}, reporting anything we can't find.
  const entries = [];
  const unresolved = [];
  for (const [name, qty] of Object.entries(deck.main)) {
    const card = resolve(name);
    if (card) entries.push({ card, qty, name });
    else unresolved.push(name);
  }
  const total = entries.reduce((s, e) => s + e.qty, 0);
  console.log(`\n${total} maindeck cards resolved${unresolved.length ? `, UNRESOLVED: ${unresolved.join(", ")}` : ""}`);

  const spells = entries.filter((e) => !/Land/.test(e.card.type_line));
  const lands = entries.filter((e) => /Land/.test(e.card.type_line));

  // ---- power profile (calibration check) ----
  const powers = {};
  let weighted = 0;
  for (const e of spells) {
    const p = e.card.ai?.power ?? 0;
    powers[p] = (powers[p] ?? 0) + e.qty;
    weighted += p * e.qty;
  }
  const spellCount = spells.reduce((s, e) => s + e.qty, 0);
  console.log(`\n-- our power ratings for its ${spellCount} nonland cards --`);
  for (const p of [5, 4, 3, 2, 1]) {
    if (powers[p]) console.log(`   power ${p}: ${String(powers[p]).padStart(2)} cards  ${bar(powers[p], spellCount, 20)}`);
  }
  console.log(`   weighted average: ${(weighted / spellCount).toFixed(2)}`);

  // ---- role composition ----
  const roles = {};
  for (const e of entries) for (const r of e.card.ai?.roles ?? []) roles[r] = (roles[r] ?? 0) + e.qty;
  console.log(`\n-- role composition --`);
  const roleMax = Math.max(...Object.values(roles), 1);
  for (const [r, n] of Object.entries(roles).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`   ${r.padEnd(16)} ${String(n).padStart(2)}  ${bar(n, roleMax, 18)}`);
  }

  // ---- curve ----
  const curve = {};
  for (const e of spells) {
    const k = Math.min(e.card.cmc, 6);
    curve[k] = (curve[k] ?? 0) + e.qty;
  }
  const curveMax = Math.max(...Object.values(curve), 1);
  console.log(`\n-- curve (${lands.reduce((s, e) => s + e.qty, 0)} lands) --`);
  for (let k = 0; k <= 6; k++) {
    if (curve[k]) console.log(`   ${k === 6 ? "6+" : k + " "}  ${String(curve[k]).padStart(2)}  ${bar(curve[k], curveMax, 20)}`);
  }

  // ---- the engine: highest-scoring internal pairs ----
  const pairs = [];
  for (let i = 0; i < spells.length; i++) {
    for (let j = i + 1; j < spells.length; j++) {
      const { score, reasons } = scoreSynergy(spells[i].card, spells[j].card);
      if (score > 0) pairs.push({ a: spells[i], b: spells[j], score, reasons });
    }
  }
  pairs.sort((x, y) => y.score - x.score);

  const density = pairs.reduce((s, p) => s + p.score * Math.min(p.a.qty, p.b.qty), 0);
  console.log(`\n-- synergy density: ${density.toFixed(0)} (${pairs.length} interacting pairs among ${spells.length} distinct nonlands) --`);

  console.log(`\n-- why it works: top interactions --`);
  for (const p of pairs.slice(0, 6)) {
    console.log(`\n   [${p.score}] ${p.a.qty}x ${p.a.card.name}  +  ${p.b.qty}x ${p.b.card.name}`);
    for (const r of p.reasons.slice(0, 3)) {
      console.log(
        r.deck_want
          ? `        ◆ ${r.consumer} wants a deck of ${r.label}; ${r.provider} fits`
          : `        → ${r.provider} gives ${r.label} to ${r.consumer}`
      );
    }
  }

  // ---- most connected cards: the glue ----
  const conn = new Map();
  for (const p of pairs) {
    conn.set(p.a.card.name, (conn.get(p.a.card.name) ?? 0) + p.score);
    conn.set(p.b.card.name, (conn.get(p.b.card.name) ?? 0) + p.score);
  }
  console.log(`\n-- most connected cards (the glue) --`);
  for (const [name, sc] of [...conn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    const e = entries.find((x) => x.card.name === name);
    console.log(`   ${sc.toFixed(1).padStart(6)}  ${e.qty}x ${name}  (power ${e.card.ai?.power ?? "?"})`);
  }
}
console.log("");
