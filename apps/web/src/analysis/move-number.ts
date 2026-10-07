export function moveNumber(fen: string): number {
  return Number(fen.split(' ')[5]);
}
export function movePrefix(fen: string): string {
  return `${moveNumber(fen)}${fen.split(' ')[1] === 'b' ? '...' : '.'}`;
}
