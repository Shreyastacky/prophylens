import { Chess } from 'chess.js';
import type {
  AnalysisRun,
  EngineLine,
  LibraryGame,
  PlayerSide,
  PositionAnalysis,
  PracticeAttempt,
} from './types';
import { parseGame } from './pgn';
import { validateRowsAsync, readStoredLibraryAsync } from './storageAsync';
import { legalVariation } from './variation';
import { assessMove } from './classification';
import { recordedPracticeAssessment, isAcceptedPracticeMove } from './practice-assessment';
const DB_NAME = 'prophylens-library';
const LEGACY_KEY = 'prophylens:last-analysis:v2';
// Backups have no library-wide count/byte limit: export and restore share the
// same per-record schema. Memory/storage exhaustion is reported, never truncated.
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('games', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error('Browser storage is unavailable. You can still download your review.'));
    request.onblocked = () =>
      reject(new Error('Close other ProphyLens tabs and try saving again.'));
  });
}
function startTransaction(db: IDBDatabase, mode: IDBTransactionMode): IDBTransaction {
  try {
    return db.transaction('games', mode);
  } catch (e) {
    db.close();
    throw e;
  }
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = startTransaction(db, mode);
    let request: IDBRequest<T>;
    try {
      request = action(tx.objectStore('games'));
    } catch (e) {
      tx.abort();
      db.close();
      reject(e);
      return;
    }
    let value: T;
    request.onsuccess = () => {
      value = request.result;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        new Error(
          'Could not save your library. Browser storage may be full or blocked. Download a backup.',
        ),
      );
    };
  });
}
export let corruptRecordCount = 0;
export async function listGames(validate = validateRowsAsync): Promise<LibraryGame[]> {
  // Read IndexedDB in the worker itself, avoiding two extra full-library clones.
  const checked =
    typeof window !== 'undefined' && typeof Worker !== 'undefined' && validate === validateRowsAsync
      ? await readStoredLibraryAsync()
      : await validate((await transaction('readonly', (store) => store.getAll())) as unknown[]);
  corruptRecordCount = checked.corrupt;
  return checked.games.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function validateRows(
  rows: unknown[],
): Promise<{ games: LibraryGame[]; corrupt: number }> {
  const valid: LibraryGame[] = [];
  let corrupt = 0;
  for (const row of rows) {
    try {
      valid.push(await validateLibraryGame(row));
    } catch {
      corrupt++;
    }
  }
  return { games: valid, corrupt };
}
export function getGame(id: string): Promise<LibraryGame | undefined> {
  return transaction('readonly', (store) => store.get(id));
}
export class StorageConflict extends Error {}
function canonicalJson(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}
function sameAnalysis(a: AnalysisRun | undefined, b: AnalysisRun | undefined): boolean {
  // Validation normalizes property order; it must not make unchanged engine
  // evidence look stale. Compare the complete content, with sorted object keys.
  return canonicalJson(a) === canonicalJson(b);
}
// The get and put share one readwrite transaction. IndexedDB serializes these
// across tabs too; no asynchronous work is allowed between the read and write.
async function mutateGame(
  id: string,
  change: (current: LibraryGame | undefined) => LibraryGame,
): Promise<LibraryGame> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = startTransaction(db, 'readwrite');
    const store = tx.objectStore('games');
    let result: LibraryGame;
    let failure: unknown;
    const read = store.get(id);
    read.onsuccess = () => {
      try {
        result = change(read.result);
        store.put(result);
      } catch (e) {
        failure = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      announceLibraryChange();
      resolve(result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        failure ?? new Error('Could not save your library. Download a backup before leaving.'),
      );
    };
  });
}
export function mergeGames(prior: LibraryGame | undefined, incoming: LibraryGame): LibraryGame {
  if (!prior) return incoming;
  // Newest metadata/player choice wins. Analysis has its own creation clock,
  // so a later practice attempt cannot replace a more recent analysis.
  const winner = (a: LibraryGame, b: LibraryGame) => {
    const order = Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
    // Only player is independent of analysis/history in schema 1. Ties use
    // lexical player order, independent of arrival order and history size.
    return order > 0 || (order === 0 && a.player >= b.player) ? a : b;
  };
  const metadata = winner(prior, incoming);
  const analysisOrder =
    Date.parse(prior.analysis.createdAt) - Date.parse(incoming.analysis.createdAt);
  const analysis =
    analysisOrder > 0
      ? prior.analysis
      : analysisOrder < 0
        ? incoming.analysis
        : canonicalJson(prior.analysis)! >= canonicalJson(incoming.analysis)!
          ? prior.analysis
          : incoming.analysis;
  return {
    ...metadata,
    analysis,
    pgn: analysis.pgn,
    attempts: mergeAttempts(prior.attempts, incoming.attempts),
  };
}
export function mergeAttempts(a: PracticeAttempt[], b: PracticeAttempt[]): PracticeAttempt[] {
  const unique = new Map<string, PracticeAttempt>();
  for (const attempt of [...a, ...b]) {
    const key = `${attempt.ply}|${attempt.moveUci}|${Date.parse(attempt.attemptedAt)}`;
    const existing = unique.get(key);
    if (
      !existing ||
      (!existing.comparison && attempt.comparison) ||
      (!!existing.comparison === !!attempt.comparison &&
        JSON.stringify(attempt) > JSON.stringify(existing))
    )
      unique.set(key, attempt);
  }
  return [...unique.values()].sort((x, y) => Date.parse(x.attemptedAt) - Date.parse(y.attemptedAt));
}
export async function saveGame(game: LibraryGame): Promise<void> {
  await mutateGame(game.id, (current) => mergeGames(current, game));
}
export async function saveAnalysis(
  game: LibraryGame,
  expected: AnalysisRun | undefined,
): Promise<LibraryGame> {
  return mutateGame(game.id, (current) => {
    if (!sameAnalysis(current?.analysis, expected))
      throw new StorageConflict(
        'This game was changed or deleted in another operation. Your completed review is available to download.',
      );
    return {
      ...game,
      player: current?.player ?? game.player,
      attempts: current?.attempts ?? game.attempts,
    };
  });
}
export async function updatePlayer(id: string, player: PlayerSide): Promise<LibraryGame> {
  return mutateGame(id, (current) => {
    if (!current) throw new StorageConflict('This game was deleted. Open another saved game.');
    return { ...current, player, updatedAt: new Date().toISOString() };
  });
}
export async function appendAttempt(
  game: LibraryGame,
  attempt: PracticeAttempt,
): Promise<LibraryGame> {
  return mutateGame(game.id, (current) => {
    if (
      !current ||
      !sameAnalysis(current.analysis, game.analysis) ||
      current.player !== game.player
    )
      throw new StorageConflict(
        'This practice position changed or was deleted. Try the current position again.',
      );
    return {
      ...current,
      attempts: mergeAttempts(current.attempts, [attempt]),
      updatedAt: new Date().toISOString(),
    };
  });
}
export async function removeGame(id: string): Promise<void> {
  await transaction('readwrite', (store) => store.delete(id));
  announceLibraryChange();
}
export async function clearLibrary(): Promise<void> {
  await transaction('readwrite', (store) => store.clear());
  corruptRecordCount = 0;
  announceLibraryChange();
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* legacy storage can be unavailable independently */
  }
}
export async function makeLibraryGame(
  run: AnalysisRun,
  player: PlayerSide,
  previous?: LibraryGame,
): Promise<LibraryGame> {
  const id = await sha256(
    run.positions[0]!.fen + '|' + run.positions.map((p) => p.playedMoveUci).join(' '),
  );
  return {
    schemaVersion: 1,
    id,
    pgn: run.pgn,
    analysis: run,
    player,
    updatedAt: new Date().toISOString(),
    attempts: previous?.id === id ? previous.attempts : [],
  };
}
export function downloadJson(value: unknown, name: string): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadAnalysis(run: AnalysisRun): void {
  downloadJson(run, `prophylens-analysis-${run.createdAt.replace(/[:.]/g, '-')}.json`);
}
export function downloadPgn(run: AnalysisRun): void {
  const url = URL.createObjectURL(new Blob([run.pgn], { type: 'application/x-chess-pgn' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'prophylens-game.pgn';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadLibrary(games: LibraryGame[]): void {
  downloadJson(
    { format: 'prophylens-library', schemaVersion: 1, exportedAt: new Date().toISOString(), games },
    'prophylens-library.json',
  );
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid review record.');
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 10000): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid text in review.');
  return value;
}
function integer(value: unknown, max = 1e12): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max)
    throw new Error('Invalid number in review.');
  return value;
}
function timestamp(value: unknown): string {
  const v = text(value, 100);
  if (!Number.isFinite(Date.parse(v))) throw new Error('Invalid review date.');
  return v;
}
function lineFrom(value: unknown, fen: string): EngineLine {
  const item = object(value);
  if (!Array.isArray(item.movesUci) || item.movesUci.length > 200)
    throw new Error('Invalid variation.');
  const moves = item.movesUci.map((v) => text(v, 5));
  if (!moves.length || !legalVariation(fen, moves))
    throw new Error('Review contains an illegal variation.');
  const line: EngineLine = {
    rank: integer(item.rank, 3),
    depth: integer(item.depth, 256),
    nodes: integer(item.nodes),
    movesUci: moves,
    scoreBound:
      item.scoreBound === undefined ? 'exact' : (item.scoreBound as EngineLine['scoreBound']),
  };
  if (line.rank < 1) throw new Error('Candidate ranks must be positive.');
  if (item.selectiveDepth !== undefined) line.selectiveDepth = integer(item.selectiveDepth, 256);
  if (!['exact', 'lower', 'upper', 'unknown'].includes(line.scoreBound!))
    throw new Error('Invalid score bound.');
  for (const key of ['scoreCp', 'mateIn'] as const) {
    if (item[key] !== undefined) {
      const n = item[key];
      if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1000000)
        throw new Error('Invalid evaluation.');
      line[key] = n;
    }
  }
  if (line.scoreCp !== undefined && line.mateIn !== undefined)
    throw new Error('A line cannot contain both centipawn and mate scores.');
  if (line.mateIn !== undefined && !Number.isInteger(line.mateIn))
    throw new Error('Mate distances must be integers.');
  if (line.scoreCp === undefined && line.mateIn === undefined) line.scoreBound = 'unknown';
  if (item.wdl !== undefined) {
    const w = object(item.wdl);
    const win = integer(w.win, 1000),
      draw = integer(w.draw, 1000),
      loss = integer(w.loss, 1000);
    if (win + draw + loss !== 1000) throw new Error('Invalid WDL.');
    line.wdl = { win, draw, loss };
  }
  return line;
}
function reconstructPgn(positions: unknown[], headers: Record<string, unknown>): string {
  const first = object(positions[0]);
  const game = new Chess(text(first.fen, 200));
  for (const [key, value] of Object.entries(headers))
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) game.setHeader(key, text(value));
  for (const pos of positions) {
    const uci = text(object(pos).playedMoveUci, 5);
    game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  }
  return game.pgn();
}
export async function validateAnalysis(value: unknown): Promise<AnalysisRun> {
  const r = object(value);
  if (r.schemaVersion !== 2 && r.schemaVersion !== 3)
    throw new Error('Unsupported review version.');
  if (!Array.isArray(r.positions) || !r.positions.length || r.positions.length > 600)
    throw new Error('Invalid review positions.');
  const g = object(r.game);
  const pgn =
    r.schemaVersion === 3
      ? text(r.pgn, 2 * 1024 * 1024)
      : reconstructPgn(r.positions, object(g.headers));
  const parsed = parseGame(pgn);
  if (parsed.positions.length !== r.positions.length || g.plies !== r.positions.length)
    throw new Error('The review does not match its game.');
  const hash = await sha256(pgn);
  if (r.schemaVersion === 3 && hash !== r.pgnSha256)
    throw new Error('The game checksum does not match its review.');
  const positions: PositionAnalysis[] = r.positions.map((v, index) => {
    const p = object(v),
      expected = parsed.positions[index]!;
    if (
      p.fen !== expected.fen ||
      p.playedMoveUci !== expected.moveUci ||
      p.sideToMove !== expected.sideToMove ||
      p.ply !== expected.ply
    )
      throw new Error('The review contains inconsistent positions.');
    if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > 3)
      throw new Error('Invalid candidate lines.');
    const lines = p.lines.map((l) => lineFrom(l, expected.fen));
    const playedLine = lineFrom(p.playedLine, expected.fen);
    if (
      lines.some((l, i) => l.rank !== i + 1) ||
      playedLine.rank !== 1 ||
      new Set(lines.map((l) => l.movesUci[0])).size !== lines.length
    )
      throw new Error('Candidate ranks and first moves are inconsistent.');
    const bestMove = text(p.bestMoveUci, 5);
    if (
      !legalVariation(expected.fen, [bestMove]) ||
      lines[0]!.movesUci[0] !== bestMove ||
      playedLine.movesUci[0] !== expected.moveUci
    )
      throw new Error('Review move evidence is inconsistent.');
    return {
      ply: expected.ply,
      san: expected.san,
      playedMoveUci: expected.moveUci,
      fen: expected.fen,
      sideToMove: expected.sideToMove,
      bestMoveUci: bestMove,
      lines,
      playedLine,
    };
  });
  const pr = object(r.provenance);
  if (
    pr.engine !== 'Stockfish' ||
    pr.threads !== 1 ||
    pr.hashMb !== 16 ||
    !['move-loss-v1', 'move-loss-v2'].includes(String(pr.classifierVersion))
  )
    throw new Error('Unsupported engine provenance.');
  const provenance: AnalysisRun['provenance'] = {
    engine: 'Stockfish',
    engineVersion: text(pr.engineVersion, 200),
    distribution: 'Stockfish.js 18 lite single-threaded',
    upstreamRelease: text(pr.upstreamRelease, 200),
    upstreamStockfishCommit: text(pr.upstreamStockfishCommit, 100),
    evaluationNetwork: text(pr.evaluationNetwork, 200),
    scriptSha256: text(pr.scriptSha256, 64),
    wasmSha256: text(pr.wasmSha256, 64),
    threads: 1,
    hashMb: 16,
    nodesPerPosition: integer(pr.nodesPerPosition, 100000),
    multiPv: integer(pr.multiPv, 3),
    classifierVersion: pr.classifierVersion as AnalysisRun['provenance']['classifierVersion'],
    appVersion: r.schemaVersion === 2 ? 'legacy' : text(pr.appVersion, 100),
    sourceRevision: r.schemaVersion === 2 ? 'unknown' : text(pr.sourceRevision, 100),
  };
  if (
    provenance.nodesPerPosition < 1000 ||
    provenance.multiPv < 1 ||
    ![provenance.scriptSha256, provenance.wasmSha256].every((h) => /^[a-f0-9]{64}$/.test(h))
  )
    throw new Error('Invalid search settings or checksums.');
  return {
    schemaVersion: 3,
    pgn,
    createdAt: timestamp(r.createdAt),
    pgnSha256: hash,
    game: { headers: parsed.headers, plies: positions.length },
    provenance,
    positions,
  };
}
export async function validateLibraryGame(value: unknown): Promise<LibraryGame> {
  const r = object(value);
  if (r.schemaVersion !== 1) throw new Error('Unsupported library version.');
  const analysis = await validateAnalysis(r.analysis);
  if (r.pgn !== analysis.pgn || !['white', 'black', 'both'].includes(String(r.player)))
    throw new Error('Invalid library game.');
  const game = await makeLibraryGame(analysis, r.player as PlayerSide);
  if (r.id !== game.id) throw new Error('Invalid game identity.');
  if (!Array.isArray(r.attempts)) throw new Error('Invalid practice history.');
  const moves = new Map<string, ReturnType<typeof recordedPracticeAssessment>>();
  const attempts: PracticeAttempt[] = r.attempts.map((v) => {
    const a = object(v),
      ply = integer(a.ply, analysis.positions.length),
      moveUci = text(a.moveUci, 5);
    const pos = analysis.positions[ply - 1];
    if (!pos || typeof a.correct !== 'boolean') throw new Error('Invalid practice attempt.');
    const key = `${ply}|${moveUci}`;
    if (!moves.has(key)) {
      if (!legalVariation(pos.fen, [moveUci])) throw new Error('Invalid practice attempt.');
      moves.set(key, recordedPracticeAssessment(pos, moveUci));
    }
    let assessment = moves.get(key);
    let comparison: PracticeAttempt['comparison'];
    if (a.comparison !== undefined) {
      const evidence = object(a.comparison);
      comparison = {
        bestMoveUci: text(evidence.bestMoveUci, 5),
        bestLine: lineFrom(evidence.bestLine, pos.fen),
        playedLine: lineFrom(evidence.playedLine, pos.fen),
      };
      if (
        comparison.bestLine.rank !== 1 ||
        comparison.playedLine.rank !== 1 ||
        comparison.bestLine.movesUci[0] !== comparison.bestMoveUci ||
        comparison.playedLine.movesUci[0] !== moveUci
      )
        throw new Error('Practice comparison does not match the attempted move.');
      // Fresh comparison evidence belongs to the historical attempt even if
      // the saved game has since been reanalysed.
      assessment = assessMove({
        ...pos,
        playedMoveUci: moveUci,
        bestMoveUci: comparison.bestMoveUci,
        lines: [comparison.bestLine],
        playedLine: comparison.playedLine,
      });
    }
    return {
      ply,
      moveUci,
      correct: assessment !== undefined && isAcceptedPracticeMove(assessment.label),
      attemptedAt: timestamp(a.attemptedAt),
      ...(comparison ? { comparison } : {}),
    };
  });
  return { ...game, updatedAt: timestamp(r.updatedAt), attempts };
}
export async function readLibraryFile(
  contents: string,
  validate = validateLibraryGame,
): Promise<LibraryGame[]> {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error('Choose a valid ProphyLens JSON backup or analysis receipt.');
  }
  const r = object(value);
  if (r.format === 'prophylens-library') {
    if (r.schemaVersion !== 1 || !Array.isArray(r.games))
      throw new Error('Unsupported library backup.');
    const games: LibraryGame[] = [];
    for (const item of r.games) games.push(await validate(item));
    return games;
  }
  return [await makeLibraryGame(await validateAnalysis(value), 'both')];
}
export async function importGames(
  games: LibraryGame[],
  validate = validateRowsAsync,
): Promise<void> {
  const consolidated = new Map<string, LibraryGame>();
  for (const game of games) consolidated.set(game.id, mergeGames(consolidated.get(game.id), game));
  // Validation cannot await inside a live IDB transaction. Validate a snapshot,
  // then compare it inside the atomic commit; retry on a concurrent tab edit.
  for (let retry = 0; retry < 5; retry++) {
    const raw = (await transaction('readonly', (store) => store.getAll())) as LibraryGame[];
    const valid = await validate(raw);
    const existing = new Map(valid.games.map((g) => [g.id, g]));
    const snapshot = new Map(raw.map((g) => [g.id, JSON.stringify(g)]));
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = startTransaction(db, 'readwrite');
        const store = tx.objectStore('games');
        let conflict = false;
        for (const incoming of consolidated.values()) {
          const read = store.get(incoming.id);
          read.onsuccess = () => {
            if (JSON.stringify(read.result) !== snapshot.get(incoming.id)) {
              conflict = true;
              tx.abort();
              return;
            }
            store.put(mergeGames(existing.get(incoming.id), incoming));
          };
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(
            conflict
              ? new StorageConflict()
              : new Error('Could not import the backup. Existing games were preserved.'),
          );
        };
      });
      announceLibraryChange();
      return;
    } catch (e) {
      if (!(e instanceof StorageConflict)) throw e;
    }
  }
  throw new StorageConflict(
    'Another tab kept changing the library. Close it and retry; existing games were preserved.',
  );
}
const libraryChannel =
  typeof BroadcastChannel !== 'undefined' && typeof window !== 'undefined'
    ? new BroadcastChannel('prophylens-library-changes')
    : null;
export function announceLibraryChange() {
  libraryChannel?.postMessage('changed');
}
export function subscribeLibrary(listener: () => void): () => void {
  libraryChannel?.addEventListener('message', listener);
  return () => libraryChannel?.removeEventListener('message', listener);
}
export async function migrateLegacy(): Promise<void> {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  const run = await validateAnalysis(JSON.parse(raw));
  await saveGame(await makeLibraryGame(run, 'both'));
  localStorage.removeItem(LEGACY_KEY);
}
