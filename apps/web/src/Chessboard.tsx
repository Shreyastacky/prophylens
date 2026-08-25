import { Chess } from 'chess.js';

import type { MoveAssessment } from './analysis/classification';
import type { PositionAnalysis } from './analysis/types';

const pieces = {
  wp: '♙',
  wn: '♘',
  wb: '♗',
  wr: '♖',
  wq: '♕',
  wk: '♔',
  bp: '♟',
  bn: '♞',
  bb: '♝',
  br: '♜',
  bq: '♛',
  bk: '♚',
} as const;

const pieceNames = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
} as const;

function uciSquares(move: string): [string, string] {
  return [move.slice(0, 2), move.slice(2, 4)];
}

export function moveToSan(fen: string, uci: string): string {
  try {
    const game = new Chess(fen);
    return game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })?.san ?? uci;
  } catch {
    return uci;
  }
}

interface ChessboardProps {
  result: PositionAnalysis;
  assessment: MoveAssessment;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export function Chessboard({
  result,
  assessment,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
}: ChessboardProps) {
  const game = new Chess(result.fen);
  const board = game.board();
  const playedSquares = uciSquares(result.playedMoveUci);
  const bestSquares = uciSquares(result.bestMoveUci);

  return (
    <div className="board-panel">
      <div
        className="chessboard"
        role="img"
        aria-label={`Position before ${result.san}. Orange marks the played move and green marks Stockfish's choice.`}
      >
        {board.flatMap((rank, rankIndex) =>
          rank.map((piece, fileIndex) => {
            const square = `${String.fromCharCode(97 + fileIndex)}${8 - rankIndex}`;
            const isPlayed = playedSquares.includes(square);
            const isBest = bestSquares.includes(square);
            const classes = [
              'board-square',
              (rankIndex + fileIndex) % 2 === 0 ? 'square-light' : 'square-dark',
              isPlayed ? 'square-played' : '',
              isBest ? 'square-best' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const pieceKey = piece ? (`${piece.color}${piece.type}` as keyof typeof pieces) : null;
            const label = piece
              ? `${piece.color === 'w' ? 'White' : 'Black'} ${pieceNames[piece.type]} on ${square}`
              : `Empty ${square}`;

            return (
              <div className={classes} key={square} aria-label={label}>
                {fileIndex === 0 && <span className="rank-label">{8 - rankIndex}</span>}
                {rankIndex === 7 && <span className="file-label">{square[0]}</span>}
                {pieceKey && (
                  <span className={`piece piece-${piece!.color}`}>{pieces[pieceKey]}</span>
                )}
              </div>
            );
          }),
        )}
      </div>

      <div className="board-summary">
        <div>
          <span className={`move-label label-${assessment.label.toLowerCase()}`}>
            {assessment.label}
          </span>
          <strong>
            {Math.ceil(result.ply / 2)}
            {result.ply % 2 === 0 ? '…' : '.'} {result.san}
          </strong>
        </div>
        <dl>
          <div>
            <dt>Played</dt>
            <dd>{moveToSan(result.fen, result.playedMoveUci)}</dd>
          </div>
          <div>
            <dt>Engine choice</dt>
            <dd>{moveToSan(result.fen, result.bestMoveUci)}</dd>
          </div>
          <div>
            <dt>Evaluation lost</dt>
            <dd>
              {assessment.centipawnLoss === undefined
                ? 'Mate sequence'
                : `${(assessment.centipawnLoss / 100).toFixed(2)} pawns`}
            </dd>
          </div>
        </dl>
        <p className="legend">
          <span className="legend-played" /> Played move
          <span className="legend-best" /> Engine choice
        </p>
        <div className="board-controls">
          <button className="secondary-button" onClick={onPrevious} disabled={!canGoPrevious}>
            ← Previous
          </button>
          <button className="secondary-button" onClick={onNext} disabled={!canGoNext}>
            Next →
          </button>
        </div>
        <small>Tip: use the left and right arrow keys to move through the game.</small>
      </div>
    </div>
  );
}
