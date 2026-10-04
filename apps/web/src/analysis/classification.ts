import type { EngineLine, PositionAnalysis } from './types';
export type MoveLabel = 'Best' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder' | 'Uncertain';
export interface MoveAssessment {
  label: MoveLabel;
  centipawnLoss?: number;
  expectedScoreLoss?: number;
  mateTransition?: string;
  confidence: 'low' | 'medium';
  reason?: string;
}
export function expectedScore(line: EngineLine): number | undefined {
  if (line.mateIn !== undefined) return line.mateIn > 0 ? 1 : 0;
  const wdl = line.wdl;
  if (
    !wdl ||
    ![wdl.win, wdl.draw, wdl.loss].every((n) => Number.isInteger(n) && n >= 0 && n <= 1000) ||
    wdl.win + wdl.draw + wdl.loss !== 1000
  )
    return undefined;
  return (wdl.win + wdl.draw / 2) / 1000;
}
export function assessMove(result: PositionAnalysis): MoveAssessment {
  const best = result.lines[0];
  const played = result.playedLine;
  const unknown = (reason: string): MoveAssessment => ({
    label: 'Uncertain',
    confidence: 'low',
    reason,
  });
  if (!best || !played) return unknown('The engine did not return a complete comparison.');
  if (
    (best.scoreBound && best.scoreBound !== 'exact') ||
    (played.scoreBound && played.scoreBound !== 'exact')
  )
    return unknown('This search returned a score bound, not an exact comparison.');
  if (
    (best.scoreCp === undefined && best.mateIn === undefined) ||
    (played.scoreCp === undefined && played.mateIn === undefined)
  )
    return unknown('An evaluation is missing.');
  const centipawnLoss =
    best.scoreCp !== undefined && played.scoreCp !== undefined
      ? Math.max(0, best.scoreCp - played.scoreCp)
      : undefined;
  const bestExpected = expectedScore(best);
  const playedExpected = expectedScore(played);
  const expectedScoreLoss =
    bestExpected !== undefined && playedExpected !== undefined
      ? Math.max(0, bestExpected - playedExpected)
      : undefined;
  const confidence = Math.min(best.depth, played.depth) >= 12 ? 'medium' : 'low';
  const mateTransition =
    played.mateIn !== undefined &&
    played.mateIn <= 0 &&
    (best.mateIn === undefined || best.mateIn > 0)
      ? 'Allows forced mate'
      : best.mateIn !== undefined &&
          best.mateIn > 0 &&
          (played.mateIn === undefined || played.mateIn <= 0)
        ? 'Misses forced mate'
        : best.mateIn !== undefined || played.mateIn !== undefined
          ? 'Mate line'
          : undefined;
  let label: MoveLabel;
  if (result.playedMoveUci === result.bestMoveUci) label = 'Best';
  else if (mateTransition === 'Allows forced mate' || mateTransition === 'Misses forced mate')
    label = 'Blunder';
  else if (
    centipawnLoss !== undefined &&
    centipawnLoss <= 10 &&
    expectedScoreLoss !== undefined &&
    expectedScoreLoss <= 0.01
  )
    label = 'Best';
  else if (expectedScoreLoss !== undefined)
    label =
      expectedScoreLoss <= 0.015
        ? 'Good'
        : expectedScoreLoss <= 0.06
          ? 'Inaccuracy'
          : expectedScoreLoss <= 0.18
            ? 'Mistake'
            : 'Blunder';
  else if (centipawnLoss !== undefined)
    label =
      centipawnLoss <= 20
        ? 'Good'
        : centipawnLoss <= 60
          ? 'Inaccuracy'
          : centipawnLoss <= 150
            ? 'Mistake'
            : 'Blunder';
  else label = 'Uncertain';
  return {
    label,
    centipawnLoss,
    expectedScoreLoss,
    mateTransition,
    confidence,
    reason:
      confidence === 'low'
        ? 'Quick search: re-analyse deeper before relying on a close decision.'
        : undefined,
  };
}
export function isKeyMove(assessment: MoveAssessment): boolean {
  return ['Inaccuracy', 'Mistake', 'Blunder'].includes(assessment.label);
}
export function severityScore(assessment: MoveAssessment): number {
  return assessment.label === 'Uncertain'
    ? -1
    : assessment.mateTransition === 'Allows forced mate' ||
        assessment.mateTransition === 'Misses forced mate'
      ? 1
      : (assessment.expectedScoreLoss ?? (assessment.centipawnLoss ?? 0) / 1000);
}
export function formatLoss(assessment: MoveAssessment): string {
  return assessment.centipawnLoss !== undefined
    ? `${(assessment.centipawnLoss / 100).toFixed(2)} pawns`
    : (assessment.mateTransition ?? 'Not determined');
}
