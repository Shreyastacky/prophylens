import { useEffect, useMemo, useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react/dist/csr/ArrowsClockwise';
import { Board } from './Chessboard';
import { variationSteps } from './analysis/variation';
import type { ParsedGame } from './analysis/types';

const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
function playerName(game: ParsedGame | null, side: 'White' | 'Black') {
  const name = game?.headers[side]?.trim();
  return name && name !== '?' ? name : side;
}
export function GamePreview({ game }: { game: ParsedGame | null }) {
  const [step, setStep] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const positions = useMemo(() => {
    if (!game?.positions.length) return [{ fen: initialFen, san: 'Starting position' }];
    return variationSteps(
      game.positions[0]!.fen,
      game.positions.map((p) => p.moveUci),
    );
  }, [game]);
  useEffect(() => {
    setStep(0);
  }, [game]);
  const currentStep = Math.min(step, positions.length - 1);
  const position = positions[currentStep]!;
  return (
    <div className="board-panel preview-board">
      <div className="board-top">
        <span className="board-player">
          <span className="player-dot player-white" />
          {playerName(game, 'White')}
        </span>
        <button
          className="text-button"
          onClick={() => setFlipped((v) => !v)}
          aria-label="Flip board in preview"
        >
          <ArrowsClockwise size={16} aria-hidden="true" /> Flip board
        </button>
        <span className="board-player">
          <span className="player-dot player-black" />
          {playerName(game, 'Black')}
        </span>
      </div>
      <div className="board-frame">
        <Board fen={position.fen} orientation={flipped ? 'black' : 'white'} />
      </div>
      <div className="preview-toolbar">
        <div>
          <strong>{currentStep ? position.san : 'Starting position'}</strong>
          <span>Game preview · not analysed</span>
        </div>
        <div className="board-controls">
          <button
            className="secondary-button"
            aria-label="Previous preview move"
            disabled={currentStep === 0}
            onClick={() => setStep((v) => Math.max(0, v - 1))}
          >
            ←
          </button>
          <span>
            {currentStep} / {positions.length - 1}
          </span>
          <button
            className="secondary-button"
            aria-label="Next preview move"
            disabled={currentStep >= positions.length - 1}
            onClick={() => setStep((v) => Math.min(positions.length - 1, v + 1))}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
