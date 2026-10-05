import { expect, test } from '@playwright/test';

test('fresh and revalidated workers retain the same-origin security policy', async ({
  request,
}) => {
  const manifest = (await (await request.get('/release.json')).json()) as {
    assets: Record<string, string>;
  };
  const workers = Object.keys(manifest.assets).filter((path) =>
    /pgn\.worker-.*\.js$|engine\/stockfish-.*\.js$/.test(path),
  );
  expect(workers).toHaveLength(2);
  for (const worker of workers) {
    const fresh = await request.get('/' + worker);
    expect(fresh.status()).toBe(200);
    expect(fresh.headers()['cross-origin-resource-policy']).toBe('same-origin');
    expect(fresh.headers()['cross-origin-embedder-policy']).toBe('require-corp');
    const etag = fresh.headers().etag;
    if (etag) {
      const cached = await request.get('/' + worker, { headers: { 'If-None-Match': etag } });
      expect([200, 304]).toContain(cached.status());
      expect(cached.headers()['cross-origin-resource-policy']).toBe('same-origin');
      expect(cached.headers()['cross-origin-embedder-policy']).toBe('require-corp');
    }
  }
});
