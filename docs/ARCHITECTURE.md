# Architecture

## Shape

ProphyLens is local-first and evidence-driven. Expensive analysis lives in workers; the UI receives versioned events and never talks directly to a UCI process.

```text
PGN / provider import
        |
        v
legal game reconstruction -----> local game store
        |
        v
analysis scheduler -> Stockfish worker -> immutable position evidence
        |                                  |
        |                                  v
        +--------------------------> motif interpreter
                                           |
peer adapter ------------------------------+
                                           v
                                  review classifier
                                           |
player history ----------------------------+
                                           v
                                  lesson + retry drill
```

## Boundaries

### Game core

Parses/sanitises PGN, enforces legal moves, retains comments only as inert text, and creates both FEN and history-aware keys.

### Engine adapter

Owns UCI lifecycle, worker messages, cancellation, time/node budgets, MultiPV, score perspective, and crash recovery. The first implementation targets Stockfish 18 lite single-threaded WASM. Threaded builds are optional after production COOP/COEP verification.

### Immutable evidence store

Stores raw results keyed by position/history plus engine version, NNUE hash, options, node budget, and MultiPV. Classifier changes must not require rerunning Stockfish.

### Motif interpreter

Computes attackers/defenders, material deltas, checks/captures/threats, king exposure, pawn structure, mobility, and tactical motif candidates. Each motif contains squares and a proof line that can be replayed.

### Peer adapter

Returns the same `PeerBaseline` contract for explorer, static-index, and future model backends. Source and uncertainty remain visible.

### Review classifier

Combines WDL loss, stability, forcedness, motifs, peer data, and time context into a versioned result. It is deterministic and benchmarked.

Its output is not a single classification label. Forcedness (`forced`, `onlyMove`) and peer-relative labelling (`peerLabel`, `peerSource`) are separate axes on `MoveReview`, not one union, because they vary independently: a move can be forced *and* a personal leak (there is only one move that avoids a large loss here, and this player still doesn't find it), or natural *and* engine-only (peers play something reasonable, but the engine's actual best move is invisible to human search). Collapsing them into a single field forces a lossy choice at annotation time. See `MoveReview` in `packages/contracts/src/index.ts`.

### Player model

Aggregates motif evidence across games. Exact-position repetition is supporting evidence, not the unit of diagnosis.

## Storage

Use IndexedDB for games, evidence, reviews, settings, drills, and cached peer data. Schema migrations must be explicit and reversible where practical. Games remain local unless users intentionally invoke sharing/sync.

## Security boundaries

- Parse PGN as data; never inject comments/tags as HTML.
- Put engines in dedicated workers with a narrow message protocol.
- Limit file size, game count, analysis concurrency, and cache use.
- Treat provider APIs as optional adapters; PGN always works offline.
- No engine endpoint is exposed as an unauthenticated arbitrary command runner.

## Reproducibility

Every saved review references:

- application and classifier versions;
- engine version and NNUE hash;
- search budget/options and MultiPV;
- game/history key;
- peer source, index/model version, band, speed, sample, and date range;
- motif rule version.
