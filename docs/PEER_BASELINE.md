# Peer baseline design

**Status:** research design; the static index is not approved until the peer-UX spike passes.

## Question

Given a position, mover rating band, and speed class, what legal moves did comparable humans choose, and with what observed results?

This layer is descriptive. It does not say that a move caused a result, that ratings transfer perfectly between platforms, or that common moves are good.

## Phase 0: use what already exists

Lichess Opening Explorer already returns exact-position move counts and results with rating-group and speed filters. Use it on 100-200 imported games to measure:

- coverage by ply and game phase;
- how often peer context changes the selected lesson;
- latency and caching requirements;
- whether the wording is useful to real players;
- how often bands need widening.

Building a multi-terabyte pipeline before this test would be expensive theatre.

## Source data

The default source is Lichess's `Lichess/standard-chess-games` dataset on Hugging Face: CC0, hive-partitioned Parquet by year/month, updated monthly. Column pushdown makes filtering by rating, speed, and result cheap before any position reconstruction happens, and there is no decompression stage to write or maintain. Fall back to the official monthly compressed PGN dump (`.pgn.zst`) only where the Parquet dataset is missing a month, lagging behind the PGN release, or an audit specifically wants the primary source.

Either way, a production build still needs:

1. validation of standard, rated, non-bot games;
2. position reconstruction with a legal chess library;
3. internal unthresholded aggregation;
4. privacy/sparsity filtering only at publication time.

Two caveats:

- The dataset card carries a work-in-progress warning. Pin an exact revision (a commit hash, not `main`/latest) when ingesting, so an upstream change doesn't silently shift results between runs.
- Parquet removes decompression and makes filtering cheap; it does not remove the ingestion pipeline. The movetext column is still SAN, not a legal-move stream — it needs the same position reconstruction as the `.pgn.zst` fallback. Parquet is a faster front door onto the same pipeline, not a replacement for it.

Do not delete low-count rows from the only aggregate. Future months must merge into an internal unthresholded store; the public release is derived from it.

## Evaluation annotations (`%eval`)

Some Lichess games carry `%eval` comments — Stockfish evaluations Lichess attaches when a player requests computer analysis. This is not a clean labelled corpus for benchmarking a review classifier or motif rule. The annotations come from a self-selected sample (players who request analysis, on games they chose to analyse), not a random slice of games, and the engine version and search depth behind them varies across the corpus as Lichess has upgraded its analysis pipeline over time. Selection bias — who requests analysis, on which game outcomes, at what depth, on which platform version — must be measured before `%eval` is used as ground truth for anything. Until then, treat it as a candidate signal to validate, not a labelled dataset to train or grade against.

## Position identity

Use a tested 64-bit Zobrist/Polyglot-compatible position key covering pieces, side to move, castling rights, and a legally relevant en-passant square. Keep a separate history-aware key for repetition and draw rules. Hash collisions are rare but must still be detectable in offline validation.

## Dimensions

Initial dimensions:

- mover rating band;
- speed class;
- legal position key.

Candidate later dimensions—rating gap, platform mapping, and recent time remaining—require measured value because every new dimension destroys sample density.

## Published record

```ts
type PeerPosition = {
  positionKey: bigint;
  ratingBand: string;
  speed: 'bullet' | 'blitz' | 'rapid' | 'classical';
  sampleSize: number;
  moves: Array<{
    moveUci: string;
    count: number;
    moverWins: number;
    draws: number;
    moverLosses: number;
  }>;
};
```

The client calculates proportions and confidence intervals from integer counts. Published metadata includes source months, filters, band definitions, build commit, schema, and suppression threshold.

## Useful metrics

### Move popularity

```text
p(move) = move count / position count
```

Always pair it with a sample and interval.

### Acceptable-move mass

Define an engine-acceptable set using WDL loss and stability thresholds, then sum peer probability across that set. This better represents human difficulty than raw entropy: multiple natural moves can exist even when only one is the engine's first line.

### Observed expected points

```text
observed points = (wins + 0.5 x draws) / samples
```

This is confounded by rating gaps, previous advantage, later errors, openings, and selection. Call it observed peer score, never move quality or causal impact.

## Clocks

Lichess `%clk` is remaining clock, not think time. For an ordinary increment game, derive approximate spend from the previous same-side remaining time, the current remaining time, and increment. Explicitly handle:

- the player's first move;
- missing or malformed clock comments;
- unknown delay/increment formats;
- berserk or platform-specific time changes;
- rounding and timestamp resolution;
- time forfeits and games ending before a next sample.

If those conditions are unresolved, expose remaining-clock buckets instead of invented think times.

## Delivery modes

A 4096-way Parquet/DuckDB-WASM design is not the default. Point lookups across a game can touch many random shards, DuckDB is heavy for tiny reads, and a hash-prefix request still leaks a reduced position fingerprint.

Evaluate three honest modes:

1. **Online:** query an API with explicit consent and clear retention/logging policy.
2. **Prefix-sharded:** fetch compact sorted binary/Brotli shards in a worker and cache them in IndexedDB; label this privacy-reducing, not fully private.
3. **Offline pack:** user downloads a complete or rating/speed-specific pack; no position requests leave the device.

The spike must compare bandwidth, cold latency, storage, shard fan-out, cache hit rate, and privacy claims before selecting one.

## Sparse positions and Maia-3

Maia-3 may estimate rating-conditioned human moves where corpus coverage is absent. Its current open implementation is AGPL-3.0 and Python/PyTorch UCI—not a drop-in browser WASM worker. Browser execution is a separate feasibility and licensing spike.

The UI contract is strict:

- `corpus`: observed human sample;
- `model`: predicted by named Maia version;
- `none`: no peer claim.

Never manufacture a `sparse` state by deleting all evidence of sparse rows. Retain a compact suppression catalog or let the lookup return a measured absence.
