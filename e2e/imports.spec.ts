import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('batch import, old receipt migration, damaged records and oversize paste', async ({
  page,
}) => {
  await page.goto('/');
  const batch =
    '[Event "A"]\n[White "Alpha"]\n\n1. e4 e5 *\n\n[Event "B"]\n[White "Beta"]\n\n1. d4 d5 *';
  await page.getByLabel('Choose PGN file').setInputFiles({
    name: 'batch.pgn',
    mimeType: 'application/x-chess-pgn',
    buffer: Buffer.from(batch),
  });
  await expect(page.getByText(/2 games ready/)).toBeVisible();
  await page.getByRole('button', { name: 'Analyse game' }).click();
  await expect(page.getByText('Analysis complete')).toBeVisible();
  await expect(page.locator('.library-card')).toHaveCount(2);
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download evidence' }).click();
  const file = await waiting;
  const receipt = JSON.parse(await readFile((await file.path())!, 'utf8'));
  receipt.schemaVersion = 2;
  delete receipt.pgn;
  receipt.provenance.classifierVersion = 'move-loss-v1';
  await page.getByRole('button', { name: 'Clear library', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.locator('.library-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirm delete', exact: true })).toHaveCount(0);
  await page.evaluate(
    (run) => localStorage.setItem('prophylens:last-analysis:v2', JSON.stringify(run)),
    receipt,
  );
  await page.reload();
  await expect(page.locator('.library-card')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('prophylens:last-analysis:v2'))).toBeNull();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('prophylens-library', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('games', 'readwrite');
          tx.objectStore('games').put({ id: 'damaged' });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByText(/1 damaged record/)).toBeVisible();
  await expect(page.locator('.library-card')).toHaveCount(1);
  await page.getByRole('textbox', { name: /PGN/ }).fill('x'.repeat(2 * 1024 * 1024 + 1));
  await expect(page.getByRole('button', { name: 'Analyse game' })).toBeDisabled();
  await expect(page.getByRole('alert')).toBeVisible();
});
