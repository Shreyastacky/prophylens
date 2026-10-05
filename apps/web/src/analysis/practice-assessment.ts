import { assessMove } from './classification';
import type { PositionAnalysis } from './types';

export function recordedPracticeAssessment(position: PositionAnalysis, moveUci: string) {
  const line =
    position.lines.find((candidate) => candidate.movesUci[0] === moveUci) ??
    (position.playedMoveUci === moveUci ? position.playedLine : undefined);
  if (!line) return undefined;
  return assessMove({ ...position, playedMoveUci: moveUci, playedLine: line });
}
export function isAcceptedPracticeMove(label: string): boolean {
  return label === 'Best' || label === 'Good';
}
