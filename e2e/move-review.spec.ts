import { expect, test, type Page } from '@playwright/test';

const shortGame = `[Event "Browser test"]
[White "Tester"]
[Black "Engine"]
[Result "*"]

1. f3 e5 *`;

async function expectPerfectlySquareBoard(page: Page) {
  const dimensions = await page.locator('.results .board-square').evaluateAll((squares) =>
    squares.map((square) => {
      const { width, height } = square.getBoundingClientRect();
      return { width, height };
    }),
  );
  const widths = dimensions.map(({ width }) => width);
  const heights = dimensions.map(({ height }) => height);

  for (const { width, height } of dimensions) {
    expect(Math.abs(width - height)).toBeLessThanOrEqual(0.5);
  }
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(0.5);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(0.5);
}

test('analyses a game and connects the results to the chessboard', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    // Sites' edge protection may emit a Firefox cookie-domain diagnostic.
    // Keep all application errors visible; record this exact provider diagnostic separately.
    if (message.type() === 'error') {
      if (
        process.env.PUBLIC_BASE_URL &&
        message.text().includes('Cookie “__cf_bm” has been rejected for invalid domain.')
      ) {
        void testInfo.attach('hosting cookie diagnostic', {
          body: message.text(),
          contentType: 'text/plain',
        });
      } else consoleErrors.push(message.text());
    }
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });

  await page.goto('/');
  await page.getByLabel('Choose PGN file').setInputFiles({
    name: 'browser-test.pgn',
    mimeType: 'application/x-chess-pgn',
    buffer: Buffer.from(shortGame),
  });
  await expect(page.getByText('browser-test.pgn loaded locally')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /PGN/ })).toHaveValue(shortGame);
  await expect(page.getByText('2 half-moves ready for local analysis')).toBeVisible();
  await page.getByRole('button', { name: 'Analyse game' }).click();

  await expect(page.getByText('Analysis complete')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.result-row')).toHaveCount(2);
  await expect(page.locator('.results .board-square')).toHaveCount(64);
  await expectPerfectlySquareBoard(page);
  await expect(page.locator('.results .square-played')).toHaveCount(2);
  await expect(page.locator('.results .square-best')).toHaveCount(2);
  await expect(page.locator('.board-summary > div').first().getByText('1. f3')).toBeVisible();
  await expect(page.getByText('Biggest miss')).toBeVisible();
  await expect(page.locator('.review-summary article').first()).toBeVisible();

  await page.getByRole('button', { name: /Key moments 1/ }).click();
  await expect(page.locator('.result-row')).toHaveCount(1);
  await expect(page.getByText('1 moves shown')).toBeVisible();
  await page.getByRole('button', { name: /All moves 2/ }).click();

  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('.results .board-square').first()).toHaveAttribute(
    'aria-label',
    'White rook on h1',
  );
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await expect(page.locator('.board-summary > div').first().getByText('1... e5')).toBeVisible();

  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.board-summary > div').first().getByText('1. f3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download evidence' })).toBeEnabled();

  const screenshotPath = testInfo.outputPath('completed-move-review.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach('completed move review', {
    path: screenshotPath,
    contentType: 'image/png',
  });

  await page.getByRole('textbox', { name: /PGN/ }).fill('1. e4 *');
  await expect(page.locator('.result-row')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download evidence' })).toHaveCount(0);
  await expect(page.getByText('Engine idle')).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('rejects unsafe file imports without replacing the current game', async ({ page }) => {
  await page.goto('/');
  const pgnEditor = page.getByRole('textbox', { name: /PGN/ });
  const originalPgn = await pgnEditor.inputValue();

  await page.getByLabel('Choose PGN file').setInputFiles({
    name: 'not-a-game.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(shortGame),
  });

  await expect(page.getByRole('alert')).toHaveText('Choose a file ending in .pgn.');
  await expect(pgnEditor).toHaveValue(originalPgn);
});

test('cancels an active analysis promptly and allows recovery', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Nodes per position').selectOption('100000');
  await page.getByRole('button', { name: 'Analyse game' }).click();
  await expect(page.getByText('Analysing locally')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Analysis cancelled')).toBeVisible({ timeout: 2_000 });
  await expect(page.getByRole('button', { name: 'Restart engine' })).toBeEnabled();
});

test('keeps the completed review usable on a phone-sized screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('textbox', { name: /PGN/ }).fill(shortGame);
  await page.getByRole('button', { name: 'Analyse game' }).click();
  await expect(page.getByText('Analysis complete')).toBeVisible({ timeout: 120_000 });

  await expect(page.locator('.results .board-square')).toHaveCount(64);
  await expectPerfectlySquareBoard(page);
  await expect(page.getByText('Biggest miss')).toBeVisible();
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.right > window.innerWidth + 1 && box.width > 1;
      })
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        width: el.getBoundingClientRect().width,
      })),
  );
  await testInfo.attach('layout bounds', {
    body: JSON.stringify(overflow),
    contentType: 'application/json',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  const screenshotPath = testInfo.outputPath('mobile-move-review.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach('mobile move review', {
    path: screenshotPath,
    contentType: 'image/png',
  });
});
