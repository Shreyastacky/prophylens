import { describe, expect, it } from 'vitest';

import { parseGame } from './pgn';

describe('parseGame', () => {
  it('reconstructs the decision position before every played move', () => {
    const game = parseGame('1. e4 e5 2. Nf3 Nc6');

    expect(game.positions).toHaveLength(4);
    expect(game.positions[0]!).toMatchObject({ ply: 1, san: 'e4', moveUci: 'e2e4' });
    expect(game.positions[0]!.positionCommand).not.toContain(' moves ');
    expect(game.positions[3]!.positionCommand).toContain('moves e2e4 e7e5 g1f3');
    expect(game.positions[3]!.sideToMove).toBe('black');
  });

  it('supports games that begin from a custom FEN', () => {
    const game = parseGame(`[SetUp "1"]\n[FEN "8/8/8/8/8/4k3/8/4K2R w K - 0 1"]\n\n1. O-O`);

    expect(game.positions[0]!.positionCommand).toBe('position fen 8/8/8/8/8/4k3/8/4K2R w K - 0 1');
  });

  it('rejects an empty game', () => {
    expect(() => parseGame('[Event "No moves"]')).toThrow(/does not contain any moves/i);
  });
});
