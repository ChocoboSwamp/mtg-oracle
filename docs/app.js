/* Synergy Oracle frontend — runs the scoring engine client-side. */

import { findSynergies } from "./lib/synergy.js";
import { findCard } from "./lib/lookup.js";
import { publicCard } from "./lib/card-view.js";
import { tagCard } from "./lib/tags.js";

const $ = (id) => document.getElementById(id);

const state = {
  names: [],
  pool: [],
  seed: null,
  colors: new Set(),
  activeSuggestion: -1,
};

/* ---------- theme ---------- */

const themeToggle = $("themeToggle");
const savedTheme = localStorage.getItem("theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

themeToggle.addEventListener("click", () => {
  const current =
    document.documentElement.dataset.theme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("theme", next);
});

/* ---------- helpers ---------- */

function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* Render a mana cost string like "{2}{B}{B}" as pip spans. */
function manaHtml(cost) {
  if (!cost) return "";
  return cost.replace(/\{([^}]+)\}/g, (_, sym) => {
    const s = sym.toUpperCase();
    const cls = ["W", "U", "B", "R", "G"].includes(s) ? ` ms-${s.toLowerCase()}` : "";
    return `<span class="ms${cls}">${esc(sym)}</span>`;
  });
}

/* Oracle text: escape, then substitute mana symbols and italicize reminders. */
function oracleHtml(text) {
  if (!text) return "";
  return text
    .split("\n")
    .map((line) => {
      let html = esc(line);
      html = html.replace(/\(([^)]*)\)/g, '<span class="reminder">($1)</span>');
      html = html.replace(/\{([^}]+)\}/g, (_, sym) => {
        const s = sym.toUpperCase();
        const cls = ["W", "U", "B", "R", "G"].includes(s) ? ` ms-${s.toLowerCase()}` : "";
        return `<span class="ms${cls}">${sym}</span>`;
      });
      return `<p>${html}</p>`;
    })
    .join("");
}

function chipsHtml(tags, noneText) {
  if (!tags.length) return `<span class="chip chip-none">${noneText}</span>`;
  return tags.map((t) => `<span class="chip">${esc(t.label)}</span>`).join("");
}

/* ---------- search & suggestions ---------- */

const input = $("cardSearch");
const suggestionsEl = $("suggestions");

function showSuggestions(matches) {
  if (!matches.length) {
    suggestionsEl.hidden = true;
    return;
  }
  suggestionsEl.innerHTML = matches
    .map((n, i) => `<li data-name="${esc(n)}" class="${i === state.activeSuggestion ? "active" : ""}">${esc(n)}</li>`)
    .join("");
  suggestionsEl.hidden = false;
}

function filterNames(q) {
  const lq = q.toLowerCase();
  const starts = [];
  const contains = [];
  for (const n of state.names) {
    const ln = n.toLowerCase();
    if (ln.startsWith(lq)) starts.push(n);
    else if (ln.includes(lq)) contains.push(n);
    if (starts.length >= 12) break;
  }
  return starts.concat(contains).slice(0, 12);
}

input.addEventListener("input", () => {
  state.activeSuggestion = -1;
  const q = input.value.trim();
  if (q.length < 2) {
    suggestionsEl.hidden = true;
    return;
  }
  showSuggestions(filterNames(q));
});

input.addEventListener("keydown", (e) => {
  const items = [...suggestionsEl.querySelectorAll("li")];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!items.length) return;
    const dir = e.key === "ArrowDown" ? 1 : -1;
    state.activeSuggestion = (state.activeSuggestion + dir + items.length) % items.length;
    showSuggestions(items.map((li) => li.dataset.name));
  } else if (e.key === "Enter") {
    const pick =
      items[state.activeSuggestion]?.dataset.name ??
      items[0]?.dataset.name ??
      input.value.trim();
    if (pick) selectCard(pick);
  } else if (e.key === "Escape") {
    suggestionsEl.hidden = true;
  }
});

suggestionsEl.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (li) selectCard(li.dataset.name);
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".searchbox")) suggestionsEl.hidden = true;
});

/* ---------- color filter ---------- */

$("colorPips").addEventListener("click", (e) => {
  const btn = e.target.closest(".pip");
  if (!btn) return;
  const c = btn.dataset.color;
  if (state.colors.has(c)) state.colors.delete(c);
  else state.colors.add(c);
  btn.setAttribute("aria-pressed", state.colors.has(c));
  $("filterHint").textContent = state.colors.size
    ? [...state.colors].join("") + " identity"
    : "any colors";
  if (state.seed) runQuery(state.seed);
});

/* ---------- query & render ---------- */

async function selectCard(name) {
  suggestionsEl.hidden = true;
  input.value = name;
  runQuery(name);
}

function runQuery(name) {
  const card = findCard(state.pool, name);
  if (!card) {
    $("results").innerHTML = `<p class="no-results">Card not found in the current Standard pool.</p>`;
    return;
  }
  const colors = [...state.colors].join("");
  const results = findSynergies(card, state.pool, { colors: colors || undefined, top: 30 });
  const data = {
    seed: publicCard(card),
    results: results.map(({ card: c, score, reasons }) => ({
      ...publicCard(c),
      score,
      reasons,
    })),
  };
  state.seed = data.seed.name;
  input.value = data.seed.name;
  renderSeed(data.seed);
  renderResults(data);
}

let seedFaces = [];
let seedFaceIndex = 0;

function showSeedFace(i) {
  seedFaceIndex = i;
  $("seedArt").src = seedFaces[i]?.normal ?? "";
}

$("flipBtn").addEventListener("click", () => {
  showSeedFace((seedFaceIndex + 1) % seedFaces.length);
});

