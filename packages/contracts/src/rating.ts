/**
 * Rating ranges.
 *
 * The core model expresses an explicit rating range on an explicit platform.
 * Provider quirks live in adapters. This keeps Phase 0 comparable against the
 * Lichess Opening Explorer without permanently coupling the domain model to one
 * API's bucket boundaries.
 */

import type { Platform } from './speed';

export interface RatingRange {
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound; null means open-ended. */
  max: number | null;
  platform: Platform;
}

/**
 * The Lichess Opening Explorer's `ratings` parameter accepts these lower bounds
 * only. Note they are NOT uniformly 200 wide: `0` covers everything under 1000
 * and `2500` is open-ended at the top.
 */
export const LICHESS_EXPLORER_BUCKETS = [
  0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500,
] as const;

export type LichessExplorerBucket = (typeof LICHESS_EXPLORER_BUCKETS)[number];

export interface ExplorerBucketMapping {
  buckets: LichessExplorerBucket[];
  /**
   * False when the requested range does not align with bucket boundaries, i.e.
   * the returned buckets cover strictly more players than asked for. Callers
   * must surface this rather than silently reporting a wider cohort.
   */
  exact: boolean;
  coveredRange: { min: number; max: number | null };
}

/** Lower bound of the bucket an individual rating falls into. */
export function bucketForRating(elo: number): LichessExplorerBucket {
  let chosen: LichessExplorerBucket = LICHESS_EXPLORER_BUCKETS[0];
  for (const bucket of LICHESS_EXPLORER_BUCKETS) {
    if (elo >= bucket) chosen = bucket;
  }
  return chosen;
}

/** Exclusive upper edge of a bucket, or null for the open-ended top bucket. */
export function bucketUpperEdge(bucket: LichessExplorerBucket): number | null {
  const index = LICHESS_EXPLORER_BUCKETS.indexOf(bucket);
  const next = LICHESS_EXPLORER_BUCKETS[index + 1];
  return next === undefined ? null : next;
}

/**
 * Map a domain rating range onto the Explorer's buckets.
 *
 * Throws for non-Lichess platforms: no verified cross-platform rating mapping
 * exists, and inventing one here is how unlabelled cross-platform claims get
 * made. Callers must handle other platforms explicitly.
 */
export function toExplorerBuckets(range: RatingRange): ExplorerBucketMapping {
  if (range.platform !== 'lichess') {
    throw new Error(
      `no verified rating mapping from platform "${range.platform}" to Lichess ` +
        'Explorer buckets; do not query the Explorer with a foreign rating range',
    );
  }

  const lower = bucketForRating(range.min);
  const upper = range.max === null ? LICHESS_EXPLORER_BUCKETS.at(-1)! : bucketForRating(range.max);

  const buckets = LICHESS_EXPLORER_BUCKETS.filter(
    (bucket) => bucket >= lower && bucket <= upper,
  ) as LichessExplorerBucket[];

  const coveredMax = bucketUpperEdge(upper);
  const exact =
    range.min === lower &&
    (range.max === null
      ? coveredMax === null
      : coveredMax !== null && range.max === coveredMax - 1);

  return {
    buckets,
    exact,
    coveredRange: { min: lower, max: coveredMax === null ? null : coveredMax - 1 },
  };
}

/** Human-readable band label for UI. Never used as an identifier. */
export function describeBucket(bucket: LichessExplorerBucket): string {
  const upper = bucketUpperEdge(bucket);
  if (bucket === 0) return 'under 1000';
  return upper === null ? `${bucket}+` : `${bucket}\u2013${upper - 1}`;
}
