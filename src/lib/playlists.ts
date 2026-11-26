import rawData from '../data/joy-chen-monthly-playlists.json';
import { isRecord } from './isRecord';
import type { MonthlyPlaylist, RawTrack, Track } from './types';

const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

interface RawPlaylist {
  month?: unknown;
  playlist?: unknown;
  tracks?: unknown;
}

function formatTrackDuration(ms?: number): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatPlaylistDuration(totalMs: number): string {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return '';
  const totalMinutes = Math.round(totalMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

function parseMonthInfo(
  rawMonth: string
): { year: number; monthIndex: number; monthKey: string } | null {
  const monthMatch = rawMonth.trim().match(/^(\d{4})[-/](\d{1,2})$/);
  if (!monthMatch) return null;
  const year = Number(monthMatch[1]);
  const monthIndex = Number(monthMatch[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  const padded = String(monthIndex + 1).padStart(2, '0');
  return { year, monthIndex, monthKey: `${year}-${padded}` };
}

function normalizeTrack(raw: RawTrack): Track | null {
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) return null;

  const artists = Array.isArray(raw.artists)
    ? raw.artists
        .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
        .map((a) => a.trim())
    : [];

  const durationMs = typeof raw.durationMs === 'number' ? raw.durationMs : undefined;

  const youtubeId =
    typeof raw.youtubeId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(raw.youtubeId.trim())
      ? raw.youtubeId.trim()
      : undefined;

  return {
    title,
    artistText: artists.length > 0 ? artists.join(', ') : 'Unknown Artist',
    durationMs,
    durationText: formatTrackDuration(durationMs),
    ...(youtubeId ? { youtubeId } : {}),
  };
}

export function normalizeTracks(rawTracks: unknown): {
  tracks: Track[];
  totalDurationText: string;
} {
  const list: unknown[] = Array.isArray(rawTracks) ? rawTracks : [];
  const tracks = list
    .map((item) => (isRecord(item) ? normalizeTrack(item) : null))
    .filter((t): t is Track => t !== null);
  const totalMs = tracks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
  return {
    tracks,
    totalDurationText: formatPlaylistDuration(totalMs),
  };
}

function normalizePlaylists(list: unknown[]): MonthlyPlaylist[] {
  const normalized: MonthlyPlaylist[] = [];

  for (const item of list) {
    if (!isRecord(item)) continue;
    const raw: RawPlaylist = item;
    if (typeof raw.month !== 'string') continue;
    const parsed = parseMonthInfo(raw.month);
    if (!parsed) continue;

    const { tracks, totalDurationText } = normalizeTracks(raw.tracks);
    const rawLabel = typeof raw.playlist === 'string' ? raw.playlist.trim() : '';

    normalized.push({
      monthKey: parsed.monthKey,
      year: parsed.year,
      monthShort: MONTH_SHORT[parsed.monthIndex],
      label: rawLabel || `${MONTH_LONG[parsed.monthIndex]} ${parsed.year}`,
      tracks,
      trackCount: tracks.length,
      totalDurationText,
    });
  }

  // Newest first (Time Machine order); missing months are naturally omitted.
  normalized.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  return normalized;
}

export function loadPlaylists(): MonthlyPlaylist[] {
  return normalizePlaylists(rawData.playlists);
}
