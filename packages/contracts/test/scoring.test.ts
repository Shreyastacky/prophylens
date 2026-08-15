import { describe, expect, it } from 'vitest';
import { acceptableMoveMass, expectedPoints, lessonPriority, wilsonInterval } from '../src/scoring';

describe('peer scoring primitives', () => {
  it('scores results from the mover perspective', () => {
    expect(expectedPoints(4, 2, 10)).toBe(0.5);
    expect(expectedPoints(0, 0, 0)).toBeNull();
  });

  it('measures how much human probability sits on engine-acceptable moves', () => {
    const moves = [
      { moveUci: 'e2e4', count: 50 },
      { moveUci: 'd2d4', count: 30 },
      { moveUci: 'g1f3', count: 20 },
    ];
    expect(acceptableMoveMass(moves, new Set(['e2e4', 'd2d4']))).toBe(0.8);
  });

  it('returns uncertainty instead of pretending small samples are exact', () => {
    const interval = wilsonInterval(6, 10);
    expect(interval).not.toBeNull();
    expect(interval?.low).toBeLessThan(0.6);
    expect(interval?.high).toBeGreaterThan(0.6);
  });
});

describe('lesson priority', () => {
  it('requires every product factor to be present', () => {
    expect(
      lessonPriority({
        severity: 1,
        recurrence: 1,
        fixability: 1,
        confidence: 1,
        futureExposure: 1,
      }),
    ).toBe(1);
    expect(
      lessonPriority({
        severity: 1,
        recurrence: 0,
        fixability: 1,
        confidence: 1,
        futureExposure: 1,
      }),
    ).toBe(0);
  });
});
