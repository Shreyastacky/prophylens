import { ENGINE_ASSET } from './types';

export async function verifiedEngineUrls(
  signal: AbortSignal,
): Promise<{ script: string; wasm: string }> {
  const files = await Promise.all(
    [
      [ENGINE_ASSET.workerUrl, ENGINE_ASSET.scriptSha256, 'text/javascript'],
      [ENGINE_ASSET.wasmUrl, ENGINE_ASSET.wasmSha256, 'application/wasm'],
    ].map(async ([path, expected, type]) => {
      const response = await fetch(`${path}?sha256=${expected}`, { signal });
      if (!response.ok)
        throw new Error('Could not download the chess engine. Reload and try again.');
      const bytes = await response.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const actual = [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('');
      if (actual !== expected)
        throw new Error('Chess engine integrity check failed. Reload to download a clean copy.');
      return { bytes, type };
    }),
  );
  signal.throwIfAborted();
  return {
    script: URL.createObjectURL(new Blob([files[0]!.bytes], { type: files[0]!.type })),
    wasm: URL.createObjectURL(new Blob([files[1]!.bytes], { type: files[1]!.type })),
  };
}
