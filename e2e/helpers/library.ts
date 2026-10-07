import { createHash } from 'node:crypto';
import { Chess } from 'chess.js';
import { expect, type Page } from '@playwright/test';
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export function review(pgn: string, manifest: any, keyPly = 1) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  return {
    schemaVersion: 3,
    pgn,
    pgnSha256: hash(pgn),
    createdAt: '2026-10-01T00:00:00Z',
    game: { headers: chess.getHeaders(), plies: history.length },
    positions: history.map((m, i) => {
      const playedMoveUci = m.from + m.to + (m.promotion ?? '');
      const miss = i + 1 === keyPly && m.color === 'w' && playedMoveUci !== 'e2e4';
      const bestMoveUci = miss ? 'e2e4' : playedMoveUci;
      const line = {
        rank: 1,
        depth: 14,
        nodes: 10000,
        scoreCp: 100,
        scoreBound: 'exact',
        movesUci: [bestMoveUci],
      };
      return {
        ply: i + 1,
        san: m.san,
        playedMoveUci,
        fen: m.before,
        sideToMove: m.color === 'w' ? 'white' : 'black',
        bestMoveUci,
        lines: miss ? [line, { ...line, rank: 2, scoreCp: 95, movesUci: ['d2d4'] }] : [line],
        playedLine: { ...line, scoreCp: miss ? -100 : 100, movesUci: [playedMoveUci] },
      };
    }),
    provenance: {
      engine: 'Stockfish',
      engineVersion: 'Synthetic audit regression',
      distribution: 'Stockfish.js 18 lite single-threaded',
      upstreamRelease: 'nmrugg/stockfish.js v18.0.0',
      upstreamStockfishCommit: 'cb3d4ee',
      evaluationNetwork: 'nn-9067e33176e8.nnue',
      scriptSha256: manifest.assets['engine/stockfish-18-lite-single.js'],
      wasmSha256: manifest.assets['engine/stockfish-18-lite-single.wasm'],
      threads: 1,
      hashMb: 16,
      nodesPerPosition: 10000,
      multiPv: 2,
      classifierVersion: 'move-loss-v2',
      appVersion: manifest.version,
      sourceRevision: manifest.sourceRevision,
    },
  };
}
export function libraryGame(analysis: ReturnType<typeof review>) {
  const chess = new Chess();
  chess.loadPgn(analysis.pgn);
  const moves = chess.history({ verbose: true });
  return {
    schemaVersion: 1,
    id: hash(
      moves[0]!.before + '|' + moves.map((m) => m.from + m.to + (m.promotion ?? '')).join(' '),
    ),
    pgn: analysis.pgn,
    analysis,
    player: 'both',
    updatedAt: analysis.createdAt,
    attempts: [] as any[],
  };
}
export const backup = (games: unknown[]) =>
  JSON.stringify({ format: 'prophylens-library', schemaVersion: 1, games });
export async function restore(page: Page, value: unknown) {
  await page.getByLabel('Import library backup').setInputFiles({
    name: 'audit.json',
    mimeType: 'application/json',
    buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
  });
  await waitForRestore(page);
}
export async function restoreFile(page: Page, path: string) {
  await page.getByLabel('Import library backup').setInputFiles(path);
  await waitForRestore(page);
}
async function waitForRestore(page: Page) {
  // Let the input event commit its loading state before waiting for completion.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByLabel('Import library backup')).toBeEnabled({ timeout: 120000 });
}
export async function stored(page: Page): Promise<any[]> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('prophylens-library', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('games', 'readonly');
          const read = tx.objectStore('games').getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(read.result);
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}
export async function seed(page: Page, games: unknown[]) {
  await page.evaluate(
    (rows) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('prophylens-library', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('games', 'readwrite');
          for (const row of rows) tx.objectStore('games').put(row);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    games,
  );
}
export async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Analyse game', exact: true })).toBeEnabled();
}
