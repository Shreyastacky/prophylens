# Move review classification

**Status:** first deterministic review layer; thresholds require calibration before public accuracy claims.

ProphyLens now performs two searches from each decision position:

1. an unrestricted search for Stockfish's preferred move;
2. a `searchmoves` search that forces Stockfish to examine the move the player actually chose.

Both evaluations therefore use the same position, engine, node budget and score perspective. When the played move is already Stockfish's first choice, the first result is reused.

## Version 1 labels

`move-loss-v1` primarily uses the change in Stockfish's expected score derived from its win/draw/loss output:

| Label      |                                            Expected-score loss |
| ---------- | -------------------------------------------------------------: |
| Best       | Engine choice, or at most 0.01 with at most 10 centipawns lost |
| Good       |                                                  At most 0.015 |
| Inaccuracy |                               More than 0.015 and at most 0.06 |
| Mistake    |                                More than 0.06 and at most 0.18 |
| Blunder    |                                                 More than 0.18 |

Centipawn thresholds of 20, 60 and 150 are a fallback when WDL is unavailable. Negative losses caused by search noise are clamped to zero.

These labels are not intended to reproduce Chess.com or Lichess classifications. They describe immediate engine loss only. They do not yet account for position complexity, forcedness, clock time, peer behaviour or recurring motifs.

## Evidence and future calibration

The downloadable evidence stores both the unrestricted candidate lines and the forced played-move line. It also records `classifierVersion: move-loss-v1` so later threshold changes do not silently alter the meaning of old results.

Before these labels are presented as calibrated coaching judgements, test them against a reviewed position set across ratings, game phases and node budgets. Report disagreement and boundary instability rather than tuning thresholds to imitate another site's private system.
