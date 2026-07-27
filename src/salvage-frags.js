/**
 * Salvage orphaned fragment files left behind by interrupted agents.
 *   node src/salvage-frags.js <dir> [<dir>...]
 *
 * Scans each directory for *.json, keeps any entry that is keyed by a known
 * oracle_id and passes the shape check, and merges it into data/analysis.json.
 * Reports which chunks the salvaged cards belong to.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, CARDS_FILE } from "./fetch-data.js";
import { RESOURCES, DECK_WANTS, ROLES } from "./ai-schema.js";

const ANALYSIS_FILE = join(DATA_DIR, "analysis.json");
const CHUNKS_DIR = join(DATA_DIR, "chunks");

function validEntry(a) {
  if (!a || typeof a !== "object") return false;
  if (![1, 2, 3, 4, 5].includes(a.power)) return false;
  if (!Array.isArray(a.provides) || !Array.isArray(a.wants)) return false;
  if (!Array.isArray(a.deck_wants) || !Array.isArray(a.roles)) return false;
  if (!a.provides.every((p) => RESOURCES.includes(p?.resource))) return false;
  if (!a.wants.every((w) => RESOURCES.includes(w?.resource))) return false;
  if (!a.deck_wants.every((d) => DECK_WANTS.includes(d?.want))) return false;
  if (!a.roles.every((r) => ROLES.includes(r))) return false;
  return true;
}

const knownIds = new Set(
  JSON.parse(readFileSync(CARDS_FILE, "utf8")).map((c) => c.oracle_id)
);

// oracle_id -> chunk id, so we can report what got covered
const chunkOf = {};
for (const f of readdirSync(CHUNKS_DIR).filter((f) => f.endsWith(".json"))) {
  const id = f.match(/chunk-(\d+)\.json/)[1];
  for (const c of JSON.parse(readFileSync(join(CHUNKS_DIR, f), "utf8"))) {
    chunkOf[c.oracle_id] = id;
  }
}

const analysis = existsSync(ANALYSIS_FILE)
  ? JSON.parse(readFileSync(ANALYSIS_FILE, "utf8"))
  : {};

const perChunk = {};
let salvaged = 0;

for (const dir of process.argv.slice(2)) {
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    let obj;
    try {
      obj = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch {
      continue;
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
    for (const [oracleId, a] of Object.entries(obj)) {
      if (!knownIds.has(oracleId) || analysis[oracleId] || !validEntry(a)) continue;
      analysis[oracleId] = { model: "claude-code-salvaged", ...a };
      salvaged++;
      const ch = chunkOf[oracleId] ?? "?";
      perChunk[ch] = (perChunk[ch] ?? 0) + 1;
    }
  }
}

writeFileSync(ANALYSIS_FILE, JSON.stringify(analysis));
console.log(`salvaged ${salvaged} analyses; total ${Object.keys(analysis).length}`);
for (const [ch, n] of Object.entries(perChunk).sort()) {
  console.log(`  chunk ${ch}: +${n}`);
}
