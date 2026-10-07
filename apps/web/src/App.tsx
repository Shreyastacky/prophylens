import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { parsePgnAsync } from './analysis/parseAsync';
import { MAX_PGN_BYTES, splitPgnGames } from './analysis/pgn';
import { StockfishClient } from './analysis/stockfish';
import {
  clearLibrary,
  corruptRecordCount,
  downloadAnalysis,
  downloadLibrary,
  downloadPgn,
  listGames,
  makeLibraryGame,
  migrateLegacy,
  getGame,
  appendAttempt,
  updatePlayer,
  saveAnalysis,
  StorageConflict,
  subscribeLibrary,
  removeGame,
  sha256,
} from './analysis/storage';
import { importLibraryAsync } from './analysis/storageAsync';
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
  const batchRef = useRef<{ sources: string[]; cursor: number } | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [unsaved, setUnsaved] = useState<LibraryGame[]>([]);
  const [damaged, setDamaged] = useState(0);
  const [progress, setProgress] = useState({
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
  const [importing, setImporting] = useState<'pgn' | 'backup' | 'delete' | 'player' | null>(null);
  const busy = importing !== null || status === 'loading' || status === 'analysing';
  const libraryRead = useRef(0);
  const view = useRef({ active, busy, player });
  view.current = { active, busy, player };
  async function readLatestLibrary() {
    const revision = ++libraryRead.current;
    const saved = await listGames();
    return revision === libraryRead.current ? saved : null;
  }
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
    batchRef.current = null;
    setRemaining(0);
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
        const saved = await readLatestLibrary();
        if (mounted && saved) {
          setGames(saved);
          setDamaged(corruptRecordCount);
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
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const saved = await readLatestLibrary();
        if (!mounted || !saved) return;
        setGames(saved);
        setDamaged(corruptRecordCount);
        const currentView = view.current;
        if (currentView.active && !currentView.busy) {
          const current = saved.find((g) => g.id === currentView.active!.id);
          setActive(current ?? null);
          setPlayer(current?.player ?? currentView.player);
          setRun(current?.analysis ?? null);
          setResults(current?.analysis.positions ?? []);
        }
      } catch (e) {
        if (mounted) setWarning(e instanceof Error ? e.message : 'Could not refresh library.');
      }
    };
    const unsubscribe = subscribeLibrary(() => {
      void refresh();
    });
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      mounted = false;
      unsubscribe();
      window.removeEventListener('focus', onFocus);
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
    batchRef.current = null;
    setRemaining(0);
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
    const token = ++operation.current;
    const abort = new AbortController();
    abortRef.current = abort;
    setFileError(null);
    setNotice(null);
    setImporting('pgn');
    try {
      const parts = splitPgnGames(await file.text());
      for (const part of parts) await parsePgnAsync(part, abort.signal);
      if (operation.current !== token || abort.signal.aborted) return;
      replacePgn(parts[0]!, file.name);
      batchRef.current = { sources: parts, cursor: 0 };
      setRemaining(parts.length);
      if (parts.length > 1)
        setNotice(`${parts.length} games ready. Analyse game will review and save each in order.`);
    } catch (e) {
      if (operation.current === token && !abort.signal.aborted)
        setFileError(e instanceof Error ? e.message : 'Could not import PGN.');
    } finally {
      if (operation.current === token) {
        abortRef.current = null;
        setImporting(null);
      }
    }
  }
  function cancel() {
    operation.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    if (importing === 'pgn') {
      setImporting(null);
      setNotice('PGN import cancelled. Your current game was kept.');
      return;
    }
    clientRef.current?.terminate();
    clientRef.current = null;
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
    const batchState = batchRef.current ?? { sources: [pgn], cursor: 0 };
    batchRef.current = batchState;
    const batch = batchState.sources;
    setError(null);
    setWarning(null);
    setRun(null);
    setResults([]);
    setStatus('loading');
    setConfirmDelete(null);
    try {
      for (let index = batchState.cursor; index < batch.length; index++) {
        if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const source = batch[index]!,
          game = await parsePgnAsync(source, abort.signal);
        const identity = await sha256(
          game.positions[0]!.fen + '|' + game.positions.map((p) => p.moveUci).join(' '),
        );
        const expected = await getGame(identity).catch((e) => {
          setWarning(
            e instanceof Error
              ? e.message
              : 'Storage is unavailable. Download your completed review.',
          );
          return undefined;
        });
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
            appVersion: import.meta.env.VITE_APP_VERSION ?? 'development',
            sourceRevision: import.meta.env.VITE_SOURCE_REVISION ?? 'development',
          },
        };
        if (operation.current !== token) return;
        // Completion is independent of storage: export remains available if saving fails.
        setRun(finished);
        const record = await makeLibraryGame(finished, player, expected);
        if (operation.current !== token || abort.signal.aborted) return;
        setActive(record);
        try {
          const committed = await saveAnalysis(record, expected?.analysis);
          // Advance only after completing a review, so cancelling the next
          // game resumes at that game and never repeats completed reviews.
          batchState.cursor = index + 1;
          setRemaining(batch.length - batchState.cursor);
          const saved = await readLatestLibrary();
          if (operation.current === token && saved) {
            setGames(saved);
            const latest = saved.find((g) => g.id === committed.id);
            setActive(latest ?? null);
            setPlayer(latest?.player ?? committed.player);
          }
          if (operation.current !== token || abort.signal.aborted) return;
        } catch (e) {
          if (operation.current === token) {
            setUnsaved((current) => [...current, record]);
            batchState.cursor = index + 1;
            setRemaining(batch.length - batchState.cursor);
            setStatus('complete');
            setNotice(
              'Batch paused. Download the unsaved review before resuming the remaining games.',
            );
            setWarning(
              e instanceof Error
                ? e.message
                : 'Could not save. Download your review before leaving.',
            );
          }
          return;
        }
      }
      if (operation.current === token) {
        setStatus('complete');
        batchRef.current = null;
        setRemaining(0);
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
  async function changePlayer(side: PlayerSide) {
    if (busy) return;
    setPlayer(side);
    if (!active) return;
    setImporting('player');
    try {
      await updatePlayer(active.id, side);
      const saved = await readLatestLibrary();
      if (!saved || view.current.active?.id !== active.id) return;
      setGames(saved);
      const current = saved.find((g) => g.id === active.id);
      setActive(current ?? null);
      setPlayer(current?.player ?? side);
      setRun(current?.analysis ?? null);
      setResults(current?.analysis.positions ?? []);
    } catch (e) {
      setWarning(e instanceof Error ? e.message : 'Could not save changes. Export a backup.');
      if (!(e instanceof StorageConflict))
        setUnsaved((current) => [
          ...current,
          { ...active, player: side, updatedAt: new Date().toISOString() },
        ]);
    } finally {
      setImporting(null);
    }
  }
  async function recordAttempt(game: LibraryGame, attempt: PracticeAttempt) {
    if (view.current.busy)
      throw new StorageConflict(
        'Practice is paused while the library is changing. Try again afterwards.',
      );
    try {
      await appendAttempt(game, attempt);
      const saved = await readLatestLibrary();
      if (!saved) return;
      setGames(saved);
      if (active?.id === game.id) setActive(saved.find((g) => g.id === game.id) ?? null);
    } catch (e) {
      if (e instanceof StorageConflict) throw e;
      const next = {
        ...game,
        attempts: [...game.attempts, attempt],
        updatedAt: new Date().toISOString(),
      };
      setUnsaved((current) => [...current, next]);
      setWarning(
        'Practice could not be saved. Download unsaved reviews to keep this attempt before leaving.',
      );
    }
  }
  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setImporting('backup');
    setNotice(null);
    try {
      const checked = await importLibraryAsync(file);
      libraryRead.current++;
      const saved = checked.games;
      setGames(saved);
      setDamaged(checked.corrupt);
      const first = saved.find((g) => g.id === checked.importedIds?.[0]);
      if (first) openGame(first);
      setNotice(
        `Imported ${checked.importedIds?.length ?? 0} review(s). Duplicate games were combined.`,
      );
    } catch (e) {
      setWarning(e instanceof Error ? e.message : 'Could not import backup.');
    } finally {
      setImporting(null);
    }
  }
  async function deleteConfirmed(id: string) {
    libraryRead.current++;
    setImporting('delete');
    try {
      if (id === 'all') {
        await clearLibrary();
        setGames([]);
        setDamaged(0);
      } else {
        await removeGame(id);
        const saved = await readLatestLibrary();
        if (saved) setGames(saved);
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
      setImporting(null);
    }
  }
  const progressPercent = progress.total
    ? Math.min(100, (progress.completed / progress.total) * 100)
    : 0;
  const libraryBytes = useMemo(
    () => new TextEncoder().encode(JSON.stringify(games)).length,
    [games],
  );
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
                {remaining > 0 && batchRef.current?.cursor ? 'Resume batch' : 'Analyse game'}{' '}
                <ArrowUpRight size={17} aria-hidden="true" />
              </button>
              {busy && (importing === null || importing === 'pgn') ? (
                <button className="secondary-button" onClick={cancel}>
                  Cancel
                </button>
              ) : !busy ? (
                <>
                  <button className="secondary-button" onClick={() => void restart()}>
                    Restart engine
                  </button>
                  <button className="text-button" onClick={() => replacePgn(examplePgn, null)}>
                    Load sample
                  </button>
                </>
              ) : null}
            </div>
            {busy && (
              <div className="progress-panel" aria-live="polite">
                <div>
                  <span>
                    {importing === 'pgn'
                      ? 'Reading your PGN file'
                      : importing === 'backup'
                        ? 'Restoring your library'
                        : importing === 'delete'
                          ? 'Updating your library'
                          : status === 'loading'
                            ? 'Loading the 7 MB engine'
                            : `Analysing ${progress.move}`}
                  </span>
                  {!importing && (
                    <span>
                      {progress.completed}/{progress.total} positions
                    </span>
                  )}
                </div>
                <progress
                  aria-label={importing ? 'Import progress' : 'Analysis progress'}
                  value={importing ? undefined : progressPercent}
                  max="100"
                />
                {!importing && (
                  <small>
                    Game {progress.game}/{progress.count} · {progress.nodes.toLocaleString()} nodes
                    in this position
                  </small>
                )}
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
      {unsaved.length > 0 && (
        <section className="storage-warning" aria-label="Unsaved reviews">
          <p>
            {unsaved.length} unsaved completed review(s) retained in this session. Download before
            leaving.
          </p>
          <button className="secondary-button" onClick={() => downloadLibrary(unsaved)}>
            Download unsaved reviews
          </button>
          {unsaved.map((game, i) => (
            <button className="text-button" key={i} onClick={() => downloadAnalysis(game.analysis)}>
              Download unsaved evidence {i + 1}
            </button>
          ))}
        </section>
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
              disabled={(!games.length && !damaged) || busy || !libraryReady}
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
      <Practice games={games} onAttempt={recordAttempt} disabled={busy} />
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
        <span>
          Post-game study only · ProphyLens {import.meta.env.VITE_APP_VERSION ?? 'development'} ·{' '}
          {engineName}
        </span>
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
