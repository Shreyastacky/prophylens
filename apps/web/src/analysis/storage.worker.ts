import {
  readLibraryFile,
  validateLibraryGame,
  listGames,
  importGames,
  corruptRecordCount,
} from './storage';
import type { LibraryGame } from './types';
// Cache only byte-identical rows. Timestamp/length-only keys would conceal
// corruption and edits from another tab. All serialization stays off the UI.
const cache = new Map<string, { raw: string; game?: LibraryGame }>();
async function cachedGame(row: unknown): Promise<LibraryGame> {
  const raw = JSON.stringify(row);
  const key = String((row as { id?: unknown })?.id);
  const hit = cache.get(key);
  if (hit?.raw === raw && hit.game) return hit.game;
  const game = await validateLibraryGame(row);
  cache.set(key, { raw: JSON.stringify(game), game });
  return game;
}
async function cachedRows(rows: unknown[], prune = true) {
  const games: LibraryGame[] = [];
  const live = new Set<string>();
  let corrupt = 0;
  for (const row of rows) {
    const raw = JSON.stringify(row);
    const key = String((row as { id?: unknown })?.id);
    live.add(key);
    let entry = cache.get(key);
    if (!entry || entry.raw !== raw) {
      try {
        entry = { raw, game: await validateLibraryGame(row) };
      } catch {
        entry = { raw };
      }
      cache.set(key, entry);
    }
    if (entry.game) games.push(entry.game);
    else corrupt++;
  }
  if (prune) for (const key of cache.keys()) if (!live.has(key)) cache.delete(key);
  return { games, corrupt };
}
self.onmessage = async (
  event: MessageEvent<{ id: number; rows?: unknown[]; file?: File; mode?: 'list' | 'import' }>,
) => {
  const { id, rows, file, mode } = event.data;
  try {
    if (mode === 'list') {
      const games = await listGames(cachedRows);
      self.postMessage({ id, value: { games, corrupt: corruptRecordCount } });
      return;
    }
    if (file) {
      const games = await readLibraryFile(await file.text(), cachedGame);
      for (const game of games) cache.set(game.id, { raw: JSON.stringify(game), game });
      if (mode === 'import') {
        await importGames(games, (rows) => cachedRows(rows, false));
        const saved = await listGames(cachedRows);
        self.postMessage({
          id,
          value: { games: saved, corrupt: corruptRecordCount, importedIds: games.map((g) => g.id) },
        });
      } else self.postMessage({ id, value: { games, corrupt: 0 } });
      return;
    }
    self.postMessage({ id, value: await cachedRows(rows ?? []) });
  } catch (e) {
    self.postMessage({ id, error: e instanceof Error ? e.message : 'Could not read backup.' });
  }
};
