import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { backup, libraryGame, ready, restore, review, seed, stored } from './helpers/library';

test('corrupt-only libraries can be cleared through confirmation', async ({ page }) => {
  await ready(page);
  await seed(page, [{ id: 'corrupt-only' }]);
  await page.reload();
  await expect(page.getByText(/1 damaged record/)).toBeVisible();
  await expect(page.locator('.library-card')).toHaveCount(0);
  const clear = page.getByRole('button', { name: 'Clear library', exact: true });
  await expect(clear).toBeEnabled();
  await clear.click();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  expect(await stored(page)).toEqual([]);
  await page.reload();
  await expect(page.getByText(/damaged record/)).toHaveCount(0);
});

for (const black of [false, true])
  test(`turn follows displayed board in before/after/variation (${black ? 'Black' : 'White'} start)`, async ({
    page,
    request,
  }) => {
    const manifest = await (await request.get('/release.json')).json();
    const pgn = black
      ? '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 42"]\n\n42... e5 *'
      : '1. e4 *';
    const run = review(pgn, manifest, 0);
    run.positions[0]!.lines[0]!.movesUci.push(black ? 'g1f3' : 'e7e5');
    await ready(page);
    await restore(page, run);
    const turn = page
      .getByRole('region', { name: 'Chess move review' })
      .locator('.board-top > span');
    await expect(turn).toHaveText(`${black ? 'Black' : 'White'} to move`);
    await page.getByRole('button', { name: 'After played move', exact: true }).click();
    await expect(turn).toHaveText(`${black ? 'White' : 'Black'} to move`, { timeout: 2000 });
    await page.getByRole('button', { name: 'Before move', exact: true }).click();
    await expect(turn).toHaveText(`${black ? 'Black' : 'White'} to move`);
    await page.getByRole('button', { name: 'Engine line', exact: true }).click();
    await expect(turn).toHaveText(`${black ? 'White' : 'Black'} to move`);
    await page.getByRole('button', { name: 'Next variation move' }).click();
    await expect(turn).toHaveText(`${black ? 'Black' : 'White'} to move`);
    await page.getByRole('button', { name: 'Previous variation move' }).click();
    await expect(turn).toHaveText(`${black ? 'White' : 'Black'} to move`);
  });

test('footer matches manifest and receipt version', async ({ page, request }) => {
  const manifest = await (await request.get('/release.json')).json();
  await ready(page);
  await expect(page.locator('footer')).toContainText(manifest.version, { timeout: 2000 });
  await page.getByRole('button', { name: 'Analyse game', exact: true }).click();
  await expect(page.getByText('Analysis complete')).toBeVisible();
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download evidence', exact: true }).click();
  expect(
    JSON.parse(await readFile((await (await wait).path())!, 'utf8')).provenance.appVersion,
  ).toBe(manifest.version);
});

test('fresh practice sends repetition history, not just a matching FEN', async ({
  page,
  request,
}) => {
  const commands: string[] = [];
  await page.exposeFunction('recordPosition', (s: string) => commands.push(s));
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: any, ...args: any[]) {
      if (typeof message === 'string' && message.startsWith('position fen '))
        (window as any).recordPosition(message);
      return (original as any).call(this, message, ...args);
    };
  });
  const manifest = await (await request.get('/release.json')).json();
  const run = review('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. f3 *', manifest, 9);
  await ready(page);
  await restore(page, run);
  await page.getByLabel('Practice move').fill('h3');
  await page.getByRole('button', { name: 'Check move', exact: true }).click();
  await expect.poll(() => commands.length).toBeGreaterThan(0);
  expect(commands[0]).toContain(' moves g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8');
  await expect(page.getByText(/1 attempts saved/)).toBeVisible();
});

test('failed second save pauses a batch and every completed review is downloadable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    let calls = 0;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      if (++calls === 2) throw new DOMException('Injected quota failure', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await ready(page);
  await page.getByLabel('Choose PGN file').setInputFiles({
    name: 'batch.pgn',
    mimeType: 'application/x-chess-pgn',
    buffer: Buffer.from(
      '[Event "A"]\n\n1. e4 *\n\n[Event "B"]\n\n1. d4 *\n\n[Event "C"]\n\n1. c4 *',
    ),
  });
  await expect(page.getByText(/3 games ready/)).toBeVisible();
  await page.getByRole('button', { name: 'Analyse game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download unsaved reviews' })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator('.library-card')).toHaveCount(1);
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download unsaved reviews' }).click();
  const lost = JSON.parse(await readFile((await (await wait).path())!, 'utf8'));
  expect(lost.games.map((g: any) => g.analysis.game.headers.Event)).toEqual(['B']);
  const prior = (await stored(page))[0].analysis.createdAt;
  await page.getByRole('button', { name: 'Resume batch', exact: true }).click();
  await expect(page.getByText('Analysis complete')).toBeVisible();
  const saved = await stored(page);
  expect(saved.map((g) => g.analysis.game.headers.Event).sort()).toEqual(['A', 'C']);
  expect(saved.find((g) => g.analysis.game.headers.Event === 'A').analysis.createdAt).toBe(prior);
  await restore(page, JSON.stringify(lost));
  await expect(page.locator('.library-card')).toHaveCount(3);
});

