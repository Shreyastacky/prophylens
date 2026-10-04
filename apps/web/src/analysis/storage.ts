import { Chess } from 'chess.js';
import type {
  AnalysisRun,
  EngineLine,
  LibraryGame,
  PlayerSide,
  PositionAnalysis,
  PracticeAttempt,
} from './types';
import { parseGame, MAX_BATCH_GAMES } from './pgn';
import { legalVariation } from './variation';
const DB_NAME = 'prophylens-library';
const LEGACY_KEY = 'prophylens:last-analysis:v2';
export const MAX_LIBRARY_FILE_BYTES = 20 * 1024 * 1024;
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
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('games', mode);
    const request = action(tx.objectStore('games'));
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
export async function listGames(): Promise<LibraryGame[]> {
  corruptRecordCount = 0;
  const rows = (await transaction('readonly', (store) => store.getAll())) as unknown[];
  // A corrupt row must not stop access to every other game.
  const valid: LibraryGame[] = [];
  for (const row of rows) {
    try {
      valid.push(await validateLibraryGame(row));
    } catch {
      corruptRecordCount++;
    }
  }
  return valid.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveGame(game: LibraryGame): Promise<void> {
  await transaction('readwrite', (store) => store.put(game));
}
export async function removeGame(id: string): Promise<void> {
  await transaction('readwrite', (store) => store.delete(id));
}
export async function clearLibrary(): Promise<void> {
  await transaction('readwrite', (store) => store.clear());
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
  const parsed = parseGame(run.pgn);
  const id = await sha256(
    parsed.positions[0]!.fen + '|' + parsed.positions.map((p) => p.moveUci).join(' '),
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
  if (!['exact', 'lower', 'upper'].includes(line.scoreBound!))
    throw new Error('Invalid score bound.');
  for (const key of ['scoreCp', 'mateIn'] as const) {
    if (item[key] !== undefined) {
      const n = item[key];
      if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1000000)
        throw new Error('Invalid evaluation.');
      line[key] = n;
    }
  }
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
  if (!Array.isArray(r.attempts) || r.attempts.length > 10000)
    throw new Error('Invalid practice history.');
  const attempts: PracticeAttempt[] = r.attempts.map((v) => {
    const a = object(v),
      ply = integer(a.ply, analysis.positions.length),
      moveUci = text(a.moveUci, 5);
    const pos = analysis.positions[ply - 1];
    if (!pos || !legalVariation(pos.fen, [moveUci]) || typeof a.correct !== 'boolean')
      throw new Error('Invalid practice attempt.');
    return {
      ply,
      moveUci,
      correct: moveUci === pos.bestMoveUci,
      attemptedAt: timestamp(a.attemptedAt),
    };
  });
  return { ...game, updatedAt: timestamp(r.updatedAt), attempts };
}
export async function readLibraryFile(contents: string): Promise<LibraryGame[]> {
  if (new TextEncoder().encode(contents).byteLength > MAX_LIBRARY_FILE_BYTES)
    throw new Error('The backup exceeds the 20 MB limit.');
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error('Choose a valid ProphyLens JSON backup or analysis receipt.');
  }
  const r = object(value);
  if (r.format === 'prophylens-library') {
    if (r.schemaVersion !== 1 || !Array.isArray(r.games) || r.games.length > MAX_BATCH_GAMES)
      throw new Error('Unsupported library backup; import at most 100 games.');
    const games: LibraryGame[] = [];
    for (const item of r.games) games.push(await validateLibraryGame(item));
    return games;
  }
  return [await makeLibraryGame(await validateAnalysis(value), 'both')];
}
export async function importGames(games: LibraryGame[]): Promise<void> {
  const existing = await listGames();
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('games', 'readwrite');
    for (const incoming of games) {
      const prior = existing.find((g) => g.id === incoming.id);
      const attempts = [...(prior?.attempts ?? []), ...incoming.attempts].filter(
        (attempt, index, list) =>
          list.findIndex(
            (a) =>
              a.ply === attempt.ply &&
              a.moveUci === attempt.moveUci &&
              a.attemptedAt === attempt.attemptedAt,
          ) === index,
      );
      tx.objectStore('games').put({ ...incoming, attempts });
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(new Error('Could not import the backup. Existing games were preserved.'));
    };
  });
}
export async function migrateLegacy(): Promise<void> {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  const run = await validateAnalysis(JSON.parse(raw));
  await saveGame(await makeLibraryGame(run, 'both'));
  localStorage.removeItem(LEGACY_KEY);
}
