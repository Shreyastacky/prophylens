import { test, expect } from '@playwright/test';
test('reviews an 81-ply game at Quick budget', async ({ page }, info) => {
  await page.goto('/');
  await page.getByLabel('Choose PGN file').setInputFiles('e2e/fixtures/fischer-spassky-1972-6.pgn');
  await expect(page.getByText('81 half-moves ready for local analysis')).toBeVisible();
  const started = Date.now();
  await page.getByRole('button', { name: 'Analyse game' }).click();
  await expect(page.getByText('Analysis complete')).toBeVisible({ timeout: 90000 });
  const elapsed = Date.now() - started;
  await expect(page.locator('.result-row')).toHaveCount(81);
  await expect(page.locator('.library-card')).toHaveCount(1);
  await info.attach('full game timing', {
    body: JSON.stringify({
      browser: info.project.name,
      plies: 81,
      nodes: 10000,
      elapsedMs: elapsed,
    }),
    contentType: 'application/json',
  });
  await page.getByRole('button', { name: 'Engine line', exact: true }).click();
  await expect(page.getByLabel('Engine variation')).toBeVisible();
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await page.getByRole('button', { name: /Key moments/ }).click();
  const count = await page.locator('.result-row').count();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.result-row')).toHaveCount(count);
});
