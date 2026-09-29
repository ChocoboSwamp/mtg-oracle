# MTG-ORACLE — project brief

Standard-format synergy finder for Magic: The Gathering. Card data from Scryfall, analysed into structured provides / wants / deck-wants facts with scope, so synergies are found by reading what cards actually do rather than keyword matching. Published as a static site on GitHub Pages. `README.md` has the full description and architecture; read it before touching the analysis pipeline.

## Goal
Strong, creative, competitive decks. Not a card database. Every feature is judged by whether it surfaces a synergy a good player would have missed.

## Read first
- `README.md` — how the pipeline works
- per-folder memory — non-obvious lessons (Triple Triad scope case, deployment steps, MTGA overlay gotchas)

## Deploy
Static build lives in `docs/` and is served by GitHub Pages. Redeploy = `npm run build` then commit and push. Live at chocoboswamp.github.io/mtg-oracle. Do not push without being asked.

## Working conventions
- Multi-step work: keep a plan table and re-post it with updated status after every completed coding step (not after questions).
- Run the relevant tests or a smoke build before reporting a change as done.
- Moved here from `ClaudeHOME\mtg-synergy` on 2026-09-09. Git history and remote are unchanged.
