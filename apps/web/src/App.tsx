import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';

import { assessMove, type MoveAssessment } from './analysis/classification';
import { parseGame } from './analysis/pgn';
import { downloadAnalysis, saveLastAnalysis, sha256 } from './analysis/storage';
import { StockfishClient } from './analysis/stockfish';
import type { AnalysisRun, AnalysisSettings, PositionAnalysis } from './analysis/types';
import { ENGINE_ASSET } from './analysis/types';
import { Chessboard, moveToSan } from './Chessboard';

const examplePgn = `[Event "Example"]
[White "You"]
[Black "Training Partner"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *`;

const MAX_PGN_FILE_BYTES = 2 * 1024 * 1024;

type EngineStatus = 'idle' | 'loading' | 'ready' | 'analysing' | 'cancelled' | 'complete' | 'error';
type ReviewFilter = 'all' | 'key';

interface ProgressState {
  completed: number;
  total: number;
  nodes: number;
  move: string;
}

function moveNumber(ply: number): string {
  return ply % 2 === 1 ? `${Math.ceil(ply / 2)}.` : `${Math.ceil(ply / 2)}...`;
}

function statusLabel(status: EngineStatus): string {
  const labels: Record<EngineStatus, string> = {
    idle: 'Engine idle',
    loading: 'Loading engine',
    ready: 'Engine ready',
    analysing: 'Analysing locally',
    cancelled: 'Analysis cancelled',
    complete: 'Analysis complete',
    error: 'Engine error',
  };
  return labels[status];
}

function formatLoss(assessment: MoveAssessment): string {
  return assessment.centipawnLoss === undefined
    ? 'Mate'
    : `${(assessment.centipawnLoss / 100).toFixed(2)}`;
}

function severityScore(assessment: MoveAssessment): number {
  return assessment.expectedScoreLoss ?? (assessment.centipawnLoss ?? 0) / 1000;
}

