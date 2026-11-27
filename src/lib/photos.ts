import rawManifest from '../data/photos.json';
import { BASE_PATH } from './basePath';
import { isRecord } from './isRecord';
import type { CameraPhoto, PhotosByMonth } from './types';

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

function withBaseUrl(src: string): string {
  if (/^(?:https?:)?\/\//i.test(src) || src.startsWith('data:')) {
    return src;
  }
  const normalized = src.startsWith('/') ? src : `/${src}`;
  if (BASE_PATH && (normalized === BASE_PATH || normalized.startsWith(`${BASE_PATH}/`))) {
    return normalized;
  }
  return `${BASE_PATH}${normalized}`;
}

function normalizePhotoEntry(entry: unknown): CameraPhoto | null {
  if (typeof entry === 'string' && entry.trim()) {
    return { src: withBaseUrl(entry.trim()) };
  }
  if (!isRecord(entry) || typeof entry.src !== 'string' || !entry.src.trim()) {
    return null;
  }

  return {
    src: withBaseUrl(entry.src.trim()),
    ...(typeof entry.caption === 'string' && entry.caption.trim()
      ? { caption: entry.caption.trim() }
      : {}),
    ...(typeof entry.date === 'string' && entry.date.trim() ? { date: entry.date.trim() } : {}),
    ...(typeof entry.filmSim === 'string' && entry.filmSim.trim()
      ? { filmSim: entry.filmSim.trim() }
      : {}),
    ...(typeof entry.meta === 'string' && entry.meta.trim() ? { meta: entry.meta.trim() } : {}),
  };
}

export function loadPhotosByMonth(): PhotosByMonth {
  const byMonth: PhotosByMonth = {};
  const seenSrcs = new Map<string, Set<string>>();

  if (!isRecord(rawManifest)) return byMonth;

  for (const [monthKey, value] of Object.entries(rawManifest)) {
    if (!MONTH_KEY_RE.test(monthKey) || !Array.isArray(value)) continue;

    for (const entry of value) {
      const photo = normalizePhotoEntry(entry);
      if (!photo) continue;

      let seen = seenSrcs.get(monthKey);
      if (!seen) {
        seen = new Set();
        seenSrcs.set(monthKey, seen);
        byMonth[monthKey] = [];
      }
      if (seen.has(photo.src)) continue;
      seen.add(photo.src);
      byMonth[monthKey].push(photo);
    }
  }

  return byMonth;
}
