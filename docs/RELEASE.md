# Public alpha release 0.1.0 — 2026-10-04

This release makes the current local chess review product usable publicly. It does not certify the research roadmap.

## Verification

- Formatting, TypeScript, 60 unit/integration assertions and production build pass.
- Dependency audit: zero known vulnerabilities at release.
- Chromium and Firefox production browser journeys cover file/paste review, player/filter navigation, square boards at 390 × 844, cancellation/restart/repeated runs, storage failure, refresh recovery, backup/import/deletion, saved practice and automated accessibility.
- Full-game fixture: Fischer–Spassky, Reykjavik 1972 round 6, 81 half-moves, 10,000 nodes, MultiPV 2. Complete journey took 11.2 s in Chromium and 31.1 s in Firefox in the local test run. These include test overhead and are observations, not performance guarantees.
- Test machine: Windows, AMD Ryzen 7 8845HS, 8 cores / 16 logical processors.
- Fixture is the factual game score, without copied annotations. Reference: https://en.chessbase.com/post/50-years-ago-today-fischer-spassky-game-six
- Engine JavaScript/WASM checksums remain pinned; the release manifest hashes every bundled asset.
- Public deployment verification is performed separately after publication; see the release PR for the hosted result.

## Known boundaries

Physical Android/iOS devices, Safari, slow-network/battery behaviour, human accessibility review and coach validation have not been proved. WebKit could not run locally because Windows runtime libraries were missing. Phone-size browser layout is not physical-device proof.

Labels have synthetic golden tests for mate transitions, missing/bounded scores and legal chess edge cases, but no statistically validated coaching corpus. Quick search confidence is limited. No claim of recurring-motif accuracy or measured improvement is made. Peer lookup and offline installation are absent.

## Maintainer release procedure

1. Start from current main. Run npm ci, npm run check, and production browser journeys.
2. Commit source. Build with the exact source revision. Verify engine checksums and dist/release.json.
3. Push public GitHub source and the Sites source state. Save the matching archive and deploy the saved version.
4. Confirm public access, asset integrity, engine boot and the complete review/library/practice flow on the deployed origin.
5. Record failures and limits honestly. Revert deployment if an essential journey fails.
