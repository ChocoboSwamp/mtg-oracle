#!/usr/bin/env node
/**
 * Parse an Untapped.gg meta capture into a clean play-rate table.
 *   node src/parse-untapped.js data/imports/untapped-meta.json [--names names.txt] [--top 25]
 *
 * The capture holds, per archetype id: daily popularity %, daily win rate,
 * total matches, and a colour bitmask. It does NOT carry archetype names —
 * those live in a separate lookup — so pass --names with the rendered page
 * text (or a "id=name" list) to label them.
 *
 * Writes data/playrate.json: the playability prior the `power` rating was
 * guessing at. Input stays in the gitignored imports folder; only the derived
 * aggregate is written out.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./fetch-data.js";

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error("Usage: node src/parse-untapped.js <capture.json> [--names file] [--top N]");
  process.exit(1);
}
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const TOP = Number(arg("top", 25));

const raw = JSON.parse(readFileSync(file, "utf8"));
const { date_range, primary_tag_group_ids: groups, meta_data } = raw;

if (!groups) {
  console.error("Not an Untapped meta capture (no primary_tag_group_ids).");
  process.exit(1);
}

/** Colour bitmask -> guild/shard name. */
const COLOR_BITS = [
  ["W", 1],
  ["U", 2],
  ["B", 4],
  ["R", 8],
  ["G", 16],
];
const COMBO_NAMES = {
  W: "Mono White", U: "Mono Blue", B: "Mono Black", R: "Mono Red", G: "Mono Green",
  WU: "Azorius", UB: "Dimir", BR: "Rakdos", RG: "Gruul", WG: "Selesnya",
  WB: "Orzhov", UR: "Izzet", BG: "Golgari", WR: "Boros", UG: "Simic",
  WUB: "Esper", UBR: "Grixis", BRG: "Jund", WRG: "Naya", WUG: "Bant",
  WBG: "Abzan", URG: "Temur", WUR: "Jeskai", UBG: "Sultai", WBR: "Mardu",
  WUBR: "4C (no G)", WUBG: "4C (no R)", WURG: "4C (no B)", WBRG: "4C (no U)",
  UBRG: "4C (no W)", WUBRG: "5C",
};
function colorsFrom(byte) {
  if (byte == null) return { letters: "", label: "Colorless" };
  const letters = COLOR_BITS.filter(([, bit]) => byte & bit).map(([c]) => c).join("");
  return { letters, label: COMBO_NAMES[letters] ?? (letters || "Colorless") };
}

/**
 * Optional archetype names. Accepts either an explicit "123=Name" mapping,
 * or raw page text copied from the site — in which case names are matched to
 * ids by their popularity percentage, which is unique enough to join on.
 */
const names = {};
const pageRows = []; // {name, pop} scraped from pasted page text
const namesFile = arg("names");
if (namesFile && existsSync(namesFile)) {
  const txt = readFileSync(namesFile, "utf8");
  let explicit = 0;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s*[=:\t]\s*(.+?)\s*$/);
    if (m) {
      names[m[1]] = m[2];
      explicit++;
    }
  }
  if (explicit) {
    console.log(`loaded ${explicit} explicit archetype names\n`);
  } else {
    // Raw page text: find "<name> ... <pop>%" pairs, tolerating line breaks.
    const lines = txt.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const pct = lines[i].match(/^(\d{1,2}\.\d{1,2})\s*%$/);
      if (pct) {
        // walk back to the nearest plausible deck name
        for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
          const cand = lines[j];
          if (/^[A-Z][A-Za-z0-9'’,\- ]{2,40}$/.test(cand) && !/^\d/.test(cand)) {
            pageRows.push({ name: cand, pop: Number(pct[1]) });
            break;
          }
        }
      }
      const inline = lines[i].match(/^(.{3,40}?)\s+(\d{1,2}\.\d{1,2})\s*%/);
      if (inline && !pct) pageRows.push({ name: inline[1].trim(), pop: Number(inline[2]) });
    }
    console.log(`scraped ${pageRows.length} name/popularity pairs from page text\n`);
  }
}

