/**
 * Validate an agent-produced analysis part against the chunk it covers.
 *   node src/validate-part.js 003
 * Prints "OK" or a list of errors (max 40 shown).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./fetch-data.js";
import { RESOURCES, DECK_WANTS, ROLES } from "./ai-schema.js";

const id = String(process.argv[2] ?? "").padStart(3, "0");
const chunk = JSON.parse(readFileSync(join(DATA_DIR, "chunks", `chunk-${id}.json`), "utf8"));
const part = JSON.parse(readFileSync(join(DATA_DIR, "parts", `part-${id}.json`), "utf8"));

const errors = [];
const err = (m) => errors.length < 200 && errors.push(m);

for (const card of chunk) {
  const a = part[card.oracle_id];
  if (!a) {
    err(`MISSING: ${card.name} (${card.oracle_id})`);
    continue;
  }
  const where = card.name;
  if (!Array.isArray(a.provides)) err(`${where}: provides must be an array`);
  else
    for (const p of a.provides) {
      if (!RESOURCES.includes(p.resource)) err(`${where}: bad provides.resource "${p.resource}"`);
      if (!["usable_by_others", "own_effect_only"].includes(p.scope))
        err(`${where}: bad provides.scope "${p.scope}"`);
      if (!["repeatable", "once", "conditional"].includes(p.frequency))
        err(`${where}: bad provides.frequency "${p.frequency}"`);
      if (typeof p.detail !== "string") err(`${where}: provides.detail must be a string`);
    }
  if (!Array.isArray(a.wants)) err(`${where}: wants must be an array`);
  else
    for (const w of a.wants) {
      if (!RESOURCES.includes(w.resource)) err(`${where}: bad wants.resource "${w.resource}"`);
      if (!["any_source", "own_effect_only"].includes(w.accepts))
        err(`${where}: bad wants.accepts "${w.accepts}"`);
      if (typeof w.detail !== "string") err(`${where}: wants.detail must be a string`);
    }
  if (!Array.isArray(a.deck_wants)) err(`${where}: deck_wants must be an array`);
  else
    for (const d of a.deck_wants) {
      if (!DECK_WANTS.includes(d.want)) err(`${where}: bad deck_wants.want "${d.want}"`);
      if (typeof d.detail !== "string") err(`${where}: deck_wants.detail must be a string`);
    }
  if (!Array.isArray(a.roles)) err(`${where}: roles must be an array`);
  else for (const r of a.roles) if (!ROLES.includes(r)) err(`${where}: bad role "${r}"`);
  if (![1, 2, 3, 4, 5].includes(a.power)) err(`${where}: power must be an integer 1-5`);
}

const extras = Object.keys(part).filter((k) => !chunk.some((c) => c.oracle_id === k));
for (const k of extras) err(`EXTRA key not in chunk: ${k}`);

if (errors.length) {
  console.log(`${errors.length} error(s):`);
  for (const e of errors.slice(0, 40)) console.log("  - " + e);
  process.exit(1);
}
console.log(`OK — part-${id} covers all ${chunk.length} cards.`);
