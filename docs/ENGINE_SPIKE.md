# Engine spike status

**Status:** implementation complete enough for browser benchmarking; go/no-go decision not yet made.

## What exists

- Stockfish.js 18 lite single-threaded JavaScript and WebAssembly assets, pinned with checksums.
- A browser Web Worker client that performs the UCI handshake and sets Hash, WDL, and MultiPV.
- PGN parsing that reconstructs the complete history before every played move, including custom-FEN games.
- Fixed node-budget analysis with one to three candidate lines.
- Position-by-position progress, cancellation by terminating the worker, and explicit restart.
- Raw evaluation, WDL, depth, node count, best move, and principal-variation parsing.
- A versioned JSON evidence receipt saved locally and available for download.
- Deployment headers and the correct WebAssembly MIME type.

## What the automated checks prove

- TypeScript accepts the data flow without unsafe type errors.
- PGN reconstruction works for ordinary and custom starting positions.
- Representative UCI centipawn, mate, WDL, MultiPV, and best-move messages parse correctly.
- The exact distributed engine completes `uci`, `isready`, and a real node-limited search.
- The production build contains the engine files with the documented byte-for-byte checksums.

## What remains before the spike passes

1. Analyse representative 40-move games on the target desktop hardware.
2. Measure cold load, first-result time, nodes per second, peak memory, and long UI tasks.
3. Measure cancellation latency during a deeper search and restart reliability over repeated runs.
4. Compare result stability at 10,000, 50,000, and 100,000 nodes.
5. Test a mid-range phone for runtime, memory, heat, and battery behaviour.
6. Verify the deployed production URL serves the same headers, MIME types, and immutable engine assets.
7. Decide whether a threaded build materially improves the experience enough to justify its extra deployment requirements.

Until these measurements are recorded, this is a working engine path—not proof that the final performance target has passed.