function renderSeed(card) {
  $("emptyState").hidden = true;
  const el = $("seedCard");
  el.hidden = false;
  seedFaces = card.images ?? [];
  $("flipBtn").hidden = seedFaces.length < 2;
  showSeedFace(0);
  $("seedArt").alt = card.name;
  $("seedName").textContent = card.name;
  $("seedCost").innerHTML = manaHtml(card.mana_cost);
  $("seedType").textContent = card.type_line;
  $("seedOracle").innerHTML = oracleHtml(card.oracle_text);
  $("seedProvides").innerHTML = chipsHtml(card.provides, "nothing tagged");
  $("seedWants").innerHTML = chipsHtml(card.wants, "nothing tagged");
}

function renderResults(data) {
  const seedName = data.seed.name;
  const parts = [
    `<div class="results-head">${data.results.length} synergies with <strong>${esc(seedName)}</strong></div>`,
  ];
  if (!data.results.length) {
    parts.push(`<p class="no-results">No tagged synergies under the current filters — try removing color restrictions.</p>`);
  }
  for (const r of data.results) {
    const reasons = r.reasons
      .map((rs) => {
        if (rs.deck_want) {
          const seedWants = rs.consumer === seedName;
          return `<div class="reason"><span class="dir">◆</span> ${
            seedWants
              ? `fits your card's deck: <em>${esc(rs.label)}</em>`
              : `its deck wants <em>${esc(rs.label)}</em> — your card fits`
          }</div>`;
        }
        const outgoing = rs.provider === seedName;
        return `<div class="reason"><span class="dir">${outgoing ? "→" : "←"}</span> ${
          outgoing
            ? `feeds it <em>${esc(rs.label)}</em>`
            : `feeds your card <em>${esc(rs.label)}</em>`
        }</div>`;
      })
      .join("");
    const thumb = r.images?.[0]?.small ?? "";
    const preview = r.images?.[0]?.normal ?? "";
    parts.push(`
      <button class="result" data-name="${esc(r.name)}" data-img="${esc(preview)}" title="Pivot to ${esc(r.name)}">
        ${thumb ? `<img class="thumb" src="${esc(thumb)}" loading="lazy" alt="" draggable="false">` : ""}
        <div class="result-body">
          <div class="result-top">
            <span class="score">${r.score}</span>
            <span class="result-name">${esc(r.name)}</span>
            <span class="mana">${manaHtml(r.mana_cost)}</span>
          </div>
          <div class="result-type">${esc(r.type_line)}</div>
          <div class="reasons">${reasons}</div>
        </div>
      </button>`);
  }
  $("results").innerHTML = parts.join("");
}

$("results").addEventListener("click", (e) => {
  const btn = e.target.closest(".result");
  if (btn) {
    selectCard(btn.dataset.name);
    scrollTo({ top: 0, behavior: "smooth" });
  }
});

/* ---------- hover card preview ---------- */

const preview = $("hoverPreview");
const hasFinePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

function positionPreview(e) {
  const w = 300;
  const h = w * (680 / 488);
  const pad = 16;
  let x = e.clientX + pad;
  let y = e.clientY - h / 3;
  if (x + w + pad > innerWidth) x = e.clientX - w - pad;
  y = Math.max(pad, Math.min(y, innerHeight - h - pad));
  preview.style.left = `${x}px`;
  preview.style.top = `${y}px`;
}

if (hasFinePointer) {
  $("results").addEventListener("mouseover", (e) => {
    const btn = e.target.closest(".result");
    if (btn?.dataset.img) {
      preview.src = btn.dataset.img;
      preview.hidden = false;
      positionPreview(e);
    }
  });
  $("results").addEventListener("mousemove", (e) => {
    if (!preview.hidden) positionPreview(e);
  });
  $("results").addEventListener("mouseout", (e) => {
    if (!e.relatedTarget?.closest?.(".result")) {
      preview.hidden = true;
      preview.removeAttribute("src");
    }
  });
}

/* ---------- boot ---------- */

const TRY_CARDS = [
  "Triple Triad",
  "High-Society Hunter",
  "Ashiok, Wicked Manipulator",
  "Enduring Innocence",
];

/** Rebuild the card objects the scorer expects from the baked pool. */
function hydrate(pool) {
  return pool.cards.map((c) => {
    const tags = tagCard(c);
    return { ...c, ai: pool.analysis[c.oracle_id] ?? null, provides: tags.provides, wants: tags.wants };
  });
}

(async function init() {
  input.disabled = true;
  input.placeholder = "Loading card pool…";
  try {
    // Relative path: a project Pages site is served from /<repo>/.
    const res = await fetch("data/pool.json");
    if (!res.ok) throw new Error(`pool.json returned ${res.status}`);
    const pool = await res.json();

    state.pool = hydrate(pool);
    state.names = state.pool.map((c) => c.name);
    $("poolCount").textContent = `${pool.count.toLocaleString()} cards · standard`;
    $("poolCount").title = `${pool.analyzed.toLocaleString()} analyzed · data built ${pool.built_at}`;

    const available = TRY_CARDS.filter((n) => state.names.includes(n));
    $("tryButtons").innerHTML = available
      .map((n) => `<button data-name="${esc(n)}">${esc(n)}</button>`)
      .join("");
    $("tryButtons").addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (btn) selectCard(btn.dataset.name);
    });

    input.disabled = false;
    input.placeholder = "Start typing a card name…";
    input.focus();
  } catch (err) {
    input.placeholder = "Card data failed to load";
    $("results").innerHTML =
      `<p class="no-results">Couldn't load the card pool (${esc(String(err.message))}). Try reloading the page.</p>`;
  }
})();
