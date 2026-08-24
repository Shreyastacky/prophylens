import type { EngineLine } from './types';

function numberAfter(tokens: string[], key: string): number | undefined {
  const index = tokens.indexOf(key);
  if (index === -1) return undefined;
  const value = Number(tokens[index + 1]);
  return Number.isFinite(value) ? value : undefined;
}

export function parseInfoLine(message: string): EngineLine | null {
  const tokens = message.trim().split(/\s+/);
  if (tokens[0] !== 'info' || !tokens.includes('pv')) return null;

  const depth = numberAfter(tokens, 'depth');
  const nodes = numberAfter(tokens, 'nodes');
  if (depth === undefined || nodes === undefined) return null;

  const scoreIndex = tokens.indexOf('score');
  const scoreKind = tokens[scoreIndex + 1];
  const scoreValue = Number(tokens[scoreIndex + 2]);
  const pvIndex = tokens.indexOf('pv');
  const wdlIndex = tokens.indexOf('wdl');

  const parsed: EngineLine = {
    rank: numberAfter(tokens, 'multipv') ?? 1,
    depth,
    nodes,
    movesUci: tokens.slice(pvIndex + 1),
  };

  const selectiveDepth = numberAfter(tokens, 'seldepth');
  if (selectiveDepth !== undefined) parsed.selectiveDepth = selectiveDepth;
  if (scoreKind === 'cp' && Number.isFinite(scoreValue)) parsed.scoreCp = scoreValue;
  if (scoreKind === 'mate' && Number.isFinite(scoreValue)) parsed.mateIn = scoreValue;

  if (wdlIndex !== -1) {
    const values = tokens.slice(wdlIndex + 1, wdlIndex + 4).map(Number);
    if (values.length === 3 && values.every(Number.isFinite)) {
      parsed.wdl = { win: values[0]!, draw: values[1]!, loss: values[2]! };
    }
  }

  return parsed;
}

export function parseBestMove(message: string): string | null {
  const match = /^bestmove\s+(\S+)/.exec(message.trim());
  if (!match || match[1] === '(none)') return null;
  return match[1]!;
}
