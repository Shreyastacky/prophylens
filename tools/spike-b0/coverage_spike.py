#!/usr/bin/env python3
"""
ProphyLens — Spike B0: peer coverage by ply.

Answers the one question that decides whether peer-calibrated review is a
product or a footnote:

    How deep into a real game can we still find >= N rating-matched human
    games that reached the exact same position?

This deliberately needs NO engine, NO UI and NO corpus pipeline. It walks real
games through the public Lichess Opening Explorer and plots where the data
runs out.

Read the verdict at the bottom of the run, then look at coverage.png.

Usage
-----
    # 60 of a player's most recent rapid games
    python coverage_spike.py --user DrNykterstein --max-games 60

    # a local PGN file (any number of games concatenated)
    python coverage_spike.py --pgn mygames.pgn --max-games 150

    # prove the pipeline works without touching the network
    python coverage_spike.py --self-test

Notes
-----
* Responses are cached on disk, so re-runs are nearly free and the opening
  plies dedupe heavily across games.
* Default rate is 1 request/second. The explorer is a free community service
  with no published quota; be polite or you will get 429s. It has had real
  outages (lila#19610, Feb 2026), so the client backs off and keeps going
  rather than dying mid-run.
* Rating bands are the explorer's own buckets, not ours: 0, 1000, 1200, 1400,
  1600, 1800, 2000, 2200, 2500. They are 200 wide in the middle and much wider
  at both tails.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import random
import sys
import time
import urllib.parse
from collections import defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterator

import chess
import chess.pgn
import requests

EXPLORER_URL = "https://explorer.lichess.ovh/lichess"
LICHESS_EXPORT = "https://lichess.org/api/games/user/{user}"
USER_AGENT = "ProphyLens-coverage-spike/0.1 (+https://github.com/Shreyastacky/prophylens)"

# The explorer's rating buckets, as lower bounds.
RATING_BUCKETS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]

# The explorer and the bulk game export both require a Lichess login. The
# personal API token is read only from the LICHESS_TOKEN environment variable,
# never from a file, so it cannot end up in the repository.
def auth_headers() -> dict[str, str]:
    token = os.environ.get("LICHESS_TOKEN", "").strip()
    return {"Authorization": f"Bearer {token}"} if token else {}


# --------------------------------------------------------------------------
# Classification helpers
# --------------------------------------------------------------------------

def rating_bucket(elo: int | None) -> int | None:
    """Map an Elo to the explorer's bucket lower bound."""
    if elo is None:
        return None
    chosen = RATING_BUCKETS[0]
    for bucket in RATING_BUCKETS:
        if elo >= bucket:
            chosen = bucket
    return chosen


def speed_class(time_control: str | None) -> str | None:
    """
    Lichess speed classification: estimate total duration as base + 40*increment.

    <=29s ultraBullet, <=179s bullet, <=479s blitz, <=1499s rapid, else classical.
    """
    if not time_control or time_control in ("-", "?"):
        return None
    try:
        base_str, inc_str = time_control.split("+")
        estimate = int(base_str) + 40 * int(inc_str)
    except (ValueError, AttributeError):
        return None
    if estimate <= 29:
        return "ultraBullet"
    if estimate <= 179:
        return "bullet"
    if estimate <= 479:
        return "blitz"
    if estimate <= 1499:
        return "rapid"
    return "classical"


# --------------------------------------------------------------------------
# Explorer client
# --------------------------------------------------------------------------

@dataclass
class PositionStats:
    total: int
    n_moves: int
    top_share: float


