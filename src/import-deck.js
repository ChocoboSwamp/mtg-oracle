#!/usr/bin/env node
/**
 * Import a decklist from any common text format and add it to data/meta-decks.json.
 *
 *   node src/import-deck.js paste.txt --name "Mono White Auras" --source untapped --share 0.081 --winrate 0.55
 *   type paste.txt | node src/import-deck.js --name "..."          (Windows pipe)
 *   node src/import-deck.js paste.txt --dry                        (parse + verify only)
 *
 * Accepts, and auto-detects:
 *   MTG Arena export   4 Llanowar Elves (DMU) 168
 *   MTGO / plain       4 Llanowar Elves
 *   With headers       "Deck" / "Maindeck" / "Sideboard" / "Companion" / "Commander"
 *   Bare names         Llanowar Elves            (assumes 1 copy)
 *
 * Every card is verified against the local Standard pool; the import refuses to
 * write if anything is unresolved, so a typo can't silently become a missing card.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./fetch-data.js";
import { loadCards, findCard } from "./cards.js";

const DECKS_FILE = join(DATA_DIR, "meta-decks.json");

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const has = (n) => args.includes(`--${n}`);
const fileArg = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));

let text = "";
if (fileArg && existsSync(fileArg)) text = readFileSync(fileArg, "utf8");
else if (!process.stdin.isTTY) text = readFileSync(0, "utf8");

if (!text.trim()) {
  console.error(
    "No input. Pass a file path, or pipe text in.\n" +
      '  node src/import-deck.js paste.txt --name "Mono White Auras"'
  );
  process.exit(1);
}

const SECTION = /^(deck|maindeck|main|sideboard|companion|commander|about)\b/i;
const SIDE = /^(sideboard|companion)/i;

/** Parse a decklist into {main, side} of name -> qty. */
export function parseDecklist(raw) {
  const main = {};
  const side = {};
  let bucket = main;
  const junk = [];

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (SECTION.test(t)) {
      bucket = SIDE.test(t) ? side : main;
      continue;
    }
    // "4 Card Name (SET) 123"  |  "4x Card Name"  |  "Card Name"
    const m = t.match(/^(?:(\d+)\s*x?\s+)?(.+?)(?:\s*\((\w{2,5})\)\s*[\w-]+)?\s*$/i);
    if (!m) {
      junk.push(t);
      continue;
    }
    const qty = Number(m[1] ?? 1);
    const name = m[2].trim().replace(/\s+/g, " ");
    if (!name || /^\d+$/.test(name)) {
      junk.push(t);
      continue;
    }
    bucket[name] = (bucket[name] ?? 0) + qty;
  }
  return { main, side, junk };
}

const { main, side, junk } = parseDecklist(text);

// ---- verify against the Standard pool ----
const pool = loadCards();
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
const byNorm = new Map();
for (const c of pool) {
  byNorm.set(norm(c.name), c);
  byNorm.set(norm(c.name.split(" // ")[0]), c);
}
const resolve = (n) => byNorm.get(norm(n)) ?? findCard(pool, n);

const unresolved = [];
const fix = {};
for (const bucketObj of [main, side]) {
  for (const name of Object.keys(bucketObj)) {
    const card = resolve(name);
    if (!card) unresolved.push(name);
    else if (card.name !== name) fix[name] = card.name; // canonicalize to Scryfall's name
  }
}

const count = (o) => Object.values(o).reduce((a, b) => a + b, 0);
console.log(`parsed: ${count(main)} maindeck, ${count(side)} sideboard`);
if (junk.length) console.log(`ignored ${junk.length} unparseable line(s): ${junk.slice(0, 3).join(" | ")}`);
if (Object.keys(fix).length) {
  console.log(`canonicalized ${Object.keys(fix).length} name(s):`);
  for (const [from, to] of Object.entries(fix).slice(0, 8)) console.log(`   "${from}" -> "${to}"`);
}

if (unresolved.length) {
  console.error(`\nNOT IN THE STANDARD POOL (${unresolved.length}) — nothing was written:`);
  for (const u of unresolved) console.error(`   ${u}`);
  console.error("\nCheck spelling, or run `npm run fetch -- --force` if a new set just released.");
  process.exit(1);
}

// apply canonical names
const canon = (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [fix[k] ?? k, v]));

const deck = {
  name: flag("name", "Imported deck"),
  player: flag("player", ""),
  event: flag("event", ""),
  date: flag("date", new Date().toISOString().slice(0, 10)),
  finish: flag("finish", ""),
  source: flag("source", ""),
  meta_share: flag("share") ? Number(flag("share")) : undefined,
  win_rate: flag("winrate") ? Number(flag("winrate")) : undefined,
  sample: flag("sample") ? Number(flag("sample")) : undefined,
  main: canon(main),
  side: canon(side),
};
for (const k of Object.keys(deck)) if (deck[k] === "" || deck[k] === undefined) delete deck[k];

console.log(`\nAll ${Object.keys(main).length + Object.keys(side).length} distinct cards verified Standard-legal.`);

if (has("dry")) {
  console.log("\n--dry: not written. Parsed deck:\n");
  console.log(JSON.stringify(deck, null, 2));
  process.exit(0);
}

const db = existsSync(DECKS_FILE)
  ? JSON.parse(readFileSync(DECKS_FILE, "utf8"))
  : { source: "imported", fetched: deck.date, meta_snapshot: {}, decks: [] };

const dup = db.decks.findIndex((d) => d.name === deck.name && d.date === deck.date);
if (dup !== -1) {
  db.decks[dup] = deck;
  console.log(`replaced existing "${deck.name}" (${deck.date})`);
} else {
  db.decks.push(deck);
  console.log(`added "${deck.name}" — ${db.decks.length} decks now stored`);
}
writeFileSync(DECKS_FILE, JSON.stringify(db, null, 2));
console.log(`\nAnalyze it:  node src/analyze-decks.js "${deck.name}"`);
