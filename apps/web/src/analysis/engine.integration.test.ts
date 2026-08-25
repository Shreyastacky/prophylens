import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ENGINE_PATH = resolve(process.cwd(), '../../public/engine/stockfish-18-lite-single.js');

describe('Stockfish 18 browser distribution', () => {
  it('completes the UCI handshake and analyses a real position', async () => {
    const transcript = await new Promise<string>((resolveTranscript, rejectTranscript) => {
      const engine = spawn(process.execPath, [ENGINE_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      let sentUci = false;
      let sentReady = false;
      let sentSearch = false;
      let sentForcedSearch = false;

      const timeout = setTimeout(() => {
        engine.kill();
        rejectTranscript(new Error(`Stockfish integration timed out. Transcript:\n${output}`));
      }, 30_000);

      const finish = (error?: Error) => {
        clearTimeout(timeout);
        engine.stdin.write('quit\n');
        engine.kill();
        if (error) rejectTranscript(error);
        else resolveTranscript(output);
      };

      engine.on('error', finish);
      engine.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      engine.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();

        if (!sentUci && output.includes('Stockfish 18 Lite WASM')) {
          sentUci = true;
          engine.stdin.write('uci\n');
        }
        if (!sentReady && output.includes('uciok')) {
          sentReady = true;
          engine.stdin.write('isready\n');
        }
        if (!sentSearch && output.includes('readyok')) {
          sentSearch = true;
          engine.stdin.write('position startpos moves e2e4 e7e5\n');
          engine.stdin.write('go nodes 1000\n');
        }
        if (sentSearch && !sentForcedSearch && /bestmove\s+[a-h][1-8][a-h][1-8]/.test(output)) {
          sentForcedSearch = true;
          engine.stdin.write('position startpos\n');
          engine.stdin.write('go nodes 1000 searchmoves f2f3\n');
        }
        if (sentForcedSearch && output.includes('bestmove f2f3')) finish();
      });
    });

    expect(transcript).toContain('id name Stockfish 18 Lite WASM');
    expect(transcript).toContain('uciok');
    expect(transcript).toContain('readyok');
    expect(transcript).toMatch(/info depth \d+.*nodes \d+.*pv /);
    expect(transcript).toMatch(/bestmove\s+[a-h][1-8][a-h][1-8]/);
    expect(transcript).toContain('bestmove f2f3');
  }, 35_000);
});
