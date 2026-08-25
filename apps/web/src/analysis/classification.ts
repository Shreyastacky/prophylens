import type { EngineLine, PositionAnalysis } from './types';

export type MoveLabel = 'Best' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';

export interface MoveAssessment {
  label: MoveLabel;
  centipawnLoss?: number;
  expectedScoreLoss?: number;
}

function expectedScore(line: EngineLine): number | undefined {
  if (!line.wdl) return undefined;
  return (line.wdl.win + line.wdl.draw / 2) / 1000;
}

export function assessMove(result: PositionAnalysis): MoveAssessment {
  const bestLine = result.lines[0];
  const playedLine = result.playedLine;
  if (!bestLine) return { label: 'Good' };

  const centipawnLoss =
    bestLine.scoreCp !== undefined && playedLine.scoreCp !== undefined
      ? Math.max(0, bestLine.scoreCp - playedLine.scoreCp)
      : undefined;
  const bestExpected = expectedScore(bestLine);
  const playedExpected = expectedScore(playedLine);
  const expectedScoreLoss =
    bestExpected !== undefined && playedExpected !== undefined
      ? Math.max(0, bestExpected - playedExpected)
      : undefined;

  if (
    result.playedMoveUci === result.bestMoveUci ||
    ((centipawnLoss ?? Infinity) <= 10 && (expectedScoreLoss ?? Infinity) <= 0.01)
  ) {
    return { label: 'Best', centipawnLoss, expectedScoreLoss };
  }

  let label: MoveLabel;
  if (expectedScoreLoss !== undefined) {
    if (expectedScoreLoss <= 0.015) label = 'Good';
    else if (expectedScoreLoss <= 0.06) label = 'Inaccuracy';
    else if (expectedScoreLoss <= 0.18) label = 'Mistake';
    else label = 'Blunder';
  } else if (centipawnLoss !== undefined) {
    if (centipawnLoss <= 20) label = 'Good';
    else if (centipawnLoss <= 60) label = 'Inaccuracy';
    else if (centipawnLoss <= 150) label = 'Mistake';
    else label = 'Blunder';
  } else {
    label = bestLine.mateIn !== undefined && playedLine.mateIn === undefined ? 'Blunder' : 'Good';
  }

  return { label, centipawnLoss, expectedScoreLoss };
}
