import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const game =
  '[Event "Library test"]\n[White "You"]\n[Black "Partner"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
test('library survives refresh, backup restore and practice; review is accessible', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Analyse game' })).toBeEnabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('textbox', { name: /PGN/ }).fill(game);
  await page.getByRole('button', { name: 'Analyse game' }).click();
  await expect(page.getByText('Analysis complete')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.library-card')).toHaveCount(1);
  await page.getByLabel('Review player').selectOption('white');
  await expect(page.locator('.result-row')).toHaveCount(2);
  await page.getByLabel('Practice move').fill('e4');
  await page.getByRole('button', { name: 'Check move' }).click();
  await expect(page.getByText(/1 attempts saved/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Switch to dark appearance' }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Switch to light appearance' }).click();
  await page.reload();
  await expect(page.getByText('Analysis complete')).toBeVisible();
  await expect(page.getByLabel('Review player')).toHaveValue('white');
  await expect(page.getByText(/1 attempts saved/)).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export library', exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.getByRole('button', { name: 'Clear library', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.locator('.library-card')).toHaveCount(0);
  await page.getByLabel('Import library backup').setInputFiles(path!);
  await expect(page.locator('.library-card')).toHaveCount(1);
  await expect(page.getByText(/1 attempts saved/)).toBeVisible();
  await page.getByLabel('Import library backup').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"wrong"}'),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.library-card')).toHaveCount(1);
});
test('failed persistence keeps the completed review downloadable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      if (args[1] === 'readwrite') throw new DOMException('Storage disabled', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: /PGN/ }).fill('1. f3 e5 *');
  await page.getByRole('button', { name: 'Analyse game' }).click();
  await expect(page.getByText('Analysis complete')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download evidence' })).toBeEnabled();
  await expect(page.getByText('In memory · download to keep')).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
});
test('cancel, restart and repeated analysis recover without duplicate games', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: any, ...args: any[]) {
      // Hold the first requested search so a fast engine cannot finish while
      // the browser waits for the moving Cancel button to become stable.
      if (
        typeof message === 'string' &&
        message.startsWith('go ') &&
        !(window as any).firstSearchHeld
      ) {
        (window as any).firstSearchHeld = true;
        return;
      }
      return (original as any).call(this, message, ...args);
    };
  });
  await page.goto('/');
  await page.getByLabel('Nodes per position').selectOption('100000');
  await page.getByRole('button', { name: 'Analyse game' }).click();
  await expect(page.getByText('Analysing locally')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean((window as any).firstSearchHeld))).toBe(true);
  const start = Date.now();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Analysis cancelled')).toBeVisible({ timeout: 2000 });
  expect(Date.now() - start).toBeLessThan(2000);
  await page.getByRole('button', { name: 'Restart engine' }).click();
  await expect(page.getByText('Engine ready')).toBeVisible({ timeout: 90_000 });
  await page.getByLabel('Nodes per position').selectOption('10000');
  await page.getByRole('textbox', { name: /PGN/ }).fill('1. e4 e5 *');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Analyse game' }).click();
    await expect(page.getByText('Analysis complete')).toBeVisible();
  }
  await expect(page.locator('.library-card')).toHaveCount(1);
});
