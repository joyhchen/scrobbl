import { loadPlaylists, normalizeTracks } from './playlists';
import type { DiscPreset, MonthlyPlaylist, RawTrack } from './types';
import chineseSongsData from '../data/chinese-100-playlist.json';

export type { DiscPreset, IPodColorTheme } from './types';

interface SinglePlaylistJson {
  title?: string;
  tracks?: RawTrack[];
}

function loadSinglePlaylistDisc(
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
    monthShort: 'DISC',
    monthLong: title,
    label: title,
    tracks,
    trackCount: tracks.length,
    totalDurationText,
  };
}

export function loadDiscs(): [DiscPreset, ...DiscPreset[]] {
  const timeMachinePlaylists = loadPlaylists();
  const chinesePlaylist = loadSinglePlaylistDisc(
    'best-100-chinese-songs',
    chineseSongsData,
    '最好听的 100 首中文歌'
  );

  return [
    {
      id: 'time-machine',
      tapeLabel: 'time machine',
      tapeSubLabel: '2019 — 2025',
      tapeTiltDeg: -1.6,
      discTone: 'silver',
      ipodTheme: 'aqua',
      showTimelineDial: true,
      playlists: timeMachinePlaylists,
    },
    {
      id: 'best-100-chinese-songs',
      tapeLabel: chinesePlaylist.label,
      tapeSubLabel: `${chinesePlaylist.trackCount} tracks`,
      tapeTiltDeg: 1.2,
      discTone: 'gold',
      ipodTheme: 'aqua',
      showTimelineDial: false,
      playlists: [chinesePlaylist],
    },
  ];
}
