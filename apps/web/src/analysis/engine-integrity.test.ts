import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { verifiedEngineUrls } from './engine-integrity';
import { ENGINE_ASSET } from './types';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('bounded engine downloads', () => {
  it.each(['headers', 'body'])('times out stalled %s and aborts both requests', async (phase) => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, options) => {
        signals.push(options.signal);
        return phase === 'headers'
          ? new Promise(() => {})
          : Promise.resolve({ ok: true, arrayBuffer: () => new Promise(() => {}) });
      }),
    );
    let failure: unknown;
    void verifiedEngineUrls(new AbortController().signal).catch((e) => {
      failure = e;
    });
    await vi.advanceTimersByTimeAsync(45001);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/45 seconds/);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
  it('can cancel loading immediately even if the transport stalls', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    const abort = new AbortController();
    const pending = verifiedEngineUrls(abort.signal);
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  }, 1000);
  it('retries successfully with pinned bytes and creates no partial blob URLs', async () => {
    const script = await readFile('../../public/engine/stockfish-18-lite-single.js');
    const wasm = await readFile('../../public/engine/stockfish-18-lite-single.wasm');
    vi.stubGlobal(
      'fetch',
      vi.fn((url) =>
        Promise.resolve(new Response(String(url).startsWith(ENGINE_ASSET.wasmUrl) ? wasm : script)),
      ),
    );
    const create = vi.spyOn(URL, 'createObjectURL');
    const urls = await verifiedEngineUrls(new AbortController().signal);
    expect(create).toHaveBeenCalledTimes(2);
    URL.revokeObjectURL(urls.script);
    URL.revokeObjectURL(urls.wasm);
  });
});
