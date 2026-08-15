# Contributing to ProphyLens

Thanks for helping build a chess coach that can show its work.

## Before coding

- Read `docs/PRODUCT_DIRECTION.md` and the relevant architecture/algorithm spec.
- Open or link an issue for substantial product, data, classifier, or dependency decisions.
- Keep live-game assistance, cheat detection, and copied commercial UI out of scope.

## Development

```bash
npm install
npm run dev
npm run check
```

## Pull requests

A good PR is small enough to review and includes:

- the user/research problem;
- the decision and alternatives considered;
- tests, including counterexamples for chess rules;
- screenshots only when UI changed;
- provenance/licence changes for engines, models, datasets, or assets;
- documentation when behaviour or schemas changed.

Motif and classification rules need a human-readable explanation, legal proof positions, positive examples, and false-positive counterexamples. Do not merge a rule because it “looks right” on one famous game.

## Commits

Use concise imperative subjects, for example `Add Wilson interval to peer claims`. Do not include secrets, personal game archives, or proprietary datasets in commits.

By contributing, you agree that your contribution is licensed under AGPL-3.0-or-later.
