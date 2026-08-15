export interface Interval {
  low: number;
  high: number;
}

export interface PriorityInputs {
  severity: number;
  recurrence: number;
  fixability: number;
  confidence: number;
  futureExposure: number;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function expectedPoints(wins: number, draws: number, total: number): number | null {
  if (total <= 0) return null;
  return (wins + draws * 0.5) / total;
}

export function wilsonInterval(successes: number, total: number, z = 1.96): Interval | null {
  if (total <= 0 || successes < 0 || successes > total) return null;
  const proportion = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = proportion + (z * z) / (2 * total);
  const margin = z * Math.sqrt((proportion * (1 - proportion) + (z * z) / (4 * total)) / total);
  return {
    low: clampUnit((centre - margin) / denominator),
    high: clampUnit((centre + margin) / denominator),
  };
}

export function acceptableMoveMass(
  moves: ReadonlyArray<{ moveUci: string; count: number }>,
  acceptableMoves: ReadonlySet<string>,
): number | null {
  const total = moves.reduce((sum, move) => sum + Math.max(0, move.count), 0);
  if (total === 0) return null;
  const acceptable = moves.reduce(
    (sum, move) => sum + (acceptableMoves.has(move.moveUci) ? Math.max(0, move.count) : 0),
    0,
  );
  return acceptable / total;
}

export function lessonPriority(inputs: PriorityInputs): number {
  const factors = [
    inputs.severity,
    inputs.recurrence,
    inputs.fixability,
    inputs.confidence,
    inputs.futureExposure,
  ].map(clampUnit);

  return factors.reduce((product, factor) => product * factor, 1);
}

export function movePopularity(count: number, total: number): number | null {
  if (total <= 0) return null;
  return clampUnit(count / total);
}
