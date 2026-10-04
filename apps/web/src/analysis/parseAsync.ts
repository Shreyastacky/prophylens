import type { ParsedGame } from './types';
import { checkPgnSize } from './pgn';
export function parsePgnAsync(pgn: string, signal?: AbortSignal): Promise<ParsedGame> {
  checkPgnSize(pgn);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./pgn.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('This PGN took too long to read. Try a smaller game.'));
    }, 10000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ game?: ParsedGame; error?: string }>) => {
      cleanup();
      if (event.data.game) resolve(event.data.game);
      else reject(new Error(event.data.error ?? 'Could not read this game.'));
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error('Could not start the PGN reader. Reload and try again.'));
    };
    worker.postMessage(pgn);
  });
}