class ExplorerClient:
    """Disk-cached, rate-limited, backoff-aware client for the Lichess explorer."""

    def __init__(self, cache_dir: Path, rate: float = 1.0, timeout: int = 20):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.min_interval = 1.0 / rate if rate > 0 else 0.0
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, **auth_headers()})
        self._last_call = 0.0
        self.hits = 0
        self.misses = 0
        self.failures = 0

    def _cache_path(self, key: str) -> Path:
        # Two-level fan-out so we don't put 10k files in one directory.
        digest = hashlib.sha256(key.encode()).hexdigest()[:16]
        sub = self.cache_dir / digest[:2]
        sub.mkdir(exist_ok=True)
        return sub / f"{digest}.json"

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_call
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_call = time.monotonic()

    def lookup(self, fen: str, speeds: list[str], bucket: int) -> PositionStats | None:
        params = {
            "variant": "standard",
            "fen": fen,
            "speeds": ",".join(speeds),
            "ratings": str(bucket),
            "moves": "20",
            "topGames": "0",
            "recentGames": "0",
        }
        key = urllib.parse.urlencode(sorted(params.items()))
        path = self._cache_path(key)

        if path.exists():
            self.hits += 1
            payload = json.loads(path.read_text())
        else:
            payload = self._fetch(params)
            if payload is None:
                self.failures += 1
                return None
            self.misses += 1
            path.write_text(json.dumps(payload))

        return self._summarise(payload)

    def _fetch(self, params: dict) -> dict | None:
        """GET with exponential backoff. Returns None if it never succeeds."""
        for attempt in range(5):
            self._throttle()
            try:
                response = self.session.get(EXPLORER_URL, params=params, timeout=self.timeout)
            except requests.RequestException as exc:
                wait = (2**attempt) + random.random()
                print(f"    network error ({exc.__class__.__name__}), retry in {wait:.1f}s",
                      file=sys.stderr)
                time.sleep(wait)
                continue

            if response.status_code == 200:
                return response.json()
            if response.status_code == 429:
                wait = (2 ** (attempt + 3)) + random.random()
                print(f"    429 rate limited, sleeping {wait:.1f}s", file=sys.stderr)
                time.sleep(wait)
                continue
            if response.status_code == 401:
                print("    401 unauthorized: set the LICHESS_TOKEN environment "
                      "variable (see README)", file=sys.stderr)
                return None
            if 500 <= response.status_code < 600:
                time.sleep((2**attempt) + random.random())
                continue
            print(f"    unexpected HTTP {response.status_code}", file=sys.stderr)
            return None
        return None

    @staticmethod
    def _summarise(payload: dict) -> PositionStats:
        total = payload.get("white", 0) + payload.get("draws", 0) + payload.get("black", 0)
        moves = payload.get("moves", []) or []
        move_totals = [m.get("white", 0) + m.get("draws", 0) + m.get("black", 0) for m in moves]
        top_share = (max(move_totals) / total) if (moves and total > 0) else 0.0
        return PositionStats(total=total, n_moves=len(moves), top_share=top_share)


# --------------------------------------------------------------------------
# Game sourcing
# --------------------------------------------------------------------------

def fetch_user_pgn(user: str, max_games: int, speeds: list[str]) -> str:
    """Export a player's recent games from the Lichess API as PGN."""
    params = {
        "max": str(max_games),
        "rated": "true",
        "perfType": ",".join(speeds),
        "clocks": "false",
        "evals": "false",
        "opening": "false",
    }
    print(f"Fetching up to {max_games} {'/'.join(speeds)} games for {user}...")
    response = requests.get(
        LICHESS_EXPORT.format(user=user),
        params=params,
        headers={"User-Agent": USER_AGENT, "Accept": "application/x-chess-pgn",
                 **auth_headers()},
        timeout=120,
    )
    response.raise_for_status()
    return response.text


def iter_games(pgn_text: str, limit: int) -> Iterator[chess.pgn.Game]:
    import io

    handle = io.StringIO(pgn_text)
    count = 0
    while count < limit:
        game = chess.pgn.read_game(handle)
        if game is None:
            return
        yield game
        count += 1


# --------------------------------------------------------------------------
# The walk
# --------------------------------------------------------------------------

# Claim-specific thresholds, mirroring EVIDENCE_RULES in packages/contracts.
# There is no universal minimum: ordering moves by popularity tolerates noise
# that an outcome claim or a personal-leak claim does not.
DEFAULT_THRESHOLDS = {"move-popularity": 20, "peer-outcome": 50, "personal-leak": 100}


@dataclass
class Row:
    game_index: int
    ply: int
    bucket: int
    speed: str
    total: int
    n_moves: int
    top_share: float


