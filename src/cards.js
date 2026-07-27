import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CARDS_FILE, DATA_DIR } from "./fetch-data.js";
import { tagCard } from "./tags.js";

// Re-exported so existing importers (cli.js, server.js) keep working.
export { fitsColors } from "./colors.js";

const ANALYSIS_FILE = join(DATA_DIR, "analysis.json");

let cache = null;

/** Load and pre-tag the Standard card pool, attaching LLM analyses when cached. */
export function loadCards() {
  if (cache) return cache;
  if (!existsSync(CARDS_FILE)) {
    console.error('No card data found. Run "node src/cli.js fetch" first.');
    process.exit(1);
  }
  const analysis = existsSync(ANALYSIS_FILE)
    ? JSON.parse(readFileSync(ANALYSIS_FILE, "utf8"))
    : {};
  const raw = JSON.parse(readFileSync(CARDS_FILE, "utf8"));
  const cards = [];
  for (const c of raw) {
    const tags = tagCard(c);
    cards.push({
      name: c.name,
      oracle_id: c.oracle_id,
      power: c.power ?? c.card_faces?.[0]?.power,
      ai: analysis[c.oracle_id] ?? null,
      mana_cost: c.mana_cost ?? c.card_faces?.[0]?.mana_cost ?? "",
      cmc: c.cmc ?? 0,
      type_line: c.type_line ?? "",
      oracle_text:
        c.oracle_text ??
        c.card_faces?.map((f) => f.oracle_text).filter(Boolean).join(" // ") ??
        "",
      color_identity: c.color_identity ?? [],
      rarity: c.rarity,
      images: c.image_uris
        ? [{ small: c.image_uris.small, normal: c.image_uris.normal }]
        : (c.card_faces ?? [])
            .filter((f) => f.image_uris)
            .map((f) => ({ small: f.image_uris.small, normal: f.image_uris.normal })),
      provides: tags.provides,
      wants: tags.wants,
    });
  }
  cache = cards;
  return cards;
}

export { findCard } from "./lookup.js";
