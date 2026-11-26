export type IPodColorTheme = 'aqua' | 'coral' | 'mint';

export type StepDirection = 1 | -1;

export interface RawTrack {
  title?: unknown;
  name?: unknown;
  artists?: unknown;
  artist?: unknown;
  durationMs?: unknown;
  duration_ms?: unknown;
  youtubeId?: unknown;
}

export interface Track {
  title: string;
  artists: string[];
  artistText: string;
  durationMs?: number;
  durationText: string;
  youtubeId?: string;
}

export interface MonthlyPlaylist {
  id: string;
  monthKey: string;
  year: number;
  monthIndex: number; // 0-11
  monthShort: string;
  monthLong: string;
  label: string;
  tracks: Track[];
  trackCount: number;
  totalDurationText: string;
}

export interface DiscPreset {
  id: string;
  tapeLabel: string;
  tapeSubLabel?: string;
  tapeTiltDeg: number;
  discTone: 'silver' | 'gold';
  ipodTheme: IPodColorTheme;
  showTimelineDial: boolean;
  playlists: MonthlyPlaylist[];
}

export type ClientTrack = Pick<Track, 'title' | 'artistText' | 'durationText' | 'youtubeId'>;

export type ClientPlaylist = Pick<
  MonthlyPlaylist,
  'year' | 'monthShort' | 'label' | 'trackCount' | 'totalDurationText'
> & {
  tracks: ClientTrack[];
};

export type ClientDisc = Pick<
  DiscPreset,
  'id' | 'ipodTheme' | 'showTimelineDial'
> & {
  playlists: ClientPlaylist[];
};
