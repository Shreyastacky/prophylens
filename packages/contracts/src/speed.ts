/**
 * Speed classification.
 *
 * Deliberately NOT universal. Platforms classify identical time controls
 * differently, so a single hardcoded rule would contaminate cross-platform
 * analysis in exactly the way an unproven rating mapping would. We store the
 * raw time control, the source platform, the derived class and the rule
 * version that derived it — and we refuse to guess for platforms whose rule we
 * have not verified.
 */

import type { SpeedClass } from './index';

export type Platform = 'lichess' | 'chesscom' | 'unknown';

/** Bump when a classification rule changes. Stored alongside every result. */
export const SPEED_RULES = {
  lichess: 'lichess-estimate-v1',
} as const;

export interface TimeControl {
  baseSeconds: number;
  incrementSeconds: number;
}

export interface SpeedClassification {
  speed: SpeedClass | null;
  platform: Platform;
  ruleVersion: string | null;
  /** Populated when speed is null, so the caller can log why rather than guess. */
  undeterminedReason?: string;
}

/** Parse a PGN `TimeControl` header (`"300+3"`). Returns null for `-`, `?`, or junk. */
export function parseTimeControl(raw: string | undefined | null): TimeControl | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === '-' || trimmed === '?' || trimmed === '') return null;

  const match = /^(\d+)(?:\+(\d+))?$/.exec(trimmed);
  if (!match) return null;

  const baseSeconds = Number(match[1]);
  const incrementSeconds = match[2] === undefined ? 0 : Number(match[2]);
  if (!Number.isFinite(baseSeconds) || !Number.isFinite(incrementSeconds)) return null;

  return { baseSeconds, incrementSeconds };
}

/**
 * Lichess estimates total duration as `base + 40 * increment`, then buckets it.
 * This rule is Lichess's own; do not apply it to other platforms.
 */
export function classifyLichessSpeed(control: TimeControl): SpeedClass {
  const estimate = control.baseSeconds + 40 * control.incrementSeconds;
  if (estimate <= 179) return 'bullet';
  if (estimate <= 479) return 'blitz';
  if (estimate <= 1499) return 'rapid';
  return 'classical';
}

export function classifySpeed(
  raw: string | undefined | null,
  platform: Platform,
): SpeedClassification {
  if (platform !== 'lichess') {
    return {
      speed: null,
      platform,
      ruleVersion: null,
      undeterminedReason:
        `no verified speed-classification rule for platform "${platform}"; ` +
        'store the raw time control and classify later',
    };
  }

  const control = parseTimeControl(raw);
  if (control === null) {
    return {
      speed: null,
      platform,
      ruleVersion: SPEED_RULES.lichess,
      undeterminedReason: `unparseable TimeControl: ${JSON.stringify(raw)}`,
    };
  }

  // Correspondence is not derivable from base+increment; Lichess marks it by
  // days-per-move, which the standard TimeControl header does not carry.
  return {
    speed: classifyLichessSpeed(control),
    platform,
    ruleVersion: SPEED_RULES.lichess,
  };
}
