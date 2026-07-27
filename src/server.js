import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCards, findCard } from "./cards.js";
import { findSynergies } from "./synergy.js";
import { publicCard } from "./card-view.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const PORT = process.env.PORT || 8787;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

console.log("Loading and tagging Standard card pool...");
const cards = loadCards();
const namesPayload = JSON.stringify({
  count: cards.length,
  names: cards.map((c) => c.name),
});
console.log(`${cards.length} cards ready.`);

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/names") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(namesPayload);
  }

  if (url.pathname === "/api/card") {
    const card = findCard(cards, url.searchParams.get("name") ?? "");
    if (!card) return json(res, 404, { error: "Card not found" });
    return json(res, 200, publicCard(card));
  }

  if (url.pathname === "/api/synergy") {
    const card = findCard(cards, url.searchParams.get("name") ?? "");
    if (!card) return json(res, 404, { error: "Card not found" });
    const colors = url.searchParams.get("colors") || undefined;
    const top = Math.min(Number(url.searchParams.get("top")) || 30, 100);
    const results = findSynergies(card, cards, { colors, top });
    return json(res, 200, {
      seed: publicCard(card),
      results: results.map(({ card: c, score, reasons }) => ({
        ...publicCard(c),
        score,
        reasons,
      })),
    });
  }

  // Static files
  let path = url.pathname === "/" ? "/index.html" : url.pathname;
  path = normalize(path).replace(/^(\.\.[/\\])+/, "");
  try {
    const file = await readFile(join(PUBLIC_DIR, path));
    res.writeHead(200, { "Content-Type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Synergy Oracle running at http://localhost:${PORT}`);
});
