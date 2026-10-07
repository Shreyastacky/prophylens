# Spike B0: peer coverage by ply

Measures how deep into real games the **public Lichess Opening Explorer** still returns enough
rating- and speed-matched human games for the exact position. It answers one Phase 0 question:
can the Explorer, as a data source, carry peer-calibrated review?

It does **not** measure whether peer analysis works in general. Thin coverage here is a verdict on
the Explorer as a source. A custom index could use newer games, different rating grouping or
transposition handling, and could reach further.

## Setup

```bash
python -m venv tools/spike-b0/.venv
tools/spike-b0/.venv/Scripts/python -m pip install -r tools/spike-b0/requirements.txt
```

On macOS/Linux, use `tools/spike-b0/.venv/bin/python`.

The Explorer and the per-user game export both require a Lichess login (both return 401 or 404
without one). Create a personal API token at <https://lichess.org/account/oauth/token>; it needs no
scopes. Then either set `LICHESS_TOKEN` in your environment or put it in
`tools/spike-b0/.lichess-token`, as the bare token or as `LICHESS_TOKEN = "..."`. That file is
git-ignored. Never commit a token.

`--self-test` needs no token.

## Run

```bash
# check the pipeline without any network calls
python tools/spike-b0/coverage_spike.py --self-test --out tools/spike-b0/out-selftest

# a player's recent rated blitz/rapid games from Lichess
python tools/spike-b0/coverage_spike.py --user <name> --max-games 60 --out tools/spike-b0/out-<label>

# a local PGN file
python tools/spike-b0/coverage_spike.py --pgn games.pgn --max-games 150 --out tools/spike-b0/out-<label>
```

By default, the script makes one request per second. Use `--rate 0.5` if you see repeated 429s.
Responses are cached under `<out>/cache`, so re-runs are cheap.

## Output

- `coverage.png`: the share of games with enough peer samples at each ply, per claim type, and the
  median sample size at each ply.
- `summary.json`: coverage by ply, the ply where each claim type drops below 50% and 20%, and the
  rating/speed strata.
- `coverage.csv`: one row per Explorer lookup.

The claim thresholds are 20 games for move popularity, 50 for peer outcome and 100 for personal
leak. Each ply is checked against the rating bucket of the player to move.

`out*/` directories and `.venv/` are git-ignored. Record findings in an ADR rather than committing
outputs.
