/**
 * Error convention across this package.
 *
 * Two kinds of "this didn't work," handled differently on purpose:
 *
 *   - Functions that interpret observed data return a null-or-undetermined
 *     result with a reason (`classifySpeed`, `expectedPoints`, `wilsonInterval`,
 *     `acceptableMoveMass`, `movePopularity`). Unknown inputs are an expected
 *     data condition during ingestion — a game with a malformed clock comment
 *     or an unclassified platform is normal, not exceptional, and the caller
 *     needs to keep going with that absence recorded.
 *   - Functions that construct a query or assert an invariant throw
 *     (`toExplorerBuckets`, `positionKeyFromBigInt`, `normaliseEpd`, `shardId`).
 *     Reaching them with invalid input is a caller bug, and a silent `null`
 *     would be read downstream as "no peer data" rather than "invalid
 *     request" — the wrong failure to hide.
 */

export * from './scoring';
export * from './eligibility';
export * from './position';
export * from './rating';
export * from './speed';

import type { PositionIdentity } from './position';
import type { RatingRange } from './rating';

export type Confidence = 'low' | 'medium' | 'high';
export type GamePhase = 'opening' | 'middlegame' | 'endgame';
export type PeerSource = 'corpus' | 'model' | 'none';
export type SpeedClass = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence';

export interface EngineLine {
  rank: number;
  scoreCp?: number;
  mateIn?: number;
  movesUci: string[];
}

export interface EngineProvenance {
  engine: 'stockfish';
  engineVersion: string;
  nnueHash: string;
  nodes: number;
  multiPv: number;
  threads: number;
  hashMb: number;
}

export interface PositionEvidence {
  ply: number;
  fen: string;
  historyKey: string;
  depth: number;
  selDepth?: number;
  scoreCp?: number;
  mateIn?: number;
  wdl?: { win: number; draw: number; loss: number };
  lines: EngineLine[];
  provenance: EngineProvenance;
}

export interface PeerMoveObservation {
  moveUci: string;
  count: number;
  moverWins: number;
  draws: number;
  moverLosses: number;
}

export interface PeerBaseline {
  source: PeerSource;
  /** Hash plus normalised EPD; a key match alone is not an identity match. */
  position: PositionIdentity;
  /** Explicit range on an explicit platform. Provider buckets live in adapters. */
  ratingRange: RatingRange;
  speed: SpeedClass;
  /** How the speed class was derived, so cross-platform data stays comparable. */
  speedRuleVersion: string | null;
  sampleSize: number;
  moves: PeerMoveObservation[];
  indexVersion?: string;
  modelVersion?: string;
  confidence: Confidence;
}

export interface MotifEvidence {
  id: string;
  label: string;
  confidence: Confidence;
  squares: string[];
  proofLineUci: string[];
}

/**
 * Peer-relative label. Orthogonal to forcedness and to evidence availability —
 * a move can be forced AND a personal leak, or natural AND engine-only.
 * Collapsing these into one union forced a lossy choice at annotation time.
 */
export type PeerLabel = 'natural' | 'strong-find' | 'common-trap' | 'personal-leak' | 'unknown';

export interface MoveReview {
  ply: number;
  playedMoveUci: string;
  bestMoveUci: string;
  expectedOutcomeLoss: number;

  /** What peers did. 'unknown' whenever peerSource is 'none'. */
  peerLabel: PeerLabel;
  /** Where the peer claim came from, or 'none' for a measured absence. */
  peerSource: PeerSource;
  /** True when practically every alternative loses similarly. Position property. */
  forced: boolean;
  /** True when exactly one move avoids a large loss. Stricter than `forced`. */
  onlyMove: boolean;

  confidence: Confidence;
  motifs: MotifEvidence[];
  explanationFacts: string[];
  classifierVersion: string;
}

export interface RecurringWeakness {
  motifId: string;
  occurrences: number;
  affectedGames: number;
  severity: number;
  fixability: number;
  confidence: number;
  futureExposure: number;
  /** Ranking score among eligible lessons. Meaningless unless `eligible` is true. */
  priority: number;
  /** `priority` discounted by `confidence`, via `expectedLessonValue`. The UI sorts on this. */
  expectedValue: number;
  eligible: boolean;
  /** Why this lesson is suppressed, when it is. Suppression is never permanent. */
  suppressionReasons: string[];
  sourcePositions: Array<{ gameId: string; ply: number; fen: string }>;
}