def walk_game(
    game: chess.pgn.Game,
    game_index: int,
    client: ExplorerClient,
    max_ply: int,
    min_samples: int,
    early_stop: int,
    speeds_override: list[str] | None,
) -> list[Row]:
    """Walk one game ply by ply, querying peer stats for the mover's band."""
    headers = game.headers
    speed = speeds_override[0] if speeds_override else speed_class(headers.get("TimeControl"))
    if speed is None:
        return []

    try:
        white_elo = int(headers.get("WhiteElo", ""))
        black_elo = int(headers.get("BlackElo", ""))
    except ValueError:
        return []

    board = game.board()
    rows: list[Row] = []
    consecutive_misses = 0

    for ply, move in enumerate(game.mainline_moves()):
        if ply >= max_ply:
            break

        # Band on the rating of the side to move, before the move is made.
        mover_elo = white_elo if board.turn == chess.WHITE else black_elo
        bucket = rating_bucket(mover_elo)
        if bucket is None:
            break

        stats = client.lookup(board.fen(), [speed], bucket)
        if stats is None:
            break

        rows.append(
            Row(
                game_index=game_index,
                ply=ply,
                bucket=bucket,
                speed=speed,
                total=stats.total,
                n_moves=stats.n_moves,
                top_share=round(stats.top_share, 4),
            )
        )
        covered = stats.total >= min_samples

        # Coverage is monotonically decreasing in practice. Once we're well
        # past the cliff there is nothing left to learn, so stop burning
        # requests on this game.
        consecutive_misses = 0 if covered else consecutive_misses + 1
        if early_stop and consecutive_misses >= early_stop:
            break

        board.push(move)

    return rows


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------

def summarise(rows: list[Row], thresholds: dict[str, int], max_ply: int) -> dict:
    by_ply: dict[int, list[Row]] = defaultdict(list)
    for row in rows:
        by_ply[row.ply].append(row)

    n_games = len({row.game_index for row in rows})

    # Games that stopped early count as uncovered deeper in: we stopped because
    # the data had already run out. The raw CSV supports the other reading.
    coverage: dict[str, dict[int, float]] = {claim: {} for claim in thresholds}
    median_samples: dict[int, int] = {}
    for ply in range(max_ply):
        observed = by_ply.get(ply, [])
        for claim, floor in thresholds.items():
            covered = sum(1 for r in observed if r.total >= floor)
            coverage[claim][ply] = covered / n_games if n_games else 0.0
        totals = sorted(r.total for r in observed)
        median_samples[ply] = totals[len(totals) // 2] if totals else 0

    def cliff(claim: str, fraction: float) -> int | None:
        return next((p for p in range(max_ply) if coverage[claim][p] < fraction), None)

    strata: dict[str, int] = defaultdict(int)
    for game_index in {r.game_index for r in rows}:
        first = next(r for r in rows if r.game_index == game_index)
        strata[f"{first.bucket}/{first.speed}"] += 1

    return {
        "n_games": n_games,
        "n_lookups": len(rows),
        "thresholds": thresholds,
        "strata": dict(strata),
        "coverage_by_ply": coverage,
        "median_samples_by_ply": median_samples,
        "ply_below_50pct": {claim: cliff(claim, 0.5) for claim in thresholds},
        "ply_below_20pct": {claim: cliff(claim, 0.2) for claim in thresholds},
    }


def plot(summary: dict, out_path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    coverage = summary["coverage_by_ply"]
    medians = summary["median_samples_by_ply"]
    thresholds = summary["thresholds"]
    plies = sorted(medians.keys())
    palette = {"move-popularity": "#2b6cb0", "peer-outcome": "#805ad5", "personal-leak": "#c53030"}

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8), sharex=True)

    for claim, floor in thresholds.items():
        ax1.plot(
            plies,
            [coverage[claim][p] * 100 for p in plies],
            linewidth=2,
            color=palette.get(claim, "#4a5568"),
            label=f"{claim} (n>={floor})",
        )
    ax1.axhline(50, linestyle="--", linewidth=1, color="#a0aec0")
    ax1.set_ylabel("% of games with enough peer evidence")
    ax1.set_title("ProphyLens Spike B0 - Lichess Opening Explorer coverage by ply")
    ax1.legend(loc="upper right", fontsize=9)
    ax1.grid(alpha=0.3)
    ax1.set_ylim(0, 102)

    ax2.semilogy(plies, [max(1, medians[p]) for p in plies], linewidth=2, color="#2f855a")
    for floor in sorted(set(thresholds.values())):
        ax2.axhline(floor, linestyle="--", linewidth=1, color="#a0aec0")
    ax2.set_ylabel("median peer sample size (log)")
    ax2.set_xlabel("ply")
    ax2.grid(alpha=0.3, which="both")

    fig.tight_layout()
    fig.savefig(out_path, dpi=140)
    print(f"Chart written to {out_path}")