export function App() {
  const [pgn, setPgn] = useState(examplePgn);
  const [settings, setSettings] = useState<AnalysisSettings>({ nodes: 10_000, multiPv: 2 });
  const [status, setStatus] = useState<EngineStatus>('idle');
  const [engineName, setEngineName] = useState('Stockfish 18 Lite');
  const [results, setResults] = useState<PositionAnalysis[]>([]);
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [progress, setProgress] = useState<ProgressState>({
    completed: 0,
    total: 0,
    nodes: 0,
    move: '',
  });
  const clientRef = useRef<StockfishClient | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const parsed = useMemo(() => {
    try {
      return { error: null, game: parseGame(pgn) };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unable to parse PGN',
        game: null,
      };
    }
  }, [pgn]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      clientRef.current?.terminate();
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('textarea, input, select')) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      setSelectedPly((current) => {
        const index = Math.max(
          0,
          results.findIndex((result) => result.ply === current),
        );
        const nextIndex =
          event.key === 'ArrowLeft'
            ? Math.max(0, index - 1)
            : Math.min(results.length - 1, index + 1);
        return results[nextIndex]?.ply ?? current;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [results]);

  const ensureClient = () => {
    if (!clientRef.current) clientRef.current = new StockfishClient();
    return clientRef.current;
  };

  const replacePgn = (nextPgn: string, fileName: string | null) => {
    setPgn(nextPgn);
    setImportedFileName(fileName);
    setFileError(null);
    setErrorMessage(null);
    setResults([]);
    setSelectedPly(null);
    setRun(null);
    setReviewFilter('all');
    setProgress({ completed: 0, total: 0, nodes: 0, move: '' });
    setStatus(clientRef.current ? 'ready' : 'idle');
  };

  const importPgnFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pgn')) {
      setFileError('Choose a file ending in .pgn.');
      return;
    }
    if (file.size > MAX_PGN_FILE_BYTES) {
      setFileError('That PGN is larger than the 2 MB safety limit.');
      return;
    }

    try {
      const contents = await file.text();
      parseGame(contents);
      replacePgn(contents, file.name);
    } catch (error) {
      setFileError(
        error instanceof Error
          ? `Could not import this PGN: ${error.message}`
          : 'Could not import this PGN.',
      );
    }
  };

  const restartEngine = async () => {
    abortRef.current?.abort();
    clientRef.current?.terminate();
    clientRef.current = new StockfishClient();
    setStatus('loading');
    setErrorMessage(null);
    try {
      setEngineName(await clientRef.current.initialize());
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to restart Stockfish.');
    }
  };

  const cancelAnalysis = () => {
    abortRef.current?.abort();
    clientRef.current?.terminate();
    clientRef.current = null;
    setStatus('cancelled');
  };

  const startAnalysis = async () => {
    if (!parsed.game) return;

    const abortController = new AbortController();
    abortRef.current = abortController;
    setResults([]);
    setSelectedPly(null);
    setRun(null);
    setReviewFilter('all');
    setErrorMessage(null);
    setStatus('loading');
    setProgress({ completed: 0, total: parsed.game.positions.length, nodes: 0, move: '' });

    try {
      const client = ensureClient();
      const initializedEngineName = await client.initialize();
      setEngineName(initializedEngineName);
      setStatus('analysing');

      const completedResults: PositionAnalysis[] = [];
      for (const position of parsed.game.positions) {
        if (abortController.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        setProgress((current) => ({ ...current, nodes: 0, move: position.san }));
        const result = await client.analysePosition(
          position,
          settings,
          abortController.signal,
          (nodes) => setProgress((current) => ({ ...current, nodes })),
        );
        completedResults.push(result);
        setResults([...completedResults]);
        setSelectedPly((current) => current ?? result.ply);
        setProgress((current) => ({ ...current, completed: completedResults.length }));
      }

      const finishedRun: AnalysisRun = {
        schemaVersion: 2,
        createdAt: new Date().toISOString(),
        pgnSha256: await sha256(pgn),
        game: { headers: parsed.game.headers, plies: parsed.game.positions.length },
        provenance: {
          engine: 'Stockfish',
          engineVersion: initializedEngineName,
          distribution: 'Stockfish.js 18 lite single-threaded',
          upstreamRelease: ENGINE_ASSET.upstreamRelease,
          upstreamStockfishCommit: ENGINE_ASSET.upstreamStockfishCommit,
          evaluationNetwork: ENGINE_ASSET.evaluationNetwork,
          scriptSha256: ENGINE_ASSET.scriptSha256,
          wasmSha256: ENGINE_ASSET.wasmSha256,
          threads: 1,
          hashMb: 16,
          nodesPerPosition: settings.nodes,
          multiPv: settings.multiPv,
          classifierVersion: 'move-loss-v1',
        },
        positions: completedResults,
      };

      saveLastAnalysis(finishedRun);
      setRun(finishedRun);
      const mostCostly = completedResults.reduce<PositionAnalysis | null>((worst, result) => {
        if (!worst) return result;
        return severityScore(assessMove(result)) > severityScore(assessMove(worst))
          ? result
          : worst;
      }, null);
      setSelectedPly(mostCostly?.ply ?? null);
      setStatus('complete');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus('cancelled');
        return;
      }
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Analysis failed unexpectedly.');
      clientRef.current?.terminate();
      clientRef.current = null;
    } finally {
      abortRef.current = null;
    }
  };

  const totalProgress = progress.total
    ? ((progress.completed + Math.min(progress.nodes / (settings.nodes * 2), 1)) / progress.total) *
      100
    : 0;

  const reviewedResults = useMemo(
    () => results.map((result) => ({ result, assessment: assessMove(result) })),
    [results],
  );
  const keyReviews = reviewedResults.filter(
    ({ assessment }) => assessment.label !== 'Best' && assessment.label !== 'Good',
  );
  const visibleReviews = reviewFilter === 'key' ? keyReviews : reviewedResults;
  const selectedIndex = Math.max(
    0,
    visibleReviews.findIndex(({ result }) => result.ply === selectedPly),
  );
  const selectedReview = visibleReviews[selectedIndex] ?? null;
  const selectedResult = selectedReview?.result ?? null;
  const averageLoss =
    reviewedResults.length === 0
      ? 0
      : reviewedResults.reduce(
          (total, { assessment }) => total + (assessment.centipawnLoss ?? 0),
          0,
        ) / reviewedResults.length;
  const largestLoss = reviewedResults.reduce<(typeof reviewedResults)[number] | null>(
    (largest, review) =>
      !largest || severityScore(review.assessment) > severityScore(largest.assessment)
        ? review
        : largest,
    null,
  );

  const changeReviewFilter = (filter: ReviewFilter) => {
    setReviewFilter(filter);
    const nextReviews = filter === 'key' ? keyReviews : reviewedResults;
    if (!nextReviews.some(({ result }) => result.ply === selectedPly)) {
      setSelectedPly(nextReviews[0]?.result.ply ?? null);
    }
  };

  return (
    <main>
      <nav className="nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="ProphyLens home">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <span>ProphyLens</span>
        </a>
        <span className={`status status-${status}`}>{statusLabel(status)}</span>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">PRIVATE CHESS REVIEW</div>
          <h1>Find the moves that changed your game.</h1>
          <p>
            Import a finished game and compare every move with Stockfish—without sending the PGN
            away from your device.
          </p>
        </div>
        <div className="hero-proof" aria-label="Product principles">
          <div>
            <strong>Local</strong>
            <span>Your game stays in this browser</span>
          </div>
          <div>
            <strong>Explainable</strong>
            <span>Every label keeps its engine evidence</span>
          </div>
          <div>
            <strong>Open source</strong>
            <span>Inspect the code and the calculation receipt</span>
          </div>
        </div>
      </section>

      <section className="workspace" aria-labelledby="import-heading">
        <div>
          <p className="step">01 / IMPORT AND CALCULATE</p>
          <h2 id="import-heading">Import your game</h2>
          <p className="muted">
            Start with Quick analysis. Increase the node budget only when you want a slower, more
            stable second opinion.
          </p>

          <div className="settings" aria-label="Analysis settings">
            <label>
              Nodes per position
              <select
                value={settings.nodes}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, nodes: Number(event.target.value) }))
                }
                disabled={status === 'analysing' || status === 'loading'}
              >
                <option value={10_000}>10,000 · quick</option>
                <option value={50_000}>50,000 · balanced</option>
                <option value={100_000}>100,000 · deeper</option>
              </select>
            </label>
            <label>
              Candidate lines
              <select
                value={settings.multiPv}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, multiPv: Number(event.target.value) }))
                }
                disabled={status === 'analysing' || status === 'loading'}
              >
                <option value={1}>1 line</option>
                <option value={2}>2 lines</option>
                <option value={3}>3 lines</option>
              </select>
            </label>
          </div>
        </div>

        <div className="import-panel">
          <div className="file-import">
            <label className="secondary-button file-button">
              <input
                type="file"
                accept=".pgn,application/x-chess-pgn"
                aria-label="Choose PGN file"
                onChange={importPgnFile}
                disabled={status === 'analysing' || status === 'loading'}
              />
              Choose .pgn file
            </label>
            <span>
              {importedFileName
                ? `${importedFileName} loaded locally`
                : 'Maximum 2 MB · never uploaded'}
            </span>
          </div>
          {fileError && (
            <small className="parse-error" role="alert">
              {fileError}
            </small>
          )}

          <label className="pgn-field">
            <span>PGN</span>
            <textarea
              value={pgn}
              onChange={(event) => replacePgn(event.target.value, null)}
              spellCheck="false"
              disabled={status === 'analysing' || status === 'loading'}
            />
            <small className={parsed.error ? 'parse-error' : 'parse-ok'}>
              {parsed.error ??
                `${parsed.game?.positions.length ?? 0} half-moves ready for local analysis`}
            </small>
          </label>

          <div className="actions">
            <button
              className="primary-button"
              onClick={startAnalysis}
              disabled={!parsed.game || status === 'analysing' || status === 'loading'}
            >
              Analyse game
            </button>
            {(status === 'analysing' || status === 'loading') && (
              <button className="secondary-button" onClick={cancelAnalysis}>
                Cancel
              </button>
            )}
            {status !== 'analysing' && status !== 'loading' && (
              <button className="secondary-button" onClick={restartEngine}>
                Restart engine
              </button>
            )}
          </div>

          {(status === 'analysing' || status === 'loading') && (
            <div className="progress-panel" aria-live="polite">
              <div>
                <span>
                  {status === 'loading' ? 'Loading the 7 MB engine' : `Analysing ${progress.move}`}
                </span>
                <span>
                  {progress.completed}/{progress.total} positions
                </span>
              </div>
              <progress value={totalProgress} max="100" />
              <small>
                {progress.nodes.toLocaleString()} / approximately{' '}
                {(settings.nodes * 2).toLocaleString()} search nodes in this position
              </small>
            </div>
          )}

          {errorMessage && (
            <p className="error-box" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
      </section>

      <section className="results" aria-labelledby="results-heading">
        <div className="results-header">
          <div>
            <p className="step">02 / MOVE REVIEW</p>
            <h2 id="results-heading">See what changed when you moved.</h2>
          </div>
          {run && (
            <button className="secondary-button" onClick={() => downloadAnalysis(run)}>
              Download evidence
            </button>
          )}
        </div>

        {results.length === 0 ? (
          <p className="empty-state">
            No engine evidence yet. Analyse the sample game above to start.
          </p>
        ) : (
          <>
            <div className="review-summary" aria-label="Analysis summary">
              <article>
                <span>Key moments</span>
                <strong>{keyReviews.length}</strong>
                <small>Inaccuracies, mistakes and blunders</small>
              </article>
              <article>
                <span>Average loss</span>
                <strong>{(averageLoss / 100).toFixed(2)}</strong>
                <small>Pawns lost per move</small>
              </article>
              <article>
                <span>Biggest miss</span>
                <strong>{largestLoss?.result.san ?? '—'}</strong>
                <small>
                  {largestLoss ? `${formatLoss(largestLoss.assessment)} pawns` : 'No result yet'}
                </small>
              </article>
            </div>

            <div className="review-toolbar">
              <div className="segmented-control" aria-label="Move filter">
                <button
                  aria-pressed={reviewFilter === 'all'}
                  onClick={() => changeReviewFilter('all')}
                >
                  All moves <span>{reviewedResults.length}</span>
                </button>
                <button
                  aria-pressed={reviewFilter === 'key'}
                  onClick={() => changeReviewFilter('key')}
                  disabled={keyReviews.length === 0}
                >
                  Key moments <span>{keyReviews.length}</span>
                </button>
              </div>
              <span>{visibleReviews.length} moves shown</span>
            </div>

            <div className="review-layout">
              {selectedResult && (
                <Chessboard
                  result={selectedResult}
                  assessment={selectedReview!.assessment}
                  canGoPrevious={selectedIndex > 0}
                  canGoNext={selectedIndex < visibleReviews.length - 1}
                  onPrevious={() =>
                    setSelectedPly(visibleReviews[selectedIndex - 1]?.result.ply ?? selectedPly)
                  }
                  onNext={() =>
                    setSelectedPly(visibleReviews[selectedIndex + 1]?.result.ply ?? selectedPly)
                  }
                />
              )}
              <div className="result-list" aria-label="Analysed moves">
                {visibleReviews.map(({ result, assessment }) => {
                  return (
                    <button
                      className={`result-row ${selectedResult?.ply === result.ply ? 'result-selected' : ''}`}
                      key={result.ply}
                      onClick={() => setSelectedPly(result.ply)}
                    >
                      <div className="move-cell">
                        <span>{moveNumber(result.ply)}</span>
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
                        <small>Better move</small>
                        <code>{moveToSan(result.fen, result.bestMoveUci)}</code>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {run && (
          <div className="receipt">
            <strong>Analysis receipt</strong>
            <span>{engineName}</span>
            <span>{run.provenance.nodesPerPosition.toLocaleString()} nodes per position</span>
            <span>MultiPV {run.provenance.multiPv}</span>
            <span>Saved locally in this browser</span>
          </div>
        )}
      </section>

      <section className="next-layer">
        <p className="step">WHAT THIS DOES NOT CLAIM YET</p>
        <h2>Calculation is working. Coaching comes next.</h2>
        <p>
          These labels describe immediate engine loss using transparent thresholds. They do not yet
          explain the chess motif, compare the move with peers, or prove a recurring weakness.
        </p>
      </section>

      <footer>
        <span>Post-game study only · {engineName}</span>
        <a href="https://github.com/Shreyastacky/prophylens" rel="noreferrer">
          AGPL-3.0-or-later
        </a>
      </footer>
    </main>
  );
}
