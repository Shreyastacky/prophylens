# Spike B0 analysis: peer coverage from the Lichess Opening Explorer

- Companion to: [ADR 0004](../adr/0004-peer-coverage-phase0.md)
- Data collected: 2026-10-07
- Tool: `tools/spike-b0/coverage_spike.py`
- Status: analysis of a proposed decision; the ADR, not this file, records the decision

This file explains the numbers behind ADR 0004 in more detail than an ADR should carry. It adds no
new measurements. Every figure below is either copied from the ADR or derived from those figures
with the arithmetic shown. Derived values are marked _(derived)_.

## 1. One-paragraph summary

For two real Lichess players, a 1200-rated rapid player and a 1600-rated blitz player, the public
Opening Explorer has enough rating-matched games to support a peer claim for about the first 13 to
17 plies of a game. That is roughly moves 7 to 9, the end of the opening. After ply 21 (Account A)
and ply 26 (Account B), no game in either sample has a usable peer sample at all. The three claim types
run out of data within one or two plies of each other, so choosing a weaker claim buys almost no
extra depth. Exact-position peer data from the Explorer is an opening feature.

## 2. What was measured

| Item                   | Account A                    | Account B                    |
| ---------------------- | ---------------------------- | ---------------------------- |
| Speed                  | Rapid                        | Blitz                        |
| Rating                 | 1219                         | 1622                         |
| Rated games on account | ~21,000                      | ~10,400                      |
| Games sampled          | 60                           | 60                           |
| Maximum ply walked     | 40                           | 40                           |
| Explorer lookups       | 1,039                        | 1,141                        |
| Failed lookups         | 0                            | 0                            |
| Rate                   | `--rate 0.5`, with backoff   | `--rate 0.5`, with backoff   |
| Same-opening cap       | 8 games per first-8-ply line | 8 games per first-8-ply line |

A game counts as "covered" at a ply when the Explorer returns at least the claim's minimum sample
for that exact position, in the mover's rating bucket and the game's speed. The minimums come from
`EVIDENCE_RULES` in `packages/contracts`:

| Claim           | Minimum sample | Interval check in contracts | Applied in B0? |
| --------------- | -------------: | --------------------------- | -------------- |
| move-popularity |             20 | none                        | yes            |
| peer-outcome    |             50 | Wilson width ≤ 0.25         | **no**         |
| personal-leak   |            100 | Wilson width ≤ 0.20         | **no**         |

Because the interval checks were not applied, the peer-outcome and personal-leak results are
**upper bounds**. Real eligibility for those two claims is lower than shown.

## 3. Where coverage runs out

First ply at which the share of covered games drops below 50% and below 20%:

| Claim (floor)         | A: <50% | A: <20% | B: <50% | B: <20% |
| --------------------- | ------: | ------: | ------: | ------: |
| move-popularity (20)  |      14 |      18 |      17 |      21 |
| peer-outcome (50)     |      13 |      17 |      16 |      21 |
| personal-leak (100)   |      13 |      17 |      15 |      19 |
| No game covered after |      21 |         |      26 |         |

The same plies converted to full moves _(derived: move = ⌊ply ÷ 2⌋ + 1)_:

| Claim           | A: half lost | A: most lost | B: half lost | B: most lost |
| --------------- | -----------: | -----------: | -----------: | -----------: |
| move-popularity |       move 8 |      move 10 |       move 9 |      move 11 |
| peer-outcome    |       move 7 |       move 9 |       move 9 |      move 11 |
| personal-leak   |       move 7 |       move 9 |       move 8 |      move 10 |

### 3.1 The claim types fail together

The gap between the weakest claim (popularity, n ≥ 20) and the strongest (personal-leak,
n ≥ 100) at the 50% line is **one ply for Account A and two plies for Account B**. A fivefold
difference in required evidence produces almost no difference in depth.

