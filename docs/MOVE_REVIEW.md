# Move review — move-loss-v2

Each decision uses an unrestricted Stockfish search and, when needed, a search restricted to the played move. Searches share the position/history, node limit, engine and mover score perspective. Hash is cleared before each search. When the played move is the engine choice, its evidence is reused.

The client preserves score bounds and legal principal variations. It prefers the last completed exact evaluation for the final root move; its recorded depth is retained. If exact evidence is unavailable, the move is Uncertain. A node limit may interrupt the next iteration, so completed comparisons can have different depths. No confidence is inferred from node count alone.

Expected-score loss from valid WDL is preferred. Without WDL, pawn loss uses explicit thresholds. Losing a winning mate or allowing a losing mate is a Blunder; mate lines are excluded from pawn-loss averages. The graph shows White's perspective with gaps for unknown scores.

Labels are Best, Good, Inaccuracy, Mistake, Blunder or Uncertain. Confidence is low below depth 12 and medium at/above it; this is a search-depth signal, not empirical diagnostic accuracy. Thresholds are in apps/web/src/analysis/classification.ts and require human corpus calibration before accuracy claims.

Receipts retain raw evidence and provenance. Legacy move-loss-v1 receipts can be imported; the current UI reinterprets evidence using v2 and names this explicitly. Best-move practice checks the recorded engine choice and does not certify a unique winning move.
