import { useMemo, useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { ArrowsClockwise } from '@phosphor-icons/react/dist/csr/ArrowsClockwise';
import { formatLoss, type MoveAssessment } from './analysis/classification';
import { variationSteps } from './analysis/variation';
import type { PositionAnalysis } from './analysis/types';
import { movePrefix } from './analysis/move-number';
const pieceNames = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
} as const;
export function moveToSan(fen: string, uci: string): string {
  try {
    return (
      new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })?.san ??
      uci
    );
  } catch {
    return uci;
  }
}
export function Board({
  fen,
  orientation = 'white',
  playedMove = '',
  bestMove = '',
  onSquare,
}: {
  fen: string;
  orientation?: 'white' | 'black';
  playedMove?: string;
  bestMove?: string;
  onSquare?: (square: string) => void;
}) {
  const squares = useMemo(
    () =>
      new Chess(fen)
        .board()
        .flat()
        .map((piece, index) => ({
          piece,
          square: `${String.fromCharCode(97 + (index % 8))}${8 - Math.floor(index / 8)}`,
        })),
    [fen],
  );
  const ordered = orientation === 'black' ? [...squares].reverse() : squares;
  return (
    <div
      className="chessboard"
      role={onSquare ? 'group' : 'img'}
      aria-label={
        onSquare
          ? 'Practice board. Select a piece and then its destination.'
          : 'Chess position. Amber marks the played move and blue marks the engine choice.'
      }
    >
      {ordered.map(({ piece, square }, index) => {
        const classes = [
          'board-square',
          (Math.floor(index / 8) + (index % 8)) % 2 === 0 ? 'square-light' : 'square-dark',
          playedMove.includes(square) ? 'square-played' : '',
          bestMove.includes(square) ? 'square-best' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const label = piece
          ? `${piece.color === 'w' ? 'White' : 'Black'} ${pieceNames[piece.type]} on ${square}`
          : `Empty ${square}`;
        const content = (
          <>
            {index % 8 === 0 && <span className="rank-label">{square[1]}</span>}
            {index >= 56 && <span className="file-label">{square[0]}</span>}
            {piece && (
              <span className={`piece piece-${piece.color}`}>
                <img
                  src={`${import.meta.env.BASE_URL}pieces/${piece.color}${piece.type.toUpperCase()}.svg`}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  width="80"
                  height="80"
                />
              </span>
            )}
          </>
        );
        return onSquare ? (
          <button
            type="button"
            className={classes}
            key={square}
            aria-label={label}
            onClick={() => onSquare(square)}
          >
            {content}
          </button>
        ) : (
          <div className={classes} key={square} role="img" aria-label={label}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
interface ChessboardProps {
  result: PositionAnalysis;
  assessment: MoveAssessment;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  orientation?: 'white' | 'black';
}
export function Chessboard({
  result,
  assessment,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  orientation = 'white',
}: ChessboardProps) {
  const [preview, setPreview] = useState<'before' | 'played' | 'line'>('before');
  const [rank, setRank] = useState(0);
  const [step, setStep] = useState(0);
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    setPreview('before');
    setStep(0);
    setRank(0);
  }, [result.ply, result.fen]);
  const line = result.lines[rank] ?? result.lines[0];
  const steps = useMemo(() => {
    try {
      return variationSteps(result.fen, line?.movesUci ?? []);
    } catch {
      return [{ fen: result.fen, san: 'Variation unavailable' }];
    }
  }, [result.fen, line]);
  const playedFen = useMemo(() => {
    try {
      return variationSteps(result.fen, [result.playedMoveUci])[1]!.fen;
    } catch {
      return result.fen;
    }
  }, [result.fen, result.playedMoveUci]);
  const displayFen =
    preview === 'played'
      ? playedFen
      : preview === 'line'
        ? (steps[step] ?? steps[0]!).fen
        : result.fen;
  const actualOrientation = flipped ? (orientation === 'white' ? 'black' : 'white') : orientation;
  return (
    <div className="board-panel">
      <div className="board-top">
        <span>{result.sideToMove === 'white' ? 'White' : 'Black'} to move</span>
        <button
          className="text-button"
          onClick={() => setFlipped((v) => !v)}
          aria-label="Flip board"
        >
          <ArrowsClockwise size={16} aria-hidden="true" /> Flip board
        </button>
      </div>
      <div className="board-view-toolbar">
        <div className="segmented-control board-views" aria-label="Board view">
          <button aria-pressed={preview === 'before'} onClick={() => setPreview('before')}>
            Before move
          </button>
          <button aria-pressed={preview === 'played'} onClick={() => setPreview('played')}>
            After played move
          </button>
          <button
            aria-pressed={preview === 'line'}
            onClick={() => {
              setPreview('line');
              setStep(1);
            }}
          >
            Engine line
          </button>
        </div>
      </div>
      <div className="board-frame">
        <Board
          fen={displayFen}
          orientation={actualOrientation}
          playedMove={preview === 'before' ? result.playedMoveUci : ''}
          bestMove={preview === 'before' ? result.bestMoveUci : ''}
        />
      </div>
      <div className="board-navigation">
        <div className="board-controls">
          <button className="secondary-button" onClick={onPrevious} disabled={!canGoPrevious}>
            ← Previous
          </button>
          <button className="secondary-button" onClick={onNext} disabled={!canGoNext}>
            Next →
          </button>
        </div>
      </div>
      <div className="board-summary">
        <div>
          <span className={`move-label label-${assessment.label.toLowerCase()}`}>
            {assessment.label}
          </span>
          <strong>
            {movePrefix(result.fen)} {result.san}
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
            <dd>{formatLoss(assessment)}</dd>
          </div>
        </dl>
        <p className="legend">
          <span className="legend-played" />
          Played move <span className="legend-best" />
          Engine choice
        </p>
        {assessment.reason && <p className="confidence-note">{assessment.reason}</p>}
        {preview === 'line' && (
          <div className="variation-panel">
            <label>
              Candidate line
              <select
                value={rank}
                onChange={(e) => {
                  setRank(Number(e.target.value));
                  setStep(1);
                }}
              >
                {result.lines.map((l, i) => (
                  <option key={l.rank} value={i}>
                    {i + 1}. {moveToSan(result.fen, l.movesUci[0] ?? '')} · depth {l.depth}
                  </option>
                ))}
              </select>
            </label>
            <div className="variation-moves" aria-label="Engine variation">
              {steps.map((s, i) => (
                <button key={i} aria-pressed={step === i} onClick={() => setStep(i)}>
                  {i === 0 ? 'Start' : s.san}
                </button>
              ))}
            </div>
            <div className="board-controls">
              <button
                className="secondary-button"
                aria-label="Previous variation move"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                ← Line
              </button>
              <span>
                Move {step}/{steps.length - 1}
              </span>
              <button
                className="secondary-button"
                aria-label="Next variation move"
                disabled={step >= steps.length - 1}
                onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              >
                Line →
              </button>
            </div>
          </div>
        )}
        <small>Left and right arrow keys follow the current move filter.</small>
      </div>
    </div>
  );
}
