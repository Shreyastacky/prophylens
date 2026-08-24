import { useEffect, useMemo, useRef, useState } from 'react';

import { parseGame } from './analysis/pgn';
import { downloadAnalysis, saveLastAnalysis, sha256 } from './analysis/storage';
import { StockfishClient } from './analysis/stockfish';
import type { AnalysisRun, AnalysisSettings, PositionAnalysis } from './analysis/types';
import { ENGINE_ASSET } from './analysis/types';

const examplePgn = `[Event "Example"]
[White "You"]
[Black "Training Partner"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *`;

type EngineStatus = 'idle' | 'loading' | 'ready' | 'analysing' | 'cancelled' | 'complete' | 'error';

interface ProgressState {
  completed: number;
  total: number;
  nodes: number;
  move: string;
}

function whitePerspectiveScore(result: PositionAnalysis): { cp?: number; mate?: number } {
  const line = result.lines[0];
  if (!line) return {};
  const direction = result.sideToMove === 'white' ? 1 : -1;
  return {
    cp: line.scoreCp === undefined ? undefined : line.scoreCp * direction,
    mate: line.mateIn === undefined ? undefined : line.mateIn * direction,
  };
}

function formatScore(result: PositionAnalysis): string {
  const score = whitePerspectiveScore(result);
  if (score.mate !== undefined) {
    return score.mate > 0 ? `M${score.mate}` : `-M${Math.abs(score.mate)}`;
  }
  if (score.cp === undefined) return '—';
  const pawns = score.cp / 100;
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
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

export function App() {
  const [pgn, setPgn] = useState(examplePgn);
  const [settings, setSettings] = useState<AnalysisSettings>({ nodes: 10_000, multiPv: 2 });
  const [status, setStatus] = useState<EngineStatus>('idle');
  const [engineName, setEngineName] = useState('Stockfish 18 Lite');
  const [results, setResults] = useState<PositionAnalysis[]>([]);
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  const ensureClient = () => {
    if (!clientRef.current) clientRef.current = new StockfishClient();
    return clientRef.current;
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
    setRun(null);
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
        setProgress((current) => ({ ...current, completed: completedResults.length }));
      }

      const finishedRun: AnalysisRun = {
        schemaVersion: 1,
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
        },
        positions: completedResults,
      };

      saveLastAnalysis(finishedRun);
      setRun(finishedRun);
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
    ? ((progress.completed + Math.min(progress.nodes / settings.nodes, 1)) / progress.total) * 100
    : 0;

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
        <div className="eyebrow">PRIVATE. TRANSPARENT. NOW CALCULATING.</div>
        <h1>Analyse a complete game on your own computer.</h1>
        <p>
          Paste a finished game. ProphyLens rebuilds every position and asks Stockfish for objective
          evidence in a background worker, so the page stays responsive and the PGN stays local.
        </p>
      </section>

      <section className="workspace" aria-labelledby="import-heading">
        <div>
          <p className="step">01 / IMPORT AND CALCULATE</p>
          <h2 id="import-heading">Start with a finished game</h2>
          <p className="muted">
            A node is one position inspected by Stockfish. More nodes improve stability but take
            longer. MultiPV controls how many candidate lines are saved.
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
          <label className="pgn-field">
            <span>PGN</span>
            <textarea
              value={pgn}
              onChange={(event) => setPgn(event.target.value)}
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
                {progress.nodes.toLocaleString()} / {settings.nodes.toLocaleString()} nodes in this
                position
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
            <p className="step">02 / RAW ENGINE EVIDENCE</p>
            <h2 id="results-heading">Every result keeps its receipt.</h2>
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
          <div className="result-list">
            {results.map((result) => (
              <article className="result-row" key={result.ply}>
                <div className="move-cell">
                  <span>{moveNumber(result.ply)}</span>
                  <strong>{result.san}</strong>
                </div>
                <div>
                  <small>White evaluation</small>
                  <strong className="evaluation">{formatScore(result)}</strong>
                </div>
                <div>
                  <small>Engine choice</small>
                  <code>{result.bestMoveUci}</code>
                </div>
                <div className="line-cell">
                  <small>Principal variation</small>
                  <code>
                    {result.lines[0]?.movesUci.slice(0, 6).join(' ') || 'No line returned'}
                  </code>
                </div>
              </article>
            ))}
          </div>
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
          These are raw Stockfish facts, not yet mistake labels or explanations. Motifs, peer
          comparisons and recurring-weakness lessons remain behind their own accuracy experiments.
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
