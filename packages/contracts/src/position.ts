/**
 * Position identity.
 *
 * A 64-bit Zobrist value is a hash, not an identity. Representation and
 * identity are separate concerns:
 *
 *   - `key` is the compact hash, a 16-char lowercase hex string. It is the
 *     contract/serialisation representation (JSON, IndexedDB keys, cache keys,
 *     shard routing). Internal code may hold a bigint; it crosses every
 *     boundary as hex.
 *   - `epd` is the normalised position itself. It is what makes a match a
 *     match. Two entries are the same position only if both agree.
 *
 * Storing the EPD costs ~60 bytes per entry and removes an entire class of
 * silent wrong-answer bugs. Drop it only with a measurement showing the size
 * actually matters.
 */

export type PositionKey = string;

export interface PositionIdentity {
  key: PositionKey;
  /** Normalised EPD: board, side to move, castling rights, en passant square. */
  epd: string;
}

const HEX_KEY = /^[0-9a-f]{16}$/;

export function isPositionKey(value: string): value is PositionKey {
  return HEX_KEY.test(value);
}

export function positionKeyFromBigInt(value: bigint): PositionKey {
  if (value < 0n || value > 0xffffffffffffffffn) {
    throw new RangeError('position key must fit in 64 unsigned bits');
  }
  return value.toString(16).padStart(16, '0');
}

export function positionKeyToBigInt(key: PositionKey): bigint {
  if (!isPositionKey(key)) throw new TypeError(`malformed position key: ${key}`);
  return BigInt(`0x${key}`);
}

/**
 * Strip the halfmove clock and fullmove number from a FEN.
 *
 * Deliberately keeps the en passant square exactly as the FEN states it. Note
 * that FEN producers disagree on whether to record an ep square when no legal
 * en passant capture exists; two encoders can therefore describe the same
 * position differently. Normalise FENs through one library on both the
 * ingestion and lookup sides, or peer lookups will miss for no visible reason.
 */
export function normaliseEpd(fen: string): string {
  const fields = fen.trim().split(/\s+/);
  if (fields.length < 4) throw new TypeError(`malformed FEN: ${fen}`);
  return fields.slice(0, 4).join(' ');
}

export function positionIdentity(fen: string, key: PositionKey): PositionIdentity {
  if (!isPositionKey(key)) throw new TypeError(`malformed position key: ${key}`);
  return { key, epd: normaliseEpd(fen) };
}

/**
 * True only when hash AND position agree. A key match with an EPD mismatch is a
 * Zobrist collision: rare, but it produces a confidently wrong peer claim,
 * which is the worst failure this product can have.
 */
export function samePosition(a: PositionIdentity, b: PositionIdentity): boolean {
  return a.key === b.key && a.epd === b.epd;
}

/** Detects the collision case specifically, so callers can count and log it. */
export function isCollision(a: PositionIdentity, b: PositionIdentity): boolean {
  return a.key === b.key && a.epd !== b.epd;
}

/** Shard routing for a prefix-sharded index. `bits` must be 1..16. */
export function shardId(key: PositionKey, bits = 12): string {
  if (!isPositionKey(key)) throw new TypeError(`malformed position key: ${key}`);
  if (bits < 1 || bits > 16 || !Number.isInteger(bits)) {
    throw new RangeError('shard bits must be an integer in 1..16');
  }
  const prefix = positionKeyToBigInt(key) >> BigInt(64 - bits);
  return prefix.toString(16).padStart(Math.ceil(bits / 4), '0');
}
