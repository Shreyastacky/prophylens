# Stockfish browser engine

This directory distributes the lite, single-threaded browser build from
[Stockfish.js 18.0.0](https://github.com/nmrugg/stockfish.js/releases/tag/v18.0.0).
It runs inside a Web Worker, so analysis does not block the interface.

## Included files

| File | SHA-256 |
| --- | --- |
| `stockfish-18-lite-single.js` | `2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe` |
| `stockfish-18-lite-single.wasm` | `a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1` |
| `COPYING.txt` | `0b383d5a63da644f628d99c33976ea6487ed89aaa59f0b3257992deac1171e6b` |

The release identifies upstream Stockfish commit
[`cb3d4ee`](https://github.com/official-stockfish/Stockfish/commit/cb3d4ee). The complete
corresponding Stockfish.js source and build instructions are available at the exact
[`v18.0.0` source tag](https://github.com/nmrugg/stockfish.js/tree/v18.0.0).

## Licence

Stockfish and Stockfish.js are GPL-3.0. The bundled licence text is in `COPYING.txt`.
ProphyLens is AGPL-3.0-or-later, which is compatible with this distribution.

## Why this build

The lite build is roughly 7 MB and remains much stronger than the intended users. The
single-threaded version works without cross-origin isolation, which gives the initial spike a
reliable fallback. A future measured experiment may add the stronger multi-threaded build.
