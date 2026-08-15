# Product direction

**Status:** accepted for spikes, not a promise of completed functionality
**Product:** ProphyLens

## Thesis

ProphyLens should be the transparent, peer-calibrated, motif-level diagnosis layer that turns repeated personal mistakes into measured training.

Single-game review is solved by several open-source products. The opportunity is the loop after review:

```text
completed games -> recurring concept -> rating-aware lesson -> retry drill -> later evidence
```

## User promise

> Import finished games and learn which recurring chess habit is costing you the most, why it fails, how players at your level handle it, and whether practice fixed it.

## Product pillars

### 1. Objective truth

Stockfish supplies reproducible position evidence: WDL, lines, forced mates, and search provenance. Engine numbers are evidence, not explanations.

### 2. Human calibration

Peer data describes what rating- and speed-matched humans choose. It does not prove causality and does not replace engine evaluation. Existing Lichess Opening Explorer data must validate the UX before a proprietary index is built.

### 3. Concept diagnosis

Exact positions rarely repeat after the opening. Recurrence therefore lives at the motif level: loose pieces, overloaded defenders, pins, missed threats, king safety, pawn breaks, conversion technique, and time-management behaviours.

### 4. Measured training

Lessons come from the player's own games. The system tracks whether a motif recurs after practice and whether performance improves in comparable future positions.

### 5. Transparent uncertainty

Every peer claim shows source, sample size, band, speed, date range, and uncertainty. Corpus-backed observations and model estimates are never blended without labels.

## Differentiation that is not claimed

ProphyLens does not claim that no open-source project diagnoses weaknesses. Lichess Tutor and other projects already aggregate concepts. The claim must be narrower: transparent peer calibration plus motif-level prioritisation plus closed-loop measurement in one local-first system.

## Lesson priority

Do not rank lessons by rarity alone. A useful default is:

```text
priority = severity x recurrence x fixability x confidence x future exposure
```

A common trap can still be a personal weakness when it repeats. “Common” describes the population; “personal” describes the user's history.

## Non-goals

- Live-game assistance, overlays, or move suggestions.
- Matchmaking, ratings, chat, or social play.
- Cheat detection.
- Training a replacement for Stockfish.
- Copying Chess.com visual language, sounds, coach characters, glyphs, or layout.
- Letting an LLM classify moves or invent chess reasons.
- Supporting variants before standard chess is trustworthy.

## Success criteria for a beta

- A user can import 20-100 completed games without an account.
- Analysis remains responsive and cancellable on a normal laptop.
- At least three recurring motif classes reach agreed precision on a human-reviewed benchmark.
- Peer context changes lesson selection in a meaningful, measured fraction of reviews.
- Every explanation can reveal its engine line, motif evidence, and provenance.
- A retry session can later report recurrence/improvement without claiming causality it did not measure.
