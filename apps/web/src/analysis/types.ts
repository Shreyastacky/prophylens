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
  schemaVersion: 2;
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
    classifierVersion: 'move-loss-v1';
  };
  positions: PositionAnalysis[];
}

export const ENGINE_ASSET = {
  workerUrl: `${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`,
  upstreamRelease: 'nmrugg/stockfish.js v18.0.0',
  upstreamStockfishCommit: 'cb3d4ee',
  evaluationNetwork: 'nn-9067e33176e8.nnue',
  scriptSha256: '2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe',
  wasmSha256: 'a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1',
} as const;