/** Join scraped page names onto archetype ids by nearest popularity value. */
function attachScrapedNames(rows) {
  if (!pageRows.length) return 0;
  const used = new Set();
  let hits = 0;
  for (const r of rows) {
    // The site may show either the latest day or the window average — try both.
    const candidates = [r.popularity_avg, r.popularity_latest].filter((x) => x != null);
    if (!candidates.length) continue;
    let best = null;
    let bestDiff = Infinity;
    for (const p of pageRows) {
      if (used.has(p)) continue;
      const diff = Math.min(...candidates.map((c) => Math.abs(p.pop - c)));
      if (diff < bestDiff) {
        bestDiff = diff;
        best = p;
      }
    }
    if (best && bestDiff <= 0.06) {
      r.name = best.name;
      used.add(best);
      hits++;
    }
  }
  return hits;
}

const last = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === "number").at(-1) : a);
const mean = (a) => {
  const v = (a ?? []).filter((x) => typeof x === "number");
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

const rows = [];
for (const [id, group] of Object.entries(groups)) {
  const d = group.All ?? Object.values(group)[0];
  if (!d) continue;
  const tile = meta_data?.tile_data?.[id] ?? {};
  const { letters, label } = colorsFrom(tile.color_byte);
  rows.push({
    id,
    name: names[id] ?? null,
    colors: letters,
    color_label: label,
    matches: Array.isArray(d.matches_per_meta_period)
      ? d.matches_per_meta_period.reduce((s, x) => s + (x || 0), 0)
      : d.matches_per_meta_period ?? 0,
    popularity_latest: last(d.popularity),
    popularity_avg: mean(d.popularity),
    win_rate_latest: last(d.win_rate),
    win_rate_avg: mean(d.win_rate),
    tag_ids: tile.primary_tag_ids ?? [],
  });
}
rows.sort((a, b) => (b.popularity_avg ?? 0) - (a.popularity_avg ?? 0));

const scraped = attachScrapedNames(rows);
if (scraped) console.log(`matched ${scraped} archetype names by popularity\n`);

const totalMatches = (meta_data?.total_matches?.All ?? [])
  .flat()
  .filter((x) => typeof x === "number")
  .reduce((s, x) => s + x, 0);

console.log(`Untapped meta capture`);
console.log("=".repeat(76));
console.log(`  window   : ${date_range[0]} .. ${date_range.at(-1)}  (${date_range.length} days)`);
console.log(`  matches  : ${totalMatches.toLocaleString()} total across the window`);
console.log(`  archetypes: ${rows.length}\n`);

const named = rows.filter((r) => r.name).length;
console.log(
  `  ${"pop%".padStart(6)} ${"WR%".padStart(6)} ${"matches".padStart(9)}  ${"colors".padEnd(12)} archetype`
);
console.log("  " + "-".repeat(72));
for (const r of rows.slice(0, TOP)) {
  console.log(
    `  ${(r.popularity_avg ?? 0).toFixed(2).padStart(6)} ${(r.win_rate_avg ?? 0).toFixed(1).padStart(6)} ` +
      `${r.matches.toLocaleString().padStart(9)}  ${r.color_label.padEnd(12)} ${r.name ?? `(id ${r.id})`}`
  );
}

if (!named) {
  console.log(
    `\n  ⚠ No archetype names — this payload only carries numeric ids.\n` +
      `    Capture the rendered page text and pass --names, or map ids by hand.`
  );
}

const out = {
  source: "untapped.gg",
  captured: new Date().toISOString().slice(0, 10),
  window: { from: date_range[0], to: date_range.at(-1), days: date_range.length },
  total_matches: totalMatches,
  archetypes: rows,
};
const outPath = join(DATA_DIR, "playrate.json");
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`\nwrote ${outPath}  (${rows.length} archetypes)`);
