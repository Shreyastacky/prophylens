# ADR 0001: Local-first analysis

- Status: accepted for spike
- Date: 2026-08-15

## Decision

Run Stockfish in a browser worker by default and store games/evidence locally. Server analysis, accounts, and sync are optional later products.

## Why

It removes the analysis queue and per-game compute bill, supports offline/private use, and makes unlimited review economically honest.

## Consequences

Mobile budgets are weaker, browser features vary, threaded WASM needs deployment headers, downloads are larger, and local storage/migrations become product responsibilities. The engine spike can overturn this decision if responsiveness or reproducibility fails.
