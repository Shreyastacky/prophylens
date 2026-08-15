# ADR 0002: Validate peer UX before building an index

- Status: accepted
- Date: 2026-08-15

## Decision

Prototype peer-relative review with the official Lichess Opening Explorer before ingesting the monthly game corpus or designing production shards.

## Why

The explorer already supplies exact-position, rating-filtered, speed-filtered human move distributions. It can test coverage and coaching value quickly. A proprietary index becomes justified only if the UX works and needs broader/offline coverage.

## Consequences

The spike is not fully local and must use explicit consent, caching, rate discipline, and honest wording. No production architecture is implied by the experiment.
