import { expect, test } from '@playwright/test';

test('fresh and revalidated workers retain the origin isolation policy', async ({ request }) => {
  const document = await request.get('/');
  const embedderPolicy = document.headers()['cross-origin-embedder-policy'];
  expect(embedderPolicy).toBe('require-corp');
  const manifest = (await (await request.get('/release.json')).json()) as {
    assets: Record<string, string>;
  };
  const workers = Object.keys(manifest.assets).filter((path) =>
    /(?:pgn|storage)\.worker-.*\.js$|engine\/stockfish-.*\.js$/.test(path),
  );
  expect(workers).toHaveLength(3);
  for (const worker of workers) {
    const fresh = await request.get('/' + worker);
    expect(fresh.status()).toBe(200);
    expect(fresh.headers()['cross-origin-embedder-policy']).toBe(embedderPolicy);
    if (embedderPolicy === 'require-corp')
      expect(fresh.headers()['cross-origin-resource-policy']).toBe('same-origin');
    const etag = fresh.headers().etag;
    if (etag) {
      const cached = await request.get('/' + worker, { headers: { 'If-None-Match': etag } });
      expect(cached.status()).toBe(304);
      expect(cached.headers()['cross-origin-embedder-policy']).toBe(embedderPolicy);
      if (embedderPolicy === 'require-corp')
        expect(cached.headers()['cross-origin-resource-policy']).toBe('same-origin');
      const weak = await request.get('/' + worker, {
        headers: { 'If-None-Match': '"unrelated", W/' + etag.replace(/^W\//, '') },
      });
      expect(weak.status()).toBe(304);
      expect(weak.headers()['cross-origin-embedder-policy']).toBe(embedderPolicy);
    }
  }
});
