import { describe, expect, it } from 'vitest';

import {
  EVIDENCE_RULES,
  bucketForRating,
  classifySpeed,
  describeBucket,
  expectedLessonValue,
  isCollision,
  lessonEligibility,
  lessonPriority,
  normaliseEpd,
  parseTimeControl,
  peerClaimEligibility,
  positionIdentity,
  positionKeyFromBigInt,
  positionKeyToBigInt,
  samePosition,
  shardId,
  toExplorerBuckets,
} from '../src/index';

describe('speed classification', () => {
  it('parses standard and increment-free time controls', () => {
    expect(parseTimeControl('300+3')).toEqual({ baseSeconds: 300, incrementSeconds: 3 });
    expect(parseTimeControl('600')).toEqual({ baseSeconds: 600, incrementSeconds: 0 });
  });

  it('rejects unknown and malformed time controls', () => {
    for (const raw of ['-', '?', '', '1/86400', 'abc', null, undefined]) {
      expect(parseTimeControl(raw)).toBeNull();
    }
  });

  it('applies the Lichess base + 40 * increment estimate', () => {
    expect(classifySpeed('120+1', 'lichess').speed).toBe('bullet'); // 160s
    expect(classifySpeed('180+0', 'lichess').speed).toBe('blitz'); // 180s
    expect(classifySpeed('300+3', 'lichess').speed).toBe('blitz'); // 420s
    expect(classifySpeed('600+0', 'lichess').speed).toBe('rapid'); // 600s
    expect(classifySpeed('1800+0', 'lichess').speed).toBe('classical');
  });

  it('refuses to guess for platforms with no verified rule', () => {
    const result = classifySpeed('300+3', 'chesscom');
    expect(result.speed).toBeNull();
    expect(result.ruleVersion).toBeNull();
    expect(result.undeterminedReason).toMatch(/no verified speed-classification rule/);
  });

  it('records the rule version whenever it classifies', () => {
    expect(classifySpeed('300+3', 'lichess').ruleVersion).toBe('lichess-estimate-v1');
  });
});

describe('rating buckets', () => {
  it('maps ratings to explorer bucket lower bounds', () => {
    expect(bucketForRating(742)).toBe(0);
    expect(bucketForRating(1000)).toBe(1000);
    expect(bucketForRating(1399)).toBe(1200);
    expect(bucketForRating(3200)).toBe(2500);
  });

  it('labels the irregular tail buckets honestly', () => {
    expect(describeBucket(0)).toBe('under 1000');
    expect(describeBucket(2500)).toBe('2500+');
    expect(describeBucket(1200)).toBe('1200\u20131399');
  });

  it('flags ranges that do not align with bucket boundaries', () => {
    const aligned = toExplorerBuckets({ min: 1200, max: 1399, platform: 'lichess' });
    expect(aligned.exact).toBe(true);
    expect(aligned.buckets).toEqual([1200]);

    const ragged = toExplorerBuckets({ min: 1250, max: 1350, platform: 'lichess' });
    expect(ragged.exact).toBe(false);
    expect(ragged.coveredRange).toEqual({ min: 1200, max: 1399 });
  });

  it('refuses to map foreign platform ratings onto Lichess buckets', () => {
    expect(() => toExplorerBuckets({ min: 1200, max: 1399, platform: 'chesscom' })).toThrow(
      /no verified rating mapping/,
    );
  });
});

describe('position identity', () => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('round-trips keys through hex', () => {
    const key = positionKeyFromBigInt(0x463b96181691fc9cn);
    expect(key).toBe('463b96181691fc9c');
    expect(positionKeyToBigInt(key)).toBe(0x463b96181691fc9cn);
  });

  it('left-pads short keys to a stable width', () => {
    expect(positionKeyFromBigInt(255n)).toBe('00000000000000ff');
  });

  it('drops only the halfmove and fullmove counters', () => {
    expect(normaliseEpd(START)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  });

  it('treats a key match with a different position as a collision, not a match', () => {
    const a = positionIdentity(START, '463b96181691fc9c');
    const b = positionIdentity(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1',
      '463b96181691fc9c',
    );
    expect(samePosition(a, b)).toBe(false);
    expect(isCollision(a, b)).toBe(true);
  });

  it('routes to shards by hash prefix', () => {
    expect(shardId('463b96181691fc9c', 12)).toBe('463');
    expect(() => shardId('463b96181691fc9c', 0)).toThrow();
  });
});

