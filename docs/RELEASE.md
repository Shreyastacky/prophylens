# Public alpha release 0.1.1-alpha — 2026-10-05

This release makes the current local chess review product usable publicly. It does not certify the research roadmap.

## Verification

- Formatting, TypeScript, unit/integration assertions and production build are required for every release.
- Dependency audit: zero known vulnerabilities at release.
- Chromium and Firefox production browser journeys cover file/paste review, player/filter navigation, square boards at 390 × 844, cancellation/restart/repeated runs, storage failure, refresh recovery, backup/import/deletion, saved practice and automated accessibility.
- Full-game fixture: Fischer–Spassky, Reykjavik 1972 round 6, 81 half-moves, 10,000 nodes, MultiPV 2. Complete journey took 11.2 s in Chromium and 31.1 s in Firefox in the local test run. These include test overhead and are observations, not performance guarantees.
- Test machine: Windows, AMD Ryzen 7 8845HS, 8 cores / 16 logical processors.
- Fixture is the factual game score, without copied annotations. Reference: https://en.chessbase.com/post/50-years-ago-today-fischer-spassky-game-six
- Engine JavaScript/WASM checksums remain pinned; the release manifest hashes every bundled asset.
- Public deployment verification is performed separately after publication; the tagged release notes record the hosted run, sourceRevision and measured hashes. Hosted results are appended here after that run completes.

## Release hardening

The root package.json version now supplies both release.json and exported receipts. The full runtime licence bundle includes Scheduler as well as React, React DOM, chess.js, Phosphor, Stockfish and Chessnut pieces.

Engine JavaScript and WASM bytes must match the pinned public/engine/manifest.json before a build succeeds or a browser executes them. Browser execution uses the verified bytes through object URLs, so a second network fetch cannot substitute unverified bytes. Cancellation releases workers and object URLs; failed integrity checks produce no saved analysis.

Move labels and practice positions use the FEN's fullmove number and side rather than the receipt's relative ply. Review arrows act only while focus is inside the review; text fields and selects retain their own keys. Practice accepts Best and Good moves using recorded comparisons, or evaluates an unrecorded legal alternative at the saved search budget. Search bounds and missing scores remain uncertain.

Review rows memoize their assessments and SAN notation, unchanged rows skip rendering, and boards memoize FEN parsing. A maximum-size 600-half-move fixture verifies navigation responsiveness; it is a synthetic UI test, not coaching evidence.

## Production serving

`npm run build` generates the browser assets and a portable Worker entry at dist/server/index.js. This small static product embeds its release assets in the Worker, keeping all responses under the same policy without an asset bypass. `node scripts/serve-production.mjs` runs that exact entry locally; production e2e tests no longer substitute Vite preview headers. Sites publishing uses Worker mode, with static removed from its hosting configuration. No user game data is sent to that Worker.

Responses enforce COOP same-origin, COEP require-corp, CORP same-origin, nosniff, referrer policy and CSP, including 304 responses. HTML also carries a meta CSP fallback. The CSP allows local scripts, WASM compilation and verified blob workers; object embedding and remote connections are blocked. HTML and release.json revalidate. Engine URLs only receive immutable caching when their sha256 query matches their contents; bare engine URLs revalidate.

The browser suite checks actual production responses, meta CSP, isolation, initial/cached workers, WASM MIME, licence hashes, modified engine rejection/recovery, version consistency, FEN numbering, scoped arrows, Good practice alternatives and the saved review lifecycle. Hosted release verification runs the same suite on the public URL through the manual Hosted release verification workflow with an expected source revision.

## Known boundaries

Physical Android/iOS devices, Safari, slow-network/battery behaviour, human accessibility review and coach validation have not been proved. WebKit could not run locally because Windows runtime libraries were missing. Phone-size browser layout is not physical-device proof.

Labels have synthetic golden tests for mate transitions, missing/bounded scores and legal chess edge cases, but no statistically validated coaching corpus. Quick search confidence is limited. No claim of recurring-motif accuracy or measured improvement is made. Peer lookup and offline installation are absent.

## Maintainer release procedure

1. Start from current main. Run npm ci, npm run check, and production browser journeys.
2. Merge after CI passes; wait for CI on main to pass. Tag that exact main commit (v0.1.1-alpha for this release), build once from the clean tagged commit and preserve that output. Verify engine checksums and dist/release.json against the tag.
3. Copy the exact build to the opened Sites checkout, preserve its source identity, package without rebuilding, save the matching archive and deploy the saved version.
4. Confirm public access, asset integrity, engine boot and the complete review/library/practice flow on the deployed origin.
5. Record failures and limits honestly. Revert deployment if an essential journey fails.
6. Update this file with hosted verification results and publish GitHub prerelease notes. Main requires PRs, up-to-date passing CI and resolved conversations, including administrators. Force pushes and branch deletion are disabled. Private vulnerability reporting is enabled.
