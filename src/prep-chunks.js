/**
 * Prepare card chunks for agent-based analysis (no API cost).
 *
 * - Mechanically analyzes textless cards (vanilla creatures, basic lands)
 *   straight into data/analysis.json.
 * - Splits the remaining un-analyzed cards into data/chunks/chunk-NNN.json
 *   files of ~150 cards each for subagents to process.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, CARDS_FILE } from "./fetch-data.js";

const ANALYSIS_FILE = join(DATA_DIR, "analysis.json");
const CHUNKS_DIR = join(DATA_DIR, "chunks");
const PARTS_DIR = join(DATA_DIR, "parts");
const CHUNK_SIZE = 150;

const raws = JSON.parse(readFileSync(CARDS_FILE, "utf8"));
const analysis = existsSync(ANALYSIS_FILE)
  ? JSON.parse(readFileSync(ANALYSIS_FILE, "utf8"))
  : {};

function combinedText(c) {
  return (
    c.oracle_text ??
    (c.card_faces ?? []).map((f) => f.oracle_text ?? "").join("\n")
  ).trim();
}

// 1. Mechanical pass: no rules text = nothing for a model to read.
let mechanical = 0;
for (const c of raws) {
  if (analysis[c.oracle_id]) continue;
  const text = combinedText(c);
  const isBasic = /Basic Land/.test(c.type_line ?? "");
  if (text === "" || isBasic) {
    analysis[c.oracle_id] = {
      name: c.name,
      model: "mechanical",
      provides: [],
      wants: [],
      deck_wants: [],
      roles: /Land/.test(c.type_line ?? "")
        ? ["land"]
        : /Creature/.test(c.type_line ?? "")
          ? ["threat"]
          : ["utility"],
      power: /Basic Land/.test(c.type_line ?? "") ? 3 : 2,
    };
    mechanical++;
  }
}
writeFileSync(ANALYSIS_FILE, JSON.stringify(analysis));

// 2. Chunk the rest.
mkdirSync(CHUNKS_DIR, { recursive: true });
mkdirSync(PARTS_DIR, { recursive: true });

const pending = raws.filter((c) => !analysis[c.oracle_id]);
let chunkCount = 0;
for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
  chunkCount++;
  const id = String(chunkCount).padStart(3, "0");
  const cards = pending.slice(i, i + CHUNK_SIZE).map((c) => ({
    oracle_id: c.oracle_id,
    name: c.name,
    mana_cost: c.mana_cost ?? c.card_faces?.[0]?.mana_cost ?? "",
    type_line: c.type_line ?? "",
    power: c.power ?? c.card_faces?.[0]?.power ?? null,
    toughness: c.toughness ?? c.card_faces?.[0]?.toughness ?? null,
    oracle_text: combinedText(c),
  }));
  writeFileSync(join(CHUNKS_DIR, `chunk-${id}.json`), JSON.stringify(cards, null, 1));
}

console.log(`mechanical: ${mechanical} cards auto-analyzed`);
console.log(`already analyzed: ${raws.length - mechanical - pending.length}`);
console.log(`chunks written: ${chunkCount} (${pending.length} cards, ${CHUNK_SIZE}/chunk)`);
