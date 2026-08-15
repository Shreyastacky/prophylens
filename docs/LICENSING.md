# Licensing plan

The repository is **AGPL-3.0-or-later**. This is compatible with the project's open-source intent and keeps a clean path for possible Maia-3 integration. It does not erase third-party obligations.

## Stockfish

Stockfish/Stockfish.js is GPL-3.0. When distributing a WASM binary, ship its licence notice and corresponding source or a compliant source offer/pointer with reproducible build information. Pin the exact version and checksum.

## Maia-3

The current Maia-3 repository is AGPL-3.0. Its released runtime is Python/PyTorch UCI. No model or code is included until browser feasibility, model-file terms, attribution, source availability, and network-use obligations are reviewed.

## Data and UI libraries

Lichess database exports and `chess-openings` are CC0. `chess.js` is BSD-2-Clause. React is MIT. Any board component must receive a licence review before adoption; avoid importing branded piece art or visual assets from commercial products.

## Release gate

A release that adds a binary, model, dataset snapshot, font, icon set, or artwork must update `THIRD_PARTY_NOTICES.md`, preserve required notices/source links, and pass a dependency/licence scan. “Available on npm” is not a licence analysis.