The reason is how fast samples shrink. Section 4 shows the median sample falling by roughly a
third to two thirds every ply in this range. When samples collapse that quickly, the difference
between a floor of 20 and a floor of 100 is crossed in one or two plies. Lowering thresholds is
therefore **not** a useful lever for extending coverage, and it would weaken the evidence rules for
almost no gain.

### 3.2 The script's verdicts disagree, but the data does not

The script printed CHANGE for Account A and GO (narrow) for Account B. The difference comes from a
hard-coded cut-off: Account B's peer-outcome curve crossed 50% at ply 16, exactly where the script
switches from CHANGE to GO. One ply earlier and both accounts would have received the same verdict.
The two accounts describe the same pattern, offset by two to three plies. The ADR's own reading
replaces both printed verdicts.

## 4. How fast samples shrink

Median number of Explorer games in the exact position, among games still being walked:

| Ply | A (rapid, 1200) | B (blitz, 1600) | B ÷ A _(derived)_ |
| --: | --------------: | --------------: | ----------------: |
|   0 |     195 million |     779 million |              4.0× |
|  10 |             345 |          17,128 |             49.6× |
|  13 |              85 |             647 |              7.6× |
|  16 |              29 |             125 |              4.3× |
|  18 |              11 |              91 |              8.3× |

**Survival caveat.** These medians are computed only over games still being walked at that ply. A
game stops after three consecutive plies below n = 20, so the medians are conditional on survival
and overstate typical depth. This is why Account A can show a median of 85 at ply 13 while fewer
than half of its games are covered at that ply.

Per-ply retention between the measured plies _(derived: (later ÷ earlier)^(1 ÷ gap))_:

| Segment     | A: kept per ply | A: halves every | B: kept per ply | B: halves every |
| ----------- | --------------: | --------------: | --------------: | --------------: |
| ply 0 → 10  |            0.27 |       0.5 plies |            0.34 |       0.6 plies |
| ply 10 → 13 |            0.63 |       1.5 plies |            0.34 |       0.6 plies |
| ply 13 → 16 |            0.70 |       1.9 plies |            0.58 |       1.3 plies |
| ply 16 → 18 |            0.62 |       1.4 plies |            0.85 |       4.4 plies |

Reading this table:

- **In the zone that matters (plies 10 to 18), samples halve roughly every 0.6 to 2 plies.** Going
  from n = 100 to n = 20 is a factor of 5, about 2.3 halvings _(derived)_, so it takes only about
  one and a half to five plies. That is why the three claim floors are crossed so close together.
- **Account B's slowdown after ply 16 is probably survivorship, not a real effect.** Between plies
  16 and 18 the number of B's games still walked falls from 43 to 35, and those that remain are the
  ones that stayed in well-known lines. Their median stays high precisely because the thin games already dropped out.
  Treat the 0.85 figure as an artefact of the method.
- **The B ÷ A ratio jumps from 4× at the root to about 50× at ply 10, then falls back to 4–8×.**
  One plausible reading is that the 1600 blitz games stay in mainline openings longer, while the
  1200 rapid games leave known theory sooner. This is a hypothesis. Two accounts cannot separate
  rating, speed and individual opening repertoire.

## 5. What this means for the product

### 5.1 The honest headline

The exact-position peer layer, sourced from the public Explorer, can comment on the opening and the
first few moves after it. It cannot comment on the middlegame or endgame for most games.

### 5.2 The question this spike did not answer

Coverage by ply is the right first measurement, but it is not the measurement the product
depends on. The product depends on this:

> **What fraction of the moves ProphyLens labels Mistake or Blunder happen at a ply where peer data
> is eligible?**

If most mistakes happen after ply 20, the peer layer reaches almost none of the lessons that
matter, even though it covers the opening well. If a meaningful share happen in the opening, the
narrowed peer feature is worth shipping as it stands.

