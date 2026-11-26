import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DATA_FILES = [
  resolve(process.cwd(), 'src/data/joy-chen-monthly-playlists.json'),
  resolve(process.cwd(), 'src/data/chinese-100-playlist.json'),
];

const YTM_SEARCH_URL = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false';
const YTM_SONGS_PARAMS = 'EgWKAQIIAWoMEAMQBBAJEAoQBRAV';
const YTM_VIDEOS_PARAMS = 'EgWKAQIQAWoMEAMQBBAJEAoQBRAV';

const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 250);
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const CHECKPOINT_EVERY = 200;

const NEGATIVE_KEYWORDS = [
  'karaoke',
  'instrumental',
  'piano cover',
  'acoustic cover',
  'cover by',
  '8d audio',
  'slowed',
  'sped up',
  'nightcore',
  'tribute',
  'lullaby',
  'ringtone',
  '伴奏',
  '钢琴',
  '鋼琴',
  '纯音乐',
  '純音樂',
  '翻唱',
];

function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\(\)\[\]【】《》「」"'.,!?;:·•\-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trackKey(track) {
  const title = normalizeText(track.title);
  const artists = track.artists.map(normalizeText).join(',');
  return `${title}||${artists}`;
}

function parseDurationTextToMs(text) {
  const match = String(text || '').match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (!match) return null;
  if (match[3] !== undefined) {
    return (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000;
  }
  return (Number(match[1]) * 60 + Number(match[2])) * 1000;
}

function extractCandidates(data) {
  const results = [];
  const seen = new Set();

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.musicResponsiveListItemRenderer) {
      const r = node.musicResponsiveListItemRenderer;
      const videoId =
        r.playlistItemData?.videoId ||
        r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
          ?.playNavigationEndpoint?.watchEndpoint?.videoId;
      if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId) && !seen.has(videoId)) {
        seen.add(videoId);
        const cols = (r.flexColumns || []).map((c) =>
          (c.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [])
            .map((x) => x.text)
            .join('')
        );
        const title = cols[0] || '';
        const meta = cols[1] || '';
        const durationMs = parseDurationTextToMs(meta);
        results.push({ videoId, title, meta, durationMs });
      }
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else {
      for (const val of Object.values(node)) walk(val);
    }
  }

  walk(data);
  return results;
}

async function searchYouTubeDataApi(query) {
  if (!YOUTUBE_API_KEY) return [];
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('videoEmbeddable', 'true');
  url.searchParams.set('maxResults', '5');
  url.searchParams.set('q', query);
  url.searchParams.set('key', YOUTUBE_API_KEY);

  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) {
    throw new Error(`YouTube Data API returned HTTP ${res.status}`);
  }
  const data = await res.json();
  return (data.items || [])
    .map((item) => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title || '',
      meta: item.snippet?.channelTitle || '',
      durationMs: null,
    }))
    .filter((item) => item.videoId && /^[a-zA-Z0-9_-]{11}$/.test(item.videoId));
}

async function searchYouTubeMusic(query, params, attempt = 0) {
  const body = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: '1.20240617.01.00',
        hl: 'en',
        gl: 'US',
      },
    },
    query,
  };
  if (params) body.params = params;

  try {
    if (REQUEST_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }
    const res = await fetch(YTM_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });

    if (res.status === 403) {
      throw new Error('Blocked by YouTube anti-automation (HTTP 403). Stop and retry later or set YOUTUBE_API_KEY.');
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const waitMs = 600 * Math.pow(2, attempt) + Math.random() * 400;
      await new Promise((r) => setTimeout(r, waitMs));
      return searchYouTubeMusic(query, params, attempt + 1);
    }
    if (!res.ok) return [];
    const data = await res.json();
    return extractCandidates(data);
  } catch (err) {
    if (err instanceof Error && err.message.includes('HTTP 403')) throw err;
    if (attempt < 3) {
      const waitMs = 500 * Math.pow(2, attempt) + Math.random() * 300;
      await new Promise((r) => setTimeout(r, waitMs));
      return searchYouTubeMusic(query, params, attempt + 1);
    }
    return [];
  }
}

