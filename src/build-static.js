/**
 * Build the publishable static site into docs/ (GitHub Pages serves from /docs).
 *   node src/build-static.js
 *
 * The site runs entirely in the browser: the scoring engine modules are copied
 * verbatim from src/, and the card pool is baked into one slim JSON file.
 * data/standard-cards.json (23 MB) is NOT shipped — only the fields the UI uses.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIR, CARDS_FILE } from "./fetch-data.js";
import { makeResolver, computePlayRate, findOverlooked } from "./meta-lib.js";
import { tagCard } from "./tags.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");
const DOCS_DIR = join(ROOT, "docs");
const ANALYSIS_FILE = join(DATA_DIR, "analysis.json");

// Scoring modules that must run identically in Node and the browser.
const LIB_MODULES = [
  "synergy.js",
  "ai-schema.js",
  "tags.js",
  "colors.js",
  "lookup.js",
  "card-view.js",
  "meta-lib.js",
];

if (!existsSync(CARDS_FILE)) {
  console.error('Missing data/standard-cards.json — run "npm run fetch" first.');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(CARDS_FILE, "utf8"));
const analysis = existsSync(ANALYSIS_FILE)
  ? JSON.parse(readFileSync(ANALYSIS_FILE, "utf8"))
  : {};

// Slim each card to what the UI and scorer actually read.
const cards = raw.map((c) => ({
  oracle_id: c.oracle_id,
  name: c.name,
  mana_cost: c.mana_cost ?? c.card_faces?.[0]?.mana_cost ?? "",
  cmc: c.cmc ?? 0,
  type_line: c.type_line ?? "",
  power: c.power ?? c.card_faces?.[0]?.power ?? null,
  oracle_text:
    c.oracle_text ??
    (c.card_faces ?? []).map((f) => f.oracle_text).filter(Boolean).join(" // ") ??
    "",
  color_identity: c.color_identity ?? [],
  rarity: c.rarity,
  images: c.image_uris
    ? [{ small: c.image_uris.small, normal: c.image_uris.normal }]
    : (c.card_faces ?? [])
        .filter((f) => f.image_uris)
        .map((f) => ({ small: f.image_uris.small, normal: f.image_uris.normal })),
}));

const analyzed = cards.filter((c) => analysis[c.oracle_id]).length;

// Fresh output directory.
rmSync(DOCS_DIR, { recursive: true, force: true });
mkdirSync(join(DOCS_DIR, "data"), { recursive: true });
mkdirSync(join(DOCS_DIR, "lib"), { recursive: true });

const pool = {
  built_at: new Date().toISOString().slice(0, 10),
  count: cards.length,
  analyzed,
  cards,
  analysis,
};
const poolPath = join(DOCS_DIR, "data", "pool.json");
writeFileSync(poolPath, JSON.stringify(pool));

/* ---- meta layer: decks, card play-rate, overlooked pairs ---- */
const DECKS_FILE = join(DATA_DIR, "meta-decks.json");
let metaOut = null;
if (existsSync(DECKS_FILE)) {
  const { decks } = JSON.parse(readFileSync(DECKS_FILE, "utf8"));
  // Rehydrate into the card shape the scorer expects.
  const hydrated = cards.map((c) => ({
    ...c,
    ai: analysis[c.oracle_id] ?? null,
    ...tagCard(c),
  }));
  const resolve = makeResolver(hydrated);
  const play = computePlayRate(decks, resolve);
  const overlooked = findOverlooked(hydrated, play, { limit: 60 });

  metaOut = {
    decks: decks.map((d) => ({
      name: d.name,
      source: d.source ?? d.event ?? "",
      date: d.date,
      finish: d.finish ?? "",
      meta_share: d.meta_share ?? null,
      win_rate: d.win_rate ?? null,
      sample: d.sample ?? null,
      main: d.main,
    })),
    play_rate: Object.fromEntries(play.rate),
    deck_count: Object.fromEntries(play.deckCount),
    coverage: play.totalShare,
    deck_total: play.deckTotal,
    overlooked,
  };
  writeFileSync(join(DOCS_DIR, "data", "meta.json"), JSON.stringify(metaOut));
}

for (const file of readdirSync(PUBLIC_DIR)) {
  copyFileSync(join(PUBLIC_DIR, file), join(DOCS_DIR, file));
}
for (const mod of LIB_MODULES) {
  copyFileSync(join(__dirname, mod), join(DOCS_DIR, "lib", mod));
}

// Stop GitHub Pages running the files through Jekyll.
writeFileSync(join(DOCS_DIR, ".nojekyll"), "");

const mb = (b) => (b / 1048576).toFixed(2) + " MB";
console.log(`docs/data/pool.json  ${mb(Buffer.byteLength(JSON.stringify(pool)))}`);
console.log(`  ${cards.length} cards, ${analyzed} analyzed (${((100 * analyzed) / cards.length).toFixed(1)}%)`);
if (metaOut) {
  console.log(
    `docs/data/meta.json  ${metaOut.decks.length} decks, ${Object.keys(metaOut.play_rate).length} cards with play-rate, ${metaOut.overlooked.length} overlooked pairs`
  );
}
console.log(`docs/lib/            ${LIB_MODULES.length} modules`);
console.log(`docs/                ${readdirSync(PUBLIC_DIR).length} static files`);
console.log("\nPreview with:  npx serve docs");
