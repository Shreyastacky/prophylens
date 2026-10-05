import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('a held pointer press starts analysis without scrolling the button away', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Analyse game' })).toBeEnabled();
  await page
    .getByRole('textbox', { name: /PGN/ })
    .fill('[Event "Pointer test"]\n[White "You"]\n[Black "Partner"]\n\n1. f3 e5 *');
  await page.getByRole('button', { name: 'Analyse game' }).click({ delay: 100 });
  await expect(page.locator('.nav .status')).not.toHaveText('Engine idle', { timeout: 2000 });
  await expect(page.getByText('Analysis complete', { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.locator('.result-row')).toHaveCount(2);
});

test('shows a real game preview before analysis and resets it for a new PGN', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Analyse game' })).toBeEnabled();
  await expect(page.locator('.results .board-square')).toHaveCount(64);
  await expect(page.locator('.results .piece img')).toHaveCount(32);
  await page.getByRole('button', { name: 'Next preview move' }).click();
  await expect(page.locator('.preview-toolbar strong')).toHaveText('f3');
  await expect(page.locator('.results [aria-label="White pawn on f3"]')).toBeVisible();
  await page.getByRole('button', { name: 'Flip board in preview' }).click();
  await expect(page.locator('.results .board-square').first()).toHaveAttribute(
    'aria-label',
    'White rook on h1',
  );
  await page.getByRole('textbox', { name: /PGN/ }).fill('1. e4 e5 *');
  await expect(page.locator('.preview-toolbar strong')).toHaveText('Starting position');
  await page.getByRole('button', { name: 'Next preview move' }).click();
  await expect(page.locator('.results [aria-label="White pawn on e4"]')).toBeVisible();
});

test('appearance follows the system, can be changed and persists; both themes are accessible', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Analyse game' })).toBeEnabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Switch to dark appearance' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light appearance' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('preview board stays square, loads every piece and fits narrow and wide screens', async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Analyse game' })).toBeEnabled();
    const result = await page.evaluate(() => {
      const squares = [...document.querySelectorAll('.results .board-square')];
      const pieces = [...document.querySelectorAll<HTMLImageElement>('.results .piece img')];
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        maxDifference: Math.max(
          ...squares.map((square) => {
            const box = square.getBoundingClientRect();
            return Math.abs(box.width - box.height);
          }),
        ),
        loaded: pieces.every((piece) => piece.complete && piece.naturalWidth > 0),
      };
    });
    expect(result.overflow, `overflow at ${width}px`).toBe(false);
    expect(result.maxDifference, `square geometry at ${width}px`).toBeLessThanOrEqual(0.5);
    expect(result.loaded, `piece artwork at ${width}px`).toBe(true);
  }
});

test('waits for the current PGN before analysis and allows reloading the same sample', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const analyse = page.getByRole('button', { name: 'Analyse game' });
  await expect(analyse).toBeEnabled();
  let release = () => {};
  let requested = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const workerRequest = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await context.route('**/assets/pgn.worker-*.js', async (route) => {
    requested();
    await held;
    await route.continue();
  });
  await page.getByRole('textbox', { name: /PGN/ }).fill('1. c4 e5 *');
  await page.getByRole('textbox', { name: /PGN/ }).fill('1. d4 d5 *');
  try {
    await workerRequest;
    await expect(analyse).toBeDisabled();
    await expect(page.getByText('Checking your game…')).toBeVisible();
    await expect(page.getByText('Engine idle', { exact: true })).toBeVisible();
  } finally {
    release();
  }
  await expect(analyse).toBeEnabled();
  await analyse.click();
  await expect(page.getByText('Analysis complete', { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.locator('.result-row')).toHaveCount(2);
  await expect(page.locator('.board-summary > div').first().getByText('1. d4')).toBeVisible();
  await page.getByRole('button', { name: 'Load sample' }).click();
  await expect(analyse).toBeEnabled();
  await page.getByRole('button', { name: 'Load sample' }).click();
  await expect(analyse).toBeEnabled();
});
