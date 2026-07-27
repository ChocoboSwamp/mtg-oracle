# MTG Oracle

Find overlooked card synergies in the **current Standard format** by reading
what every card actually does. Card data from [Scryfall](https://scryfall.com/docs/api).

## How it works

Every one of the ~4,700 Standard-legal cards has been analyzed into structured
facts: what it **provides**, what it **wants**, and what it wants from the
**deck** it goes in. Two cards synergize when one's output is the other's input.

Crucially the analysis carries **scope**, which naive keyword matching misses:

- *Triple Triad* exiles cards every upkeep, but only cares about cards exiled
  **by its own effect** — so generic exile payoffs are *not* synergies with it.
  What it really wants is a deck full of **high mana-value cards**, because you
  only get to play an opponent's exiled card if yours costs more.
- A sacrifice outlet accepts expendable bodies from **any** source, so a
  temporary-theft spell genuinely does feed it.

Every result explains *why* it matched, and in which direction.

The analysis schema lives in `src/ai-schema.js`; scoring in `src/synergy.js`.

## Usage

### Live site

The published build runs entirely in your browser — the whole card pool and its
analyses are baked into a single file, so there is no backend.

### Local

```
npm run build      # generate the static site into docs/
npx serve docs     # preview it
```

or run the Node server, which serves the same UI plus a small JSON API:

```
npm run web        # then open http://localhost:8787
```

Search a seed card, filter by deck colors with the mana pips, and click any
result to pivot the search onto that card. The left panel shows the seed's
card image and the facts extracted from it.

### CLI

```
node src/cli.js fetch                # download the current Standard pool (~4.7k cards)
node src/cli.js fetch --force        # refresh after a new set / rotation
node src/cli.js tags "Card Name"     # show what a card provides / wants
node src/cli.js synergy "Card Name" --colors UBG --top 20
node src/cli.js search death_triggers wants
node src/cli.js resources            # list all axes
```

## LLM card understanding (task 1)

Regex tags can't see *scope* — e.g. Triple Triad only cares about cards exiled
by its own effect, and its real deck implication is "wants high mana values."
The `analyze` pipeline sends each card's oracle text to Claude once and caches
structured facts in `data/analysis.json`:

- **provides** with scope (`usable_by_others` / `own_effect_only`) and
  frequency (`repeatable` / `once` / `conditional`)
- **wants** with accepts (`any_source` / `own_effect_only`)
- **deck_wants** (construction constraints like `high_mana_value_cards`)
- **roles** (removal / threat / engine / ...) and **power** (1–5)

The synergy scorer automatically uses these facts when both cards are analyzed
(scope-checked matching, repeatable-engine weighting, deck-want fits gated on
power ≥ 3) and falls back to regex tags otherwise.

**All 4,702 Standard cards are analyzed** (`data/analysis.json`). Two ways to
(re)generate it after a rotation:

### A. Claude Code subagents — no API cost

```
node src/prep-chunks.js        # auto-analyzes textless cards, chunks the rest
                               # (clear data/chunks + data/parts first to re-chunk
                               #  only un-analyzed cards — nothing is repeated)
# then run one subagent per chunk: read src/ai-schema.js, analyze
# data/chunks/chunk-NNN.json, write data/parts/part-NNN.json, and
# fix errors until `node src/validate-part.js NNN` prints OK.
# Tell each agent to write ~40-card fragments as it goes — if it is
# interrupted, src/salvage-frags.js <scratchpad-dir> recovers the orphans.
node src/merge-parts.js        # fold validated parts into analysis.json
node src/analyze.js stats      # coverage + power spread
```

`merge-parts.js` shape-checks every entry and skips unparseable files, so an
interrupted write can never corrupt the cache.

### B. Batch API — costs money, needs a key

```
setx ANTHROPIC_API_KEY "sk-ant-..."   # once, then open a new terminal
npm run analyze test                  # sanity-check on benchmark cards (~cents)
npm run analyze run                   # submit all cards via Batch API (~$25)
npm run analyze watch                 # poll until done, merge results
```

Uses `claude-opus-5` at low effort with strict JSON schema output; the Batch
API halves the price. Either path writes the same cache keyed by `oracle_id`,
so after a new set only the new cards need analyzing.

## Meta deck analysis

`data/meta-decks.json` holds real tournament decklists (source + fetch date
recorded in the file). `node src/analyze-decks.js ["name filter"]` runs them
through the synergy engine to show what actually makes each deck work: the
highest-scoring internal card pairs, the "glue" cards by total connection
score, role composition, curve, and synergy density.

It doubles as a **calibration check on `power`**: if decks winning tournaments
are full of cards we rated 2, the ratings are wrong. As of the July 2026
snapshot they are — see "Known limitations" below.

## Known limitations

- **`power` undervalues cost-reduction cards.** Ratings were assigned by
  reading each card in isolation, so a card printed at `{5}{U}{U}` that
  routinely costs 1–2 mana gets judged as a seven-drop. The top Standard deck
  (Izzet Control) is built on exactly these, and we rate its core creatures 2.
- **Curve analysis uses printed mana value**, so the same decks look like clunky
  ramp piles when they are tempo decks.
- **`power` is also biased against recent cards** — 2023–24 cards are rated 4-5
  about twice as often as 2025–26 cards, reflecting how much the analyzing model
  had seen about them rather than real strength.

Treat `power` as a weak prior, not a verdict. Real play-rate data is the fix.

## Deploying

The site is static — GitHub Pages serves `docs/` directly. The scoring engine
modules in `src/` are copied verbatim into `docs/lib/` by the build, so the
browser and the CLI run **the same code** and can't drift apart.

```
npm run build
git add -A && git commit -m "Rebuild"
git push
```

After a rotation: `npm run fetch -- --force` → analyze the new cards →
`npm run build` → commit and push. Data is baked at build time, so the live site
does not update on its own.

## Ideas for later

- **"Overlooked" score**: cross-reference play-rate data (e.g. from MTGGoldfish
  or Untapped) and boost pairs with high mechanical score but low co-occurrence
  in real decklists — that's the literal definition of an overlooked synergy.
- **Deck seeding**: pick a seed card, greedily add the highest-synergy cards
  that fit the color identity and curve, output a 60-card skeleton.
- **Combo chains**: find A→B→C loops (A feeds B, B feeds C, C feeds A).
- **LLM tagging pass**: use a model to tag cards the regexes miss (novel
  wordings, implicit synergies), cached per oracle text.
- **Web UI** on top of the same data.
