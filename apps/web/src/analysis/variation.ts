import { Chess } from 'chess.js';
export interface VariationStep {
  fen: string;
  san: string;
  moveUci?: string;
}
export function variationSteps(fen: string, moves: string[]): VariationStep[] {
  const game = new Chess(fen);
  const steps: VariationStep[] = [{ fen, san: 'Starting position' }];
  for (const uci of moves) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error('Invalid engine move.');
    const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    steps.push({ fen: game.fen(), san: move.san, moveUci: uci });
  }
  return steps;
}
export function legalVariation(fen: string, moves: string[]): boolean {
  try {
    variationSteps(fen, moves);
    return true;
  } catch {
    return false;
  }
}
export function whiteEvaluation(
  side: 'white' | 'black',
  line: { scoreCp?: number; mateIn?: number },
): number | undefined {
  const value =
    line.mateIn !== undefined
      ? line.mateIn > 0
        ? 8
        : -8
      : line.scoreCp !== undefined
        ? Math.max(-8, Math.min(8, line.scoreCp / 100))
        : undefined;
  return value === undefined ? undefined : side === 'white' ? value : -value;
}
