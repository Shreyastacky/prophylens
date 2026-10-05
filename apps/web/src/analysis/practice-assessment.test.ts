import { describe, expect, it } from 'vitest';
import { isAcceptedPracticeMove, recordedPracticeAssessment } from './practice-assessment';
import { movePrefix } from './move-number';
import type { PositionAnalysis } from './types';
const line = {
  rank: 1,
  depth: 14,
  nodes: 10000,
  scoreCp: 50,
  scoreBound: 'exact' as const,
  movesUci: ['e2e4'],
};
const position: PositionAnalysis = {
  ply: 1,
  san: 'f3',
  playedMoveUci: 'f2f3',
  fen: 'start',
  sideToMove: 'white',
  bestMoveUci: 'e2e4',
  lines: [line, { ...line, rank: 2, scoreCp: 35, movesUci: ['d2d4'] }],
  playedLine: { ...line, scoreCp: -100, movesUci: ['f2f3'] },
};
describe('practice alternatives and FEN numbering', () => {
  it('accepts a recorded Good alternative, rejects losing and unknown evidence', () => {
    expect(recordedPracticeAssessment(position, 'd2d4')?.label).toBe('Good');
    expect(isAcceptedPracticeMove(recordedPracticeAssessment(position, 'd2d4')!.label)).toBe(true);
    expect(isAcceptedPracticeMove(recordedPracticeAssessment(position, 'f2f3')!.label)).toBe(false);
    expect(recordedPracticeAssessment(position, 'g1f3')).toBeUndefined();
    expect(isAcceptedPracticeMove('Uncertain')).toBe(false);
    expect(
      recordedPracticeAssessment(
        { ...position, lines: [line, { ...position.lines[1]!, scoreBound: 'lower' }] },
        'd2d4',
      )?.label,
    ).toBe('Uncertain');
  });
  it('numbers black-start and midgame FENs rather than relative plies', () => {
    expect(movePrefix('8/8/8/8/8/8/8/8 b - - 0 42')).toBe('42...');
    expect(movePrefix('8/8/8/8/8/8/8/8 w - - 0 43')).toBe('43.');
  });
});
