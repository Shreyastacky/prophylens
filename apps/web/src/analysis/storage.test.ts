import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseGame } from './pgn';
import { ENGINE_ASSET, type AnalysisRun, type LibraryGame, type PracticeAttempt } from './types';
import {
  clearLibrary,
  importGames,
  listGames,
  makeLibraryGame,
  readLibraryFile,
  saveGame,
  sha256,
  validateAnalysis,
  validateLibraryGame,
  getGame,
  saveAnalysis,
  appendAttempt,
  updatePlayer,
  removeGame,
  StorageConflict,
} from './storage';

export async function fixture(pgn = '1. f3 *'): Promise<LibraryGame> {
  const parsed = parseGame(pgn);
  const run: AnalysisRun = {
    schemaVersion: 3,
    pgn,
    pgnSha256: await sha256(pgn),
    createdAt: '2026-10-01T00:00:00Z',
    game: { headers: parsed.headers, plies: parsed.positions.length },
    provenance: {
      engine: 'Stockfish',
      engineVersion: 'Stockfish 18',
      distribution: 'Stockfish.js 18 lite single-threaded',
      upstreamRelease: ENGINE_ASSET.upstreamRelease,
      upstreamStockfishCommit: ENGINE_ASSET.upstreamStockfishCommit,
      evaluationNetwork: ENGINE_ASSET.evaluationNetwork,
      scriptSha256: ENGINE_ASSET.scriptSha256,
      wasmSha256: ENGINE_ASSET.wasmSha256,
      threads: 1,
      hashMb: 16,
      nodesPerPosition: 10000,
      multiPv: 1,
      classifierVersion: 'move-loss-v2',
      appVersion: '0.1.3-alpha',
      sourceRevision: 'test',
    },
    positions: parsed.positions.map((p) => ({
      ply: p.ply,
      san: p.san,
      fen: p.fen,
      sideToMove: p.sideToMove,
      playedMoveUci: p.moveUci,
      bestMoveUci: 'e2e4',
      lines: [{ rank: 1, depth: 12, nodes: 10000, scoreCp: 100, movesUci: ['e2e4'] }],
      playedLine: { rank: 1, depth: 12, nodes: 10000, scoreCp: -100, movesUci: [p.moveUci] },
    })),
  };
  return { ...(await makeLibraryGame(run, 'both')), updatedAt: run.createdAt };
}
const attempt = (n: number): PracticeAttempt => ({
  ply: 1,
  moveUci: 'e2e4',
  correct: true,
  attemptedAt: new Date(1700000000000 + n).toISOString(),
});
const backup = (games: LibraryGame[]) =>
  JSON.stringify({ format: 'prophylens-library', schemaVersion: 1, games });
