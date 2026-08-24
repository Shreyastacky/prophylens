import { Chess } from 'chess.js';

import type { ParsedGame } from './types';

function moveToUci(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

export function parseGame(pgn: string): ParsedGame {
  if (!pgn.trim()) throw new Error('Paste a PGN before starting analysis.');

  const game = new Chess();
  game.loadPgn(pgn, { strict: false });

  const moves = game.history({ verbose: true });
  if (moves.length === 0) throw new Error('The PGN does not contain any moves.');

  const rootFen = moves[0]!.before;
  const movesUci: string[] = [];
  const positions = moves.map((move, index) => {
    const moveUci = moveToUci(move);
    const history = movesUci.length === 0 ? '' : ` moves ${movesUci.join(' ')}`;
    const sideToMove = move.color === 'w' ? 'white' : 'black';
    const position = {
      ply: index + 1,
      san: move.san,
      moveUci,
      fen: move.before,
      sideToMove,
      positionCommand: `position fen ${rootFen}${history}`,
    } as const;
    movesUci.push(moveUci);

    return position;
  });

  return { headers: game.getHeaders(), positions };
}
