import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SECURITY_HEADERS, META_CSP } from '../scripts/security-policy.mjs';

test('production build serves real security headers, meta CSP and a complete licence bundle', async ({
  page,
  request,
}) => {
  const response = await page.goto('/');
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    expect(response!.headers()[name.toLowerCase()]).toBe(value);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    META_CSP,
  );
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  const manifest = await (await request.get('/release.json')).json();
  expect(manifest.version).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version);
  if (process.env.EXPECTED_SOURCE_REVISION)
    expect(manifest.sourceRevision).toBe(process.env.EXPECTED_SOURCE_REVISION);
  for (const path of [
    'LICENSE.txt',
    'THIRD_PARTY_NOTICES.txt',
    'licenses/scheduler.txt',
    'engine/COPYING.txt',
    'pieces/LICENSE.txt',
  ]) {
    const file = await request.get('/' + path);
    expect(file.status()).toBe(200);
    expect(
      createHash('sha256')
        .update(await file.body())
        .digest('hex'),
    ).toBe(manifest.assets[path]);
  }
  const wasm = await request.get('/engine/stockfish-18-lite-single.wasm');
  expect(wasm.headers()['content-type']).toBe('application/wasm');
  expect(wasm.headers()['cache-control']).toBe('no-cache');
  const hashed = await request.get(
    '/engine/stockfish-18-lite-single.wasm?sha256=' +
      manifest.assets['engine/stockfish-18-lite-single.wasm'],
  );
  expect(hashed.headers()['cache-control']).toContain('immutable');
});

for (const extension of ['js', 'wasm'])
  test(`tampered engine ${extension} fails closed before execution and can recover`, async ({
    page,
    context,
  }) => {
    await context.route(`**/engine/stockfish-18-lite-single.${extension}?*`, async (route) => {
      const response = await route.fetch();
      const bytes = await response.body();
      bytes[bytes.length - 1] ^= 1;
      await route.fulfill({ response, body: bytes });
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Analyse game' })).toBeEnabled();
    await page.getByRole('button', { name: 'Analyse game' }).click();
    await expect(page.getByRole('alert')).toContainText('integrity check failed');
    await expect(page.locator('.library-card')).toHaveCount(0);
    await expect(page.locator('.result-row')).toHaveCount(0);
    await context.unrouteAll({ behavior: 'wait' });
    await page.getByRole('button', { name: 'Analyse game' }).click();
    await expect(page.getByText('Analysis complete')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download evidence' }).click();
    const { readFile } = await import('node:fs/promises');
    const receipt = JSON.parse(await readFile((await (await downloadPromise).path())!, 'utf8'));
    const manifest = await (await page.request.get('/release.json')).json();
    expect(receipt.provenance.appVersion).toBe(manifest.version);
    expect(receipt.provenance.sourceRevision).toBe(manifest.sourceRevision);
    expect(receipt.provenance.wasmSha256).toBe(
      manifest.assets['engine/stockfish-18-lite-single.wasm'],
    );
  });

test('FEN move numbers use the starting side and fullmove; arrows stay in the review', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('textbox', { name: /PGN/ })
    .fill(
      '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 42"]\n\n42... e5 43. Nf3 Nc6 *',
    );
  await expect(page.getByRole('button', { name: 'Analyse game' })).toBeEnabled();
  await page.getByRole('button', { name: 'Analyse game' }).click();
  await expect(page.getByText('Analysis complete')).toBeVisible();
  await expect(page.locator('.move-cell span')).toHaveText(['42...', '43.', '43...']);
  const review = page.getByRole('region', { name: 'Chess move review' });
  await review.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.result-selected .move-cell span')).toHaveText('43.');
  await page.getByRole('button', { name: 'Export library', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.result-selected .move-cell span')).toHaveText('43.');
  await page.getByLabel('Review player').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.result-selected .move-cell span')).toHaveText('43.');
});
