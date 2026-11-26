export function formatShotCount(count: number): string {
  return `${count} ${count === 1 ? 'SHOT' : 'SHOTS'}`;
}
