# Data provenance

Every analysis claim must be traceable.

## Engine evidence

Record Stockfish version, NNUE hash, node/search limit, threads, hash size, MultiPV, browser/runtime feature tier, and analysis timestamp.

## Peer evidence

Record source (`corpus`, `model`, or `none`), corpus months or model version, filters, rating band, speed, sample size, confidence interval method, index build commit, and suppression/widening behaviour.

## Interpretation

Record classifier and motif-rule versions. A prose explanation must reference structured facts and legal proof lines.

## Source datasets

- Lichess monthly game database: CC0.
- Lichess chess-openings dataset: CC0.
- Chess.com public games: optional read-only adapter governed by current PubAPI requirements; serial requests, identifying User-Agent, and HTTP cache validators.

Data availability, schemas, API terms, and rate limits can change. Pin retrieval dates in implementation ADRs and re-verify before releases.
