import { loadPlaylists, normalizeTracks } from './playlists';
import type { CassettePreset, MonthlyPlaylist, RawTrack } from './types';
import chineseSongsData from '../data/cassette-playlist.json';

export type { CassettePreset, IPodColorTheme } from './types';

interface SinglePlaylistJson {
  title?: string;
  tracks?: RawTrack[];
}

function loadSinglePlaylistCassette(
  id: string,
  raw: SinglePlaylistJson,
  fallbackTitle: string
): MonthlyPlaylist {
  const { tracks, totalDurationText } = normalizeTracks(raw.tracks);
  const title = raw.title?.trim() || fallbackTitle;

  return {
    id,
    monthKey: id,
    year: tracks.length,
    monthIndex: 0,
    monthShort: 'SIDE',
    monthLong: title,
    label: title,
    tracks,
    trackCount: tracks.length,
    totalDurationText,
  };
}

export function loadCassettes(): [CassettePreset, ...CassettePreset[]] {
  const timeMachinePlaylists = loadPlaylists();
  const chinesePlaylist = loadSinglePlaylistCassette(
    'best-100-chinese-songs',
    chineseSongsData,
    '最好听的 100 首中文歌'
  );

  return [
    {
      id: 'time-machine',
      tapeLabel: 'time machine',
      tapeSubLabel: '2019 — 2025',
      tapeTiltDeg: -1.3,
      shellTone: 'charcoal',
      ipodTheme: 'aqua',
      showTimelineDial: true,
      playlists: timeMachinePlaylists,
    },
    {
      id: 'best-100-chinese-songs',
      tapeLabel: chinesePlaylist.label,
      tapeSubLabel: `${chinesePlaylist.trackCount} tracks`,
      tapeTiltDeg: 0.9,
      shellTone: 'amber',
      ipodTheme: 'coral',
      showTimelineDial: false,
      playlists: [chinesePlaylist],
    },
  ];
}
