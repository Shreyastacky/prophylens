# ProphyLens

Private chess review and practice, built from your own completed games.

**Public alpha:** [Open ProphyLens](https://prophylens.badakanadong.chatgpt.site). Version 0.1.0.

Paste a standard-chess PGN or import a file of up to 100 games (2 MB total, 600 half-moves per game). Stockfish 18 runs locally in a worker. Review either player's moves, filter key moments, replay engine variations, and practise positions from your saved games. The browser library supports refresh recovery, deduplication, deletion, JSON backup/restore, raw PGN export and versioned evidence receipts.

## Accuracy and scope

Move-loss labels are transparent estimates from a finite search, not validated coaching diagnoses. Receipts record exact engine binaries, settings, source revision, scores, bounds and legal variations. A partial search uses a completed exact result if one exists; otherwise the move stays uncertain. Mate transitions are handled separately from pawn loss. Quick searches can change at deeper settings.

Peer comparison, recurring motif diagnosis and measured long-term improvement are research goals, not features in this release. There are no accounts, PGN uploads, tracking scripts or online peer requests. Games stay in this browser's IndexedDB; export a backup before clearing browser data. This is post-game study software.

Desktop Chrome/Edge and Firefox are primary targets. Mobile layout is tested at 390 × 844; physical phone performance and Safari remain unverified. Start with Quick analysis. No offline installation or guaranteed offline availability is advertised.

## Development

Node.js 22.12+ and npm 11+.

```bash
npm ci
npm run dev
npm run check
npx playwright install chromium firefox
npm run test:e2e
```

`npm run build` creates a complete publishable `dist/`, including engine assets, licences and SHA-256 release manifest. Browser tests use this production build on port 5174; run the build first. Set `BROWSERS=chromium,firefox` for both engines or `PUBLIC_BASE_URL` for a published instance. CI runs the production journeys after static checks.

## Project map

- `apps/web/`: React/Vite application, engine client, parsing worker, review/library/practice.
- `packages/contracts/`: validated evidence, peer and lesson-ranking helpers for future research.
- `public/engine/`: pinned Stockfish 18 single-threaded build, licence and corresponding-source pointer.
- `docs/RELEASE.md`: release checks and remaining validation boundaries.
- `docs/NEXT_STEPS.md`: next development gates.

## Privacy and licensing

See [Privacy](docs/PRIVACY.md), [Fair play](docs/FAIR_PLAY.md), [licensing](docs/LICENSING.md) and [third-party notices](THIRD_PARTY_NOTICES.md). Source is AGPL-3.0-or-later; Stockfish is GPL-3.0. The site links to this public repository and serves bundled licence texts. Report reproducible issues with browser, settings and an anonymised receipt; do not post private game metadata.
