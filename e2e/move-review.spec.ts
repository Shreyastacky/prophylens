import { expect, test } from '@playwright/test';

const shortGame = `[Event "Browser test"]
[White "Tester"]
[Black "Engine"]
[Result "*"]

1. f3 e5 *`;

test('analyses a game and connects the results to the chessboard', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
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
  await expect(page.locator('.board-square')).toHaveCount(64);
  await expect(page.locator('.square-played')).toHaveCount(2);
  await expect(page.locator('.square-best')).toHaveCount(2);
  await expect(page.locator('.board-summary > div').first().getByText('1. f3')).toBeVisible();

  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('.board-summary > div').first().getByText('1… e5')).toBeVisible();

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
  await expect(page.getByText('Engine ready')).toBeVisible();

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
