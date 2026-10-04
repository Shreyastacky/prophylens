import { useMemo, useEffect, useState } from 'react';
import { assessMove, isKeyMove, severityScore, formatLoss } from './analysis/classification';
import { whiteEvaluation } from './analysis/variation';
import type { PlayerSide, PositionAnalysis } from './analysis/types';
import { Chessboard, moveToSan } from './Chessboard';
export function Review({
  results,
  player,
  onPlayer,
}: {
  results: PositionAnalysis[];
  player: PlayerSide;
  onPlayer: (side: PlayerSide) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'key'>('all');
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const reviews = useMemo(
    () =>
      results
        .filter((r) => player === 'both' || r.sideToMove === player)
        .map((result) => ({ result, assessment: assessMove(result) })),
    [results, player],
  );
  const keys = reviews.filter((r) => isKeyMove(r.assessment));
  const visible = filter === 'key' ? keys : reviews;
  const selectedIndex = Math.max(
    0,
    visible.findIndex((r) => r.result.ply === selectedPly),
  );
  const selected = visible[selectedIndex];
  const finiteLosses = reviews.flatMap((r) =>
    r.assessment.centipawnLoss === undefined ? [] : [r.assessment.centipawnLoss],
  );
  const average = finiteLosses.length
    ? finiteLosses.reduce((a, b) => a + b, 0) / finiteLosses.length / 100
    : undefined;
  const worst = reviews.reduce<(typeof reviews)[number] | null>(
    (a, b) => (!a || severityScore(b.assessment) > severityScore(a.assessment) ? b : a),
    null,
  );
  const navigate = (direction: number) =>
    setSelectedPly(
      visible[Math.max(0, Math.min(visible.length - 1, selectedIndex + direction))]?.result.ply ??
        null,
    );
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input,select,textarea') || target?.isContentEditable) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        navigate(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  });
  useEffect(() => {
    setFilter('all');
    setSelectedPly(null);
  }, [player]);
  return (
    <>
      <div className="review-summary" aria-label="Analysis summary">
        <article>
          <span>Key moments</span>
          <strong>{keys.length}</strong>
          <small>Inaccuracies, mistakes and blunders</small>
        </article>
        <article>
          <span>Average loss</span>
          <strong>{average === undefined ? '—' : average.toFixed(2)}</strong>
          <small>{finiteLosses.length} comparable moves · mate lines excluded</small>
        </article>
        <article>
          <span>Biggest miss</span>
          <strong>{worst?.result.san ?? '—'}</strong>
          <small>{worst ? formatLoss(worst.assessment) : 'No result yet'}</small>
        </article>
      </div>
      <div className="review-toolbar">
        <div className="segmented-control" aria-label="Move filter">
          <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All moves <span>{reviews.length}</span>
          </button>
          <button
            aria-pressed={filter === 'key'}
            onClick={() => setFilter('key')}
            disabled={!keys.length}
          >
            Key moments <span>{keys.length}</span>
          </button>
        </div>
        <label className="player-select">
          Review player
          <select
            aria-label="Review player"
            value={player}
            onChange={(e) => onPlayer(e.target.value as PlayerSide)}
          >
            <option value="both">Both players</option>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </label>
        <span>{visible.length} moves shown</span>
      </div>
      <div className="evaluation-chart" aria-label="Evaluation timeline">
        <div>
          <strong>Game balance</strong>
          <small>White advantage ↑ · Black advantage ↓ · select a move</small>
        </div>
        <svg
          viewBox="0 0 1000 130"
          role="img"
          aria-label="Stockfish evaluation timeline, from White's perspective"
        >
          <line x1="0" y1="65" x2="1000" y2="65" stroke="#74849d" />
          {results.slice(1).map((r, i) => {
            const previous = results[i]!;
            const a = whiteEvaluation(previous.sideToMove, previous.playedLine);
            const b = whiteEvaluation(r.sideToMove, r.playedLine);
            return a === undefined || b === undefined ? null : (
              <line
                key={r.ply}
                x1={(i / (results.length - 1)) * 1000}
                y1={65 - a * 7}
                x2={((i + 1) / (results.length - 1)) * 1000}
                y2={65 - b * 7}
                stroke="#9cccff"
                strokeWidth="3"
              />
            );
          })}
        </svg>
        <div className="timeline-moves">
          {reviews.map(({ result }) => (
            <button
              key={result.ply}
              aria-label={`Jump to ${Math.ceil(result.ply / 2)}${result.ply % 2 ? ' white' : ' black'} ${result.san}`}
              aria-pressed={selected?.result.ply === result.ply}
              onClick={() => {
                if (filter === 'key' && !keys.some((r) => r.result.ply === result.ply))
                  setFilter('all');
                setSelectedPly(result.ply);
              }}
            >
              {result.san}
            </button>
          ))}
        </div>
      </div>
      <div className="review-layout">
        {selected && (
          <Chessboard
            key={selected.result.ply}
            result={selected.result}
            assessment={selected.assessment}
            orientation={player === 'black' ? 'black' : 'white'}
            canGoPrevious={selectedIndex > 0}
            canGoNext={selectedIndex < visible.length - 1}
            onPrevious={() => navigate(-1)}
            onNext={() => navigate(1)}
          />
        )}
        <div className="result-list" aria-label="Analysed moves">
          {visible.map(({ result, assessment }) => (
            <button
              className={`result-row ${selected?.result.ply === result.ply ? 'result-selected' : ''}`}
              key={result.ply}
              onClick={() => setSelectedPly(result.ply)}
            >
              <div className="move-cell">
                <span>
                  {Math.ceil(result.ply / 2)}
                  {result.ply % 2 ? '.' : '...'}
                </span>
                <strong>{result.san}</strong>
              </div>
              <div>
                <small>Assessment</small>
                <strong className={`move-label label-${assessment.label.toLowerCase()}`}>
                  {assessment.label}
                </strong>
              </div>
              <div>
                <small>Loss</small>
                <strong className="evaluation">{formatLoss(assessment)}</strong>
              </div>
              <div>
                <small>Engine choice</small>
                <code>{moveToSan(result.fen, result.bestMoveUci)}</code>
              </div>
            </button>
          ))}
          {!visible.length && <p className="empty-state">No moves match this filter.</p>}
        </div>
      </div>
    </>
  );
}
