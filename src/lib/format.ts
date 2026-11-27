export function formatShotCount(count: number): string {
  return `${count} ${count === 1 ? 'SHOT' : 'SHOTS'}`;
}

export function formatDiscSlot(slotIdx: number): string {
  return `DISC ${String(slotIdx + 1).padStart(2, '0')}`;
}