describe('claim eligibility', () => {
  it('requires more evidence for stronger claims', () => {
    expect(EVIDENCE_RULES['personal-leak'].minSamples).toBeGreaterThan(
      EVIDENCE_RULES['move-popularity'].minSamples,
    );
  });

  it('allows a popularity claim on a modest sample', () => {
    expect(peerClaimEligibility('move-popularity', { sampleSize: 25 }).eligible).toBe(true);
  });

  it('blocks a personal-leak claim on the same sample', () => {
    const result = peerClaimEligibility('personal-leak', { sampleSize: 25, successes: 10 });
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/below 100/);
  });

  it('blocks outcome claims whose interval is too wide', () => {
    const result = peerClaimEligibility('peer-outcome', { sampleSize: 55, successes: 27 });
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/interval/);
  });

  it('reports every failed gate, not just the first', () => {
    const result = lessonEligibility({
      occurrences: 1,
      affectedGames: 1,
      motifConfidence: 0,
      motifValidated: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.length).toBe(4);
  });

  it('clears a well-evidenced lesson', () => {
    expect(
      lessonEligibility({
        occurrences: 6,
        affectedGames: 4,
        motifConfidence: 0.91,
        motifValidated: true,
      }).eligible,
    ).toBe(true);
  });
});

describe('lesson priority', () => {
  const base = { severity: 0.8, recurrence: 0.6, fixability: 0.7, futureExposure: 0.5 };

  it('stays in a readable range instead of collapsing toward zero', () => {
    const { priority } = lessonPriority(base);
    expect(priority).toBeGreaterThan(0.5);
    expect(priority).toBeLessThan(0.8);
  });

  it('preserves the ordering of the old product at equal weights', () => {
    const lower = lessonPriority({ ...base, severity: 0.4 }).priority;
    expect(lessonPriority(base).priority).toBeGreaterThan(lower);
  });

  it('reports which factor caused a zero rather than swallowing it', () => {
    const result = lessonPriority({ ...base, futureExposure: 0 });
    expect(result.priority).toBe(0);
    expect(result.zeroedBy).toEqual(['futureExposure']);
  });

  it('lets weights change relative importance', () => {
    const severityHeavy = { severity: 4, recurrence: 1, fixability: 1, futureExposure: 1 };
    const a = { severity: 0.9, recurrence: 0.3, fixability: 0.5, futureExposure: 0.5 };
    const b = { severity: 0.3, recurrence: 0.9, fixability: 0.5, futureExposure: 0.5 };
    expect(lessonPriority(a, severityHeavy).priority).toBeGreaterThan(
      lessonPriority(b, severityHeavy).priority,
    );
    expect(lessonPriority(a).priority).toBeCloseTo(lessonPriority(b).priority, 10);
  });

  it('names the lowest-valued factor even when nothing hit exactly zero', () => {
    expect(lessonPriority(base).weakest).toEqual({ factor: 'futureExposure', value: 0.5 });
  });

  it('still names the weakest factor when a near-zero, not exact-zero, value is the real bug', () => {
    const result = lessonPriority({ ...base, recurrence: 0.0001 });
    expect(result.zeroedBy).toEqual([]); // not caught by the exact-zero check
    expect(result.weakest).toEqual({ factor: 'recurrence', value: 0.0001 });
  });
});

describe('expected lesson value', () => {
  it('discounts priority by motif confidence', () => {
    expect(expectedLessonValue(0.8, 0.5)).toBeCloseTo(0.4, 10);
    expect(expectedLessonValue(0.8, 1)).toBeCloseTo(0.8, 10);
  });

  it('clamps an out-of-range confidence instead of inverting the ordering', () => {
    expect(expectedLessonValue(0.8, 1.5)).toBeCloseTo(0.8, 10);
    expect(expectedLessonValue(0.8, -1)).toBe(0);
  });
});
