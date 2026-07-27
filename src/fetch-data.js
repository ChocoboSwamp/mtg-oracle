import { writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, "..", "data");
export const CARDS_FILE = join(DATA_DIR, "standard-cards.json");

// Scryfall asks all clients to send a descriptive User-Agent,
// and to keep request rates under ~10/second.
const HEADERS = {
  "User-Agent": "mtg-synergy-finder/0.1 (pet project)",
  Accept: "application/json",
};
const PAGE_DELAY_MS = 120;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Download every card currently legal in Standard via the paginated
 * search API. Much smaller than the full bulk file and always reflects
 * the current rotation.
 */
export async function fetchStandardCards({ force = false } = {}) {
  if (!force && existsSync(CARDS_FILE)) {
    const ageDays = (Date.now() - statSync(CARDS_FILE).mtimeMs) / 86_400_000;
    console.log(
      `Standard card data already downloaded (${ageDays.toFixed(1)} days old). Use "fetch --force" to refresh.`
    );
    return CARDS_FILE;
  }

  const query = encodeURIComponent("legal:standard game:paper");
  let url = `https://api.scryfall.com/cards/search?q=${query}&unique=cards&order=name`;
  const cards = [];
  let page = 1;

  while (url) {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`Scryfall request failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    cards.push(...body.data);
    process.stdout.write(`\rFetched page ${page} — ${cards.length}/${body.total_cards} cards`);
    url = body.has_more ? body.next_page : null;
    page++;
    if (url) await sleep(PAGE_DELAY_MS);
  }
  console.log();

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CARDS_FILE, JSON.stringify(cards));
  console.log(`Saved ${cards.length} Standard-legal cards to ${CARDS_FILE}`);
  return CARDS_FILE;
}
