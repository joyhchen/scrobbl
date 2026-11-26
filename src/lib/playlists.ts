import rawData from '../data/joy-chen-monthly-playlists.json';
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
  date?: unknown;
  playlist?: unknown;
  name?: unknown;
  title?: unknown;
  tracks?: unknown;
  songs?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  rawMonth?: string,
  rawLabel?: string
): { year: number; monthIndex: number; monthKey: string } | null {
  const monthMatch = rawMonth?.trim().match(/^(\d{4})[-/](\d{1,2})$/);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const monthIndex = Number(monthMatch[2]) - 1;
    if (monthIndex >= 0 && monthIndex <= 11) {
      const padded = String(monthIndex + 1).padStart(2, '0');
      return { year, monthIndex, monthKey: `${year}-${padded}` };
    }
  }

  if (!rawLabel) return null;

  const lower = rawLabel.toLowerCase();
  const yearMatch = lower.match(/\b(19\d{2}|20\d{2})\b/);
  const monthIndex = MONTH_LONG.findIndex(
    (m, idx) =>
      lower.includes(m.toLowerCase()) ||
      new RegExp(`\\b${MONTH_SHORT[idx].toLowerCase()}\\b`).test(lower)
  );
  if (!yearMatch || monthIndex === -1) return null;

  const year = Number(yearMatch[1]);
  const padded = String(monthIndex + 1).padStart(2, '0');
  return { year, monthIndex, monthKey: `${year}-${padded}` };
}

function normalizeTrack(raw: RawTrack): Track | null {
  const titleVal =
    typeof raw.title === 'string' ? raw.title : typeof raw.name === 'string' ? raw.name : '';
  const title = titleVal.trim();
  if (!title) return null;

  let artists: string[] = [];
  if (Array.isArray(raw.artists)) {
    artists = raw.artists
      .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      .map((a) => a.trim());
  } else if (typeof raw.artist === 'string' && raw.artist.trim()) {
    artists = [raw.artist.trim()];
  } else if (typeof raw.artists === 'string' && raw.artists.trim()) {
    artists = [raw.artists.trim()];
  }

  const durationMs =
    typeof raw.durationMs === 'number'
      ? raw.durationMs
      : typeof raw.duration_ms === 'number'
        ? raw.duration_ms
        : undefined;

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

function normalizePlaylistsPayload(input: unknown): MonthlyPlaylist[] {
  const list: unknown[] = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.playlists)
      ? input.playlists
      : [];

  const normalized: MonthlyPlaylist[] = [];

  for (const item of list) {
    if (!isRecord(item)) continue;
    const raw: RawPlaylist = item;
    const rawMonth =
      typeof raw.month === 'string'
        ? raw.month
        : typeof raw.date === 'string'
          ? raw.date
          : undefined;
    const rawLabel =
      typeof raw.playlist === 'string'
        ? raw.playlist
        : typeof raw.name === 'string'
          ? raw.name
          : typeof raw.title === 'string'
            ? raw.title
            : undefined;

    const parsed = parseMonthInfo(rawMonth, rawLabel);
    if (!parsed) continue;

    const { tracks, totalDurationText } = normalizeTracks(
      Array.isArray(raw.tracks) ? raw.tracks : raw.songs
    );
    const monthLong = MONTH_LONG[parsed.monthIndex];
    const monthShort = MONTH_SHORT[parsed.monthIndex];

    normalized.push({
      monthKey: parsed.monthKey,
      year: parsed.year,
      monthShort,
      label: rawLabel?.trim() || `${monthLong} ${parsed.year}`,
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
  return normalizePlaylistsPayload(rawData);
}
