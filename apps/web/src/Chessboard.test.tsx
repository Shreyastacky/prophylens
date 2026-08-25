import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PositionAnalysis } from './analysis/types';
import { Chessboard, moveToSan } from './Chessboard';

const result: PositionAnalysis = {
  ply: 1,
  san: 'e4',
  playedMoveUci: 'e2e4',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  sideToMove: 'white',
  bestMoveUci: 'd2d4',
  lines: [{ rank: 1, depth: 12, nodes: 10_000, scoreCp: 30, movesUci: ['d2d4'] }],
  playedLine: { rank: 1, depth: 12, nodes: 10_000, scoreCp: 20, movesUci: ['e2e4'] },
};

describe('Chessboard', () => {
  it('renders all 64 squares and the played and recommended move evidence', () => {
    const html = renderToStaticMarkup(
      <Chessboard
        result={result}
        assessment={{ label: 'Good', centipawnLoss: 10 }}
        canGoPrevious={false}
        canGoNext={true}
        onPrevious={() => undefined}
        onNext={() => undefined}
      />,
    );

    expect(html.match(/class="board-square/g)).toHaveLength(64);
    expect(html).toContain('square-played');
    expect(html).toContain('square-best');
    expect(html).toContain('White king on e1');
    expect(html).toContain('Engine choice');
  });

  it('turns legal UCI coordinates into readable chess notation', () => {
    expect(moveToSan(result.fen, 'g1f3')).toBe('Nf3');
  });
});
