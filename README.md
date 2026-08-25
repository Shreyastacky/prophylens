# ProphyLens

> See the threat before it becomes a mistake.

ProphyLens is an open-source, local-first chess improvement system. It combines Stockfish's objective analysis with peer-calibrated human move data and motif-level diagnosis to answer a more useful question than "what was the best move?": **which recurring habit should I fix next?**

The name combines **prophylaxis**—the chess skill of anticipating and preventing a plan—with a **lens** on the patterns hidden across your games.

## Why this exists

Open-source game review already exists. Lichess, En Croissant, CHONSE2, eval.bar, and other projects cover much of the single-game analysis surface. ProphyLens is intentionally narrower and deeper:

1. Analyse completed games privately on the user's device.
2. Separate tactical truth from human difficulty.
3. Detect recurring motifs across games.
4. Prioritise lessons by severity, recurrence, fixability, confidence, and likely future exposure.
5. Turn the player's own mistakes into measurable practice.

```text
Play -> diagnose -> practise -> re-test -> measure improvement
```

## Status

**Pre-alpha / first-review stage.** The browser can parse a PGN, reconstruct every decision position, run Stockfish 18 locally in a background worker, compare the engine move with the move played, show a navigable board, apply versioned move-loss labels, cancel/restart analysis, and save or download a reproducible evidence receipt. Hardware benchmarking, calibrated classification, peer calibration, motifs, and training are not complete.

## User system requirements

ProphyLens is planned as a browser application, so ordinary users will not need to install Node.js or development tools. The requirements below are provisional until the Stockfish engine spike measures performance on real hardware.

| Experience     | Suggested hardware                              | What to expect                                               |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| Minimum        | Modern 64-bit computer, 4 CPU threads, 4 GB RAM | Usable with lighter analysis; complete games may take longer |
| Recommended    | 4–6 CPU cores, 8 GB RAM                         | Comfortable everyday game analysis                           |
| Heavy analysis | 8+ CPU cores, 16 GB RAM                         | Faster, deeper analysis with several suggested moves         |

Additional notes:

- A current desktop version of Chrome or Edge will be the initial target; Firefox support will be tested separately.
- No dedicated graphics card is required. Stockfish primarily uses the processor.
- Reserve approximately 250–500 MB of storage for the application, engine files and saved analyses.
- Internet access is required for the initial application load and Lichess peer statistics. Local Stockfish analysis can work offline after its files are cached.
- Desktop computers and laptops are the initial target. Mobile performance and battery use will be evaluated later.
- Actual analysis time depends on the processor, search budget and number of alternative moves requested. No fixed full-game completion time is promised until benchmarking is complete.

## The chess brain

```text
Stockfish evidence
       |
       v
Deterministic board + motif interpreter
       |
       v
Peer calibration + player history
       |
       v
Lesson ranking + retry drill
       |
       v
Verified explanation (optional LLM rephrasing only)
```

Stockfish decides what works. ProphyLens extracts what changed, identifies the motif, compares it with rating-appropriate human behaviour, and decides what is worth teaching. An LLM may eventually rewrite verified facts; it never evaluates a position.

## Start locally

Requirements: Node.js 22+ and npm 11+.

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run check
```

What the current page proves:

- Stockfish loads from the same web application and responds through UCI.
- Analysis runs in a Web Worker instead of freezing the interface.
- Every position uses the complete game history leading to the player's decision.
- The node budget and number of candidate lines are visible and configurable.
- Results include engine version, neural-network identity, settings, source revision, and binary checksums.
- The latest completed analysis remains in local browser storage and can be downloaded as JSON.

The current rows are raw engine evidence. They deliberately do not call moves blunders or claim to explain why a move failed yet.

## Go/no-go spikes

Full product development starts only after these pass:

- **Engine:** Stockfish 18 WASM in a worker, stable evaluation, cancellation, desktop/mobile budgets.
- **Peer UX and coverage:** use the existing Lichess Opening Explorer first; measure coverage and whether peer context changes lesson selection across 100-200 games.
- **Motif diagnosis:** prove that repeated mistakes can be grouped into concepts reliably enough to create useful drills.

See [docs/SPIKES.md](docs/SPIKES.md), [docs/PRODUCT_DIRECTION.md](docs/PRODUCT_DIRECTION.md), and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository map

```text
apps/web/              React/Vite product shell
packages/contracts/    Shared evidence, peer, diagnosis, and provenance types
docs/                  Product, algorithm, privacy, data, and architecture specs
public/engine/         Pinned Stockfish 18 browser build, licence, checksums, and source pointer
.github/               CI, contribution, and issue templates
```

## Product rules

- Completed games only; no live-game assistance.
- Private and local by default.
- No cheat-detection claims.
- Every conclusion carries engine, classifier, and peer-data provenance.
- Corpus-backed and model-estimated peer claims are visibly different.
- Missing or weak evidence is shown as uncertainty, not dressed up as confidence.

## Licensing

ProphyLens is licensed under **AGPL-3.0-or-later**. The included Stockfish.js 18 lite single-threaded browser build is GPL-3.0; its licence, exact checksums, release, corresponding source, and build instructions are recorded under `public/engine/`. Maia-3 is not included. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [docs/LICENSING.md](docs/LICENSING.md).

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Small, evidence-backed rules beat clever black boxes here.
