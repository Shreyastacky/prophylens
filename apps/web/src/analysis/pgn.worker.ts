import { parseGame } from './pgn';
self.addEventListener('message', (event: MessageEvent<string>) => {
  try {
    self.postMessage({ game: parseGame(event.data) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Unable to read this game.',
    });
  }
});
