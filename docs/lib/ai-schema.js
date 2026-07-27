/**
 * Structured card-understanding schema for the LLM extraction pass.
 *
 * Every analyzed card gets:
 *  - provides[]: resources it generates, with SCOPE (can other cards use it?)
 *    and FREQUENCY (repeatable engine vs one-shot).
 *  - wants[]:    inputs that make it better, with ACCEPTS (does production by
 *    OTHER cards help, or only its own effect?).
 *  - deck_wants[]: deck-construction constraints (the "Triple Triad wants a
 *    high-mana-value deck" class of insight that pairwise tags can't express).
 *  - roles[]:    deck function (removal, threat, engine, ...).
 *  - power:      1-5 standalone competitive rating.
 */

export const RESOURCES = [
  "tokens",
  "sac_fodder",
  "death_triggers",
  "plus1_counters",
  "lifegain",
  "draw_triggers",
  "graveyard_fill",
  "reanimation_targets",
  "discard_matters",
  "etb_triggers",
  "blink_flicker",
  "artifacts",
  "treasures",
  "spells_cast",
  "landfall",
  "extra_lands",
  "exile_fuel",
  "attack_triggers",
  "untap_effects",
  "mana_ramp",
  "energy",
  "mill_self",
  "mill_opponent",
  "opponent_lifeloss",
  "creature_type_tribal",
  "other",
];

export const RESOURCE_LABELS = {
  tokens: "creature tokens",
  sac_fodder: "expendable bodies",
  death_triggers: "creature deaths",
  plus1_counters: "+1/+1 counters",
  lifegain: "life gain",
  draw_triggers: "card draws",
  graveyard_fill: "graveyard fuel",
  reanimation_targets: "creatures in the yard",
  discard_matters: "discards",
  etb_triggers: "ETB value",
  blink_flicker: "blink effects",
  artifacts: "artifacts",
  treasures: "treasure tokens",
  spells_cast: "spell casts",
  landfall: "land drops",
  extra_lands: "extra lands",
  exile_fuel: "cards in exile",
  attack_triggers: "attack triggers",
  untap_effects: "untap effects",
  mana_ramp: "mana ramp",
  energy: "energy",
  mill_self: "self-mill",
  mill_opponent: "opponent mill",
  opponent_lifeloss: "opponent life loss",
  creature_type_tribal: "tribal synergy",
  other: "other synergy",
};

export const DECK_WANTS = [
  "high_mana_value_cards",
  "low_mana_value_cards",
  "many_creatures",
  "big_power_creatures",
  "many_instants_sorceries",
  "many_artifacts",
  "many_enchantments",
  "many_multicolor_cards",
  "legendary_cards",
  "specific_creature_type",
  "many_basic_land_types",
  "none_special",
];

export const DECK_WANT_LABELS = {
  high_mana_value_cards: "high mana-value cards",
  low_mana_value_cards: "cheap cards",
  many_creatures: "a creature-heavy deck",
  big_power_creatures: "big-power creatures",
  many_instants_sorceries: "many instants/sorceries",
  many_artifacts: "many artifacts",
  many_enchantments: "many enchantments",
  many_multicolor_cards: "multicolor cards",
  legendary_cards: "legendary cards",
  specific_creature_type: "a specific creature type",
  many_basic_land_types: "many basic land types",
};

export const ROLES = [
  "spot_removal",
  "sweeper",
  "counterspell",
  "hand_disruption",
  "threat",
  "finisher",
  "card_advantage",
  "card_selection",
  "ramp",
  "mana_fixing",
  "engine",
  "combo_piece",
  "protection",
  "recursion",
  "lifegain_defense",
  "utility",
  "land",
];

