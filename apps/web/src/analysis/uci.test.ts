import { describe, expect, it } from 'vitest';

import { parseBestMove, parseInfoLine } from './uci';

describe('UCI parsing', () => {
  it('parses a centipawn line with WDL and a principal variation', () => {
    expect(
      parseInfoLine(
        'info depth 14 seldepth 21 multipv 2 score cp -37 wdl 120 500 380 nodes 12345 pv e7e5 g1f3',
      ),
    ).toEqual({
      rank: 2,
      depth: 14,
      selectiveDepth: 21,
      nodes: 12345,
      scoreCp: -37,
      wdl: { win: 120, draw: 500, loss: 380 },
      movesUci: ['e7e5', 'g1f3'],
    });
  });

  it('parses mate scores and best moves', () => {
    expect(parseInfoLine('info depth 18 score mate 3 nodes 900 pv h5f7')).toMatchObject({
      mateIn: 3,
    });
    expect(parseBestMove('bestmove h5f7 ponder e8e7')).toBe('h5f7');
    expect(parseBestMove('bestmove (none)')).toBeNull();
  });
});