def verdict(summary: dict) -> str:
    """
    Scope note: this measures the PUBLIC LICHESS OPENING EXPLORER at Phase 0.
    Thin coverage here means the Explorer is insufficient as a production source
    for deep peer comparison. It does not by itself disprove peer-relative
    analysis: a custom index could use newer games, different normalisation,
    broader transposition handling or different rating grouping. Treat the
    output as a decision about the Phase 0 data source only.
    """
    cliffs = summary["ply_below_50pct"]
    strong = cliffs.get("peer-outcome")
    weak = cliffs.get("move-popularity")

    lines = [f"  {claim}: 50% coverage lost at ply {ply}" for claim, ply in cliffs.items()]
    body = "\n".join(lines)

    if strong is None or strong >= 24:
        head = ("GO: outcome-grade evidence reaches real middlegame decisions. "
                "The Explorer is viable for Phase 1; build the review slice on it.")
    elif strong >= 16:
        head = ("GO (narrow): outcome-grade evidence covers openings and early middlegame. "
                "Ship that honestly and label deeper positions as engine-only.")
    elif weak is not None and weak >= 12:
        head = ("CHANGE: popularity claims survive where outcome claims do not. "
                "Demote quoted peer scores, keep peer popularity, and use this as the "
                "case for evaluating a custom index against the Explorer.")
    else:
        head = ("CHANGE: the public Explorer is too thin at this depth to carry the "
                "peer layer. This is a verdict on the SOURCE, not on the thesis - the "
                "next question is whether a custom index closes the gap, not whether "
                "to abandon peer analysis.")

    return f"{head}\n{body}"


# --------------------------------------------------------------------------
# Self-test (no network)
# --------------------------------------------------------------------------

