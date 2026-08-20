/**
 * Eligibility.
 *
 * Two different decisions, deliberately kept apart:
 *
 *   1. Eligibility — is the evidence strong enough to make this claim at all?
 *   2. Priority    — among claims we are allowed to make, which matters most?
 *
 * Folding both into one score makes failures unreadable: a lesson scoring zero
 * tells you nothing about whether it was weak, unevidenced, or the victim of an
 * upstream bug. Eligibility answers "may we say this" with reasons attached;
 * ranking (see `scoring.ts`) only ever orders things already cleared.
 *
 * There is no universal sample threshold. Showing rough move popularity is a
 * much weaker claim than telling someone a move is their personal weakness, and
 * they need different evidence.
 */

import { wilsonInterval } from './scoring';

export type ClaimKind =
  /** "most players here play Nf3" — descriptive, low stakes */
  | 'move-popularity'
  /** "your peers score 41% from here" — outcome claim, needs an interval */
  | 'peer-outcome'
  /** "this is a common trap at your level" — population claim about a mistake */
  | 'common-trap'
  /** "this one is yours to fix" — claim about the individual, highest stakes */
  | 'personal-leak';

export interface EvidenceRule {
  minSamples: number;
  /** Max width of the 95% Wilson interval on the outcome rate. null = unchecked. */
  maxIntervalWidth: number | null;
  rationale: string;
}

export const EVIDENCE_RULES: Record<ClaimKind, EvidenceRule> = {
  'move-popularity': {
    minSamples: 20,
    maxIntervalWidth: null,
    rationale: 'ordering moves by frequency tolerates noise; we quote no outcome',
  },
  'peer-outcome': {
    minSamples: 50,
    maxIntervalWidth: 0.25,
    rationale: 'quoting a score requires the interval to be narrow enough to mean something',
  },
  'common-trap': {
    minSamples: 100,
    maxIntervalWidth: 0.2,
    rationale: 'asserting a population-level pattern needs population-level evidence',
  },
  'personal-leak': {
    minSamples: 100,
    maxIntervalWidth: 0.2,
    rationale: 'telling someone a mistake is theirs alone is the strongest claim we make',
  },
};

export interface EligibilityResult {
  eligible: boolean;
  /** Every failed gate, not just the first. Empty when eligible. */
  reasons: string[];
}

const ELIGIBLE: EligibilityResult = Object.freeze({ eligible: true, reasons: [] });

export interface PeerClaimEvidence {
  sampleSize: number;
  /** Outcome successes among `sampleSize`, when the claim quotes an outcome. */
  successes?: number;
}

export function peerClaimEligibility(
  claim: ClaimKind,
  evidence: PeerClaimEvidence,
): EligibilityResult {
  const rule = EVIDENCE_RULES[claim];
  const reasons: string[] = [];

  if (evidence.sampleSize < rule.minSamples) {
    reasons.push(`sample ${evidence.sampleSize} below ${rule.minSamples} required for "${claim}"`);
  }

  if (rule.maxIntervalWidth !== null) {
    if (evidence.successes === undefined) {
      reasons.push(`"${claim}" quotes an outcome but no successes were supplied`);
    } else {
      const interval = wilsonInterval(evidence.successes, evidence.sampleSize);
      if (interval === null) {
        reasons.push('outcome interval could not be computed');
      } else if (interval.high - interval.low > rule.maxIntervalWidth) {
        reasons.push(
          `outcome interval ${(interval.high - interval.low).toFixed(2)} wider than ` +
            `${rule.maxIntervalWidth} allowed for "${claim}"`,
        );
      }
    }
  }

  return reasons.length === 0 ? ELIGIBLE : { eligible: false, reasons };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export interface LessonEvidence {
  /** Occurrences of this motif across the player's games. */
  occurrences: number;
  affectedGames: number;
  /** Calibrated precision of the motif rule, 0..1. Zero means uncalibrated. */
  motifConfidence: number;
  /** Whether the motif rule has cleared its precision benchmark. */
  motifValidated: boolean;
}

export const LESSON_GATES = {
  minOccurrences: 3,
  minAffectedGames: 2,
  minMotifConfidence: 0.6,
} as const;

/**
 * Gate a lesson on evidence. A lesson that fails here is suppressed *for now*
 * and says why — it is not deleted. Recompute on every player-model rebuild;
 * more games or a recalibrated rule can make the same lesson eligible later.
 */
export function lessonEligibility(evidence: LessonEvidence): EligibilityResult {
  const reasons: string[] = [];

  if (!evidence.motifValidated) {
    reasons.push('motif rule has not passed its precision benchmark');
  }
  if (evidence.motifConfidence < LESSON_GATES.minMotifConfidence) {
    reasons.push(
      `motif confidence ${evidence.motifConfidence.toFixed(2)} below ` +
        `${LESSON_GATES.minMotifConfidence}`,
    );
  }
  if (evidence.occurrences < LESSON_GATES.minOccurrences) {
    reasons.push(
      `${evidence.occurrences} occurrences below ${LESSON_GATES.minOccurrences} required`,
    );
  }
  if (evidence.affectedGames < LESSON_GATES.minAffectedGames) {
    reasons.push(
      `seen in ${evidence.affectedGames} game(s); needs ${LESSON_GATES.minAffectedGames} ` +
        'to distinguish a pattern from a one-off',
    );
  }

  return reasons.length === 0 ? ELIGIBLE : { eligible: false, reasons };
}

/**
 * Expected value of a lesson, for ordering the training plan.
 *
 * Three separate numbers now exist and must not collapse back into one:
 *
 *   - Eligibility (above)     — a hard constraint: may we say this at all?
 *   - Priority (`scoring.ts`) — value *if the motif is real*: severity x
 *     recurrence x fixability x futureExposure, deliberately confidence-blind.
 *   - Expected value (here)   — what actually orders the plan: priority
 *     discounted by how much we trust the motif claim that produced it. A
 *     high-priority lesson resting on a barely-calibrated motif rule should
 *     not outrank a slightly-lower-priority lesson we're confident is real.
 *
 * `motifConfidence` is clamped to [0, 1] rather than trusted as-is, so a
 * value outside that range degrades gracefully instead of inverting the
 * ordering it is meant to produce.
 */
export function expectedLessonValue(priority: number, motifConfidence: number): number {
  return priority * clamp01(motifConfidence);
}
