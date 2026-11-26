import fs from 'node:fs';
import path from 'node:path';
import rawManifest from '../data/photos.json';
import type { CameraPhoto, PhotosByMonth } from './types';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withBaseUrl(src: string): string {
  if (/^(?:https?:)?\/\//i.test(src) || src.startsWith('data:')) {
    return src;
  }
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  const normalized = src.startsWith('/') ? src : `/${src}`;
  if (base && (normalized === base || normalized.startsWith(`${base}/`))) {
    return normalized;
  }
  return `${base}${normalized}`;
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

function scanPublicPhotosDirectory(): PhotosByMonth {
  const result: PhotosByMonth = {};
  const photosRoot = path.resolve(process.cwd(), 'public', 'photos');
  if (!fs.existsSync(photosRoot)) return result;

  const entries = fs.readdirSync(photosRoot, { withFileTypes: true });
  for (const dir of entries) {
    if (!dir.isDirectory() || !MONTH_KEY_RE.test(dir.name)) continue;

    const monthDir = path.join(photosRoot, dir.name);
    const files = fs
      .readdirSync(monthDir, { withFileTypes: true })
      .filter((f) => f.isFile() && IMAGE_EXTENSIONS.has(path.extname(f.name).toLowerCase()))
      .map((f) => f.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (files.length === 0) continue;

    result[dir.name] = files.map((file) => ({
      src: withBaseUrl(`/photos/${dir.name}/${encodeURIComponent(file)}`),
    }));
  }

  return result;
}

export function loadPhotosByMonth(): PhotosByMonth {
  const byMonth: PhotosByMonth = {};
  const seenSrcs = new Map<string, Set<string>>();

  const addPhoto = (monthKey: string, photo: CameraPhoto) => {
    if (!byMonth[monthKey]) {
      byMonth[monthKey] = [];
      seenSrcs.set(monthKey, new Set());
    }
    const seen = seenSrcs.get(monthKey)!;
    if (seen.has(photo.src)) return;
    seen.add(photo.src);
    byMonth[monthKey].push(photo);
  };

  // 1. Manifest entries take priority so captions, dates, and ordering are preserved.
  if (isRecord(rawManifest)) {
    for (const [monthKey, value] of Object.entries(rawManifest)) {
      if (!MONTH_KEY_RE.test(monthKey) || !Array.isArray(value)) continue;
      for (const entry of value) {
        const photo = normalizePhotoEntry(entry);
        if (photo) addPhoto(monthKey, photo);
      }
    }
  }

  // 2. Auto-discover any local images dropped into public/photos/YYYY-MM/.
  const scanned = scanPublicPhotosDirectory();
  for (const [monthKey, photos] of Object.entries(scanned)) {
    for (const photo of photos) {
      addPhoto(monthKey, photo);
    }
  }

  return byMonth;
}