def self_test(out_dir: Path) -> None:
    """Run the full pipeline against a synthetic explorer to prove the plumbing."""
    print("Self-test: synthetic explorer, no network calls.\n")

    sample_pgn = "\n\n".join(
        f'[Event "Rated Blitz game"]\n[White "a"]\n[Black "b"]\n[Result "1-0"]\n'
        f'[WhiteElo "{1200 + i * 40}"]\n[BlackElo "{1250 + i * 40}"]\n[TimeControl "300+3"]\n\n'
        "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 "
        "8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7 12. Bc2 Re8 13. Nf1 Bf8 "
        "14. Ng3 g6 15. a4 c5 16. d5 c4 17. Bg5 h6 18. Be3 Nc5 19. Qd2 h5 20. Bg5 1-0"
        for i in range(8)
    )

    class FakeClient(ExplorerClient):
        def lookup(self, fen, speeds, bucket):
            ply = fen.split()[-1]  # fullmove number, proxy for depth
            depth = int(ply) * 2
            total = max(0, int(200000 * (0.55**depth)))
            self.hits += 1
            return PositionStats(total=total, n_moves=min(12, max(1, 20 - depth)),
                                 top_share=0.4)

    client = FakeClient(out_dir / "cache-selftest", rate=0)
    rows: list[Row] = []
    for index, game in enumerate(iter_games(sample_pgn, 8)):
        rows.extend(walk_game(game, index, client, 40, 20, 3, None))

    summary = summarise(rows, DEFAULT_THRESHOLDS, 40)
    plot(summary, out_dir / "coverage-selftest.png")
    print(f"Games: {summary['n_games']}  lookups: {summary['n_lookups']}")
    print(f"Strata: {summary['strata']}")
    print(f"\n{verdict(summary)}")
    print("\nSelf-test passed: PGN walk, banding, caching, summary and chart all work.")


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--user", help="Lichess username to export recent games from")
    source.add_argument("--pgn", type=Path, help="local PGN file")
    parser.add_argument("--max-games", type=int, default=100)
    parser.add_argument("--max-ply", type=int, default=40)
    parser.add_argument("--per-opening-cap", type=int, default=8,
                        help="max games sharing the same first-8-ply signature, so one "
                             "popular opening cannot dominate the sample")
    parser.add_argument("--per-bucket-cap", type=int, default=40,
                        help="max games per rating bucket, to keep strata comparable")
    parser.add_argument("--speeds", default="blitz,rapid",
                        help="used when exporting from --user; per-game speed is "
                             "otherwise derived from TimeControl")
    parser.add_argument("--rate", type=float, default=1.0, help="requests per second")
    parser.add_argument("--early-stop", type=int, default=3,
                        help="abandon a game after N consecutive uncovered plies (0 = never)")
    parser.add_argument("--out", type=Path, default=Path("spike-b0"))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    if args.self_test:
        self_test(args.out)
        return 0

    speeds = [s.strip() for s in args.speeds.split(",") if s.strip()]

    if args.user:
        # Over-fetch so the opening/bucket caps below can still fill --max-games.
        pgn_text = fetch_user_pgn(args.user, args.max_games * 4, speeds)
    elif args.pgn:
        pgn_text = args.pgn.read_text()
    else:
        parser.error("pass --user, --pgn or --self-test")
        return 2

    client = ExplorerClient(args.out / "cache", rate=args.rate)
    rows: list[Row] = []
    floor = min(DEFAULT_THRESHOLDS.values())
    opening_counts: dict[str, int] = defaultdict(int)
    bucket_counts: dict[int, int] = defaultdict(int)

    for index, game in enumerate(iter_games(pgn_text, args.max_games * 4)):
        # Stratify: a random pull of recent games over-represents whatever the
        # player has been grinding lately, which inflates coverage.
        signature = ",".join(m.uci() for m in list(game.mainline_moves())[:8])
        try:
            bucket = rating_bucket(int(game.headers.get("WhiteElo", "")))
        except ValueError:
            continue
        if opening_counts[signature] >= args.per_opening_cap:
            continue
        if bucket is not None and bucket_counts[bucket] >= args.per_bucket_cap:
            continue
        opening_counts[signature] += 1
        if bucket is not None:
            bucket_counts[bucket] += 1

        game_rows = walk_game(game, index, client, args.max_ply, floor,
                              args.early_stop, None)
        rows.extend(game_rows)
        if len({r.game_index for r in rows}) >= args.max_games:
            break
        deepest = max((r.ply for r in game_rows), default=-1)
        print(f"[{index + 1}] {game.headers.get('White', '?')} vs "
              f"{game.headers.get('Black', '?')} — walked to ply {deepest + 1} "
              f"(cache {client.hits}h/{client.misses}m)")

    if not rows:
        print("No usable games. Check that PGNs have WhiteElo, BlackElo and TimeControl.")
        return 1

    csv_path = args.out / "coverage.csv"
    with csv_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(asdict(rows[0]).keys()))
        writer.writeheader()
        for row in rows:
            writer.writerow(asdict(row))

    summary = summarise(rows, DEFAULT_THRESHOLDS, args.max_ply)
    (args.out / "summary.json").write_text(json.dumps(summary, indent=2))
    plot(summary, args.out / "coverage.png")

    print(f"\nGames analysed:      {summary['n_games']}")
    print(f"Explorer lookups:    {summary['n_lookups']} "
          f"({client.hits} cached, {client.misses} fetched, {client.failures} failed)")
    print(f"Strata (bucket/speed): {summary['strata']}")
    print(f"\nVERDICT: {verdict(summary)}")
    print(f"\nWrite this up as docs/adr/0004-peer-coverage-phase0.md with the chart, the CSV and the date.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