test('cancelled batch resumes its second game without replaying completed games', async ({
  page,
}) => {
  const starts: string[] = [];
  await page.exposeFunction('batchRoot', (command: string) => starts.push(command));
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: any, ...args: any[]) {
      if (
        typeof message === 'string' &&
        message.startsWith('position fen ') &&
        !(this as any).seenRoot
      ) {
        (this as any).seenRoot = true;
        (window as any).batchRoot(message);
      }
      // Hold search in game two (its starting FEN is distinctive).
      if (
        typeof message === 'string' &&
        message.startsWith('position fen ') &&
        message.includes(' b KQkq - 0 42')
      )
        (this as any).held = true;
      if (
        (this as any).held &&
        typeof message === 'string' &&
        message.startsWith('go ') &&
        !(window as any).releaseSearch
      )
        return;
      return (original as any).call(this, message, ...args);
    };
  });
  await ready(page);
  const second =
    '[Event "B"]\n[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 42"]\n\n42... e5 *';
  await page.getByLabel('Choose PGN file').setInputFiles({
    name: 'cancel.pgn',
    mimeType: 'application/x-chess-pgn',
    buffer: Buffer.from('[Event "A"]\n\n1. e4 *\n\n' + second + '\n\n[Event "C"]\n\n1. c4 *'),
  });
  await expect(page.getByText(/3 games ready/)).toBeVisible();
  await page.getByRole('button', { name: 'Analyse game', exact: true }).click();
  await expect(page.getByText(/Game 2\/3/)).toBeVisible();
  await expect(page.getByText('Analysing locally')).toBeVisible();
  await expect.poll(() => starts.filter((s) => s.includes(' b KQkq - 0 42')).length).toBe(1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const first = (await stored(page))[0].analysis.createdAt;
  await page.evaluate(() => {
    (window as any).releaseSearch = true;
  });
  // Original UI calls this Analyse game; the fixed UI calls it Resume batch.
  await page.getByRole('button', { name: /^(Analyse game|Resume batch)$/ }).click();
  await expect(page.getByText('Analysis complete')).toBeVisible();
  const saved = await stored(page);
  expect(saved.map((g) => g.analysis.game.headers.Event).sort()).toEqual(['A', 'B', 'C']);
  expect(saved.find((g) => g.analysis.game.headers.Event === 'A').analysis.createdAt).toBe(first);
  expect(starts.filter((s) => s.includes(' b KQkq - 0 42'))).toHaveLength(2);
  expect(starts).toHaveLength(4); // A, interrupted B, resumed B, C.
});

test('two tabs keep both attempts and the latest player selection', async ({
  page,
  context,
  request,
}) => {
  const manifest = await (await request.get('/release.json')).json();
  await ready(page);
  await restore(page, review('1. f3 *', manifest));
  await expect(page.locator('.library-card')).toHaveCount(1);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByLabel('Practice move')).toBeEnabled();
  await page.getByLabel('Practice move').fill('e4');
  await second.getByLabel('Practice move').fill('d4');
  await Promise.all([
    page.getByRole('button', { name: 'Check move', exact: true }).click(),
    second.getByRole('button', { name: 'Check move', exact: true }).click(),
  ]);
  await expect.poll(async () => (await stored(page))[0]?.attempts.length).toBe(2);
  await second.getByLabel('Review player').selectOption('white');
  await expect.poll(async () => (await stored(page))[0]?.player).toBe('white');
  await page.reload();
  await expect(page.getByLabel('Review player')).toHaveValue('white');
  await expect(page.getByText(/2 attempts saved/)).toBeVisible();
});