beforeEach(async () => {
  await clearLibrary();
});
describe('audit storage invariants', () => {
  it('restores backups with more than 100 entries', async () => {
    const game = await fixture();
    expect(await readLibraryFile(backup(Array.from({ length: 101 }, () => game)))).toHaveLength(
      101,
    );
  });
  it('restores a valid backup beyond 20 MB without truncation', async () => {
    expect(
      await readLibraryFile(' '.repeat(21 * 1024 * 1024) + backup([await fixture()])),
    ).toHaveLength(1);
  });
  it('keeps games readable beyond 10,000 attempts and after merging', async () => {
    const game = {
      ...(await fixture()),
      attempts: Array.from({ length: 10001 }, (_, n) => attempt(n)),
    };
    expect((await validateLibraryGame(game)).attempts).toHaveLength(10001);
    await saveGame(game);
    expect(await listGames()).toHaveLength(1);
    await appendAttempt(game, attempt(10001));
    expect((await listGames())[0]?.attempts).toHaveLength(10002);
    await importGames([{ ...game, attempts: [attempt(10002)] }]);
    expect((await listGames())[0]?.attempts).toHaveLength(10003);
  }, 20000);
  it('consolidates duplicate incoming IDs and is idempotent', async () => {
    const game = await fixture();
    const incoming = [
      { ...game, attempts: [attempt(1)] },
      { ...game, attempts: [attempt(2)] },
    ];
    await importGames(incoming);
    await importGames(incoming);
    expect((await listGames())[0]?.attempts).toHaveLength(2);
  });
  it('merges concurrent attempts and player patches atomically', async () => {
    const game = await fixture();
    await saveGame(game);
    await Promise.all([appendAttempt(game, attempt(1)), appendAttempt(game, attempt(2))]);
    await updatePlayer(game.id, 'black');
    const current = await getGame(game.id);
    expect(current?.attempts).toHaveLength(2);
    expect(current?.player).toBe('black');
  });
  it('accepts unchanged validated engine evidence regardless of JSON key order', async () => {
    const game = await fixture();
    const best = game.analysis.positions[0]!.lines[0]!;
    game.analysis.positions[0]!.lines[0] = {
      scoreCp: best.scoreCp,
      selectiveDepth: 18,
      scoreBound: 'exact',
      ...best,
    };
    game.analysis.positions[0]!.playedLine.scoreBound = 'exact';
    await saveGame(game);
    const normalized = (await listGames())[0]!;
    expect(normalized.analysis.positions[0]!.lines[0]!.selectiveDepth).toBe(18);
    await appendAttempt(normalized, attempt(1));
    expect((await getGame(game.id))?.attempts).toHaveLength(1);
  });
  it('reanalysis preserves attempts and player updates made during the search', async () => {
    const game = await fixture();
    await saveGame(game);
    const snapshot = await getGame(game.id);
    await appendAttempt(game, attempt(1));
    await updatePlayer(game.id, 'white');
    const next = { ...game, analysis: { ...game.analysis, createdAt: '2026-10-06T00:00:00Z' } };
    const saved = await saveAnalysis(next, snapshot?.analysis);
    expect(saved.attempts).toHaveLength(1);
    expect(saved.player).toBe('white');
    await expect(appendAttempt(game, attempt(2))).rejects.toBeInstanceOf(StorageConflict);
    await expect(saveAnalysis(game, snapshot?.analysis)).rejects.toBeInstanceOf(StorageConflict);
  });
  it.each(['delete', 'clear'] as const)(
    'stale work never resurrects a record after %s',
    async (mode) => {
      const game = await fixture();
      await saveGame(game);
      if (mode === 'delete') await removeGame(game.id);
      else await clearLibrary();
      await expect(appendAttempt(game, attempt(1))).rejects.toBeInstanceOf(StorageConflict);
      await expect(updatePlayer(game.id, 'white')).rejects.toBeInstanceOf(StorageConflict);
      await expect(saveAnalysis(game, game.analysis)).rejects.toBeInstanceOf(StorageConflict);
      expect(await listGames()).toEqual([]);
    },
  );
  it('concurrent backup restores and attempts retain all unique history', async () => {
    const game = await fixture();
    await saveGame(game);
    await Promise.all([
      importGames([{ ...game, attempts: [attempt(1)] }]),
      importGames([{ ...game, attempts: [attempt(2)] }]),
      appendAttempt(game, attempt(3)),
    ]);
    expect((await getGame(game.id))?.attempts).toHaveLength(3);
  });
  it('preserves newer player settings, metadata and analysis while merging history', async () => {
    const old = await fixture();
    const newer: LibraryGame = {
      ...old,
      player: 'black',
      updatedAt: '2026-10-05T00:00:00Z',
      analysis: { ...old.analysis, createdAt: '2026-10-04T00:00:00Z' },
    };
    await saveGame(newer);
    await importGames([{ ...old, attempts: [attempt(1)] }]);
    const saved = (await listGames())[0]!;
    expect(saved.player).toBe('black');
    expect(saved.updatedAt).toBe(newer.updatedAt);
    expect(saved.analysis.createdAt).toBe(newer.analysis.createdAt);
    expect(saved.attempts).toHaveLength(1);
  });
  it.each([
    [
      'rank zero',
      (r: AnalysisRun) => {
        r.positions[0]!.lines[0]!.rank = 0;
      },
    ],
    [
      'contradictory scores',
      (r: AnalysisRun) => {
        r.positions[0]!.lines[0]!.mateIn = 1;
      },
    ],
    [
      'fractional mate',
      (r: AnalysisRun) => {
        delete r.positions[0]!.lines[0]!.scoreCp;
        r.positions[0]!.lines[0]!.mateIn = 1.5;
      },
    ],
    [
      'wrong candidate rank',
      (r: AnalysisRun) => {
        r.positions[0]!.lines[0]!.rank = 2;
      },
    ],
    [
      'duplicate candidate move',
      (r: AnalysisRun) => {
        r.positions[0]!.lines.push({ ...r.positions[0]!.lines[0]!, rank: 2 });
      },
    ],
  ] as const)('rejects %s evidence', async (_name, change) => {
    const run = (await fixture()).analysis;
    change(run);
    await expect(validateAnalysis(run)).rejects.toThrow();
  });
  it('migrates supported version 2 receipts and labels missing scores uncertain', async () => {
    const run = (await fixture()).analysis;
    const migrated = await validateAnalysis({ ...run, schemaVersion: 2, pgn: undefined });
    expect(migrated.provenance.appVersion).toBe('legacy');
    delete run.positions[0]!.lines[0]!.scoreCp;
    const incomplete = await validateAnalysis(run);
    expect(incomplete.positions[0]!.lines[0]!.scoreBound).toBe('unknown');
  });
});
