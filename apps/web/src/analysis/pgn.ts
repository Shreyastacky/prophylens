import { Chess } from 'chess.js';
import type { ParsedGame } from './types';
export const MAX_PGN_BYTES = 2 * 1024 * 1024;
export const MAX_GAME_PLIES = 600;
export const MAX_BATCH_GAMES = 100;
export function checkPgnSize(pgn: string): void {
  if (new TextEncoder().encode(pgn).byteLength > MAX_PGN_BYTES)
    throw new Error('That PGN is larger than the 2 MB safety limit.');
}
function moveToUci(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}
export function parseGame(pgn: string): ParsedGame {
  if (!pgn.trim()) throw new Error('Paste a PGN before starting analysis.');
  checkPgnSize(pgn);
  const game = new Chess();
  try {
    game.loadPgn(pgn, { strict: false });
  } catch {
    throw new Error(
      'Could not read this game. Check its PGN notation, legal moves and starting FEN. Import multi-game files with Choose .pgn file.',
    );
  }
  const variant = game.getHeaders().Variant;
  if (variant && !['standard', 'chess', 'normal'].includes(variant.toLowerCase()))
    throw new Error('Only standard chess is supported.');
  const moves = game.history({ verbose: true });
  if (!moves.length) throw new Error('The PGN does not contain any moves.');
  if (moves.length > MAX_GAME_PLIES) throw new Error('A game can contain at most 600 half-moves.');
  const rootFen = moves[0]!.before;
  const movesUci: string[] = [];
  const positions = moves.map((move, index) => {
    const moveUci = moveToUci(move);
    const history = movesUci.length ? ` moves ${movesUci.join(' ')}` : '';
    const position = {
      ply: index + 1,
      san: move.san,
      moveUci,
      fen: move.before,
      sideToMove: move.color === 'w' ? 'white' : 'black',
      positionCommand: `position fen ${rootFen}${history}`,
    } as const;
    movesUci.push(moveUci);
    return position;
  });
  return { headers: game.getHeaders(), positions };
}
export function splitPgnGames(pgn: string): string[] {
  checkPgnSize(pgn);
  const games: string[] = [];
  let current: string[] = [];
  let movetext = false;
  let commentDepth = 0;
  for (const line of pgn.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = line.trim();
    const tag = commentDepth === 0 && /^\[[A-Za-z][A-Za-z0-9_]*\s+"/.test(trimmed);
    if (tag && movetext) {
      games.push(current.join('\n').trim());
      current = [];
      movetext = false;
    }
    current.push(line);
    if (!tag && trimmed && !trimmed.startsWith(';')) movetext = true;
    if (!tag)
      for (const c of line.replace(/;.*/, '')) {
        if (c === '{') commentDepth++;
        if (c === '}') commentDepth = Math.max(0, commentDepth - 1);
      }
    if (games.length >= MAX_BATCH_GAMES) throw new Error('Import at most 100 games at a time.');
  }
  if (current.join('\n').trim()) games.push(current.join('\n').trim());
  if (!games.length) throw new Error('The PGN does not contain any games.');
  return games;
}