for (const action of ['reanalysis', 'restore', 'delete', 'player'] as const)
  test(`pending practice is invalidated by ${action}`, async ({ page, request }) => {
    await page.addInitScript(() => {
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message: any, ...args: any[]) {
        if (
          (window as any).holdSearch &&
          typeof message === 'string' &&
          message.startsWith('go ')
        ) {
          (window as any).searchHeld = true;
          return;
        }
        return (original as any).call(this, message, ...args);
      };
    });
    const manifest = await (await request.get('/release.json')).json();
    await ready(page);
    const run = review('1. f3 *', manifest);
    await restore(page, run);
    await expect(page.getByLabel('Practice move')).toBeEnabled();
    await page.evaluate(() => {
      (window as any).holdSearch = true;
    });
    await page.getByLabel('Practice move').fill('h3');
    await page.getByRole('button', { name: 'Check move', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).searchHeld)).toBe(true);
    await page.evaluate(() => {
      (window as any).holdSearch = false;
    });
    if (action === 'reanalysis') {
      await page.getByRole('button', { name: 'Analyse game', exact: true }).click();
      await expect(page.getByLabel('Practice move')).toBeDisabled();
      await expect(page.getByText('Analysis complete')).toBeVisible();
    } else if (action === 'restore') {
      const newer = libraryGame({ ...run, createdAt: '2026-10-07T00:00:00Z' });
      await restore(page, backup([newer]));
      await expect(page.getByText(/Imported 1 review/)).toBeVisible();
      await expect(page.getByLabel('Practice move')).toBeEnabled();
    } else if (action === 'delete') {
      await page.getByRole('button', { name: /Delete White|Delete \? vs/ }).click();
      await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
      await expect(page.locator('.library-card')).toHaveCount(0);
    } else {
      await page.getByLabel('Review player').selectOption('white');
      await expect(page.getByLabel('Practice move')).toBeEnabled();
    }
    const saved = await stored(page);
    if (action === 'delete') expect(saved).toEqual([]);
    else {
      expect(saved[0].attempts).toEqual([]);
      if (action === 'restore') expect(saved[0].analysis.createdAt).toBe('2026-10-07T00:00:00Z');
      if (action === 'player') expect(saved[0].player).toBe('white');
    }
  });

for (const phase of ['headers', 'body'] as const)
  test(`stalled engine ${phase} exits loading on deadline and recovers on retry`, async ({
    page,
  }) => {
    await page.addInitScript((phase) => {
      const original = window.fetch;
      (window as any).stallEngine = true;
      window.fetch = async function (url, options) {
        if (
          (window as any).stallEngine &&
          String(url).includes('/engine/') &&
          String(url).includes('.wasm')
        ) {
          (window as any).engineStalled = true;
          if (phase === 'headers') return new Promise<Response>(() => {});
          return new Response(new ReadableStream({ start() {} }));
        }
        return original.call(this, url, options);
      };
    }, phase);
    await ready(page);
    await page.clock.install();
    await page.getByRole('button', { name: 'Analyse game', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).engineStalled)).toBe(true);
    await page.clock.fastForward(45001);
    await expect(page.getByRole('alert')).toContainText('timed out after 45 seconds');
    await expect(page.getByRole('button', { name: 'Analyse game', exact: true })).toBeEnabled();
    await page.evaluate(() => {
      (window as any).stallEngine = false;
    });
    await page.clock.resume();
    await page.getByRole('button', { name: 'Analyse game', exact: true }).click();
    await expect(page.getByText('Analysis complete')).toBeVisible();
  });

test('warm validation cache detects changed bytes even with unchanged identity and timestamps', async ({
  page,
  request,
}) => {
  const manifest = await (await request.get('/release.json')).json();
  await ready(page);
  await restore(page, review('1. f3 *', manifest));
  await expect(page.locator('.library-card')).toHaveCount(1);
  const raw = (await stored(page))[0];
  raw.analysis.positions[0].lines[0].mateIn = 1.5;
  await seed(page, [raw]);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.library-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear library', exact: true })).toBeEnabled();
});

for (const edit of ['player', 'delete'] as const)
  test(`another tab's ${edit} is preserved when reanalysis completes`, async ({
    page,
    context,
    request,
  }) => {
    await page.addInitScript(() => {
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message: any, ...args: any[]) {
        if (
          (window as any).holdSearch &&
          typeof message === 'string' &&
          message.startsWith('go ')
        ) {
          (window as any).searchHeld = true;
          (window as any).releaseSearch = () => (original as any).call(this, message, ...args);
          return;
        }
        return (original as any).call(this, message, ...args);
      };
    });
    const manifest = await (await request.get('/release.json')).json();
    await ready(page);
    await restore(page, review('1. f3 *', manifest));
    const second = await context.newPage();
    await second.goto('/');
    await expect(second.getByRole('button', { name: 'Analyse game', exact: true })).toBeEnabled();
    await page.evaluate(() => {
      (window as any).holdSearch = true;
    });
    await page.getByRole('button', { name: 'Analyse game', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).searchHeld)).toBe(true);
    if (edit === 'player') {
      await second.getByLabel('Review player').selectOption('black');
      await expect.poll(async () => (await stored(second))[0]?.player).toBe('black');
    } else {
      await second.getByRole('button', { name: /Delete \? vs/ }).click();
      await second.getByRole('button', { name: 'Confirm delete', exact: true }).click();
      await expect(second.locator('.library-card')).toHaveCount(0);
    }
    await page.evaluate(() => {
      (window as any).holdSearch = false;
      (window as any).releaseSearch();
    });
    await expect(page.getByText('Analysis complete')).toBeVisible();
    const saved = await stored(page);
    if (edit === 'player') {
      expect(saved[0].player).toBe('black');
      await page.reload();
      await expect(page.getByLabel('Review player')).toHaveValue('black');
    } else {
      expect(saved).toEqual([]);
      await expect(page.getByRole('button', { name: 'Download unsaved reviews' })).toBeVisible();
    }
  });
