import { useState, useMemo, useEffect } from 'react';
import { Chess } from 'chess.js';
import { Board, moveToSan } from './Chessboard';
import { assessMove, isKeyMove } from './analysis/classification';
import type { LibraryGame, PracticeAttempt } from './analysis/types';
export function Practice({
  games,
  onAttempt,
}: {
  games: LibraryGame[];
  onAttempt: (game: LibraryGame, attempt: PracticeAttempt) => Promise<void>;
}) {
  const drills = useMemo(
    () =>
      games.flatMap((game) =>
        game.analysis.positions
          .filter(
            (p) =>
              (game.player === 'both' || p.sideToMove === game.player) && isKeyMove(assessMove(p)),
          )
          .map((p) => ({ game, ply: p.ply })),
      ),
    [games],
  );
  const [index, setIndex] = useState(0),
    [from, setFrom] = useState(''),
    [answer, setAnswer] = useState(''),
    [feedback, setFeedback] = useState(''),
    [revealed, setRevealed] = useState(false);
  const drill = drills[Math.min(index, drills.length - 1)];
  const position = drill?.game.analysis.positions.find((p) => p.ply === drill.ply);
  useEffect(() => {
    setFrom('');
    setAnswer('');
    setFeedback('');
    setRevealed(false);
  }, [drill?.game.id, drill?.ply]);
  async function attempt(uci: string) {
    if (!position || !drill) return;
    try {
      const game = new Chess(position.fen);
      const move = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)
        ? game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
        : game.move(uci);
      const moveUci = move.from + move.to + (move.promotion ?? '');
      const correct = moveUci === position.bestMoveUci;
      setFeedback(
        correct
          ? 'You found the engine choice.'
          : 'Legal move, but another move led the recorded search. Try again or reveal it.',
      );
      if (correct) setRevealed(true);
      await onAttempt(drill.game, {
        ply: position.ply,
        moveUci,
        correct,
        attemptedAt: new Date().toISOString(),
      });
    } catch (error) {
      setFeedback(
        error instanceof Error && error.message.includes('Invalid move')
          ? 'That move is not legal in this position. Select the piece and destination, or enter SAN such as Nf3.'
          : error instanceof Error
            ? error.message
            : 'Unable to record your attempt.',
      );
    }
  }
  const attempts = games.flatMap((g) => g.attempts);
  return (
    <section id="practice" className="practice-section" aria-labelledby="practice-heading">
      <p className="step">04 / PRACTISE YOUR POSITIONS</p>
      <h2 id="practice-heading">A second chance at your own mistakes.</h2>
      <p className="muted">
        Find the best move from your saved games. Practice tracks attempts; it does not claim a
        validated recurring chess motif.
      </p>
      {!position || !drill ? (
        <p className="empty-state">
          Save an analysed game with a key moment to create your first practice position.
        </p>
      ) : (
        <div className="practice-layout">
          <div className="board-panel">
            <Board
              fen={position.fen}
              orientation={position.sideToMove}
              playedMove={from}
              bestMove={revealed ? position.bestMoveUci : ''}
              onSquare={(square) => {
                if (revealed) return;
                if (!from) {
                  setFrom(square);
                  return;
                }
                const game = new Chess(position.fen),
                  piece = game.get(from as Parameters<Chess['get']>[0]);
                const promotion =
                  piece?.type === 'p' && (square[1] === '8' || square[1] === '1') ? 'q' : '';
                void attempt(from + square + promotion);
                setFrom('');
              }}
            />
          </div>
          <div className="practice-copy">
            <span className="eyebrow">
              POSITION {Math.min(index + 1, drills.length)} / {drills.length}
            </span>
            <h3>{position.sideToMove === 'white' ? 'White' : 'Black'} to move</h3>
            <p>
              {drill.game.analysis.game.headers.White ?? 'White'} vs{' '}
              {drill.game.analysis.game.headers.Black ?? 'Black'} · move{' '}
              {Math.ceil(position.ply / 2)}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void attempt(answer.trim());
              }}
            >
              <label>
                Your move
                <input
                  aria-label="Practice move"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Nf3 or g1f3"
                  disabled={revealed}
                />
              </label>
              <button className="primary-button" disabled={revealed || !answer.trim()}>
                Check move
              </button>
            </form>
            <p aria-live="polite">{feedback}</p>
            {revealed && (
              <p className="practice-answer">
                Engine choice: <strong>{moveToSan(position.fen, position.bestMoveUci)}</strong>
                <br />
                <small>
                  Recorded at depth {position.lines[0]?.depth}; other moves may also be playable.
                </small>
              </p>
            )}
            <div className="actions">
              <button className="secondary-button" onClick={() => setRevealed(true)}>
                Reveal move
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setIndex((index + 1) % drills.length);
                  setFrom('');
                  setAnswer('');
                  setFeedback('');
                  setRevealed(false);
                }}
              >
                Next position →
              </button>
            </div>
            <p className="muted">
              {attempts.length} attempts saved · {attempts.filter((a) => a.correct).length} engine
              choices found
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