function tokenOverlapScore(needle, haystack) {
  const nNorm = normalizeText(needle);
  const hNorm = normalizeText(haystack);
  if (!nNorm || !hNorm) return 0;
  if (hNorm === nNorm) return 30;
  if (hNorm.includes(nNorm) || nNorm.includes(hNorm)) return 20;

  const nTokens = nNorm.split(' ').filter((t) => t.length > 0);
  if (nTokens.length === 0) return 0;
  let hits = 0;
  for (const t of nTokens) {
    if (hNorm.includes(t)) hits++;
  }
  return Math.round((hits / nTokens.length) * 18);
}

function scoreCandidate(cand, track, index) {
  // Rank bias favors YouTube Music's top results
  let score = Math.max(0, 12 - index * 2.5);

  score += tokenOverlapScore(track.title, cand.title);

  let bestArtistScore = 0;
  for (const artist of track.artists) {
    const s = tokenOverlapScore(artist, `${cand.meta} ${cand.title}`);
    if (s > bestArtistScore) bestArtistScore = s;
  }
  score += bestArtistScore;

  // Duration closeness check
  if (typeof track.durationMs === 'number' && track.durationMs > 0 && cand.durationMs) {
    const diffSec = Math.abs(track.durationMs - cand.durationMs) / 1000;
    if (diffSec <= 3) score += 20;
    else if (diffSec <= 8) score += 14;
    else if (diffSec <= 20) score += 6;
    else if (diffSec > 60) score -= 18;
  }

  // Penalize covers / karaoke / piano unless the original track title asks for them
  const origLower = normalizeText(track.title);
  const candLower = normalizeText(`${cand.title} ${cand.meta}`);
  for (const kw of NEGATIVE_KEYWORDS) {
    if (candLower.includes(kw) && !origLower.includes(kw)) {
      score -= 28;
    }
  }
  if (candLower.includes('live') && !origLower.includes('live')) {
    score -= 10;
  }

  return score;
}

function pickBest(candidates, track) {
  if (!candidates.length) return null;
  let best = null;
  let bestScore = -Infinity;
  candidates.slice(0, 6).forEach((cand, idx) => {
    const s = scoreCandidate(cand, track, idx);
    if (s > bestScore) {
      bestScore = s;
      best = cand;
    }
  });
  return { cand: best, score: bestScore };
}

async function resolveTrackYoutubeId(track, { preferLyrics = false } = {}) {
  const title = track.title.trim();
  const primaryArtist = track.artists.find(Boolean) || '';
  const cleanTitle = title.replace(/\s*[\(\[（【].*?[\)\]）】]\s*/g, ' ').trim();
  const query = `${title} ${primaryArtist}`.trim();
  if (!query) return null;

  if (preferLyrics) {
    const lyricsQuery = `${cleanTitle || title} ${primaryArtist} 動態歌詞 lyrics`.trim();
    const candidates = YOUTUBE_API_KEY
      ? await searchYouTubeDataApi(lyricsQuery)
      : await searchYouTubeMusic(lyricsQuery, YTM_VIDEOS_PARAMS);
    const nonTopic = candidates.filter((c) => !/-\s*topic\b/i.test(c.meta));
    const best = pickBest(nonTopic.length > 0 ? nonTopic : candidates, track);
    if (best?.cand?.videoId) return best.cand.videoId;
  }

  if (YOUTUBE_API_KEY) {
    const apiResults = await searchYouTubeDataApi(query);
    const bestApi = pickBest(apiResults, track);
    if (bestApi?.cand?.videoId) return bestApi.cand.videoId;
  }

  // 1. Try YouTube Music Songs (official studio audio)
  const songs = await searchYouTubeMusic(query, YTM_SONGS_PARAMS);
  const bestSong = pickBest(songs, track);
  if (bestSong && bestSong.score >= 18) {
    return bestSong.cand.videoId;
  }

  // 2. Fallback: YouTube Music Videos
  const videos = await searchYouTubeMusic(query, YTM_VIDEOS_PARAMS);
  const bestVideo = pickBest(videos, track);
  if (bestVideo && bestVideo.score >= 16) {
    return bestVideo.cand.videoId;
  }

  // 3. Fallback: unfiltered search (catches tracks with simplified title)
  const fallbackQuery = `${cleanTitle || title} ${primaryArtist}`.trim();
  const anyResults = await searchYouTubeMusic(fallbackQuery, undefined);
  const bestAny = pickBest(anyResults, track);

  const candidates = [bestSong, bestVideo, bestAny].filter(Boolean);
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.cand?.videoId ?? null;
}

