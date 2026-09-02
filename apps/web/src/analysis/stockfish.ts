import type { AnalysisSettings, EngineLine, GamePosition, PositionAnalysis } from './types';
import { ENGINE_ASSET } from './types';
import { parseBestMove, parseInfoLine } from './uci';

const INITIALIZATION_TIMEOUT_MS = 30_000;
const POSITION_TIMEOUT_MS = 120_000;

function abortError(): DOMException {
  return new DOMException('Analysis cancelled', 'AbortError');
}

export class StockfishClient {
  private worker: Worker | null = null;
  private listeners = new Set<(line: string) => void>();
  private failureListeners = new Set<(error: Error) => void>();
  private initialization: Promise<string> | null = null;
  private engineName = 'Stockfish 18';

  private createWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(ENGINE_ASSET.workerUrl);
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      const text = String(event.data);
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        for (const listener of this.listeners) listener(line);
      }
    });
    worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'Stockfish worker failed to load.');
      for (const listener of this.failureListeners) listener(error);
    });
    this.worker = worker;
    return worker;
  }

  private commandUntil(
    command: string,
    done: (line: string) => boolean,
    options: {
      timeoutMs: number;
      signal?: AbortSignal;
      onLine?: (line: string) => void;
    },
  ): Promise<string> {
    const worker = this.createWorker();

    return new Promise((resolve, reject) => {
      let timeoutId = 0;

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        this.listeners.delete(onMessage);
        this.failureListeners.delete(onFailure);
        options.signal?.removeEventListener('abort', onAbort);
      };
      const onFailure = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onAbort = () => {
        worker.postMessage('stop');
        cleanup();
        reject(abortError());
      };
      const onMessage = (line: string) => {
        options.onLine?.(line);
        if (done(line)) {
          cleanup();
          resolve(line);
        }
      };

      if (options.signal?.aborted) {
        reject(abortError());
        return;
      }

      this.listeners.add(onMessage);
      this.failureListeners.add(onFailure);
      options.signal?.addEventListener('abort', onAbort, { once: true });
      timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error(`Stockfish did not finish "${command}" within the time limit.`));
      }, options.timeoutMs);
      worker.postMessage(command);
    });
  }

  initialize(): Promise<string> {
    if (this.initialization) return this.initialization;

    this.initialization = (async () => {
      await this.commandUntil('uci', (line) => line === 'uciok', {
        timeoutMs: INITIALIZATION_TIMEOUT_MS,
        onLine: (line) => {
          if (line.startsWith('id name ')) this.engineName = line.slice('id name '.length);
        },
      });
      this.createWorker().postMessage('setoption name Hash value 16');
      this.createWorker().postMessage('setoption name UCI_ShowWDL value true');
      await this.commandUntil('isready', (line) => line === 'readyok', {
        timeoutMs: INITIALIZATION_TIMEOUT_MS,
      });
      return this.engineName;
    })().catch((error) => {
      this.terminate();
      throw error;
    });

    return this.initialization;
  }

  async analysePosition(
    position: GamePosition,
    settings: AnalysisSettings,
    signal: AbortSignal,
    onNodes: (nodes: number) => void,
  ): Promise<PositionAnalysis> {
    await this.initialize();
    if (signal.aborted) throw abortError();

    const search = async (
      multiPv: number,
      searchMove?: string,
    ): Promise<{
      bestMove: string;
      lines: EngineLine[];
    }> => {
      const lines = new Map<number, EngineLine>();
      let bestMove = '';
      this.createWorker().postMessage(`setoption name MultiPV value ${multiPv}`);
      this.createWorker().postMessage(position.positionCommand);
      const command = `go nodes ${settings.nodes}${searchMove ? ` searchmoves ${searchMove}` : ''}`;

      await this.commandUntil(
        command,
        (line) => {
          const parsedBestMove = parseBestMove(line);
          if (parsedBestMove) bestMove = parsedBestMove;
          return line.startsWith('bestmove ');
        },
        {
          timeoutMs: POSITION_TIMEOUT_MS,
          signal,
          onLine: (line) => {
            const parsed = parseInfoLine(line);
            if (!parsed) return;
            const previous = lines.get(parsed.rank);
            if (!previous || parsed.depth >= previous.depth) lines.set(parsed.rank, parsed);
            onNodes((searchMove ? settings.nodes : 0) + parsed.nodes);
          },
        },
      );

      return { bestMove, lines: [...lines.values()].sort((a, b) => a.rank - b.rank) };
    };

    const bestSearch = await search(settings.multiPv);
    const playedSearch =
      bestSearch.bestMove === position.moveUci
        ? { bestMove: position.moveUci, lines: [bestSearch.lines[0]!] }
        : await search(1, position.moveUci);

    if (!bestSearch.bestMove || !bestSearch.lines[0] || !playedSearch.lines[0]) {
      throw new Error(`Stockfish returned incomplete evidence at ply ${position.ply}.`);
    }

    return {
      ply: position.ply,
      san: position.san,
      playedMoveUci: position.moveUci,
      fen: position.fen,
      sideToMove: position.sideToMove,
      bestMoveUci: bestSearch.bestMove,
      lines: bestSearch.lines,
      playedLine: playedSearch.lines[0],
    };
  }

  terminate(): void {
    if (this.worker) {
      this.worker.postMessage('quit');
      this.worker.terminate();
    }
    this.worker = null;
    this.initialization = null;
    this.listeners.clear();
    const error = abortError();
    for (const listener of this.failureListeners) listener(error);
    this.failureListeners.clear();
  }
}