ProphyLens can already answer this without new infrastructure. The public alpha labels every move.
Running the same 120 sampled games through the review and joining each Mistake or Blunder with its
ply's coverage gives a single number: **lesson coverage**. That number should be the success
measure for every later option in the ADR, including any custom index or Maia evaluation, because
it measures what the user would actually see.

### 5.3 What each remaining option can and cannot fix

| Option from ADR 0004                                | Extends depth? | Supports outcome claims ("peers score 41%")? | Notes                                                                                                                                                                                    |
| --------------------------------------------------- | -------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lower the sample floors                             | ~1–2 plies     | weakens them                                 | Ruled out by §3.1.                                                                                                                                                                       |
| Wider or pooled rating bands                        | some           | yes, with a wider cohort                     | Must label the wider cohort; `toExplorerBuckets` already reports `exact: false`.                                                                                                         |
| Transposition-aware or normalised positions         | some           | yes                                          | Helps where move orders differ; does not help genuinely new positions.                                                                                                                   |
| Structure-level grouping (pawn structure, material) | large          | partly                                       | Changes what "same position" means; needs its own validation.                                                                                                                            |
| Model estimate (e.g. Maia-3)                        | full game      | **no**                                       | Predicts what a player of a given rating would play in any position. It gives move probabilities, not results, so it can support popularity-style claims only. Licensing policy applies. |

The pattern: **the methods that reach the middlegame mostly give up the outcome claim**, and the
methods that keep the outcome claim mostly stay near the opening. Any proposal should say which
side of that trade it is on.

## 6. Limitations

1. **Small, unrepresentative sample.** Two accounts, 120 games. Rating and speed change together
   between the accounts, so neither variable's effect can be isolated.
2. **Outcome and leak curves are upper bounds** because the Wilson interval checks were skipped
   (§2). Claims about a specific move also use that move's own count, which is smaller than the
   position total measured here.
3. **Rating bucketing is uncertain.** Each ply was looked up in the mover's bucket. It is not yet
   confirmed whether the Explorer buckets a game by each player's rating or by the two players'
   average. If it is the average, some lookups landed in a slightly mismatched cohort. This would
   shift the curves a little but is unlikely to move the conclusions.
4. **Opponents spread lookups across bands.** By White's rating, A's games split 40/14/6 across the
   1200, 1000 and 0–999 buckets, and B's split 39/13/6/1/1 across 1600, 1400, 1200, 1800 and 0–999.
5. **Early stopping can miss transpositions** back into known territory. In practice coverage
   almost never recovers once lost.
6. **Finished games count as uncovered.** Four of Account B's games ended after one ply, which
   causes the dip to 93% at ply 1. Counting only games still in progress lifts the curve by 5 to 7
   points without moving any crossing in §3.
7. **Medians are survival-conditional** (§4).

## 7. Recommended next measurements, in order

1. **Lesson coverage (§5.2).** Run the 120 games through ProphyLens review and report the share of
   Mistake and Blunder labels that fall on covered plies. Cheapest and most decision-relevant.
2. **Apply the Wilson checks** to the existing cached data and re-plot the outcome and leak curves.
   No new network requests are needed; the cache already holds the win, draw and loss counts.
3. **Broaden the sample** to 4–6 accounts with both speeds inside each rating band, so speed and
   rating can be separated. Use the same cap and settings so the runs are comparable.
4. **Only then evaluate an alternative source**, scored by lesson coverage from step 1.

## 8. Reproducing these results

The Explorer now requires a Lichess personal API token. Create one with no scopes and keep it out
of the repository.

```powershell
cd tools/spike-b0
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
$env:LICHESS_TOKEN = "<your token>"
python coverage_spike.py --self-test --out out-selftest
python coverage_spike.py --user <account> --speeds rapid --max-games 60 --rate 0.5 --out out-a
```

Expect about 0.3 lookups per second, so a 60-game run takes 40 to 60 minutes. Run accounts one
after another: running them in parallel on one token triggers repeated 429 responses. Outputs and
the response cache go under `out-*/`, which is ignored by git.