function collectTrackRefs(parsed) {
  const refs = [];
  if (Array.isArray(parsed.playlists)) {
    for (const pl of parsed.playlists) {
      if (Array.isArray(pl.tracks)) {
        for (const t of pl.tracks) refs.push(t);
      }
    }
  } else if (Array.isArray(parsed.tracks)) {
    for (const t of parsed.tracks) refs.push(t);
  }
  return refs;
}

async function saveAll(loadedFiles) {
  for (const file of loadedFiles) {
    await writeFile(file.path, JSON.stringify(file.data, null, 2) + '\n', 'utf8');
  }
}

async function main() {
  const startTime = Date.now();
  const chineseLyricsOnly = process.argv.includes('--chinese-lyrics');
  const force = process.argv.includes('--force') || chineseLyricsOnly;
  const targetFiles = chineseLyricsOnly
    ? DATA_FILES.filter((p) => p.endsWith('chinese-100-playlist.json'))
    : DATA_FILES;

  const loadedFiles = [];
  const keyToRefs = new Map();
  const keyToSample = new Map();
  const existingMap = new Map();

  for (const path of targetFiles) {
    const raw = await readFile(path, 'utf8');
    const data = JSON.parse(raw);
    loadedFiles.push({ path, data });
    const refs = collectTrackRefs(data);
    for (const ref of refs) {
      const k = trackKey(ref);
      if (!keyToRefs.has(k)) {
        keyToRefs.set(k, []);
        keyToSample.set(k, ref);
      }
      keyToRefs.get(k).push(ref);
      if (!force && typeof ref.youtubeId === 'string' && ref.youtubeId.length === 11) {
        existingMap.set(k, ref.youtubeId);
      }
    }
  }

  // Backfill duplicates if one copy already has a youtubeId
  for (const [k, id] of existingMap.entries()) {
    for (const ref of keyToRefs.get(k)) {
      ref.youtubeId = id;
    }
  }

  const pendingKeys = [...keyToSample.keys()].filter((k) => !existingMap.has(k));
  const totalUnique = keyToSample.size;
  console.log(
    `Loaded ${totalUnique} unique tracks (${existingMap.size} already populated, ${pendingKeys.length} to resolve) with concurrency=${CONCURRENCY}`
  );

  if (pendingKeys.length === 0) {
    await saveAll(loadedFiles);
    console.log('Nothing left to resolve.');
    return;
  }

  let cursor = 0;
  let completed = 0;
  let matched = 0;
  let missed = 0;
  let lastSavedAt = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= pendingKeys.length) break;
      const k = pendingKeys[idx];
      const sample = keyToSample.get(k);
      const videoId = await resolveTrackYoutubeId(sample, { preferLyrics: chineseLyricsOnly });
      if (videoId) {
        matched++;
        for (const ref of keyToRefs.get(k)) {
          ref.youtubeId = videoId;
        }
      } else {
        missed++;
      }
      completed++;

      if (completed % 100 === 0 || completed === pendingKeys.length) {
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          `[${completed}/${pendingKeys.length}] matched=${matched} missed=${missed} (${elapsedSec}s)`
        );
      }
      if (completed - lastSavedAt >= CHECKPOINT_EVERY) {
        lastSavedAt = completed;
        await saveAll(loadedFiles);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  await saveAll(loadedFiles);

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `Done in ${elapsedSec}s: ${existingMap.size + matched}/${totalUnique} unique tracks have youtubeId (${missed} unmatched).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
