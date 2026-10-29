# ADR 0003: Licence as AGPL-3.0-or-later

- Status: accepted
- Date: 2026-08-20

## Decision

License the repository AGPL-3.0-or-later.

## Why

Maia-3, the candidate model for rating-conditioned human moves on sparse positions (see
[docs/PEER_BASELINE.md](../PEER_BASELINE.md)), is licensed AGPL-3.0. AGPL-licensed code cannot fold
into a project that is only GPL-3.0: the AGPL's network-use clause is an obligation the plain GPL does
not carry, so a combined work has to satisfy it, which in practice means the combined work itself needs
to be AGPL (or later). Licensing ProphyLens AGPL-3.0-or-later keeps a clean path to actually shipping
Maia-3 if the sparse-position feasibility spike (see [docs/PEER_BASELINE.md](../PEER_BASELINE.md),
"Sparse positions and Maia-3") passes, without a relicensing exercise at that point. It is also
compatible with Stockfish (GPL-3.0) under Stockfish's own terms.

## Alternatives considered

Each of these would have permitted a more permissive licence (e.g. plain GPL-3.0, or something looser
still), at the cost of constraining how Maia-3 could be integrated:

- **Maia-3 as an optional external component.** Never bundle or link Maia's code into this repository;
  users who want it point ProphyLens at a Maia install they run themselves. Our own code carries no
  AGPL obligation, but the feature stops being something we ship or can guarantee works.
- **Maia-3 behind a separate service.** Run Maia as an independently deployed network service our client
  calls over HTTP, never importing its source into this repository. This repository's own licence
  question goes away, but whoever operates that service takes on AGPL's network-use obligation for it,
  and we would be shipping a second deployable with its own operational cost.
- **Not shipping Maia-3 at all.** Drop the sparse-position model entirely and rely only on corpus data,
  returning `PeerSource: 'none'` wherever coverage runs out. This removes the AGPL driver outright and
  frees the licence choice, at the cost of the sparse-position feature described in
  `docs/PEER_BASELINE.md`.

## Consequences

Some organisations prohibit AGPL dependencies by policy — that cost is accepted knowingly, not
overlooked. It can narrow who can contribute under an employer's licence policy, who will redistribute
or bundle this project, and how it can be offered as a hosted service (AGPL's network-use clause
applies to any deployment that lets users interact with a modified version over a network, not only to
binary distribution). Reversing this decision later, once Maia-3-derived code is actually merged, would
require either removing that code or getting relicensing agreement from its contributors — considerably
harder than deciding it now, before any AGPL-derived code exists in the tree.
