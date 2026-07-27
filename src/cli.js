#!/usr/bin/env node
import { fetchStandardCards } from "./fetch-data.js";
import { loadCards, findCard } from "./cards.js";
import { findSynergies } from "./synergy.js";
import { RESOURCES } from "./tags.js";

const [command, ...rest] = process.argv.slice(2);

function getFlag(args, name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return args[i + 1];
}

function positional(args) {
  return args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
}

function usage() {
  console.log(`mtg-synergy — find overlooked synergies in the current Standard card pool

Commands:
  fetch [--force]                    Download all Standard-legal cards from Scryfall
  tags "Card Name"                   Show what a card provides / wants
  synergy "Card Name" [options]      Rank the Standard pool by synergy with this card
      --top N        number of results (default 20)
      --colors WUBG  restrict results to a color identity
  search <resource> [provides|wants] List cards tagged with a resource
  resources                          List all resource axes

Examples:
  node src/cli.js synergy "Enduring Innocence" --colors WG
  node src/cli.js search death_triggers wants`);
}

switch (command) {
  case "fetch": {
    await fetchStandardCards({ force: rest.includes("--force") });
    break;
  }

  case "resources": {
    for (const r of RESOURCES) {
      console.log(`${r.name.padEnd(22)} ${r.label} (weight ${r.weight})`);
    }
    break;
  }

  case "tags": {
    const name = positional(rest).join(" ");
    const cards = loadCards();
    const card = findCard(cards, name);
    if (!card) {
      console.error(`Card not found: ${name}`);
      process.exit(1);
    }
    console.log(`\n${card.name}  ${card.mana_cost}  [${card.type_line}]`);
    console.log(card.oracle_text + "\n");
    if (card.ai) {
      console.log("LLM analysis:");
      console.log(JSON.stringify(card.ai, null, 2));
    } else {
      console.log("(no LLM analysis yet — regex tags shown)");
      console.log("provides:", [...card.provides].join(", ") || "(nothing tagged)");
      console.log("wants:   ", [...card.wants].join(", ") || "(nothing tagged)");
    }
    break;
  }

  case "synergy": {
    const name = positional(rest).join(" ");
    const cards = loadCards();
    const card = findCard(cards, name);
    if (!card) {
      console.error(`Card not found: ${name}`);
      process.exit(1);
    }
    const results = findSynergies(card, cards, {
      colors: getFlag(rest, "colors"),
      top: Number(getFlag(rest, "top", 20)),
    });
    console.log(`\nTop synergies for ${card.name}:\n`);
    for (const { card: other, score, reasons } of results) {
      console.log(`[${String(score).padStart(2)}] ${other.name}  ${other.mana_cost}  (${other.type_line})`);
      for (const r of reasons) {
        if (r.deck_want) {
          console.log(`      - ${r.consumer} wants a deck with ${r.label} → ${r.provider} fits`);
        } else {
          console.log(`      - ${r.provider} provides ${r.label} → ${r.consumer} wants it`);
        }
      }
    }
    if (!results.length) console.log("No tagged synergies found — try broadening the tag patterns.");
    break;
  }

  case "search": {
    const [resource, direction = "provides"] = positional(rest);
    if (!RESOURCES.some((r) => r.name === resource)) {
      console.error(`Unknown resource: ${resource}. Run "resources" to list them.`);
      process.exit(1);
    }
    const cards = loadCards().filter((c) => c[direction].has(resource));
    console.log(`${cards.length} cards ${direction} "${resource}". First 40:\n`);
    for (const c of cards.slice(0, 40)) {
      console.log(`  ${c.name}  ${c.mana_cost}  (${c.type_line})`);
    }
    break;
  }

  default:
    usage();
}
