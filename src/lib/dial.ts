export const VISIBLE_DIAL_MONTHS = 8;

export function getSlotStyle(slotIdx: number, total: number): string {
  const center = (total - 1) / 2;
  const dist = Math.abs(slotIdx - center) / Math.max(center, 1);
  const scale = (1 - dist * 0.16).toFixed(3);
  const opacity = (1 - dist * 0.42).toFixed(3);
  const x = (Math.pow(1 - dist, 1.5) * 8).toFixed(1);
  return `--dial-scale:${scale};--dial-opacity:${opacity};--dial-x:${x}px;`;
}
