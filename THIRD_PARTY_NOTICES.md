# Third-party notices

The release includes the runtime components below. Exact resolved npm versions come from package-lock.json; the packaged licence texts and release.json hashes cover the shipped files.

React and React DOM also bundle Scheduler (MIT). Its full licence is included at `licenses/scheduler.txt`, alongside `licenses/react.txt`, `licenses/react-dom.txt` and `licenses/chess.js.txt`. Stockfish's GPL text is at `engine/COPYING.txt`; Chessnut's Apache text is at `pieces/LICENSE.txt`; the app's AGPL text is at `LICENSE.txt`.

| Component                   | Use                                  | Licence      | Distribution status                   |
| --------------------------- | ------------------------------------ | ------------ | ------------------------------------- |
| React / React DOM           | Web UI                               | MIT          | npm dependency                        |
| chess.js                    | Legal chess moves and PGN parsing    | BSD-2-Clause | npm dependency                        |
| Vite                        | Development/build tooling            | MIT          | development dependency                |
| Vitest                      | Tests                                | MIT          | development dependency                |
| Stockfish.js / Stockfish 18 | Local browser analysis engine        | GPL-3.0      | v18.0.0 lite single-threaded included |
| Maia-3                      | Possible sparse-position human model | AGPL-3.0     | not included; separate spike required |
| Lichess game database       | Planned peer corpus                  | CC0          | not included                          |
| Lichess chess-openings      | Planned opening names                | CC0          | not included                          |

Before distributing Stockfish, Maia, data packs, board artwork, fonts, icons, or other binary/assets, update this notice with exact versions, source locations, copyright notices, checksums where appropriate, and all required source/build information.

## Stockfish.js 18.0.0

- Copyright 2026 Chess.com, LLC; based on Stockfish by T. Romstad, M. Costalba,
  J. Kiiski, G. Linscott, and other contributors.
- Distribution: lite single-threaded JavaScript and WebAssembly browser build.
- Licence: GPL-3.0; see `public/engine/COPYING.txt`.
- Release and binaries: <https://github.com/nmrugg/stockfish.js/releases/tag/v18.0.0>
- Corresponding source and build instructions: <https://github.com/nmrugg/stockfish.js/tree/v18.0.0>
- Upstream Stockfish revision: `cb3d4ee`.
- Exact binary checksums are recorded in `public/engine/README.md` and in every exported
  ProphyLens analysis receipt.

## Chessnut chess pieces

- Author: Alexis Luengas.
- Source: https://github.com/LexLuengas/chessnut-pieces/tree/2b8eaf14a31edad7e9deb53b1473e1d4857868a9
- All twelve SVGs are bundled unchanged under `public/pieces/`.
- Licence: Apache-2.0; the original licence is included at `public/pieces/LICENSE.txt`.
- Exact asset SHA-256 values appear in the packaged `release.json`.
- These pieces replace platform-dependent Unicode chess glyphs; no external image requests occur.

## Phosphor Icons React 2.1.10

- Copyright (c) 2020 Phosphor Icons.
- Source: https://github.com/phosphor-icons/react
- Licence: MIT; included in the release at `licenses/phosphor-icons-react.txt`.
- Only the used icon exports are included by the production bundler.
