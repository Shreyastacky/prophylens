import { describe, expect, it } from 'vitest';

import { assessMove } from './classification';
import type { EngineLine, PositionAnalysis } from './types';

function line(scoreCp: number, wdl: [number, number, number]): EngineLine {
  return {
    rank: 1,
    depth: 12,
    nodes: 10_000,
    scoreCp,
    wdl: { win: wdl[0], draw: wdl[1], loss: wdl[2] },
    movesUci: ['e2e4'],
  };
}

function result(best: EngineLine, played: EngineLine, playedMove = 'd2d4'): PositionAnalysis {
  return {
    ply: 1,
    san: 'd4',
    playedMoveUci: playedMove,
    fen: 'start',
    sideToMove: 'white',
    bestMoveUci: 'e2e4',
    lines: [best],
    playedLine: played,
  };
}

describe('assessMove', () => {
  it('marks the engine move as best', () => {
    expect(
      assessMove(result(line(30, [250, 700, 50]), line(30, [250, 700, 50]), 'e2e4')).label,
    ).toBe('Best');
  });

  it('uses WDL loss for conservative severity labels', () => {
    const best = line(80, [400, 550, 50]);

    expect(assessMove(result(best, line(40, [350, 580, 70]))).label).toBe('Inaccuracy');
    expect(assessMove(result(best, line(-20, [240, 600, 160]))).label).toBe('Mistake');
    expect(assessMove(result(best, line(-250, [40, 260, 700]))).label).toBe('Blunder');
  });

  it('never reports a negative loss when search noise prefers the played line', () => {
    const assessment = assessMove(result(line(10, [200, 700, 100]), line(15, [210, 700, 90])));

    expect(assessment.centipawnLoss).toBe(0);
    expect(assessment.expectedScoreLoss).toBe(0);
  });
});
