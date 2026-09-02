export interface Interval {
  low: number;
  high: number;
}

/** Ranking factors only. Evidence strength is handled by `eligibility.ts`. */
export interface PriorityInputs {
  severity: number;
  recurrence: number;
  fixability: number;
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

export interface PriorityWeights {
  severity: number;
  recurrence: number;
  fixability: number;
  futureExposure: number;
}

export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = {
  severity: 1,
  recurrence: 1,
  fixability: 1,
  futureExposure: 1,
};

export interface PriorityResult {
  priority: number;
  /**
   * Factors that were exactly zero. A zero priority is always explained here,
   * so an upstream bug that zeroes a factor is loud rather than silent. Callers
   * should treat a non-empty list as a signal to inspect, not to hide.
   */
  zeroedBy: Array<keyof PriorityInputs>;
  /**
   * The single lowest-valued factor, always populated — not just the ones that
   * hit the literal zero floor. An exact zero usually means an unpopulated
   * field; a near-zero usually means a computation bug upstream. Both need to
   * be visible, because `zeroedBy` alone misses a factor that collapsed to
   * 0.0001 instead of 0 and still drags the geometric mean down for the wrong
   * reason.
   */
  weakest: { factor: keyof PriorityInputs; value: number };
}

/**
 * Rank an ALREADY-ELIGIBLE lesson. Evidence gates live in `eligibility.ts`;
 * this function only orders things we are already allowed to say.
 *
 * `confidence` is deliberately absent: it is an eligibility concern, and
 * including it here would re-merge the two decisions we just separated.
 *
 * A weighted geometric mean preserves the ordering of the old product exactly
 * (it is a monotonic transform of it at equal weights) while keeping the output
 * in a readable range and exposing weights as the calibration surface we will
 * need against the golden-games set. There is no floor: a genuine zero still
 * produces zero, but it is now reported rather than silently swallowed.
 */
export function lessonPriority(
  inputs: PriorityInputs,
  weights: PriorityWeights = DEFAULT_PRIORITY_WEIGHTS,
): PriorityResult {
  const severity = clampUnit(inputs.severity);
  const factors: Array<[keyof PriorityInputs, number, number]> = [
    ['severity', severity, weights.severity],
    ['recurrence', clampUnit(inputs.recurrence), weights.recurrence],
    ['fixability', clampUnit(inputs.fixability), weights.fixability],
    ['futureExposure', clampUnit(inputs.futureExposure), weights.futureExposure],
  ];

  const weakest = factors.reduce(
    (min, [factor, value]) => (value < min.value ? { factor, value } : min),
    { factor: 'severity' as keyof PriorityInputs, value: severity },
  );

  const zeroedBy = factors.filter(([, value]) => value === 0).map(([name]) => name);
  if (zeroedBy.length > 0) return { priority: 0, zeroedBy, weakest };

  const totalWeight = factors.reduce((sum, [, , weight]) => sum + weight, 0);
  if (totalWeight <= 0) throw new RangeError('priority weights must sum to a positive number');

  const logSum = factors.reduce((sum, [, value, weight]) => sum + weight * Math.log(value), 0);

  return { priority: Math.exp(logSum / totalWeight), zeroedBy: [], weakest };
}

export function movePopularity(count: number, total: number): number | null {
  if (total <= 0) return null;
  return clampUnit(count / total);
}
