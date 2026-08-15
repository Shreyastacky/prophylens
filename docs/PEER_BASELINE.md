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

The official Lichess database is released as monthly compressed PGN (`.pgn.zst`), not ready-made hive-partitioned Parquet. A production build therefore needs:

1. a streaming decompression/parser stage;
2. validation of standard, rated, non-bot games;
3. position reconstruction with a legal chess library;
4. internal unthresholded aggregation;
5. privacy/sparsity filtering only at publication time.

Do not delete low-count rows from the only aggregate. Future months must merge into an internal unthresholded store; the public release is derived from it.

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
