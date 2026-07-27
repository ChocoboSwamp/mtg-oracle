/**
 * The DTO boundary: turns an internal card object into the shape the UI renders.
 * Node-free, so the local server and the static browser build share one
 * implementation and can never drift apart.
 */
import { RESOURCES as TAG_RESOURCES } from "./tags.js";
import { RESOURCE_LABELS, DECK_WANT_LABELS } from "./ai-schema.js";

const TAG_LABEL = Object.fromEntries(TAG_RESOURCES.map((r) => [r.name, r.label]));

/** Decorate a resource label with scope/repeatability annotations. */
function providesLabel(p) {
  return (
    (RESOURCE_LABELS[p.resource] ?? p.resource) +
    (p.scope === "own_effect_only" ? " (self-only)" : "") +
    (p.frequency === "repeatable" ? " ↻" : "")
  );
}

function wantsLabel(w) {
  return (
    (RESOURCE_LABELS[w.resource] ?? w.resource) +
    (w.accepts === "own_effect_only" ? " (self-only)" : "")
  );
}

export function publicCard(c) {
  let provides, wants, analyzed;
  if (c.ai) {
    analyzed = true;
    provides = c.ai.provides.map((p) => ({
      resource: p.resource,
      label: providesLabel(p),
    }));
    wants = [
      ...c.ai.wants.map((w) => ({ resource: w.resource, label: wantsLabel(w) })),
      ...c.ai.deck_wants
        .filter((dw) => dw.want !== "none_special")
        .map((dw) => ({
          resource: dw.want,
          label: `deck: ${DECK_WANT_LABELS[dw.want] ?? dw.want}`,
        })),
    ];
  } else {
    analyzed = false;
    provides = [...c.provides].map((r) => ({ resource: r, label: TAG_LABEL[r] }));
    wants = [...c.wants].map((r) => ({ resource: r, label: TAG_LABEL[r] }));
  }
  return {
    name: c.name,
    mana_cost: c.mana_cost,
    cmc: c.cmc,
    type_line: c.type_line,
    oracle_text: c.oracle_text,
    color_identity: c.color_identity,
    rarity: c.rarity,
    images: c.images,
    analyzed,
    roles: c.ai?.roles ?? [],
    ai_power: c.ai?.power ?? null,
    provides,
    wants,
  };
}