export const CARD_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["provides", "wants", "deck_wants", "roles", "power"],
  properties: {
    provides: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["resource", "scope", "frequency", "detail"],
        properties: {
          resource: { type: "string", enum: RESOURCES },
          scope: { type: "string", enum: ["usable_by_others", "own_effect_only"] },
          frequency: { type: "string", enum: ["repeatable", "once", "conditional"] },
          detail: { type: "string" },
        },
      },
    },
    wants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["resource", "accepts", "detail"],
        properties: {
          resource: { type: "string", enum: RESOURCES },
          accepts: { type: "string", enum: ["any_source", "own_effect_only"] },
          detail: { type: "string" },
        },
      },
    },
    deck_wants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["want", "detail"],
        properties: {
          want: { type: "string", enum: DECK_WANTS },
          detail: { type: "string" },
        },
      },
    },
    roles: {
      type: "array",
      items: { type: "string", enum: ROLES },
    },
    power: { type: "integer", enum: [1, 2, 3, 4, 5] },
  },
};

export const SYSTEM_PROMPT = `You are an expert Magic: The Gathering deck-building analyst for the current Standard format. Given one card, output structured facts about what it PROVIDES to other cards, what it WANTS from other cards, what it wants from the DECK it goes in, its functional ROLES, and its standalone power.

Definitions:

provides — a resource this card generates that could feed other cards' payoffs.
- scope "usable_by_others": the resource ends up somewhere other cards can consume it (tokens on the battlefield, cards put into your graveyard or exile, life gained, treasures created, creature deaths caused, spells cast, lands played...).
- scope "own_effect_only": the resource exists only inside this card's own effect and no other card can consume it. Judge by what other cards could actually use, not by surface wording.
- frequency: "repeatable" (triggers every turn or can be activated repeatedly), "once" (one-shot spell or single ETB), "conditional" (needs specific setup to happen).

wants — an input from OTHER cards that makes this card better.
- accepts "any_source": any other card producing this resource helps (e.g. "whenever a creature you control dies" — deaths from any cause count).
- accepts "own_effect_only": the card only cares about things its OWN effect did (wordings like "exiled this way", "a card put into your graveyard with this ability"). Other producers do NOT help. If a card is fully self-contained for a resource, either mark the want own_effect_only or omit it entirely — do NOT give it an any_source want.

deck_wants — deck-construction constraints the card pushes you toward. These are second-order implications, not resource flows. Only include ones the rules text genuinely implies. Use "specific_creature_type" with the type named in detail (e.g. "Zombies"). Use "none_special" only when nothing applies (and then include nothing else).

roles — the card's function slots in a competitive deck.

power — standalone competitive strength in Standard, ignoring synergies: 1 unplayable filler, 2 below rate, 3 playable, 4 strong, 5 format staple or bomb.

Worked example — Triple Triad, {3}{R}{R}{R} Enchantment: "At the beginning of your upkeep, each player exiles the top card of their library. Until end of turn, you may play the card you own exiled this way and each other card exiled this way with lesser mana value than it without paying their mana costs."
- provides: exile_fuel, scope usable_by_others (unplayed exiled cards stay in exile and count for "cards you own in exile" payoffs), frequency repeatable (every upkeep).
- wants: NONE. Its play-for-free effect only cares about cards exiled by its own trigger ("exiled this way"), so other exile producers do not help it. Giving it an any_source exile want would be wrong.
- deck_wants: high_mana_value_cards — you may play each opponent's exiled card only if it has lesser mana value than yours, so your deck wants high mana values to win that comparison.
- roles: card_advantage, engine.
- power: 3.

Report only facts justified by the actual rules text. Keep every "detail" to one short sentence.`;

/** Build the per-card user message. */
export function cardPrompt(raw) {
  const faces = raw.card_faces ?? [];
  const oracle =
    raw.oracle_text ??
    faces.map((f) => `${f.name}: ${f.oracle_text ?? ""}`).join("\n//\n");
  const cost = raw.mana_cost ?? faces[0]?.mana_cost ?? "";
  const pt =
    raw.power != null
      ? ` ${raw.power}/${raw.toughness}`
      : faces[0]?.power != null
        ? ` ${faces[0].power}/${faces[0].toughness}`
        : "";
  return `${raw.name}  ${cost}\n${raw.type_line}${pt}\n\n${oracle}`;
}
