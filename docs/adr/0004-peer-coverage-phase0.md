# ADR 0004: Peer coverage from the public Lichess Opening Explorer (Phase 0)

- Status: proposed
- Date: 2026-10-07
- Spike: B0 (`tools/spike-b0/coverage_spike.py`)
- Related: ADR 0002, [PEER_BASELINE.md](../PEER_BASELINE.md), [SPIKES.md](../SPIKES.md) section B,
  [CODEX_REVIEW_COUNTERPOINTS.md](../CODEX_REVIEW_COUNTERPOINTS.md) section 13

## Scope

This ADR records how deep into real games the **public Lichess Opening Explorer** still has
enough rating- and speed-matched human games for the exact position. It judges the Explorer as
a Phase 0 data source.

**It is not a verdict on peer-relative analysis.** Thin coverage here shows that this source, with
exact-position matching and its fixed rating buckets, runs out early. It does not show that a
differently built peer layer would. Section 13 of the counterpoints document makes the same
distinction.

B0 measures only the coverage part of Spike B. It does not measure how often peer context changes
the chosen lesson, or whether players find the wording useful.

## Method

- Two public Lichess accounts, chosen on 2026-10-07 from players in rating-capped Lichess arenas.
  Both were active that day, had established ratings and no terms-of-service flag. They are
  anonymised here:
  - **Account A**: rapid, 1219, about 21,000 rated rapid games. Run with `--speeds rapid`.
  - **Account B**: blitz, 1622, about 10,400 rated blitz games. Run with `--speeds blitz`.
- 60 recent rated games per account, up to ply 40, with at most 8 games sharing the same first
  8 plies. Each ply was looked up in the rating bucket of the player to move.
- Claim floors are the `minSamples` values from `EVIDENCE_RULES` in `packages/contracts`:
  move-popularity n ≥ 20, peer-outcome n ≥ 50, personal-leak n ≥ 100.
- Both endpoints now require a Lichess token. We used a personal API token with no scopes.
- The Explorer rate-limits at roughly one request every 3 seconds per token. Running both accounts
  at once caused repeated 429s, so they ran one after the other at `--rate 0.5`, with backoff.
- Account A: 1,039 lookups, 0 failed. Account B: 1,141 lookups, 0 failed. No game's walk was cut
  short by a failed request.

## Results

First ply where the share of games with enough evidence falls below 50% and below 20%:

| Claim (floor)         | A: <50% | A: <20% | B: <50% | B: <20% |
| --------------------- | ------: | ------: | ------: | ------: |
| move-popularity (20)  |      14 |      18 |      17 |      21 |
| peer-outcome (50)     |      13 |      17 |      16 |      21 |
| personal-leak (100)   |      13 |      17 |      15 |      19 |
| No game covered after |      21 |         |      26 |         |

Median number of Explorer games for the position:

| Ply |           A |           B |
| --: | ----------: | ----------: |
|   0 | 195 million | 779 million |
|  10 |         345 |      17,128 |
|  13 |          85 |         647 |
|  16 |          29 |         125 |
|  18 |          11 |          91 |

### Account A (rapid, 1200-band player)

The chart shows all three curves holding near 100% until ply 7, then falling steeply. They cross 50%
at plies 13 to 14, around move 7, which is still the opening. By ply 18 fewer than 20% of games
qualify for any claim, and none do after ply 21. The three curves stay within about one ply of
each other at the 50% line, so the claim types run out of data together.

The script's verdict was "CHANGE: popularity claims survive where outcome claims do not". That
wording is an artifact of its hard-coded cut-offs: a one-ply gap (14 against 13) is not evidence
that popularity claims outlast outcome claims.

### Account B (blitz, 1600-band player)

The curves stay above 80% to about ply 11 and cross 50% at plies 15 to 17, around move 8 or 9. Below
20% comes at plies 19 to 21, and nothing qualifies after ply 26. The gap between claim types is
slightly wider here (personal-leak falls first), but it is still two plies.

