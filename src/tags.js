/**
 * The synergy model: every card can PROVIDE resources and/or WANT resources.
 * Two cards synergize when what one provides is what the other wants.
 *
 * Matching on shared "resources" (rather than tagging archetypes directly) is
 * what surfaces overlooked pairings — e.g. a temporary-theft spell PROVIDES
 * expendable bodies, which a sacrifice outlet WANTS, even though neither card
 * mentions the other's strategy.
 *
 * Patterns run against normalized oracle text: lowercased, card's own name
 * replaced with "~", reminder text (parentheses) stripped.
 */

export const RESOURCES = [
  {
    name: "tokens",
    label: "creature tokens",
    weight: 2,
    provides: [
      /create[^.]*token/,
      /\bpopulate\b/,
    ],
    wants: [
      /\bpopulate\b/,
      /whenever one or more tokens/,
      /tokens? you control (get|gain|have)/,
      /for each creature you control/,
      /creatures you control (get|gain) \+/,
      /\bconvoke\b/,
    ],
  },
  {
    name: "expendable_bodies",
    label: "expendable bodies (sac fodder)",
    weight: 3,
    provides: [
      /create[^.]*creature token/,
      /\bundying\b|\bpersist\b/,
      /you may cast ~ from your graveyard/,
      /return ~ (from your graveyard )?to (the battlefield|your hand)/,
      // Temporary theft: steal it, then sacrifice it before giving it back.
      /gain control of (target|that) creature until end of turn/,
    ],
    wants: [
      /sacrifice (a|another|any number of) creature/,
      /sacrifice (a|another) permanent/,
      /\bexploit\b/,
      /as an additional cost[^.]*sacrifice a creature/,
      /\bdevour\b|\bemerge\b/,
    ],
  },
  {
    name: "death_triggers",
    label: "creature deaths",
    weight: 3,
    provides: [
      /sacrifice (a|another|any number of) creature/,
      /\bexploit\b/,
      /destroy all creatures/,
      /each player sacrifices/,
      /\bfight\b/,
    ],
    wants: [
      /whenever (a|another) creature( you control)? dies/,
      /whenever (a|another) nontoken creature/,
      /whenever ~ or another creature[^.]*dies/,
      /\bmorbid\b/,
    ],
  },
  {
    name: "counters_plus1",
    label: "+1/+1 counters",
    weight: 2,
    provides: [
      /put[^.]*\+1\/\+1 counter/,
      /enters(?: the battlefield)? with[^.]*\+1\/\+1 counter/,
      /\bproliferate\b/,
      /\bsupport \d/,
      /\bmentor\b|\badapt\b|\bmonstrosity\b|\bbolster\b/,
    ],
    wants: [
      /\bproliferate\b/,
      /whenever[^.]*\+1\/\+1 counter[^.]*(put on|placed)/,
      /each creature you control with a \+1\/\+1 counter/,
      /creatures? you control with (a )?\+1\/\+1 counters?/,
      /remove (a|x|two|three) \+1\/\+1 counters?/,
      /\bevolve\b/,
    ],
  },
  {
    name: "lifegain",
    label: "life gain",
    weight: 2,
    provides: [
      /you gain \d+ life/,
      /\blifelink\b/,
      /gain life equal to/,
      /gains? \d+ life/,
    ],
    wants: [
      /whenever you gain life/,
      /if you (gained|have gained) life/,
      /you have (more|at least \d+ more) life than/,
      /pay \d+ life[.:]/,
      /amount of life you('ve| have) gained/,
    ],
  },
  {
    name: "extra_draws",
    label: "card draw triggers",
    weight: 2,
    provides: [
      /draw (a card|two cards|three cards|x cards|cards equal)/,
      /each player draws/,
    ],
    wants: [
      /whenever you draw a card/,
      /whenever you draw your (second|first) card/,
      /if you('ve| have) drawn (two or more|your second)/,
      /no maximum hand size/,
    ],
  },
  {
    name: "graveyard_fill",
    label: "graveyard fuel",
    weight: 3,
    provides: [
      /\bmill(s|ed)? (a |\d+ |x |that many )?cards?/,
      /discard(s)? (a|one or more|two|that|your hand)/,
      /put[^.]*(from your (hand|library))?[^.]*into your graveyard/,
      /\bsurveil\b/,
    ],
    wants: [
      /from your graveyard/,
      /\bdelve\b|\bflashback\b|\bescape\b|\bthreshold\b|\bdelirium\b|\bdisturb\b|\bunearth\b|\bdredge\b|\bembalm\b|\beternalize\b|\bjump-start\b|\bretrace\b|\bscavenge\b/,
      /cards? in your graveyard/,
      /return[^.]*from (your|a) graveyard/,
      /exile[^.]*from your graveyard[^.]*:/,
    ],
  },
  {
    name: "reanimation_targets",
    label: "big creatures into the yard",
    weight: 2,
    provides: [
      /discard(s)? (a|one or more|two|your hand)/,
      /\bmill(s|ed)? (\d+|x|that many) cards?/,
      /put[^.]*creature card[^.]*into your graveyard/,
    ],
    wants: [
      /return (target|up to \w+ target|all) creature cards? from (your|a) graveyard to the battlefield/,
      /put (target|a) creature card from (your|a) graveyard onto the battlefield/,
    ],
  },
  {
    name: "discard_outlet",
    label: "discard payoffs",
    weight: 2,
    provides: [
      /discard(s)? (a card|one or more cards|two cards|your hand)/,
      /as an additional cost[^.]*discard/,
    ],
    wants: [
      /\bmadness\b/,
      /whenever you discard/,
      /if you('ve| have) discarded/,
    ],
  },
  {
    name: "etb_value",
    label: "enter-the-battlefield value",
    weight: 3,
    provides: [
      /when(ever)? ~ enters/,
      /when(ever)? this (creature|permanent|artifact|enchantment) enters/,
    ],
    wants: [
      /exile[^.]*(then |and )?return (it|that card|them|those cards)[^.]*to the battlefield/,
      /return (it|~)[^.]*to the battlefield/,
      /\bflicker\b|\bblink\b/,
      /whenever (a|another) creature (you control )?enters/,
      /return (target|a) (creature|permanent) (card )?(you (own|control) )?to (its owner's|your) hand/,
    ],
  },
  {
    name: "treasure",
    label: "treasure / artifact tokens",
    weight: 2,
    provides: [
      /create[^.]*treasure token/,
      /create[^.]*(clue|food|blood|powerstone|map|junk) token/,
    ],
    wants: [
      /sacrifice an artifact/,
      /whenever you sacrifice an artifact/,
      /artifacts? you control/,
      /\baffinity for artifacts\b|\bmetalcraft\b|\bimprovise\b/,
      /whenever (an|another) artifact (you control )?enters/,
    ],
  },
  {
    name: "spell_velocity",
    label: "instant/sorcery payoffs",
    weight: 2,
    provides: [
      /instant and sorcery spells you cast cost[^.]*less/,
      /copy (target|that) (instant|sorcery|spell)/,
      /whenever you cast (an instant or sorcery|a noncreature) spell,? copy/,
      /add \{[wubrgc]\}\{[wubrgc]\}/,
    ],
    wants: [
      /whenever you cast (an instant or sorcery|a noncreature|an instant|a sorcery) spell/,
      /\bmagecraft\b|\bprowess\b|\bstorm\b/,
      /instant and sorcery cards? in your graveyard/,
    ],
  },
  {
    name: "landfall",
    label: "extra land drops",
    weight: 2,
    provides: [
      /you may play (an additional land|two additional lands)/,
      /put[^.]*land[^.]*onto the battlefield/,
      /search your library for[^.]*land/,
    ],
    wants: [
      /\blandfall\b/,
      /whenever a land (you control )?enters/,
      /for each land you control/,
    ],
  },
  {
    name: "attack_triggers",
    label: "combat triggers",
    weight: 2,
    provides: [
      /additional combat phase/,
      /untap all (attacking )?creatures/,
      /creatures you control (gain|have) (haste|vigilance)/,
    ],
    wants: [
      /whenever ~ attacks/,
      /whenever (you attack|one or more creatures you control attack)/,
      /\bbattle cry\b|\bexert\b|\bmyriad\b|\bmelee\b/,
    ],
  },
  {
    name: "exile_matters",
    label: "cards in exile",
    weight: 2,
    provides: [
      /exiles? the top (card|two cards|three cards|x cards|\d+ cards) of (your|their|each player's) library/,
      /exile (a|one|two|three|that many|x|\d+) cards? from (the top of )?your library/,
      /each player exiles/,
      /exile (a|one|two|three|x|\d+) cards? from your (hand|graveyard)/,
      /exile[^.]*face down/,
      /\bforetell\b/,
    ],
    wants: [
      /cards? you own in exile/,
      /put into exile this turn/,
      /whenever (a|one or more) cards? (is|are) put into exile/,
      /(cast|play)[^.]*from exile/,
      /for each card (you own )?in exile/,
    ],
  },
  {
    name: "tap_abilities",
    label: "untap shenanigans",
    weight: 1,
    provides: [
      /untap (target|another target|all|up to \w+ target) (creature|permanent|artifact)/,
      /untap (it|~|that creature)/,
    ],
    wants: [
      /\{t\},?[^:]*: (?!add)/,
    ],
  },
];

/** Normalize oracle text for pattern matching. */
export function normalizeOracle(card) {
  let text = "";
  if (card.card_faces) {
    text = card.card_faces.map((f) => f.oracle_text || "").join("\n");
  } else {
    text = card.oracle_text || "";
  }
  text = text.toLowerCase();
  // Strip reminder text so keywords aren't double-counted via their reminders.
  text = text.replace(/\([^)]*\)/g, "");
  // Replace the card's own name (and short name before a comma) with ~.
  const fullName = card.name.toLowerCase();
  for (const face of fullName.split(" // ")) {
    text = text.split(face).join("~");
    const short = face.split(",")[0];
    if (short.length > 3) text = text.split(short).join("~");
  }
  return text;
}

/** Tag a card: returns { provides: Set, wants: Set } of resource names. */
export function tagCard(card) {
  const text = normalizeOracle(card);
  const provides = new Set();
  const wants = new Set();
  if (!text) return { provides, wants };
  for (const res of RESOURCES) {
    if (res.provides.some((re) => re.test(text))) provides.add(res.name);
    if (res.wants.some((re) => re.test(text))) wants.add(res.name);
  }
  return { provides, wants };
}
