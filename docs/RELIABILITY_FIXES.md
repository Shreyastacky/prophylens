# Reliability follow-up — 2026-10-05

## Missed Firefox activation

Global smooth scrolling could move the Analyse button when the browser focused it
after pointer-down. Pointer-up landed elsewhere, leaving the engine idle. Instrumented
100 ms presses reproduced four misses in six hosted phone-size attempts. The button's
vertical position moved by 115–373 px in the failed attempts.

Page scrolling now settles immediately. Six equivalent local instrumented presses
activated analysis with no movement between pointer-down and pointer-up. A browser
regression uses a held press and requires analysis to start and finish.

## Import cancellation

PGN file validation previously continued after Cancel and could replace the current
game afterward. It now uses an abort controller and operation token, terminates its
worker on cancellation, and releases the editor immediately. Stale completions cannot
change the current game. Cancelling keeps an existing completed review intact.

Import and library activity now display the operation actually running. Backup restore
and deletion do not offer a Cancel button that cannot roll back their storage transaction.

The regression holds a PGN worker request, cancels the import, checks the original game
and enabled editor, releases the stale request, then validates and previews a fresh game.

## Cached worker policy

WebKit's repeated PGN/engine worker loads were rejected under COEP after cache
revalidation. The failure traces explicitly report a Cross-Origin-Embedder-Policy
violation. Local and production response policies now also declare
Cross-Origin-Resource-Policy: same-origin. Vite's COEP require-corp and COOP same-origin
remain enabled. Both initial and revalidated preview worker responses carry the policy.
The preview server returned 304 before applying its configured headers. An early
middleware now applies the policy before that return, with a response regression
for both PGN and engine scripts.
Sites static hosting currently does not apply the packaged `_headers` file: its
document and workers are not cross-origin isolated. The single-threaded engine works
in that mode. Hosted verification checks consistent document/worker policy and real
engine use; it does not claim that Sites applies the packaged isolation headers.

## Verification

Formatting, TypeScript, all 60 unit/integration checks, build and production dependency
audit are required. Browser coverage includes both regressions plus long-game review,
desktop/phone geometry, light/dark accessibility, imports, cancellation/restart, backup,
refresh recovery, storage failure and practice.

The Windows WebKit runtime currently closes before creating a page; this is independent
of the application. CI now installs and runs Chromium, Firefox and WebKit on Ubuntu.
Hosted verification and exact publication provenance are recorded in the separate
release evidence report after deployment. Browser emulation does not certify a physical
iPhone or human coaching quality.