The script's verdict was "GO (narrow): outcome-grade evidence covers openings and early
middlegame". It reached GO only because peer-outcome crossed at ply 16, exactly the script's
cut-off. One ply earlier would have given the same CHANGE verdict as Account A.

Four of Account B's games ended after one ply. The script counts finished games as uncovered at
every later ply, which is why the chart dips to 93% at ply 1. Counting only games still in
progress raises the curve by about 5 to 7 points but leaves every crossing in the table unchanged.

### Reading the two charts together

- Exact-position peer evidence from the Explorer lasts through the opening and fades out at the
  start of the middlegame: about 13 to 17 plies before half the games lose it, and about 20 plies
  before almost all do.
- Account B gets about 2 to 3 plies more than Account A. This does not show that higher-rated
  players get more coverage. Speed and pool size differ too: the blitz pool is about 4 times larger
  at the root.
- In the lower charts, the flat line at 1 after the last covered ply is not a real sample size. It
  means no game was still being walked at that depth.

## Limitations

- **The outcome and leak curves are upper bounds.** The script applies only `minSamples`. The
  contracts also require a 95% Wilson interval no wider than 0.25 (peer-outcome) or 0.20
  (personal-leak), which n = 50 often fails. The script also counts games reaching the position,
  while a claim about a move uses that move's smaller count.
- Two accounts, 120 games and two rating bands, with speed confounded with rating. NEXT_STEPS.md
  asks for 100 to 200 _representative_ games; this sample is not representative.
- Plies are assigned to the mover's rating bucket, so opponents put some lookups in neighbouring
  bands. Based on White's rating, A's games split 40/14/6 across the 1200, 1000 and 0–999 bands,
  and B's split 39/13/6/1/1 across 1600, 1400, 1200, 1800 and 0–999. We have not checked whether the
  Explorer buckets games by each player's rating or by the game's average.
- The walk stops a game after 3 consecutive plies below n = 20. A later transposition back into
  well-known territory would be missed. In practice coverage almost never recovers.

## Decision

Options considered:

1. **Keep peer analysis central, using the Explorer as the source.** Rejected. Peer evidence for
   a quoted outcome or a personal-leak claim does not reach past the early middlegame for most
   games, so the Explorer cannot support peer-calibrated review across a whole game.
2. **Narrow peer analysis.** Accepted for Phase 1. Peer context is shown only where the
   position's own sample passes `peerClaimEligibility`, which in practice means openings and the
   first few middlegame moves. Positions beyond that are labelled engine-only, and the missing
   coverage stays visible rather than hidden. Move popularity is the main peer claim. Quoted peer
   scores and personal-leak claims need the full eligibility check, interval included.
3. **Evaluate a custom index.** Kept open as a separate, bounded evaluation, not a build decision.
   An index of the same games with the same exact-position matching would likely hit a similar
   limit. An evaluation is worth doing only if it changes how positions or players are matched:
   pooled or wider rating bands, normalised or transposition-aware positions, structure-level
   grouping, or a model-based estimate for sparse positions (for example Maia-3, subject to the
   licensing policy). Its success measure is the same table above, measured with the interval check
   applied.

Peer analysis stays part of the product thesis. This ADR narrows what the **Explorer** can carry;
it does not abandon peer-relative review.

## Consequences

- Phase 1 review can use Explorer data for opening and early-middlegame lessons, behind the existing
  eligibility rules, with explicit "no peer data at this depth" states.
- The rest of Spike B (lesson re-ranking and wording preference) should run on positions where the
  Explorer has coverage, so that it measures usefulness rather than thin data.
- Before the custom-index evaluation, B0 should be re-run on a broader sample (more accounts, both
  speeds within each band) with the Wilson check applied. That gives the baseline any alternative
  must beat.
- The spike needs a Lichess personal API token and runs at about 0.3 lookups per second, so a
  60-game run takes 40 to 60 minutes. Any production Explorer adapter must plan for the token,
  rate limits and caching.
