# Algorithm specification

## Analysis passes

1. Reconstruct every legal position from the finished game.
2. Run a bounded first-pass analysis for all decision positions.
3. Compute expected-outcome loss from the mover's perspective.
4. Mark candidate teaching moments using severity, instability, forcedness, and novelty.
5. Deep-verify only candidates and sacrifice/mate transitions.
6. Extract motif evidence by comparing the played and recommended continuations.
7. Add peer context where measured evidence exists.
8. Aggregate motif occurrences across games.
9. Rank lessons and create retry positions.

## Why WDL, not raw centipawns alone

A centipawn swing means different things in equal, winning, and lost positions. Normalise engine output into the mover's expected outcome before computing loss. Keep centipawns for diagnosis and display, but do not let one fixed CP threshold decide every label.

## Stability and confidence

Confidence drops when:

- best moves change across deeper searches;
- top alternatives have similar WDL;
- only shallow mobile budgets were available;
- a motif rule has weak or conflicting proof;
- peer samples are small or bands were widened;
- clock information is inferred incompletely.

Deep verification may raise confidence; it must create a new evidence record rather than mutate provenance invisibly.

## Motif contract

A motif is accepted only if it has:

- a deterministic rule identifier and version;
- involved squares/pieces;
- a legal proof line or verifiable board delta;
- a confidence level;
- regression examples, including counterexamples.

## Lesson selection

```text
priority = severity x recurrence x fixability x confidence x future exposure
```

Each factor is normalised to `[0, 1]`. The multiplicative form prevents a spectacular but unrepeatable, unfixable, or poorly evidenced moment from dominating the training plan. The exact transforms and caps must be versioned and calibrated on the public golden-games set.

## Explanation contract

Generate facts first:

```json
{
  "playedMove": "Nxd4",
  "recommendedMove": "Re8",
  "motif": "pinned-defender",
  "proof": ["c3d4", "f6d4"],
  "confidence": "high"
}
```

Templates turn facts into prose. A future LLM may simplify or translate that prose, but the response must be checked against the fact object and remain optional.
