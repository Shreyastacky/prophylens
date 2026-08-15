# Engine assets

No engine binary is committed in the initial scaffold.

The engine spike should begin with the pinned `stockfish@18.0.8` package and its lite, single-threaded browser build:

- `stockfish-18-lite-single.js`
- `stockfish-18-lite-single.wasm`

Before a binary is distributed from this directory, the same change must include:

1. Stockfish's GPL-3.0 licence notice.
2. Exact upstream version and binary checksum.
3. Corresponding source or a durable offer/pointer plus reproducible build instructions.
4. An updated `THIRD_PARTY_NOTICES.md`.
5. A test proving the worker loads and responds to `uci` and `isready`.

The threaded build additionally requires cross-origin isolation headers. The Vite development and preview configuration already sets those headers, but production hosting must be verified separately.
