import engineManifest from '../../../../public/engine/manifest.json';
export type SideToMove = 'white' | 'black';

export interface GamePosition {
  ply: number;
  san: string;
  moveUci: string;
  fen: string;
  sideToMove: SideToMove;
  positionCommand: string;
}

export interface ParsedGame {
  headers: Record<string, string>;
  positions: GamePosition[];
}

export interface EngineLine {
  rank: number;
  depth: number;
  selectiveDepth?: number;
  nodes: number;
  scoreCp?: number;
  mateIn?: number;
  scoreBound?: 'exact' | 'lower' | 'upper';
  wdl?: { win: number; draw: number; loss: number };
  movesUci: string[];
}

export interface PositionAnalysis {
  ply: number;
  san: string;
  playedMoveUci: string;
  fen: string;
  sideToMove: SideToMove;
  bestMoveUci: string;
  lines: EngineLine[];
  playedLine: EngineLine;
}

export interface AnalysisSettings {
  nodes: number;
  multiPv: number;
}

export interface AnalysisRun {
  schemaVersion: 3;
  pgn: string;
  createdAt: string;
  pgnSha256: string;
  game: {
    headers: Record<string, string>;
    plies: number;
  };
  provenance: {
    engine: 'Stockfish';
    engineVersion: string;
    distribution: 'Stockfish.js 18 lite single-threaded';
    upstreamRelease: string;
    upstreamStockfishCommit: string;
    evaluationNetwork: string;
    scriptSha256: string;
    wasmSha256: string;
    threads: 1;
    hashMb: 16;
    nodesPerPosition: number;
    multiPv: number;
    classifierVersion: 'move-loss-v1' | 'move-loss-v2';
    appVersion: string;
    sourceRevision: string;
  };
  positions: PositionAnalysis[];
}

export type PlayerSide = SideToMove | 'both';
export interface PracticeAttempt {
  ply: number;
  moveUci: string;
  correct: boolean;
  attemptedAt: string;
  comparison?: { bestMoveUci: string; bestLine: EngineLine; playedLine: EngineLine };
}
export interface LibraryGame {
  schemaVersion: 1;
  id: string;
  pgn: string;
  analysis: AnalysisRun;
  player: PlayerSide;
  updatedAt: string;
  attempts: PracticeAttempt[];
}

export const ENGINE_ASSET = {
  ...engineManifest,
  workerUrl: `${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`,
  wasmUrl: `${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.wasm`,
} as const;
