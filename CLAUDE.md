# CLAUDE.md

Guidance for Claude Code (and any other agent) working in this repository.

## Project purpose

ProphyLens is a local-first, open-source chess improvement system. It combines Stockfish's objective
analysis with peer-calibrated human move data and motif-level diagnosis to answer a more useful
question than "what was the best move?": **which recurring habit should I fix next?** The pipeline is
`play -> diagnose -> practise -> re-test -> measure improvement`. The repository
is a **public alpha (0.1.3-alpha)**: a browser app that reviews completed games with a pinned local
Stockfish 18 build, keeps a private IndexedDB library and offers practice from the player's own key
moments. Peer comparison, recurring motif diagnosis and measured long-term improvement are still
research goals, gated by the spikes in [docs/SPIKES.md](docs/SPIKES.md).

## Two standing rules

These are load-bearing product constraints, not stylistic preferences — treat them as hard boundaries
when touching anything in the analysis/explanation path:

1. **Deterministic explanations before any LLM prose.** Facts, classifications, and evidence are
   computed and verified by deterministic code first (engine output, motif interpreter, review
   classifier). An LLM may only rephrase or translate already-verified facts, and that rephrasing is
   optional — it never originates a claim. See [docs/ALGORITHM.md](docs/ALGORITHM.md).
2. **No LLM in the evaluation loop.** Stockfish and deterministic classifiers decide what is true. An
   LLM never evaluates a position, classifies a move, or invents chess reasoning. See the non-goals in
   [docs/PRODUCT_DIRECTION.md](docs/PRODUCT_DIRECTION.md).

## Workspace layout

npm workspaces (`apps/*`, `packages/*`); requires Node 22.12+ and npm 11+.

```text
apps/web/              React 19 + Vite app (@prophylens/web): review, library, practice
apps/web/src/analysis/ Engine client, UCI parsing, classification, PGN worker, IndexedDB storage
packages/contracts/    Evidence, peer, diagnosis and lesson-scoring types/primitives (@prophylens/contracts)
public/engine/         Pinned Stockfish 18 lite single-threaded JS/WASM, licence and manifest
scripts/               Release build, security policy and production server for browser tests
e2e/                   Playwright production journeys (Chromium, Firefox, WebKit)
docs/                  Product, algorithm, privacy, data, release and architecture specs
docs/adr/              Architecture decision records
.github/               CI, contribution and issue templates
```

### Built vs. documented

Built today: the Stockfish worker client with verified engine bytes, versioned move-loss
classification, the PGN parsing worker, the IndexedDB library (backup/restore, deduplication,
recovery), the review UI and practice. `packages/contracts` holds the shared type shapes and pure
scoring functions (`expectedPoints`, `wilsonInterval`, `acceptableMoveMass`, `lessonPriority`,
`movePopularity`).

Documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) but **not yet built**: the motif
interpreter, peer adapter (explorer/index/model backends), the peer-aware review classifier and the
player model. The `PeerPosition` record and position-key scheme in
[docs/PEER_BASELINE.md](docs/PEER_BASELINE.md) are design-stage only. Don't assume anything described
in `docs/` exists in code until you've checked.

## Commands

- `npm run check` — the composite quality gate; run this before considering work done. It chains, in
  order: `format:check` (prettier) -> `typecheck` (all workspaces) -> `test` (all workspaces, vitest)
  -> `build`. Any step failing stops the chain.
- `npm run build` — `scripts/build-release.mjs`: a complete publishable `dist/` with engine assets,
  licences and a SHA-256 release manifest.
- `npm run test:e2e` — Playwright journeys against the production build on port 5174; run `build`
  first. Set `BROWSERS=chromium,firefox,webkit` for all engines (CI does), or `PUBLIC_BASE_URL` for a
  published instance.
- `npm run dev` — the web app's Vite dev server.
- `npm run test` / `npm run typecheck` / `npm run format` — individual steps, runnable standalone.

## Before committing

Always run `npx prettier --write .` before committing. `npm run check` runs `prettier --check .`
across the _whole_ repository — including every Markdown file, not just changed source — as its first
step, and any other step failing stops the chain before it even reaches typecheck/test/build. A single
unformatted doc (a stray `*emphasis*` Prettier would normalise to `_emphasis_`, wrong list spacing,
etc.) fails CI on its own, even when the code itself is fine. Run the formatter, review what it
changed, then run `npm run check` to confirm all four steps pass before committing.

## Licence position

The repository is **AGPL-3.0-or-later** (see [ADR 0003](docs/adr/0003-licence-agpl.md)). This is
driven by the copyleft licences of the two key dependencies the architecture is built around:

- **Stockfish** is GPL-3.0. The pinned Stockfish 18 lite single-threaded build is committed in
  `public/engine/` with its licence and corresponding-source pointer; its checksums are pinned in the
  engine manifest and verified at runtime.
- **Maia-3** is AGPL-3.0 (a possible future model for rating-conditioned human move prediction on
  sparse positions). It is not included.

Any change that adds or updates a binary, model, dataset snapshot, font, icon set or artwork must
update [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), preserve required notices/source links, and
pass a dependency/licence scan — see [docs/LICENSING.md](docs/LICENSING.md) for the full policy.

## Further reading

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system shape, boundaries, storage, security,
  reproducibility contract.
- [docs/PEER_BASELINE.md](docs/PEER_BASELINE.md) — peer-data design: what it can and can't claim,
  position identity, delivery modes.
- [docs/adr/](docs/adr/) — ADR 0001 (local-first analysis, worker-based Stockfish), ADR 0002
  (validate peer UX with the Lichess Opening Explorer before building a proprietary index) and ADR
  0003 (AGPL licence).
- [docs/RELEASE.md](docs/RELEASE.md) and [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) — current release
  evidence and the next development gates.
- [docs/PRODUCT_DIRECTION.md](docs/PRODUCT_DIRECTION.md) — product pillars and explicit non-goals.
