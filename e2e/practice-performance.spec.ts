import { expect, test } from '@playwright/test';
import { Chess } from 'chess.js';
import { createHash } from 'node:crypto';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function fixture(
  pgn: string,
  manifest: { version: string; sourceRevision: string; assets: Record<string, string> },
  alternatives = false,
) {
  const game = new Chess();
  game.loadPgn(pgn);
  const positions = game.history({ verbose: true }).map((move, index) => {
    const uci = move.from + move.to + (move.promotion ?? '');
    const line = {
      rank: 1,
      depth: 14,
      nodes: 10000,
      scoreCp: 50,
      scoreBound: 'exact',
      movesUci: [alternatives ? 'e2e4' : uci],
    };
    return {
      ply: index + 1,
      san: move.san,
      fen: move.before,
      sideToMove: move.color === 'w' ? 'white' : 'black',
      playedMoveUci: uci,
      bestMoveUci: line.movesUci[0],
      lines: alternatives ? [line, { ...line, rank: 2, scoreCp: 35, movesUci: ['d2d4'] }] : [line],
      playedLine: { ...line, scoreCp: alternatives ? -100 : 50, movesUci: [uci] },
    };
  });
  return {
    schemaVersion: 3,
    pgn,
    pgnSha256: hash(pgn),
    createdAt: new Date().toISOString(),
    game: { headers: game.getHeaders(), plies: positions.length },
    positions,
    provenance: {
      engine: 'Stockfish',
      engineVersion: 'Synthetic UI regression fixture',
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
test('practice accepts and persists a recorded Good alternative', async ({ page, request }) => {
  const manifest = await (await request.get('/release.json')).json();
  await page.goto('/');
  await page.getByLabel('Import library backup').setInputFiles({
    name: 'good-alternative.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture('1. f3 *', manifest, true))),
  });
  await expect(page.locator('.library-card')).toHaveCount(1);
  await page.getByLabel('Practice move').fill('d4');
  await page.getByRole('button', { name: 'Check move' }).click();
  await expect(
    page.getByText('Good move. This alternative is accepted by the engine comparison.'),
  ).toBeVisible();
  await expect(page.getByText(/1 attempts saved · 1/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/1 attempts saved · 1/)).toBeVisible();
});
test('600-move review navigation remains responsive', async ({ page, request }, testInfo) => {
  const manifest = await (await request.get('/release.json')).json();
  const game = new Chess();
  for (let i = 0; i < 150; i++) for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) game.move(move);
  await page.goto('/');
  await page.getByLabel('Import library backup').setInputFiles({
    name: 'maximum-game.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture(game.pgn(), manifest))),
  });
  await expect(page.locator('.result-row')).toHaveCount(600);
  await page.getByRole('region', { name: 'Chess move review' }).focus();
  const start = Date.now();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('.result-selected .move-cell span')).toHaveText('6.');
  const elapsed = Date.now() - start;
  await testInfo.attach('navigation timing', {
    body: JSON.stringify({ moves: 600, steps: 10, elapsedMs: elapsed }),
    contentType: 'application/json',
  });
  expect(elapsed).toBeLessThan(3000);
});
