import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { parsePgnAsync } from './analysis/parseAsync';
import { MAX_PGN_BYTES, splitPgnGames } from './analysis/pgn';
import { StockfishClient } from './analysis/stockfish';
import {
  clearLibrary,
  corruptRecordCount,
  downloadAnalysis,
  downloadLibrary,
  downloadPgn,
  importGames,
  listGames,
  makeLibraryGame,
  MAX_LIBRARY_FILE_BYTES,
  migrateLegacy,
  readLibraryFile,
  removeGame,
  saveGame,
  sha256,
} from './analysis/storage';
import {
  ENGINE_ASSET,
  type AnalysisRun,
  type AnalysisSettings,
  type LibraryGame,
  type ParsedGame,
  type PlayerSide,
  type PositionAnalysis,
  type PracticeAttempt,
} from './analysis/types';
import { Review } from './Review';
import { Practice } from './Practice';
import { Appearance } from './Appearance';
import { GamePreview } from './GamePreview';
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck';
import { UploadSimple } from '@phosphor-icons/react/dist/csr/UploadSimple';
import { ArrowUpRight } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
const examplePgn =
  '[Event "Sample game"]\n[White "You"]\n[Black "Training Partner"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
type Status = 'idle' | 'loading' | 'ready' | 'analysing' | 'cancelled' | 'complete' | 'error';
const labels: Record<Status, string> = {
  idle: 'Engine idle',
  loading: 'Loading engine',
  ready: 'Engine ready',
  analysing: 'Analysing locally',
  cancelled: 'Analysis cancelled',
  complete: 'Analysis complete',
  error: 'Engine error',
};
export function App() {
  const [pgn, setPgn] = useState(examplePgn),
    [parsed, setParsed] = useState<ParsedGame | null>(null),
    [parseError, setParseError] = useState<string | null>(null),
    [validating, setValidating] = useState(true);
  const [parsedSource, setParsedSource] = useState<string | null>(null);
  const [settings, setSettings] = useState<AnalysisSettings>({ nodes: 10000, multiPv: 2 }),
    [status, setStatus] = useState<Status>('idle'),
    [engineName, setEngineName] = useState('Stockfish 18 Lite');
  const [results, setResults] = useState<PositionAnalysis[]>([]),
    [run, setRun] = useState<AnalysisRun | null>(null),
    [games, setGames] = useState<LibraryGame[]>([]),
    [active, setActive] = useState<LibraryGame | null>(null),
    [player, setPlayer] = useState<PlayerSide>('both');
  const [error, setError] = useState<string | null>(null),
    [warning, setWarning] = useState<string | null>(null),
    [fileError, setFileError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null),
    [fileName, setFileName] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]),
    [progress, setProgress] = useState({
      completed: 0,
      total: 0,
      nodes: 0,
      move: '',
      game: 1,
      count: 1,
    }),
    [libraryReady, setLibraryReady] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const clientRef = useRef<StockfishClient | null>(null),
    abortRef = useRef<AbortController | null>(null),
    operation = useRef(0);
  const focusReview = useRef(false);
  const [importing, setImporting] = useState(false);
  const busy = importing || status === 'loading' || status === 'analysing';
  const parsedMatches = parsed !== null && parsedSource === pgn;
  const showReview = results.length > 0 && !busy;
  useEffect(() => {
    if (!showReview || status !== 'complete' || !focusReview.current) return;
    focusReview.current = false;
    const heading = document.getElementById('results-heading');
    heading?.scrollIntoView({ block: 'start', behavior: 'instant' });
    heading?.focus({ preventScroll: true });
  }, [showReview, status]);
  function openGame(game: LibraryGame) {
    operation.current++;
    abortRef.current?.abort();
    clientRef.current?.terminate();
    clientRef.current = null;
    setPgn(game.pgn);
    setResults(game.analysis.positions);
    setRun(game.analysis);
    setActive(game);
    setPlayer(game.player);
    setQueue([]);
    setFileName(null);
    setStatus('complete');
    setError(null);
    setWarning(null);
    setFileError(null);
  }
  useEffect(() => {
    const abort = new AbortController();
    setValidating(true);
    setParsed(null);
    setParseError(null);
    const timer = setTimeout(() => {
      try {
        void parsePgnAsync(pgn, abort.signal)
          .then((game) => {
            if (!abort.signal.aborted) {
              setParsed(game);
              setParsedSource(pgn);
              setValidating(false);
            }
          })
          .catch((e) => {
            if (!abort.signal.aborted) {
              setParseError(e.message);
              setValidating(false);
            }
          });
      } catch (e) {
        setParseError(e instanceof Error ? e.message : 'Unable to read PGN');
        setValidating(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [pgn]);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      let migrationWarning: string | null = null;
      try {
        await migrateLegacy();
      } catch {
        migrationWarning =
          'An old receipt could not be migrated. Your original browser record was preserved.';
      }
      try {
        const saved = await listGames();
        if (mounted) {
          setGames(saved);
          if (saved[0]) openGame(saved[0]);
          if (migrationWarning) setWarning(migrationWarning);
          else if (corruptRecordCount)
            setWarning(
              `${corruptRecordCount} damaged record(s) were skipped. Valid games are still available. Clear library removes all records.`,
            );
        }
      } catch (e) {
        if (mounted)
          setWarning(
            e instanceof Error ? e.message : 'Browser storage unavailable. Downloads still work.',
          );
      } finally {
        if (mounted) setLibraryReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(
    () => () => {
      operation.current++;
      abortRef.current?.abort();
      clientRef.current?.terminate();
    },
    [],
  );
  function replacePgn(next: string, name: string | null) {
    if (next !== pgn) {
      setValidating(true);
      setParsed(null);
      setParsedSource(null);
      setParseError(null);
    }
    setPgn(next);
    setFileName(name);
    setQueue([]);
    setResults([]);
    setRun(null);
    setActive(null);
    setFileError(null);
    setError(null);
    setNotice(null);
    setStatus('idle');
  }
  async function importPgn(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pgn')) {
      setFileError('Choose a file ending in .pgn.');
      return;
    }
    if (file.size > MAX_PGN_BYTES) {
      setFileError('That PGN is larger than the 2 MB safety limit.');
      return;
    }
    setValidating(true);
    setImporting(true);
    try {
      const parts = splitPgnGames(await file.text());
      for (const part of parts) await parsePgnAsync(part);
      replacePgn(parts[0]!, file.name);
      setQueue(parts.slice(1));
      if (parts.length > 1)
        setNotice(`${parts.length} games ready. Analyse game will review and save each in order.`);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Could not import PGN.');
    } finally {
      setValidating(false);
      setImporting(false);
    }
  }
  function cancel() {
    operation.current++;
    abortRef.current?.abort();
    clientRef.current?.terminate();
    clientRef.current = null;
    abortRef.current = null;
    setStatus('cancelled');
  }
  async function restart() {
    cancel();
    const token = ++operation.current;
    const client = new StockfishClient();
    clientRef.current = client;
    setStatus('loading');
    setError(null);
    try {
      const name = await client.initialize();
      if (operation.current === token) {
        setEngineName(name);
        setStatus('ready');
      }
    } catch (e) {
      if (operation.current === token) {
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Unable to restart the engine.');
      }
    }
  }
  async function analyse() {
    if (!parsed || !parsedMatches || validating || busy || !libraryReady) return;
    focusReview.current = true;
    const token = ++operation.current,
      abort = new AbortController();
    abortRef.current = abort;
    const batch = [pgn, ...queue];
    setError(null);
    setWarning(null);
    setRun(null);
    setResults([]);
    setStatus('loading');
    setConfirmDelete(null);
    try {
      for (let index = 0; index < batch.length; index++) {
        if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const source = batch[index]!,
          game = index === 0 ? parsed : await parsePgnAsync(source, abort.signal);
        clientRef.current?.terminate();
        const client = new StockfishClient();
        clientRef.current = client;
        setPgn(source);
        setResults([]);
        setRun(null);
        setProgress({
          completed: 0,
          total: game.positions.length,
          nodes: 0,
          move: '',
          game: index + 1,
          count: batch.length,
        });
        const name = await client.initialize();
        if (abort.signal.aborted || token !== operation.current)
          throw new DOMException('Cancelled', 'AbortError');
        setEngineName(name);
        setStatus('analysing');
        const completed: PositionAnalysis[] = [];
        for (const position of game.positions) {
          if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          setProgress((current) => ({ ...current, nodes: 0, move: position.san }));
          const result = await client.analysePosition(position, settings, abort.signal, (nodes) => {
            if (operation.current === token) setProgress((current) => ({ ...current, nodes }));
          });
          completed.push(result);
          setResults([...completed]);
          setProgress((current) => ({ ...current, completed: completed.length }));
        }
        const finished: AnalysisRun = {
          schemaVersion: 3,
          pgn: source,
          createdAt: new Date().toISOString(),
          pgnSha256: await sha256(source),
          game: { headers: game.headers, plies: completed.length },
          positions: completed,
          provenance: {
            engine: 'Stockfish',
            engineVersion: name,
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
            classifierVersion: 'move-loss-v2',
            appVersion: '0.1.0-alpha.1',
            sourceRevision: import.meta.env.VITE_SOURCE_REVISION ?? 'development',
          },
        };
        if (operation.current !== token) return;
        // Completion is independent of storage: export remains available if saving fails.
        setRun(finished);
        const made = await makeLibraryGame(finished, player, active ?? undefined);
        const record = {
          ...made,
          attempts: games.find((g) => g.id === made.id)?.attempts ?? made.attempts,
        };
        setActive(record);
        try {
          await saveGame(record);
          const saved = await listGames();
          if (operation.current === token) setGames(saved);
        } catch (e) {
          if (operation.current === token)
            setWarning(
              e instanceof Error
                ? e.message
                : 'Could not save. Download your review before leaving.',
            );
        }
      }
      if (operation.current === token) {
        setStatus('complete');
        setQueue([]);
        setNotice(
          batch.length > 1
            ? `Reviewed ${batch.length} games. Check the library for saved reviews.`
            : null,
        );
      }
    } catch (e) {
      if (operation.current !== token) return;
      if (e instanceof DOMException && e.name === 'AbortError') setStatus('cancelled');
      else {
        setStatus('error');
        setError(
          e instanceof Error ? e.message : 'Analysis failed. Restart the engine and try again.',
        );
        clientRef.current?.terminate();
        clientRef.current = null;
      }
    } finally {
      if (operation.current === token) abortRef.current = null;
    }
  }
  async function persist(record: LibraryGame) {
    setActive(record);
    setGames((current) => current.map((g) => (g.id === record.id ? record : g)));
    try {
      await saveGame(record);
    } catch (e) {
      setWarning(e instanceof Error ? e.message : 'Could not save changes. Export a backup.');
    }
  }
  function changePlayer(side: PlayerSide) {
    setPlayer(side);
    if (active) void persist({ ...active, player: side, updatedAt: new Date().toISOString() });
  }
  async function recordAttempt(game: LibraryGame, attempt: PracticeAttempt) {
    const next = {
      ...game,
      attempts: [...game.attempts, attempt],
      updatedAt: new Date().toISOString(),
    };
    setGames((current) => current.map((g) => (g.id === game.id ? next : g)));
    if (active?.id === game.id) setActive(next);
    try {
      await saveGame(next);
    } catch {
      setWarning(
        'Practice was recorded for this session, but could not be saved. Export a library backup before leaving.',
      );
    }
  }
  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > MAX_LIBRARY_FILE_BYTES) {
      setWarning('The backup exceeds the 20 MB limit.');
      return;
    }
    setImporting(true);
    try {
      const records = await readLibraryFile(await file.text());
      await importGames(records);
      const saved = await listGames();
      setGames(saved);
      if (records[0]) openGame(saved.find((g) => g.id === records[0]!.id)!);
      setNotice(`Imported ${records.length} review(s). Duplicate games were combined.`);
    } catch (e) {
      setWarning(e instanceof Error ? e.message : 'Could not import backup.');
    } finally {
      setImporting(false);
    }
  }
  async function deleteConfirmed(id: string) {
    setImporting(true);
    try {
      if (id === 'all') {
        await clearLibrary();
        setGames([]);
      } else {
        await removeGame(id);
        setGames(await listGames());
      }
      if (id === 'all' || active?.id === id) {
        setActive(null);
        setRun(null);
        setResults([]);
        setStatus('idle');
      }
      setConfirmDelete(null);
    } catch (e) {
      setWarning(e instanceof Error ? e.message : 'Could not delete game.');
    } finally {
      setImporting(false);
    }
  }
  const progressPercent = progress.total
    ? Math.min(100, (progress.completed / progress.total) * 100)
    : 0;
  const libraryBytes = new TextEncoder().encode(JSON.stringify(games)).length;
  return (
    <main>
      <a className="skip-link" href="#import-heading">
        Skip to game import
      </a>
      <nav className="nav" aria-label="Primary navigation">
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <span>
            ProphyLens <small>ALPHA</small>
          </span>
        </a>
        <div className="nav-links">
          <a href="#library">Library</a>
          <a href="#practice">Practice</a>
          <Appearance />
          <span className={`status status-${status}`} role="status">
            {labels[status]}
          </span>
        </div>
      </nav>
      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">YOUR PRIVATE CHESS STUDIO</div>
          <h1>Find the moves that changed your game.</h1>
          <p>
            Review completed games with Stockfish, keep your work in this browser, and practise the
            moves you missed.
          </p>
          <a className="studio-shortcut secondary-button" href="#import-heading">
            New review <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
        <div className="privacy-chip">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            On your device.
            <br />
            <strong>In your control.</strong>
          </span>
        </div>
      </section>
      <div className={`studio-stage ${showReview ? 'has-review' : 'is-preview'}`}>
        <section className="results" aria-labelledby="results-heading">
          <div className="results-header">
            <div>
              <p className="step">{showReview ? 'Move review' : 'Game preview'}</p>
              <h2 id="results-heading" tabIndex={-1}>
                {showReview ? 'See what changed when you moved.' : 'Your board. Your next insight.'}
              </h2>
            </div>
            {run && (
              <div className="actions">
                <button className="secondary-button" onClick={() => downloadAnalysis(run)}>
                  Download evidence
                </button>
                <button className="text-button" onClick={() => downloadPgn(run)}>
                  Export PGN
                </button>
              </div>
            )}
          </div>
          {showReview ? (
            <Review results={results} player={player} onPlayer={changePlayer} />
          ) : (
            <GamePreview game={parsedMatches ? parsed : null} />
          )}
          {run && showReview && (
            <div className="receipt">
              <strong>Analysis receipt</strong>
              <span>{run.provenance.engineVersion}</span>
              <span>{run.provenance.nodesPerPosition.toLocaleString()} nodes per position</span>
              <span>MultiPV {run.provenance.multiPv}</span>
              <span>Current labels: move-loss-v2</span>
              <span>
                {games.some((g) => g.id === active?.id)
                  ? 'Saved locally in this browser'
                  : 'In memory · download to keep'}
              </span>
            </div>
          )}
        </section>
        <section className="workspace" aria-labelledby="import-heading">
          <div>
            <p className="step">A NEW REVIEW</p>
            <h2 id="import-heading">Import your game</h2>
            <p className="muted">
              Start with Quick analysis. For close decisions, use a deeper second opinion. Standard
              chess · post-game study only.
            </p>
            <div className="settings" aria-label="Analysis settings">
              <label>
                Nodes per position
                <select
                  value={settings.nodes}
                  onChange={(e) => setSettings((s) => ({ ...s, nodes: Number(e.target.value) }))}
                  disabled={busy}
                >
                  <option value="10000">10,000 · quick</option>
                  <option value="50000">50,000 · balanced</option>
                  <option value="100000">100,000 · deeper</option>
                </select>
              </label>
              <label>
                Candidate lines
                <select
                  value={settings.multiPv}
                  onChange={(e) => setSettings((s) => ({ ...s, multiPv: Number(e.target.value) }))}
                  disabled={busy}
                >
                  <option value="1">1 line</option>
                  <option value="2">2 lines</option>
                  <option value="3">3 lines</option>
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
                  onChange={(e) => void importPgn(e)}
                  disabled={busy || !libraryReady}
                />
                <UploadSimple size={17} aria-hidden="true" /> Choose .pgn file
              </label>
              <span>
                {fileName
                  ? `${fileName} loaded locally`
                  : 'Maximum 2 MB · up to 100 games · never uploaded'}
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
                onChange={(e) => replacePgn(e.target.value, null)}
                spellCheck={false}
                disabled={busy}
                maxLength={MAX_PGN_BYTES}
              />
              <small className={parseError ? 'parse-error' : 'parse-ok'}>
                {validating
                  ? 'Checking your game…'
                  : (parseError ??
                    `${parsed?.positions.length ?? 0} half-moves ready for local analysis`)}
              </small>
            </label>
            <div className="actions">
              <button
                className="primary-button"
                onClick={() => void analyse()}
                disabled={!parsedMatches || validating || busy || !libraryReady}
              >
                Analyse game <ArrowUpRight size={17} aria-hidden="true" />
              </button>
              {busy ? (
                <button className="secondary-button" onClick={cancel}>
                  Cancel
                </button>
              ) : (
                <>
                  <button className="secondary-button" onClick={() => void restart()}>
                    Restart engine
                  </button>
                  <button className="text-button" onClick={() => replacePgn(examplePgn, null)}>
                    Load sample
                  </button>
                </>
              )}
            </div>
            {busy && (
              <div className="progress-panel" aria-live="polite">
                <div>
                  <span>
                    {status === 'loading'
                      ? 'Loading the 7 MB engine'
                      : `Analysing ${progress.move}`}
                  </span>
                  <span>
                    {progress.completed}/{progress.total} positions
                  </span>
                </div>
                <progress aria-label="Analysis progress" value={progressPercent} max="100" />
                <small>
                  Game {progress.game}/{progress.count} · {progress.nodes.toLocaleString()} nodes in
                  this position
                </small>
              </div>
            )}
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
      </div>
      {warning && (
        <p className="storage-warning" role="alert">
          {warning}
          <button className="text-button" onClick={() => setWarning(null)}>
            Dismiss
          </button>
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <section id="library" className="library-section" aria-labelledby="library-heading">
        <div className="results-header">
          <div>
            <p className="step">YOUR LOCAL LIBRARY</p>
            <h2 id="library-heading">Your games, ready when you return.</h2>
          </div>
          <div className="actions">
            <button
              className="secondary-button"
              disabled={!games.length || busy}
              onClick={() => downloadLibrary(games)}
            >
              Export library
            </button>
            <label className="secondary-button file-button">
              <input
                type="file"
                accept=".json,application/json"
                aria-label="Import library backup"
                disabled={busy}
                onChange={(e) => void importBackup(e)}
              />
              Import backup
            </label>
            <button
              className="text-button"
              disabled={!games.length || busy}
              onClick={() => setConfirmDelete('all')}
            >
              Clear library
            </button>
          </div>
        </div>
        <p className="muted">
          {games.length} saved games · {(libraryBytes / 1024).toFixed(1)} KB of review data · saved
          on this device only
        </p>
        {confirmDelete && (
          <div className="delete-confirm" role="group" aria-label="Confirm deletion">
            <p>
              {confirmDelete === 'all'
                ? 'Delete all saved games and practice attempts from this browser?'
                : 'Delete this game and its practice attempts?'}
            </p>
            <button className="secondary-button" onClick={() => setConfirmDelete(null)}>
              Keep games
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => void deleteConfirmed(confirmDelete)}
            >
              Confirm delete
            </button>
          </div>
        )}
        <div className="library-grid">
          {games.map((game) => (
            <article
              className={`library-card ${game.id === active?.id ? 'library-active' : ''}`}
              key={game.id}
            >
              <span className="eyebrow">{game.analysis.game.headers.Event ?? 'Imported game'}</span>
              <h3>
                {game.analysis.game.headers.White ?? 'White'} <span>vs</span>{' '}
                {game.analysis.game.headers.Black ?? 'Black'}
              </h3>
              <p>
                {game.analysis.game.plies} half-moves · {game.analysis.game.headers.Result ?? '*'} ·{' '}
                {new Date(game.updatedAt).toLocaleDateString()}
              </p>
              <div className="actions">
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => {
                    focusReview.current = true;
                    openGame(game);
                  }}
                  aria-label={`Open ${game.analysis.game.headers.White ?? 'White'} vs ${game.analysis.game.headers.Black ?? 'Black'}`}
                >
                  Open review
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(game.id)}
                  aria-label={`Delete ${game.analysis.game.headers.White ?? 'White'} vs ${game.analysis.game.headers.Black ?? 'Black'}`}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
        {!games.length && (
          <p className="empty-state">
            Completed reviews appear here automatically. Export a backup before clearing browser
            data.
          </p>
        )}
      </section>
      <Practice games={games} onAttempt={recordAttempt} />
      <section className="next-layer" id="privacy">
        <h2>Study locally. Keep control.</h2>
        <p>
          Games, reviews and practice attempts stay in this browser's IndexedDB. No accounts,
          analytics or PGN uploads. The hosting provider may use security cookies and bot-protection
          scripts, and receives ordinary page and asset requests, including IP and request metadata.
          Browser data is not encrypted against someone with access to your device.
        </p>
        <details>
          <summary>Privacy, accuracy and fair play</summary>
          <p>
            Use completed games only. Quick engine searches can change at deeper budgets; labels are
            transparent estimates of immediate move loss, not validated coaching diagnoses. Practice
            compares against a recorded engine choice. Peer comparison, recurring motif diagnosis
            and measured long-term improvement remain research work. Mobile support is experimental;
            start with Quick analysis.
          </p>
          <p>
            Deleting a game removes its review and practice attempts. Clear library deletes all
            local records. Downloaded backups remain wherever you saved them. External GitHub links
            leave this site.
          </p>
        </details>
      </section>
      <footer>
        <span>Post-game study only · ProphyLens 0.1.0 alpha · {engineName}</span>
        <div className="footer-links">
          <a href="#privacy">Privacy</a>
          <a href="https://github.com/Shreyastacky/prophylens/issues/new/choose">Feedback</a>
          <a href="https://github.com/Shreyastacky/prophylens">Source · AGPL-3.0-or-later</a>
          <a href="/engine/COPYING.txt">Stockfish licence</a>
          <a href="/THIRD_PARTY_NOTICES.txt">Asset licences</a>
        </div>
      </footer>
    </main>
  );
}
