import { describe, it, expect } from 'vitest';
import { assessMove, expectedScore } from './classification';
import { parseInfoLine } from './uci';
import { parseGame, splitPgnGames, MAX_PGN_BYTES } from './pgn';
import { variationSteps, whiteEvaluation } from './variation';
import type { PositionAnalysis, EngineLine } from './types';
const line: EngineLine = {
  rank: 1,
  depth: 14,
  nodes: 10000,
  scoreCp: 50,
  scoreBound: 'exact',
  movesUci: ['e2e4'],
};
const result: PositionAnalysis = {
  ply: 1,
  san: 'd4',
  playedMoveUci: 'd2d4',
  fen: 'start',
  sideToMove: 'white',
  bestMoveUci: 'e2e4',
  lines: [line],
  playedLine: { ...line, scoreCp: 0, movesUci: ['d2d4'] },
};
describe('golden evidence boundaries', () => {
  it.each(['white', 'black'] as const)('uses mover scores for %s', (sideToMove) => {
    expect(
      assessMove({
        ...result,
        sideToMove,
        lines: [{ ...line, scoreCp: 200 }],
        playedLine: { ...line, scoreCp: -200 },
      }).label,
    ).toBe('Blunder');
  });
  it('recognises winning-to-losing mate without WDL', () => {
    expect(
      assessMove({
        ...result,
        lines: [{ ...line, scoreCp: undefined, mateIn: 3 }],
        playedLine: { ...line, scoreCp: undefined, mateIn: -3 },
      }).label,
    ).toBe('Blunder');
  });
  it('does not call a losing mate a missed winning mate', () => {
    expect(
      assessMove({
        ...result,
        lines: [{ ...line, scoreCp: undefined, mateIn: -3 }],
        playedLine: { ...line, scoreCp: undefined, mateIn: -2 },
      }).label,
    ).toBe('Good');
  });
  it('keeps a retained winning mate distinct from lost mate', () => {
    expect(
      assessMove({
        ...result,
        lines: [{ ...line, scoreCp: undefined, mateIn: 3 }],
        playedLine: { ...line, scoreCp: undefined, mateIn: 5 },
      }).label,
    ).toBe('Good');
    expect(
      assessMove({
        ...result,
        lines: [{ ...line, scoreCp: undefined, mateIn: 3 }],
        playedLine: line,
      }).label,
    ).toBe('Blunder');
  });
  it('never labels missing or bound evidence as good', () => {
    expect(assessMove({ ...result, lines: [] }).label).toBe('Uncertain');
    expect(assessMove({ ...result, lines: [{ ...line, scoreBound: 'lower' }] }).label).toBe(
      'Uncertain',
    );
    expect(assessMove({ ...result, playedLine: { ...line, scoreCp: undefined } }).label).toBe(
      'Uncertain',
    );
  });
  it('retains score bounds and drops invalid WDL', () => {
    expect(
      parseInfoLine('info depth 10 score cp 120 lowerbound nodes 1000 pv e2e4')?.scoreBound,
    ).toBe('lower');
    expect(
      parseInfoLine('info depth 10 score cp 120 upperbound nodes 1000 wdl 1000 1000 1000 pv e2e4')
        ?.wdl,
    ).toBeUndefined();
    expect(expectedScore({ ...line, wdl: { win: -2, draw: 1000, loss: 2 } })).toBeUndefined();
  });
  it('shows all graph scores in White perspective', () => {
    expect(whiteEvaluation('black', { scoreCp: 100 })).toBe(-1);
    expect(whiteEvaluation('black', { mateIn: -3 })).toBe(8);
  });
});
describe('standard chess and bounded imports', () => {
  it('replays a legal principal variation and rejects illegal moves', () => {
    const fen = parseGame('1. e4 *').positions[0]!.fen;
    expect(variationSteps(fen, ['e2e4', 'e7e5'])[2]!.san).toBe('e5');
    expect(() => variationSteps(fen, ['e2e5'])).toThrow();
  });
  it('imports multiple tagged games independently', () => {
    const games = splitPgnGames(
      '[Event "A"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n\n[Event "B"]\n[Result "0-1"]\n\n1. d4 d5 0-1',
    );
    expect(games.map((g) => parseGame(g).positions.length)).toEqual([2, 2]);
  });
  it('does not split tag-looking text inside a comment', () => {
    const games = splitPgnGames('[Event "A"]\n\n1. e4 {note\n[Event "fake"]\n} e5 *');
    expect(games).toHaveLength(1);
  });
  it('rejects oversized paste and unsupported variants', () => {
    expect(() => parseGame(' '.repeat(MAX_PGN_BYTES + 1))).toThrow();
    expect(() => parseGame('[Variant "Atomic"]\n\n1. e4 *')).toThrow(/standard chess/);
  });
  it('supports castling, en passant and underpromotion', () => {
    expect(parseGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O *').positions.at(-1)?.moveUci).toBe(
      'e1g1',
    );
    expect(parseGame('1. e4 a6 2. e5 d5 3. exd6 *').positions.at(-1)?.moveUci).toBe('e5d6');
    expect(
      parseGame('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=N *').positions[0]
        ?.moveUci,
    ).toBe('a7a8n');
  });
});
