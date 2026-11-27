import { loadPlaylists, normalizeTracks } from './playlists';
import type { DiscPreset, MonthlyPlaylist, RawTrack } from './types';
import chineseSongsData from '../data/chinese-100-playlist.json';
import andyGrammerData from '../data/andy-grammer-2011.json';

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
    monthKey: id,
    year: tracks.length,
    monthShort: 'DISC',
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
  const andyGrammerAlbum = loadSinglePlaylistDisc('andy-grammer-2011', andyGrammerData, 'Andy Grammer');

  return [
    {
      id: 'time-machine',
      tapeLabel: 'time machine',
      tapeSubLabel: '2019 — 2026',
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
      inChangerByDefault: false,
    },
    {
      id: 'andy-grammer-2011',
      tapeLabel: 'andy grammer',
      tapeSubLabel: `2011 · ${andyGrammerAlbum.trackCount} tracks`,
      tapeTiltDeg: -2.4,
      discTone: 'silver',
      ipodTheme: 'aqua',
      showTimelineDial: false,
      playlists: [andyGrammerAlbum],
      inChangerByDefault: false,
      sleeveNote: 'first cd i ever bought, borders liquidation sale, sep 2011',
    },
  ];
}
