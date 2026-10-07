import { useState, useMemo, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Board, moveToSan } from './Chessboard';
import { assessMove, isKeyMove } from './analysis/classification';
import type { LibraryGame, PracticeAttempt } from './analysis/types';
import { moveNumber } from './analysis/move-number';
import { recordedPracticeAssessment, isAcceptedPracticeMove } from './analysis/practice-assessment';
import { StockfishClient } from './analysis/stockfish';
import { parsePgnAsync } from './analysis/parseAsync';
export function Practice({
  games,
  onAttempt,
  disabled = false,
}: {
  games: LibraryGame[];
  onAttempt: (game: LibraryGame, attempt: PracticeAttempt) => Promise<void>;
  disabled?: boolean;
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
  const [checking, setChecking] = useState(false);
  const pending = useRef<{ abort: AbortController; client?: StockfishClient } | null>(null);
  const drill = drills[Math.min(index, drills.length - 1)];
  const position = drill?.game.analysis.positions.find((p) => p.ply === drill.ply);
  const analysisIdentity = useMemo(
    () => JSON.stringify(drill?.game.analysis),
    [drill?.game.analysis],
  );
  useEffect(() => {
    pending.current?.abort.abort();
    pending.current?.client?.terminate();
    pending.current = null;
    setChecking(false);
    setFrom('');
    setAnswer('');
    setFeedback('');
    setRevealed(false);
    return () => {
      pending.current?.abort.abort();
      pending.current?.client?.terminate();
    };
  }, [drill?.game.id, drill?.ply, analysisIdentity, drill?.game.player, disabled]);
  async function attempt(uci: string) {
    if (!position || !drill || checking || disabled) return;
    setChecking(true);
    const request = {
      abort: new AbortController(),
      client: undefined as StockfishClient | undefined,
    };
    pending.current = request;
    try {
      const game = new Chess(position.fen);
      const move = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)
        ? game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
        : game.move(uci);
      const moveUci = move.from + move.to + (move.promotion ?? '');
      let assessment = recordedPracticeAssessment(position, moveUci);
      let comparison: PracticeAttempt['comparison'];
      if (!assessment) {
        const client = new StockfishClient();
        request.client = client;
        try {
          const settings = drill.game.analysis.provenance;
          const history = await parsePgnAsync(drill.game.pgn, request.abort.signal);
          const source = history.positions.find((p) => p.ply === position.ply);
          if (!source || source.fen !== position.fen)
            throw new Error('Practice history no longer matches this position.');
          const evaluated = await client.analysePosition(
            { ...source, moveUci },
            { nodes: settings.nodesPerPosition, multiPv: settings.multiPv },
            request.abort.signal,
            () => {},
          );
          assessment = assessMove(evaluated);
          comparison = {
            bestMoveUci: evaluated.bestMoveUci,
            bestLine: evaluated.lines[0]!,
            playedLine: evaluated.playedLine,
          };
        } finally {
          client.terminate();
        }
      }
      if (request.abort.signal.aborted) return;
      const correct = isAcceptedPracticeMove(assessment.label);
      setFeedback(
        correct
          ? moveUci === position.bestMoveUci
            ? 'You found the engine choice.'
            : 'Good move. This alternative is accepted by the engine comparison.'
          : assessment.label === 'Uncertain'
            ? 'The search is inconclusive. Try another move or reveal the recorded choice.'
            : 'This move loses more than a Good move. Try again or reveal the engine choice.',
      );
      if (correct) setRevealed(true);
      await onAttempt(drill.game, {
        ply: position.ply,
        moveUci,
        correct,
        attemptedAt: new Date().toISOString(),
        ...(comparison ? { comparison } : {}),
      });
    } catch (error) {
      if (request.abort.signal.aborted) return;
      setFeedback(
        error instanceof Error && error.message.includes('Invalid move')
          ? 'That move is not legal in this position. Select the piece and destination, or enter SAN such as Nf3.'
          : error instanceof Error
            ? error.message
            : 'Unable to record your attempt.',
      );
    } finally {
      if (pending.current === request) {
        pending.current = null;
        setChecking(false);
      }
    }
  }
  const attempts = useMemo(() => games.flatMap((g) => g.attempts), [games]);
  return (
    <section id="practice" className="practice-section" aria-labelledby="practice-heading">
      <p className="step">PRACTISE YOUR POSITIONS</p>
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
                if (revealed || checking || disabled) return;
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
              {drill.game.analysis.game.headers.Black ?? 'Black'} · move {moveNumber(position.fen)}
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
                  disabled={revealed || checking || disabled}
                />
              </label>
              <button
                className="primary-button"
                disabled={revealed || checking || disabled || !answer.trim()}
              >
                {checking ? 'Checking move' : 'Check move'}
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
              <button
                className="secondary-button"
                disabled={checking || disabled}
                onClick={() => setRevealed(true)}
              >
                Reveal move
              </button>
              <button
                className="secondary-button"
                disabled={checking || disabled}
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
              choices or good alternatives found
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
