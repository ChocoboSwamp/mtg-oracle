import { RESOURCES } from "./tags.js";
import { RESOURCE_LABELS, DECK_WANT_LABELS } from "./ai-schema.js";
import { fitsColors } from "./colors.js";

const TAG_WEIGHT = Object.fromEntries(RESOURCES.map((r) => [r.name, r.weight]));
const TAG_LABEL = Object.fromEntries(RESOURCES.map((r) => [r.name, r.label]));

const FREQ_MULT = { repeatable: 1.5, once: 1, conditional: 0.75 };

/* ---------------- LLM-analysis scoring ---------------- */

/** One direction: what a's effects provide that b's effects want. */
function aiFlowScore(a, b, reasons) {
  let score = 0;
  for (const p of a.ai.provides) {
    if (p.scope !== "usable_by_others") continue;
    for (const w of b.ai.wants) {
      if (w.accepts !== "any_source" || w.resource !== p.resource) continue;
      score += 2 * (FREQ_MULT[p.frequency] ?? 1);
      reasons.push({
        provider: a.name,
        consumer: b.name,
        resource: p.resource,
        label: RESOURCE_LABELS[p.resource] ?? p.resource,
      });
    }
  }
  return score;
}

/** Does candidate card satisfy a deck-construction want? */
function matchesDeckWant(dw, card) {
  switch (dw.want) {
    case "high_mana_value_cards":
      return card.cmc >= 5;
    case "low_mana_value_cards":
      return card.cmc > 0 && card.cmc <= 2;
    case "many_creatures":
      return /Creature/.test(card.type_line);
    case "big_power_creatures":
      return Number(card.power) >= 4;
    case "many_instants_sorceries":
      return /Instant|Sorcery/.test(card.type_line);
    case "many_artifacts":
      return /Artifact/.test(card.type_line);
    case "many_enchantments":
      return /Enchantment/.test(card.type_line);
    case "many_multicolor_cards":
      return card.color_identity.length >= 2;
    case "legendary_cards":
      return /Legendary/.test(card.type_line);
    case "specific_creature_type": {
      // detail names the type, e.g. "Zombies" — match capitalized words
      const words = (dw.detail.match(/[A-Z][a-z]+/g) ?? []).map((w) =>
        w.replace(/s$/, "")
      );
      return words.some((w) => card.type_line.includes(w));
    }
    default:
      return false;
  }
}

/** Deck-want matches: candidate satisfies a construction constraint of the seed. */
function deckWantScore(seed, candidate, reasons) {
  let score = 0;
  // Only recommend cards that pull their own weight (power >= 3 when rated).
  if (candidate.ai && candidate.ai.power < 3) return 0;
  for (const dw of seed.ai.deck_wants) {
    if (dw.want === "none_special" || !matchesDeckWant(dw, candidate)) continue;
    score += 1.5;
    reasons.push({
      provider: candidate.name,
      consumer: seed.name,
      resource: `deck_${dw.want}`,
      label: DECK_WANT_LABELS[dw.want] ?? dw.want,
      deck_want: true,
    });
  }
  return score;
}

function aiScore(a, b) {
  const reasons = [];
  let score = aiFlowScore(a, b, reasons) + aiFlowScore(b, a, reasons);
  const twoWay =
    score > 0 &&
    reasons.some((r) => r.provider === a.name) &&
    reasons.some((r) => r.provider === b.name);
  if (twoWay) score += 2;
  score += deckWantScore(a, b, reasons) + deckWantScore(b, a, reasons);
  return { score: Math.round(score * 10) / 10, reasons };
}

/* ---------------- regex-tag fallback ---------------- */

function tagScore(a, b) {
  let score = 0;
  const reasons = [];
  for (const res of a.provides) {
    if (b.wants.has(res)) {
      score += TAG_WEIGHT[res];
      reasons.push({ provider: a.name, consumer: b.name, resource: res, label: TAG_LABEL[res] });
    }
  }
  for (const res of b.provides) {
    if (a.wants.has(res)) {
      score += TAG_WEIGHT[res];
      reasons.push({ provider: b.name, consumer: a.name, resource: res, label: TAG_LABEL[res] });
    }
  }
  if (reasons.length >= 2 && score > 0) {
    const aFeedsB = [...a.provides].some((r) => b.wants.has(r));
    const bFeedsA = [...b.provides].some((r) => a.wants.has(r));
    if (aFeedsB && bFeedsA) score += 2;
  }
  return { score, reasons };
}

/**
 * Score how well two cards feed each other.
 * Uses LLM analyses when both cards have one; regex tags otherwise.
 */
export function scoreSynergy(a, b) {
  return a.ai && b.ai ? aiScore(a, b) : tagScore(a, b);
}

/** Rank the whole pool against one card. */
export function findSynergies(card, pool, { colors, top = 20 } = {}) {
  const results = [];
  for (const other of pool) {
    if (other === card || other.name === card.name) continue;
    if (!fitsColors(other, colors)) continue;
    const { score, reasons } = scoreSynergy(card, other);
    if (score > 0) results.push({ card: other, score, reasons });
  }
  results.sort((x, y) => y.score - x.score || x.card.cmc - y.card.cmc);
  return results.slice(0, top);
}
