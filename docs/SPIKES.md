# Go/no-go spikes

Do these before building the complete review UI. Each spike ends in measured evidence and a written decision.

## A. Engine spike

**Goal:** prove local Stockfish is responsive, reproducible enough, and deployable.

Build:

- Stockfish 18 lite single-threaded WASM in a dedicated worker;
- typed UCI wrapper with `uci`, `isready`, position, MultiPV, nodes, cancel, and restart;
- PGN reconstruction and bounded evaluation of every decision position;
- progress, pause, and cancellation.

Measure:

- cold load and first-result time;
- nodes/second on representative desktop and mid-range phone;
- UI long tasks and memory;
- battery/thermal behaviour;
- result stability at fixed node budgets;
- production COOP/COEP headers and single-thread fallback.

Pass when a 40-move game completes within the agreed budget without freezing the interface, cancellation is reliable, and saved evidence reproduces within defined tolerances.

## B. Peer UX and coverage spike

**Goal:** prove peer context changes coaching value before building a corpus pipeline.

Use the official Lichess Opening Explorer adapter on 100-200 games across rating bands and blitz/rapid.

Measure:

- lookup coverage by ply and phase;
- fraction of candidate lessons re-ranked by peer context;
- samples, widened-band frequency, latency, and cache rate;
- user preference for engine-only versus peer-calibrated wording;
- differences between Lichess and imported Chess.com cohorts.

Pass only if peer context materially improves selection or explanation. Otherwise keep it as optional context, not the product moat.

## C. Motif diagnosis spike

**Goal:** prove that cross-game weakness diagnosis is reliable.

Start with three high-evidence concepts:

- loose/undefended pieces;
- overloaded or pinned defenders;
- missed forcing threats.

Create positive and negative positions reviewed by strong human players. Report precision, recall, disagreements, and common false positives. Then test whether aggregation across 20-100 games produces a training recommendation a coach considers useful.

Pass when each shipped motif meets an agreed precision floor and every diagnosis can show a legal proof.

## Decision record

Each spike PR must add an ADR containing hardware/browser versions, dataset/sample, raw measurements, failed cases, and a go/change/stop decision. A demo video alone is not evidence.
