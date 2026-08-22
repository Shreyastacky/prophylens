# CLAUDE.md

Guidance for Claude Code (and any other agent) working in this repository.

## Project purpose

ProphyLens is a local-first, open-source chess improvement system. It combines Stockfish's objective
analysis with peer-calibrated human move data and motif-level diagnosis to answer a more useful
question than "what was the best move?": **which recurring habit should I fix next?** The pipeline is
`play -> diagnose -> practise -> re-test -> measure improvement`. The repository is currently
**pre-alpha / spike stage**: a runnable web shell, typed domain contracts, transparent scoring
primitives, tests, and the product/architecture decisions needed to run three go/no-go experiments
(engine, peer UX, motif diagnosis — see [docs/SPIKES.md](docs/SPIKES.md)) before full UI development.

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

npm workspaces (`apps/*`, `packages/*`); requires Node 22+ and npm 11+.

```text
apps/web/              React 19 + Vite product shell (@prophylens/web)
packages/contracts/    Shared evidence, peer, diagnosis, and scoring types/primitives (@prophylens/contracts)
docs/                  Product, algorithm, privacy, data, and architecture specs
docs/adr/              Architecture decision records
public/engine/         Stockfish distribution boundary (no binary committed yet)
.github/               CI, contribution, and issue templates
```

`apps/web` depends on `@prophylens/contracts` and `chess.js`; no board UI component has been chosen
yet. `_incoming/` at the repo root is **untracked scratch content** (a patch plus draft domain files)
staged for a possible future expansion of `packages/contracts` — it is not part of the workspace and
should not be treated as current implementation.

### packages/contracts: implemented vs. documented

Implemented today ([src/index.ts](packages/contracts/src/index.ts),
[src/scoring.ts](packages/contracts/src/scoring.ts), one test file): core type shapes
(`PositionEvidence`, `EngineProvenance`, `PeerBaseline`, `PeerMoveObservation`, `MotifEvidence`,
`MoveReview`, `RecurringWeakness`) and pure scoring functions (`expectedPoints`, `wilsonInterval`,
`acceptableMoveMass`, `lessonPriority`, `movePopularity`), all covered by tests.

Documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) but **not yet built**: the engine
adapter/worker, immutable evidence store, motif interpreter, peer adapter (explorer/index/model
backends), review classifier, player model, and the IndexedDB storage layer. The `PeerPosition` record
and position-key/Zobrist scheme in [docs/PEER_BASELINE.md](docs/PEER_BASELINE.md) are design-stage
only. Don't assume anything described in `docs/` exists in code until you've checked.

## Commands

- `npm run check` — the composite quality gate; run this before considering work done. It chains, in
  order: `format:check` (prettier) -> `typecheck` (all workspaces) -> `test` (all workspaces, vitest)
  -> `build` (all workspaces). Any step failing stops the chain.
- `npm run test` — runs `vitest run` in every workspace that defines a `test` script.
- `npm run dev` — runs the web app's Vite dev server.
- `npm run build` / `npm run typecheck` / `npm run format` — the individual steps `check` chains
  together, runnable standalone.

## Before committing

Always run `npx prettier --write .` before committing. `npm run check` runs `prettier --check .`
across the _whole_ repository — including every Markdown file, not just changed source — as its first
step, and any other step failing stops the chain before it even reaches typecheck/test/build. A single
unformatted doc (a stray `*emphasis*` Prettier would normalise to `_emphasis_`, wrong list spacing,
etc.) fails CI on its own, even when the code itself is fine. Run the formatter, review what it
changed, then run `npm run check` to confirm all four steps pass before committing.

## Licence position

The repository is **AGPL-3.0-or-later**. This is driven by the copyleft licences of the two key
dependencies the architecture is built around:

- **Stockfish** is GPL-3.0 (the planned browser analysis engine).
- **Maia-3** is AGPL-3.0 (a possible future model for rating-conditioned human move prediction on
  sparse positions).

No Stockfish or Maia binary/model is committed yet. Any release that adds a binary, model, dataset
snapshot, font, icon set, or artwork must update
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), preserve required notices/source links, and pass a
dependency/licence scan — see [docs/LICENSING.md](docs/LICENSING.md) for the full policy.

## Further reading

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system shape, boundaries, storage, security,
  reproducibility contract.
- [docs/PEER_BASELINE.md](docs/PEER_BASELINE.md) — peer-data design: what it can and can't claim,
  position identity, delivery modes.
- [docs/adr/](docs/adr/) — ADR 0001 (local-first analysis, worker-based Stockfish) and ADR 0002
  (validate peer UX with the Lichess Opening Explorer before building a proprietary index).
- [docs/PRODUCT_DIRECTION.md](docs/PRODUCT_DIRECTION.md) — product pillars and explicit non-goals.
