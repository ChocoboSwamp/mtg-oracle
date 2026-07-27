/**
 * Merge validated part files into data/analysis.json.
 *   node src/merge-parts.js
 *
 * Skips malformed part files (an agent interrupted mid-write) and reports them
 * so their chunks can be re-run. Only entries that pass a shape check are kept,
 * so a half-written object can never poison the cache.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./fetch-data.js";
import { RESOURCES, DECK_WANTS, ROLES } from "./ai-schema.js";

const ANALYSIS_FILE = join(DATA_DIR, "analysis.json");
const PARTS_DIR = join(DATA_DIR, "parts");

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

const analysis = existsSync(ANALYSIS_FILE)
  ? JSON.parse(readFileSync(ANALYSIS_FILE, "utf8"))
  : {};

let merged = 0;
const broken = [];
for (const file of readdirSync(PARTS_DIR).filter((f) => f.endsWith(".json")).sort()) {
  let part;
  try {
    part = JSON.parse(readFileSync(join(PARTS_DIR, file), "utf8"));
  } catch {
    broken.push(file);
    continue;
  }
  for (const [oracleId, a] of Object.entries(part)) {
    if (!validEntry(a)) continue;
    if (!analysis[oracleId]) merged++;
    analysis[oracleId] = { model: "claude-code", ...a };
  }
}
writeFileSync(ANALYSIS_FILE, JSON.stringify(analysis));
console.log(`merged ${merged} new analyses; total ${Object.keys(analysis).length}`);
if (broken.length) console.log(`unparseable (chunk needs re-run): ${broken.join(", ")}`);
