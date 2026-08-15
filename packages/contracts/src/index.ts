export * from './scoring';

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
  positionKey: string;
  ratingBand: string;
  speed: SpeedClass;
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

export interface MoveReview {
  ply: number;
  playedMoveUci: string;
  bestMoveUci: string;
  expectedOutcomeLoss: number;
  classification:
    'forced' | 'natural' | 'strong-find' | 'common-trap' | 'personal-leak' | 'engine-only';
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
  priority: number;
  sourcePositions: Array<{ gameId: string; ply: number; fen: string }>;
}
