import { Chess } from 'chess.js';
import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { libraryGame, ready, restoreFile, review, stored } from './helpers/library';

test('large-library backup round trip and responsiveness during restore and analysis', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(240000);
  const manifest = await (await request.get('/release.json')).json();
  let random = 481516;
  const games = Array.from({ length: 180 }, (_, index) => {
    const board = new Chess();
    board.move('f3');
    board.setHeader('Event', `Scale game ${index + 1}`);
    for (let ply = 1; ply < 120 && !board.isGameOver(); ply++) {
      const choices = board.moves();
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      board.move(choices[random % choices.length]!);
    }
    const game = libraryGame(review(board.pgn(), manifest));
    game.attempts = Array.from({ length: 240 }, (_, n) => ({
      ply: 1,
      moveUci: 'e2e4',
      correct: true,
      attemptedAt: new Date(1700000000000 + n).toISOString(),
    }));
    return game;
  });
  const value = JSON.stringify({ format: 'prophylens-library', schemaVersion: 1, games }, null, 2);
  expect(Buffer.byteLength(value)).toBeGreaterThan(20 * 1024 * 1024);
  const inputPath = testInfo.outputPath('large-library-input.json');
  await writeFile(inputPath, value);
  await ready(page);
  const cdp =
    testInfo.project.name === 'chromium' ? await page.context().newCDPSession(page) : null;
  await page.evaluate(() => {
    const state = { gaps: [] as number[], last: performance.now() };
    (window as any).scaleMetrics = state;
    setInterval(() => {
      const now = performance.now();
      state.gaps.push(now - state.last);
      state.last = now;
    }, 20);
  });
  const reset = () =>
    page.evaluate(() => {
      const m = (window as any).scaleMetrics;
      m.gaps = [];
      m.last = performance.now();
    });
  const metrics = async () => {
    const measured = await page.evaluate(() => {
      const m = (window as any).scaleMetrics;
      const sorted = [...m.gaps].sort((a, b) => a - b);
      return {
        samples: sorted.length,
        maximumGapMs: sorted.at(-1) ?? 0,
        p95GapMs: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      };
    });
    const heap = cdp ? await cdp.send('Runtime.getHeapUsage') : null;
    return { ...measured, rendererHeapBytesAfterStage: heap?.usedSize ?? null };
  };
  await reset();
  const started = Date.now();
  await restoreFile(page, inputPath);
  // Measured waits avoid expect() polling: its failure diagnostics build an aria
  // snapshot of the whole page on the main thread, which the gap meter records.
  await page.waitForFunction(
    (count) => document.querySelectorAll('.library-card').length === count,
    games.length,
    { timeout: 120000 },
  );
  const importMetrics = { ...(await metrics()), elapsedMs: Date.now() - started };
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export library', exact: true }).click();
  const exportedPath = (await (await downloadPromise).path())!;
  const exported = await readFile(exportedPath, 'utf8');
  expect(Buffer.byteLength(exported)).toBeGreaterThan(20 * 1024 * 1024);
  const snapshot = JSON.parse(exported).games;
  expect(snapshot).toHaveLength(games.length);
  expect(snapshot.reduce((n: number, g: any) => n + g.attempts.length, 0)).toBe(43200);
  // Restore the app's own output, including its actual >20 MB content.
  await page.getByRole('button', { name: 'Clear library', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.locator('.library-card')).toHaveCount(0);
  await reset();
  const restoreStart = Date.now();
  await restoreFile(page, exportedPath);
  await page.getByText(/Imported 180 review/).waitFor({ timeout: 120000 });
  await expect(page.getByRole('button', { name: 'Export library', exact: true })).toBeEnabled();
  const restoreMetrics = { ...(await metrics()), elapsedMs: Date.now() - restoreStart };
  expect((await stored(page)).reduce((n, g) => n + g.attempts.length, 0)).toBe(43200);
  await page.getByRole('button', { name: 'Load sample', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Analyse game', exact: true })).toBeEnabled();
  await reset();
  const analysisStart = Date.now();
  await page.getByRole('button', { name: 'Analyse game', exact: true }).click();
  await page.getByText('Analysis complete').waitFor({ timeout: 120000 });
  const analysisMetrics = { ...(await metrics()), elapsedMs: Date.now() - analysisStart };
  console.log(
    'Library responsiveness',
    JSON.stringify({
      browser: testInfo.project.name,
      import: importMetrics,
      restore: restoreMetrics,
      analysis: analysisMetrics,
    }),
  );
  await testInfo.attach('library scale benchmark', {
    contentType: 'application/json',
    body: JSON.stringify(
      {
        browser: testInfo.project.name,
        games: games.length,
        plies: games.reduce((n, g) => n + g.analysis.positions.length, 0),
        attempts: 43200,
        inputBytes: Buffer.byteLength(value),
        exportedBytes: Buffer.byteLength(exported),
        import: importMetrics,
        restore: restoreMetrics,
        analysis: analysisMetrics,
        memoryScope:
          'Chromium CDP renderer JS heap snapshots after each stage; excludes worker, IndexedDB and engine WASM allocations. Other browsers return null.',
      },
      null,
      2,
    ),
  });
  // Allow occasional IPC/structured-clone/GC stalls while requiring continued
  // event-loop service through multi-second validation and engine progress.
  for (const m of [importMetrics, restoreMetrics, analysisMetrics]) {
    expect(m.samples).toBeGreaterThan(5);
    expect(m.p95GapMs).toBeLessThan(200);
    expect(m.maximumGapMs).toBeLessThan(2000);
  }
});
