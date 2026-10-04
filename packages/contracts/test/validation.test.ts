import { describe, it, expect } from 'vitest';
import {
  peerClaimEligibility,
  lessonEligibility,
  toExplorerBuckets,
  wilsonInterval,
  lessonPriority,
} from '../src/index';
describe('untrusted numeric evidence', () => {
  it('suppresses invalid sample and lesson counts', () => {
    for (const bad of [NaN, Infinity, -1]) {
      expect(peerClaimEligibility('move-popularity', { sampleSize: bad }).eligible).toBe(false);
      expect(
        lessonEligibility({
          motifValidated: true,
          motifConfidence: bad,
          occurrences: 3,
          affectedGames: 2,
        }).eligible,
      ).toBe(false);
      expect(
        lessonEligibility({
          motifValidated: true,
          motifConfidence: 0.9,
          occurrences: bad,
          affectedGames: 2,
        }).eligible,
      ).toBe(false);
    }
  });
  it('rejects inverted or nonfinite rating ranges', () => {
    expect(() => toExplorerBuckets({ min: 2200, max: 1000, platform: 'lichess' })).toThrow();
    expect(() => toExplorerBuckets({ min: NaN, max: null, platform: 'lichess' })).toThrow();
  });
  it('does not produce NaN intervals or rankings', () => {
    expect(wilsonInterval(NaN, 100)).toBeNull();
    expect(() =>
      lessonPriority({ severity: NaN, recurrence: 1, fixability: 1, futureExposure: 1 }),
    ).toThrow();
  });
});
