import type { LibraryGame } from './types';
import {
  readLibraryFile,
  validateRows,
  importGames,
  listGames,
  corruptRecordCount,
  announceLibraryChange,
} from './storage';
type Checked = { games: LibraryGame[]; corrupt: number; importedIds?: string[] };
let validator: Worker | undefined;
let sequence = 0;
const pending = new Map<number, { resolve: (v: Checked) => void; reject: (e: Error) => void }>();
function request(payload: {
  rows?: unknown[];
  file?: File;
  mode?: 'import' | 'list';
}): Promise<Checked> {
  if (!validator) {
    validator = new Worker(new URL('./storage.worker.ts', import.meta.url), { type: 'module' });
    validator.onmessage = (e: MessageEvent<{ id: number; value?: Checked; error?: string }>) => {
      const job = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (e.data.value) job?.resolve(e.data.value);
      else job?.reject(new Error(e.data.error ?? 'Could not validate the backup.'));
    };
    validator.onerror = () => {
      for (const job of pending.values())
        job.reject(new Error('The library reader failed. Retry or use a smaller backup.'));
      pending.clear();
      validator?.terminate();
      validator = undefined;
    };
  }
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      validator!.postMessage({ id, ...payload });
    } catch (e) {
      pending.delete(id);
      reject(e instanceof Error ? e : new Error('Could not start library reader.'));
    }
  });
}
export function validateRowsAsync(rows: unknown[]): Promise<Checked> {
  return typeof window === 'undefined' || typeof Worker === 'undefined'
    ? validateRows(rows)
    : request({ rows });
}
export function readStoredLibraryAsync(): Promise<Checked> {
  return request({ mode: 'list' });
}
export async function importLibraryAsync(file: File): Promise<Checked> {
  if (typeof Worker === 'undefined') {
    const imported = await readLibraryFile(await file.text());
    await importGames(imported);
    return {
      games: await listGames(),
      corrupt: corruptRecordCount,
      importedIds: imported.map((g) => g.id),
    };
  }
  const checked = await request({ file, mode: 'import' });
  announceLibraryChange();
  return checked;
}
export async function readLibraryFileAsync(file: File): Promise<LibraryGame[]> {
  return typeof Worker === 'undefined'
    ? readLibraryFile(await file.text())
    : (await request({ file })).games;
}
