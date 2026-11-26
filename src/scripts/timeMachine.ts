import { soundEngine } from '../lib/audio';
import { getSlotStyle, VISIBLE_DIAL_MONTHS } from '../lib/dial';
import { IPodYouTubePlayer, type PlaybackState } from '../lib/youtube';
import type {
  CameraPhoto,
  ClientDisc,
  ClientPlaylist,
  ClientTrack,
  IPodColorTheme,
  StepDirection,
} from '../lib/types';

type IPodView = 'playlists' | 'tracks' | 'detail';

interface FilmSimPreset {
  id: 'classic-chrome' | 'std' | 'acros' | 'velvia';
  label: string;
}

const FILM_SIM_PRESETS: readonly FilmSimPreset[] = [
  { id: 'classic-chrome', label: 'CLASSIC CHROME' },
  { id: 'std', label: 'PROVIA / STD' },
  { id: 'acros', label: 'ACROS' },
  { id: 'velvia', label: 'VELVIA / VIVID' },
];

const VALID_THEMES: ReadonlySet<string> = new Set<IPodColorTheme>(['aqua', 'coral', 'mint']);

function formatSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const rounded = Math.floor(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIPodColorTheme(value: unknown): value is IPodColorTheme {
  return typeof value === 'string' && VALID_THEMES.has(value);
}

function isClientTrack(value: unknown): value is ClientTrack {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.artistText === 'string' &&
    typeof value.durationText === 'string' &&
    (value.youtubeId === undefined || typeof value.youtubeId === 'string')
  );
}

function isCameraPhoto(value: unknown): value is CameraPhoto {
  return (
    isRecord(value) &&
    typeof value.src === 'string' &&
    (value.caption === undefined || typeof value.caption === 'string') &&
    (value.date === undefined || typeof value.date === 'string') &&
    (value.filmSim === undefined || typeof value.filmSim === 'string') &&
    (value.meta === undefined || typeof value.meta === 'string')
  );
}

function isClientPlaylist(value: unknown): value is ClientPlaylist {
  return (
    isRecord(value) &&
    typeof value.monthKey === 'string' &&
    typeof value.year === 'number' &&
    typeof value.monthShort === 'string' &&
    typeof value.label === 'string' &&
    typeof value.trackCount === 'number' &&
    typeof value.totalDurationText === 'string' &&
    Array.isArray(value.tracks) &&
    value.tracks.every(isClientTrack) &&
    Array.isArray(value.photos) &&
    value.photos.every(isCameraPhoto)
  );
}

function isClientDisc(value: unknown): value is ClientDisc {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isIPodColorTheme(value.ipodTheme) &&
    typeof value.showTimelineDial === 'boolean' &&
    Array.isArray(value.playlists) &&
    value.playlists.every(isClientPlaylist)
  );
}

function parseClientDiscs(rawJson: string): ClientDisc[] {
  const parsed: unknown = JSON.parse(rawJson);
  if (!Array.isArray(parsed) || !parsed.every(isClientDisc)) {
    throw new Error('Invalid embedded #discs-data payload.');
  }
  return parsed;
}

function requireEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el;
}

function requireButton(id: string): HTMLButtonElement {
  const el = requireEl(id);
  if (!(el instanceof HTMLButtonElement)) {
    throw new Error(`Expected #${id} to be a <button>`);
  }
  return el;
}

function initTimeMachine(): void {
  const payloadEl = requireEl('discs-data');
  if (!payloadEl.textContent) {
    throw new Error('Embedded #discs-data payload is empty.');
  }

  const discs = parseClientDiscs(payloadEl.textContent);
  if (discs.length === 0) {
    throw new Error('No discs found in #discs-data.');
  }

  const dialEl = requireEl('timeline-dial');
  const dialSlotsEl = requireEl('dial-slots');
  const dialUpBtn = requireButton('dial-up-btn');
  const dialDownBtn = requireButton('dial-down-btn');

  const discDeckEl = requireEl('disc-deck');
  const discCarouselEl = requireEl('disc-carousel');
  const discChangeBtn = requireButton('disc-change-btn');
  const discReadoutEl = requireEl('disc-slot-readout');
  const discReadLedEl = requireEl('disc-read-led');

  const ipodRig = requireEl('ipod-3d-rig');
  const ipodBody = requireEl('ipod-body');
  const topbarLeft = requireEl('ipod-topbar-left');
  const topbarTitle = requireEl('ipod-topbar-title');
  const viewPlaylists = requireEl('ipod-view-playlists');
  const viewTracks = requireEl('ipod-view-tracks');
  const viewDetail = requireEl('ipod-view-detail');
  const playlistsListEl = requireEl('ipod-playlists-list');
  const playlistsThumbEl = requireEl('ipod-playlists-thumb');
  const tracksListEl = requireEl('ipod-tracks-list');
  const tracksThumbEl = requireEl('ipod-tracks-thumb');
  const trackCountEl = requireEl('ipod-track-count');
  const trackTotalTimeEl = requireEl('ipod-track-total-time');

  const ytHostEl = requireEl('ipod-yt-host');
  const fallbackEl = requireEl('ipod-video-fallback');
  const fallbackStatusEl = requireEl('ipod-fallback-status');
  const fallbackLinkRaw = requireEl('ipod-fallback-link');
  if (!(fallbackLinkRaw instanceof HTMLAnchorElement)) {
    throw new Error('Expected #ipod-fallback-link to be an <a>');
  }
  const fallbackLinkEl = fallbackLinkRaw;
  const fallbackSkipBtn = requireButton('ipod-fallback-skip');

  const detailCounterEl = requireEl('ipod-detail-counter');
  const detailArtMonthEl = requireEl('ipod-detail-art-month');
  const detailArtYearEl = requireEl('ipod-detail-art-year');
  const detailTitleEl = requireEl('ipod-detail-title');
  const detailArtistEl = requireEl('ipod-detail-artist');
  const detailPlaylistEl = requireEl('ipod-detail-playlist');
  const detailElapsedEl = requireEl('ipod-detail-elapsed');
  const detailDurationEl = requireEl('ipod-detail-duration');
  const scrubberTrackEl = requireEl('ipod-scrubber-track');
  const scrubberFillEl = requireEl('ipod-scrubber-fill');

  const clickWheel = requireEl('ipod-click-wheel');
  const btnMenu = requireButton('wheel-btn-menu');
  const btnPrev = requireButton('wheel-btn-prev');
  const btnNext = requireButton('wheel-btn-next');
  const btnPlay = requireButton('wheel-btn-play');
  const btnCenter = requireButton('wheel-center-btn');

  const soundToggle = requireButton('sound-toggle');

  const fujiDeskSpotEl = requireEl('fuji-desk-spot');
  const fujiCameraBtn = requireButton('fuji-camera-btn');
  const fujiBadgeMonthEl = requireEl('fuji-desk-badge-month');
  const fujiBadgeCountEl = requireEl('fuji-desk-badge-count');

  const cameraModalEl = requireEl('camera-modal');
  const cameraBackdropEl = requireEl('camera-modal-backdrop');
  const cameraCloseBtn = requireButton('camera-close-btn');
  const cameraStatusLedEl = requireEl('camera-status-led');
  const cameraTitleEl = requireEl('camera-modal-title');
  const cameraPrevMonthBtn = requireButton('camera-prev-month-btn');
  const cameraNextMonthBtn = requireButton('camera-next-month-btn');
  const cameraDeckDispBtn = requireButton('camera-deck-disp-btn');
  const cameraCmdDialBtn = requireButton('camera-cmd-dial');

  const cameraLcdEl = requireEl('camera-lcd');
  const cameraViewSingleEl = requireEl('camera-view-single');
  const cameraViewGridEl = requireEl('camera-view-grid');
  const cameraViewEmptyEl = requireEl('camera-view-empty');
  const cameraPhotoImgRaw = requireEl('camera-photo-img');
  if (!(cameraPhotoImgRaw instanceof HTMLImageElement)) {
    throw new Error('Expected #camera-photo-img to be an <img>');
  }
  const cameraPhotoImgEl = cameraPhotoImgRaw;
  const cameraHudEl = requireEl('camera-hud');
  const cameraFrameTextEl = requireEl('camera-frame-text');
  const cameraHudSimEl = requireEl('camera-hud-sim');
  const cameraHudDateEl = requireEl('camera-hud-date');
  const cameraHudCaptionEl = requireEl('camera-hud-caption');
  const cameraHudMetaEl = requireEl('camera-hud-meta');
  const cameraGridTitleEl = requireEl('camera-grid-title');
  const cameraGridCountEl = requireEl('camera-grid-count');
  const cameraGridCellsEl = requireEl('camera-grid-cells');
  const cameraEmptyMonthEl = requireEl('camera-empty-month');
  const cameraEmptySimEl = requireEl('camera-empty-sim');
  const cameraEmptyHintEl = requireEl('camera-empty-hint');
  const cameraJumpPopulatedBtn = requireButton('camera-jump-populated-btn');

  const cameraBtnPlay = requireButton('camera-btn-play');
  const cameraBtnDisp = requireButton('camera-btn-disp');
  const cameraBtnSim = requireButton('camera-btn-sim');
  const cameraBtnGrid = requireButton('camera-btn-grid');
  const cameraDpadUp = requireButton('camera-dpad-up');
  const cameraDpadDown = requireButton('camera-dpad-down');
  const cameraDpadLeft = requireButton('camera-dpad-left');
  const cameraDpadRight = requireButton('camera-dpad-right');
  const cameraDpadOk = requireButton('camera-dpad-ok');

  let activeDiscIdx = 0;
  let playlists: ClientPlaylist[] = discs[0].playlists;
  let maxDialStart = Math.max(0, playlists.length - VISIBLE_DIAL_MONTHS);
  let dialStart = 0;
  let activePlaylistIdx = 0;
  let playlistCursor = 0;
  let trackCursor = 0;
  let currentView: IPodView = 'tracks';
  let playbackState: PlaybackState = 'idle';
  let skipLoadTimer: number | null = null;

  let cameraOpen = false;
  let cameraPhotoIdx = 0;
  let cameraMode: 'single' | 'grid' = 'single';
  let cameraShowHud = true;
  let cameraFilmSimIdx = 0;
  let cameraLedTimer: number | null = null;

  function releaseIframeFocus(): void {
    if (document.activeElement instanceof HTMLIFrameElement) {
      document.activeElement.blur();
    }
    window.focus();
  }

  function updateDetailTopbarStatus(): void {
    if (currentView !== 'detail') return;
    if (playbackState === 'playing') {
      topbarLeft.textContent = '▶';
    } else if (playbackState === 'paused') {
      topbarLeft.textContent = '❚❚';
    } else if (playbackState === 'loading') {
      topbarLeft.textContent = '…';
    } else if (playbackState === 'error') {
      topbarLeft.textContent = '!';
    } else {
      topbarLeft.textContent = '‹';
    }
  }

  function showVideoFallback(reason: string, href: string): void {
    fallbackStatusEl.textContent = reason;
    fallbackLinkEl.href = href;
    fallbackEl.dataset.visible = 'true';
  }

  function hideVideoFallback(): void {
    fallbackEl.dataset.visible = 'false';
  }

  const ytPlayer = new IPodYouTubePlayer(ytHostEl, {
    onStateChange: (state, errorCode) => {
      playbackState = state;
      updateDetailTopbarStatus();

      if (state === 'playing' || state === 'paused' || state === 'loading') {
        hideVideoFallback();
      } else if (state === 'ended' && currentView === 'detail') {
        const tracks = playlists[activePlaylistIdx]?.tracks ?? [];
        if (trackCursor + 1 < tracks.length) {
          trackCursor += 1;
          renderListSelection(tracksListEl, trackCursor, tracksThumbEl);
          playActiveTrack(true);
        }
      } else if (state === 'error' && currentView === 'detail') {
        const track = playlists[activePlaylistIdx]?.tracks[trackCursor];
        const reason =
          errorCode === 101 || errorCode === 150
            ? 'Embedding disabled by video owner'
            : errorCode === 100
              ? 'Video unavailable on YouTube'
              : 'Could not play YouTube video';
        const href = track?.youtubeId
          ? `https://www.youtube.com/watch?v=${track.youtubeId}`
          : `https://www.youtube.com/results?search_query=${encodeURIComponent(
              `${track?.title ?? ''} ${track?.artistText ?? ''}`.trim()
            )}`;
        showVideoFallback(reason, href);
      }
    },
    onProgress: (cur, dur) => {
      detailElapsedEl.textContent = formatSeconds(cur);
      if (dur > 0) {
        const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
        scrubberFillEl.style.width = `${pct.toFixed(2)}%`;
        scrubberTrackEl.setAttribute('aria-valuenow', String(Math.round(pct)));
        detailDurationEl.textContent = `-${formatSeconds(Math.max(0, dur - cur))}`;
      } else {
        scrubberFillEl.style.width = '0%';
        scrubberTrackEl.setAttribute('aria-valuenow', '0');
      }
    },
  });

  ytPlayer.preload();

  function stopPlayback(): void {
    if (skipLoadTimer !== null) {
      window.clearTimeout(skipLoadTimer);
      skipLoadTimer = null;
    }
    hideVideoFallback();
    ytPlayer.stop();
  }

  function playActiveTrack(immediate = true): void {
    if (skipLoadTimer !== null) {
      window.clearTimeout(skipLoadTimer);
      skipLoadTimer = null;
    }

    renderDetailView();
    const pl = playlists[activePlaylistIdx];
    const track = pl?.tracks[trackCursor];
    if (!pl || !track) {
      stopPlayback();
      return;
    }

    if (!track.youtubeId) {
      ytPlayer.stop();
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
        `${track.title} ${track.artistText}`.trim()
      )}`;
      showVideoFallback('No YouTube video matched', searchUrl);
      playbackState = 'error';
      updateDetailTopbarStatus();
      return;
    }

    const videoId = track.youtubeId;
    fallbackLinkEl.href = `https://www.youtube.com/watch?v=${videoId}`;
    hideVideoFallback();

    if (immediate) {
      ytPlayer.play(videoId);
    } else {
      // Silence previous track immediately while user rapidly skips through tracks.
      ytPlayer.pauseForSkip();
      skipLoadTimer = window.setTimeout(() => {
        skipLoadTimer = null;
        if (currentView === 'detail') {
          ytPlayer.play(videoId);
        }
      }, 140);
    }
  }

  // Satisfy browser Web Audio autoplay policy on the first user gesture.
  const unlockOnce = () => {
    soundEngine.unlock();
    window.removeEventListener('pointerdown', unlockOnce);
    window.removeEventListener('keydown', unlockOnce);
  };
  window.addEventListener('pointerdown', unlockOnce, { passive: true });
  window.addEventListener('keydown', unlockOnce, { passive: true });

  soundToggle.addEventListener('click', () => {
    const nextMuted = !soundEngine.isMuted();
    soundEngine.setMuted(nextMuted);
    soundToggle.setAttribute('data-muted', String(nextMuted));
    soundToggle.setAttribute('aria-pressed', String(nextMuted));
    if (!nextMuted) {
      soundEngine.unlock();
      soundEngine.playDialTick(1);
    }
  });

  function renderDial(rollDirection?: 'up' | 'down'): void {
    const visibleCount = Math.min(VISIBLE_DIAL_MONTHS, playlists.length);
    const fragment = document.createDocumentFragment();

    for (let slotIdx = 0; slotIdx < visibleCount; slotIdx++) {
      const playlistIdx = dialStart + slotIdx;
      const pl = playlists[playlistIdx];
      const isActive = playlistIdx === activePlaylistIdx;

      const li = document.createElement('li');
      li.className = 'dial-slot';
      li.dataset.active = isActive ? 'true' : 'false';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dial-month-btn';
      btn.style.cssText = getSlotStyle(slotIdx, visibleCount);
      btn.dataset.playlistIndex = String(playlistIdx);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');

      const monthSpan = document.createElement('span');
      monthSpan.className = 'dial-month-name';
      monthSpan.textContent = pl.monthShort;

      const yearSpan = document.createElement('span');
      yearSpan.className = 'dial-month-year';
      yearSpan.textContent = String(pl.year);

      btn.append(monthSpan, yearSpan);
      li.append(btn);
      fragment.append(li);
    }

    dialSlotsEl.replaceChildren(fragment);

    if (rollDirection) {
      dialSlotsEl.classList.remove('nudge-up', 'nudge-down');
      // Force reflow so rapid clicks restart the CSS roll animation.
      void dialSlotsEl.offsetWidth;
      dialSlotsEl.classList.add(rollDirection === 'up' ? 'nudge-up' : 'nudge-down');
    }

    dialUpBtn.disabled = dialStart <= 0;
    dialDownBtn.disabled = dialStart >= maxDialStart;
  }

  function rotateDial(delta: StepDirection): boolean {
    const nextStart = Math.max(0, Math.min(maxDialStart, dialStart + delta));
    if (nextStart === dialStart) return false;
    dialStart = nextStart;
    soundEngine.playDialTick(delta < 0 ? 1 : -1);
    renderDial(delta < 0 ? 'up' : 'down');
    return true;
  }

  function ensurePlaylistVisibleOnDial(targetIdx: number): void {
    if (playlists.length <= VISIBLE_DIAL_MONTHS) {
      renderDial();
      return;
    }
    if (targetIdx < dialStart || targetIdx >= dialStart + VISIBLE_DIAL_MONTHS) {
      const centered = targetIdx - Math.floor(VISIBLE_DIAL_MONTHS / 2);
      dialStart = Math.max(0, Math.min(maxDialStart, centered));
    }
    renderDial();
  }

  dialSlotsEl.addEventListener('pointerover', (e) => {
    if (e.target instanceof Element && e.target.closest('.dial-month-btn')) {
      soundEngine.playDialHover();
    }
  });

  dialSlotsEl.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    const btn = e.target.closest('.dial-month-btn');
    if (!(btn instanceof HTMLButtonElement)) return;
    const idx = Number(btn.dataset.playlistIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= playlists.length) return;

    soundEngine.playButtonPress('select');
    openPlaylist(idx);
  });

  function bindHoverAutoScrollButton(btn: HTMLButtonElement, delta: StepDirection): void {
    let hoverInterval: number | null = null;
    let lastAutoStepAt = 0;

    const stopHoverScroll = () => {
      if (hoverInterval !== null) {
        window.clearInterval(hoverInterval);
        hoverInterval = null;
      }
      btn.classList.remove('is-hover-scrolling');
    };

    const tick = () => {
      if (btn.disabled) {
        stopHoverScroll();
        return;
      }
      if (rotateDial(delta)) {
        lastAutoStepAt = performance.now();
      } else {
        stopHoverScroll();
      }
    };

    btn.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch' || btn.disabled) return;
      stopHoverScroll();
      btn.classList.add('is-hover-scrolling');
      tick();
      hoverInterval = window.setInterval(tick, 175);
    });

    btn.addEventListener('pointerleave', stopHoverScroll);
    btn.addEventListener('pointercancel', stopHoverScroll);
    btn.addEventListener('blur', stopHoverScroll);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      soundEngine.unlock();
      // Avoid double-stepping when a click immediately follows pointerenter's initial tick.
      if (performance.now() - lastAutoStepAt < 135) return;
      rotateDial(delta);
    });
  }

  function bindWheelStepper(
    el: HTMLElement,
    threshold: number,
    onStep: (delta: StepDirection) => void
  ): void {
    let accum = 0;
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        soundEngine.unlock();
        accum += e.deltaY;
        while (Math.abs(accum) >= threshold) {
          const step: StepDirection = accum > 0 ? 1 : -1;
          accum -= step * threshold;
          onStep(step);
        }
      },
      { passive: false }
    );
  }

  function bindHoldButton(
    el: HTMLButtonElement,
    onStep: (isRepeat: boolean) => void,
    pressAttr: string
  ): void {
    let holdTimeout: number | null = null;
    let repeatInterval: number | null = null;
    let didRepeat = false;

    const clearTimers = () => {
      if (holdTimeout !== null) {
        window.clearTimeout(holdTimeout);
        holdTimeout = null;
      }
      if (repeatInterval !== null) {
        window.clearInterval(repeatInterval);
        repeatInterval = null;
      }
      delete clickWheel.dataset.press;
    };

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      releaseIframeFocus();
      soundEngine.unlock();
      didRepeat = false;
      clickWheel.dataset.press = pressAttr;
      holdTimeout = window.setTimeout(() => {
        didRepeat = true;
        onStep(true);
        repeatInterval = window.setInterval(() => onStep(true), 105);
      }, 310);
    });

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      releaseIframeFocus();
      soundEngine.unlock();
      if (didRepeat) {
        didRepeat = false;
        return;
      }
      onStep(false);
    });

    el.addEventListener('pointerup', clearTimers);
    el.addEventListener('pointerleave', clearTimers);
    el.addEventListener('pointercancel', clearTimers);
  }

  function bindWheelButton(
    el: HTMLButtonElement,
    onClick: () => void,
    pressAttr?: string
  ): void {
    const clearPress = () => {
      if (pressAttr) delete clickWheel.dataset.press;
    };

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      releaseIframeFocus();
      soundEngine.unlock();
      if (pressAttr) clickWheel.dataset.press = pressAttr;
    });

    el.addEventListener('pointerup', clearPress);
    el.addEventListener('pointerleave', clearPress);
    el.addEventListener('pointercancel', clearPress);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      releaseIframeFocus();
      soundEngine.unlock();
      onClick();
    });
  }

  function syncScrollbar(listEl: HTMLElement, thumbEl: HTMLElement): void {
    const track = thumbEl.parentElement;
    if (!track) return;

    const { scrollHeight, clientHeight, scrollTop } = listEl;
    const trackInnerHeight = Math.max(track.clientHeight - 4, 20);
    if (scrollHeight <= clientHeight + 1) {
      thumbEl.style.height = `${trackInnerHeight}px`;
      thumbEl.style.top = '2px';
      return;
    }

    const ratio = clientHeight / scrollHeight;
    const thumbHeight = Math.max(20, Math.round(trackInnerHeight * ratio));
    const maxTop = trackInnerHeight - thumbHeight;
    const progress = scrollTop / (scrollHeight - clientHeight);
    thumbEl.style.height = `${thumbHeight}px`;
    thumbEl.style.top = `${2 + Math.round(maxTop * progress)}px`;
  }

  function keepRowInView(listEl: HTMLElement, rowIdx: number, thumbEl: HTMLElement): void {
    const row = listEl.children[rowIdx];
    if (!(row instanceof HTMLElement)) return;

    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const viewTop = listEl.scrollTop;
    const viewBottom = viewTop + listEl.clientHeight;

    if (rowTop < viewTop) {
      listEl.scrollTop = rowTop;
    } else if (rowBottom > viewBottom) {
      listEl.scrollTop = rowBottom - listEl.clientHeight;
    }
    syncScrollbar(listEl, thumbEl);
  }

  function renderListSelection(
    listEl: HTMLElement,
    selectedIdx: number,
    thumbEl: HTMLElement
  ): void {
    const children = listEl.children;
    for (let i = 0; i < children.length; i++) {
      const selected = i === selectedIdx;
      children[i].classList.toggle('is-selected', selected);
      children[i].setAttribute('aria-selected', selected ? 'true' : 'false');
    }
    keepRowInView(listEl, selectedIdx, thumbEl);
  }

  function renderPlaylistsMenu(): void {
    const fragment = document.createDocumentFragment();

    playlists.forEach((pl, idx) => {
      const li = document.createElement('li');
      li.className = idx === playlistCursor ? 'ipod-menu-row is-selected' : 'ipod-menu-row';
      li.dataset.playlistIdx = String(idx);
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', idx === playlistCursor ? 'true' : 'false');

      const titleSpan = document.createElement('span');
      titleSpan.className = 'ipod-menu-row-title';
      titleSpan.textContent = pl.label;

      const metaSpan = document.createElement('span');
      metaSpan.className = 'ipod-menu-row-meta';

      const countSpan = document.createElement('span');
      countSpan.textContent = String(pl.trackCount);

      const chevSpan = document.createElement('span');
      chevSpan.className = 'ipod-chevron';
      chevSpan.setAttribute('aria-hidden', 'true');
      chevSpan.textContent = '›';

      metaSpan.append(countSpan, chevSpan);
      li.append(titleSpan, metaSpan);
      fragment.append(li);
    });

    playlistsListEl.replaceChildren(fragment);
    playlistsListEl.scrollTop = 0;
    keepRowInView(playlistsListEl, playlistCursor, playlistsThumbEl);
  }

  function renderTracksList(): void {
    const pl = playlists[activePlaylistIdx];
    if (!pl) return;

    trackCountEl.textContent = `${pl.trackCount} ${pl.trackCount === 1 ? 'song' : 'songs'}`;
    trackTotalTimeEl.textContent = pl.totalDurationText;

    const fragment = document.createDocumentFragment();
    pl.tracks.forEach((track, idx) => {
      const li = document.createElement('li');
      li.className = idx === trackCursor ? 'ipod-track-row is-selected' : 'ipod-track-row';
      li.dataset.trackIdx = String(idx);
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', idx === trackCursor ? 'true' : 'false');

      const topRow = document.createElement('div');
      topRow.className = 'ipod-track-top';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'ipod-track-title';
      titleSpan.textContent = track.title;

      const durSpan = document.createElement('span');
      durSpan.className = 'ipod-track-duration';
      durSpan.textContent = track.durationText;

      topRow.append(titleSpan, durSpan);

      const artistDiv = document.createElement('div');
      artistDiv.className = 'ipod-track-artist';
      artistDiv.textContent = track.artistText;

      li.append(topRow, artistDiv);
      fragment.append(li);
    });

    tracksListEl.replaceChildren(fragment);
    tracksListEl.scrollTop = 0;
    keepRowInView(tracksListEl, trackCursor, tracksThumbEl);
  }

  function renderDetailView(): void {
    const pl = playlists[activePlaylistIdx];
    const track = pl?.tracks[trackCursor];
    if (!pl || !track) return;

    detailCounterEl.textContent = `${trackCursor + 1} of ${pl.trackCount}`;
    detailArtMonthEl.textContent = pl.monthShort;
    detailArtYearEl.textContent = String(pl.year);
    detailTitleEl.textContent = track.title;
    detailArtistEl.textContent = track.artistText;
    detailPlaylistEl.textContent = pl.label;
    detailElapsedEl.textContent = '0:00';
    detailDurationEl.textContent = track.durationText ? `-${track.durationText}` : '-0:00';
    scrubberFillEl.style.width = '0%';
    scrubberTrackEl.setAttribute('aria-valuenow', '0');
    if (currentView === 'detail') {
      topbarTitle.textContent = track.title;
    }
  }

  function updateIPodViewState(): void {
    const pl = playlists[activePlaylistIdx];

    const playlistsState = currentView === 'playlists' ? 'active' : 'left';
    viewPlaylists.dataset.state = playlistsState;
    viewPlaylists.setAttribute('aria-hidden', playlistsState !== 'active' ? 'true' : 'false');

    const tracksState =
      currentView === 'tracks' ? 'active' : currentView === 'playlists' ? 'right' : 'left';
    viewTracks.dataset.state = tracksState;
    viewTracks.setAttribute('aria-hidden', tracksState !== 'active' ? 'true' : 'false');

    const detailState = currentView === 'detail' ? 'active' : 'right';
    viewDetail.dataset.state = detailState;
    viewDetail.setAttribute('aria-hidden', detailState !== 'active' ? 'true' : 'false');

    if (currentView === 'playlists') {
      topbarTitle.textContent = 'Playlists';
      topbarLeft.textContent = '♪';
    } else if (currentView === 'tracks') {
      topbarTitle.textContent = pl?.label ?? 'Playlist';
      topbarLeft.textContent = '‹';
    } else {
      topbarTitle.textContent = pl?.tracks[trackCursor]?.title ?? 'Now Playing';
      updateDetailTopbarStatus();
    }
  }

  let carouselAngleDeg = 0;

  function loadDisc(discId: string): void {
    const nextIdx = discs.findIndex((d) => d.id === discId);
    if (nextIdx === -1 || nextIdx === activeDiscIdx) return;

    releaseIframeFocus();
    stopPlayback();

    const slotStep = (nextIdx - activeDiscIdx + 6) % 6;
    // Rotate smoothly along the shortest 6-slot carousel path (clockwise or counter-clockwise).
    const deltaSlots = slotStep <= 3 ? slotStep : slotStep - 6;
    carouselAngleDeg -= deltaSlots * 60;
    discCarouselEl.style.setProperty('--carousel-angle', `${carouselAngleDeg}deg`);

    activeDiscIdx = nextIdx;
    const disc = discs[activeDiscIdx];
    playlists = disc.playlists;
    maxDialStart = Math.max(0, playlists.length - VISIBLE_DIAL_MONTHS);
    dialStart = 0;
    activePlaylistIdx = 0;
    playlistCursor = 0;
    trackCursor = 0;
    currentView = 'tracks';

    soundEngine.playDiscLoad();
    ipodRig.dataset.theme = disc.ipodTheme;

    discReadoutEl.textContent = `DISC ${String(activeDiscIdx + 1).padStart(2, '0')}`;
    discReadLedEl.dataset.tone = disc.id === 'best-100-chinese-songs' ? 'gold' : 'silver';

    dialEl.dataset.hidden = disc.showTimelineDial ? 'false' : 'true';
    dialEl.setAttribute('aria-hidden', disc.showTimelineDial ? 'false' : 'true');

    fujiDeskSpotEl.dataset.hidden = disc.showTimelineDial ? 'false' : 'true';
    fujiDeskSpotEl.setAttribute('aria-hidden', disc.showTimelineDial ? 'false' : 'true');
    if (!disc.showTimelineDial && cameraOpen) {
      closeCameraModal(false);
    }

    const buttons = discDeckEl.querySelectorAll<HTMLButtonElement>('.disc-card');
    buttons.forEach((btn) => {
      const active = btn.dataset.discId === disc.id;
      btn.dataset.active = active ? 'true' : 'false';
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });

    renderPlaylistsMenu();
    renderTracksList();
    updateIPodViewState();
    syncCameraDeskBadge();
    if (disc.showTimelineDial) {
      renderDial();
    }
  }

  discDeckEl.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    const btn = e.target.closest('.disc-card');
    if (!(btn instanceof HTMLButtonElement) || !btn.dataset.discId) return;
    soundEngine.unlock();
    loadDisc(btn.dataset.discId);
  });

  discChangeBtn.addEventListener('click', () => {
    soundEngine.unlock();
    const nextIdx = (activeDiscIdx + 1) % discs.length;
    loadDisc(discs[nextIdx].id);
  });

  function openPlaylist(idx: number): void {
    releaseIframeFocus();
    stopPlayback();
    activePlaylistIdx = idx;
    playlistCursor = idx;
    trackCursor = 0;
    currentView = 'tracks';
    renderTracksList();
    renderListSelection(playlistsListEl, playlistCursor, playlistsThumbEl);
    updateIPodViewState();
    syncCameraDeskBadge();
    if (discs[activeDiscIdx].showTimelineDial) {
      ensurePlaylistVisibleOnDial(idx);
    }
    if (cameraOpen) {
      cameraPhotoIdx = 0;
      cameraMode = 'single';
      renderCameraModal();
    }
  }

  function pulseCameraLed(): void {
    if (cameraLedTimer !== null) {
      window.clearTimeout(cameraLedTimer);
    }
    cameraStatusLedEl.dataset.pulse = 'true';
    cameraLedTimer = window.setTimeout(() => {
      cameraLedTimer = null;
      delete cameraStatusLedEl.dataset.pulse;
    }, 180);
  }

  function syncCameraDeskBadge(): void {
    const pl = playlists[activePlaylistIdx];
    const label = pl?.label ?? 'Camera Roll';
    const count = pl?.photos.length ?? 0;

    fujiBadgeMonthEl.textContent = label.toUpperCase();
    fujiBadgeCountEl.textContent =
      count > 0 ? `${count} ${count === 1 ? 'SHOT' : 'SHOTS'}` : 'CAMERA ROLL';
    fujiCameraBtn.setAttribute('aria-label', `Open JOYFILM camera roll for ${label}`);
    fujiCameraBtn.title = `Open camera roll (${label})`;
  }

  function findNearestPopulatedMonthIdx(): number {
    let bestIdx = -1;
    let bestDist = Infinity;
    playlists.forEach((pl, idx) => {
      if (pl.photos.length === 0) return;
      const dist = Math.abs(idx - activePlaylistIdx);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }

  function renderCameraGrid(photos: CameraPhoto[]): void {
    const fragment = document.createDocumentFragment();
    photos.forEach((photo, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fuji-grid-thumb';
      btn.dataset.photoIdx = String(idx);
      btn.dataset.selected = idx === cameraPhotoIdx ? 'true' : 'false';
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', idx === cameraPhotoIdx ? 'true' : 'false');
      btn.setAttribute('aria-label', photo.caption || `Photo ${idx + 1} of ${photos.length}`);

      const img = document.createElement('img');
      img.src = photo.src;
      img.alt = photo.caption || `Photo ${idx + 1}`;
      img.loading = 'lazy';
      img.decoding = 'async';

      const num = document.createElement('span');
      num.className = 'fuji-grid-thumb-num';
      num.textContent = String(idx + 1).padStart(2, '0');

      btn.append(img, num);
      fragment.append(btn);
    });
    cameraGridCellsEl.replaceChildren(fragment);
  }

  function renderCameraModal(): void {
    const pl = playlists[activePlaylistIdx];
    const label = pl?.label ?? 'Camera Roll';
    const monthKey = pl?.monthKey ?? 'YYYY-MM';
    const photos = pl?.photos ?? [];
    const sim = FILM_SIM_PRESETS[cameraFilmSimIdx];

    cameraTitleEl.textContent = label;
    cameraPrevMonthBtn.disabled = activePlaylistIdx <= 0;
    cameraNextMonthBtn.disabled = activePlaylistIdx >= playlists.length - 1;
    cameraLcdEl.dataset.filmSim = sim.id;
    cameraEmptySimEl.textContent = sim.label;

    const hasPhotos = photos.length > 0;
    const isGrid = hasPhotos && cameraMode === 'grid';

    cameraViewSingleEl.dataset.visible = hasPhotos && !isGrid ? 'true' : 'false';
    cameraViewSingleEl.setAttribute('aria-hidden', hasPhotos && !isGrid ? 'false' : 'true');

    cameraViewGridEl.dataset.visible = isGrid ? 'true' : 'false';
    cameraViewGridEl.setAttribute('aria-hidden', isGrid ? 'false' : 'true');

    cameraViewEmptyEl.dataset.visible = !hasPhotos ? 'true' : 'false';
    cameraViewEmptyEl.setAttribute('aria-hidden', !hasPhotos ? 'false' : 'true');

    cameraBtnGrid.dataset.active = isGrid ? 'true' : 'false';
    cameraBtnPlay.dataset.active = hasPhotos && !isGrid ? 'true' : 'false';

    if (!hasPhotos) {
      cameraEmptyMonthEl.textContent = label;
      cameraEmptyHintEl.textContent = `No photos for ${label} yet.`;

      const nearestIdx = findNearestPopulatedMonthIdx();
      if (nearestIdx !== -1) {
        const nearestPl = playlists[nearestIdx];
        cameraJumpPopulatedBtn.hidden = false;
        cameraJumpPopulatedBtn.textContent = `Jump to ${nearestPl.label} (${nearestPl.photos.length}) ›`;
      } else {
        cameraJumpPopulatedBtn.hidden = true;
      }
      return;
    }

    cameraPhotoIdx = Math.max(0, Math.min(photos.length - 1, cameraPhotoIdx));
    const activePhoto = photos[cameraPhotoIdx];

    if (cameraPhotoImgEl.getAttribute('src') !== activePhoto.src) {
      cameraPhotoImgEl.src = activePhoto.src;
    }
    cameraPhotoImgEl.alt = activePhoto.caption || `${label} photo ${cameraPhotoIdx + 1}`;

    cameraFrameTextEl.textContent = `${String(cameraPhotoIdx + 1).padStart(2, '0')} / ${String(
      photos.length
    ).padStart(2, '0')}`;
    cameraHudSimEl.textContent = activePhoto.filmSim || sim.label;
    cameraHudDateEl.textContent = activePhoto.date || monthKey.replace('-', '.');
    cameraHudCaptionEl.textContent = activePhoto.caption || '';
    cameraHudMetaEl.textContent = activePhoto.meta || '23mm  F2.0';
    cameraHudEl.dataset.visible = cameraShowHud ? 'true' : 'false';

    if (isGrid) {
      cameraGridTitleEl.textContent = label;
      cameraGridCountEl.textContent = `${photos.length} ${photos.length === 1 ? 'SHOT' : 'SHOTS'}`;
      renderCameraGrid(photos);
    }
  }

  function openCameraModal(): void {
    if (!discs[activeDiscIdx].showTimelineDial) return;
    releaseIframeFocus();
    soundEngine.unlock();
    soundEngine.playCameraShutter();
    cameraOpen = true;
    cameraPhotoIdx = 0;
    cameraMode = 'single';
    cameraModalEl.dataset.open = 'true';
    cameraModalEl.setAttribute('aria-hidden', 'false');
    renderCameraModal();
    pulseCameraLed();
    cameraCloseBtn.focus({ preventScroll: true });
  }

  function closeCameraModal(playSound = true): void {
    if (!cameraOpen) return;
    cameraOpen = false;
    cameraModalEl.dataset.open = 'false';
    cameraModalEl.setAttribute('aria-hidden', 'true');
    if (playSound) {
      soundEngine.playCameraButton('action');
    }
    fujiCameraBtn.focus({ preventScroll: true });
  }

  function stepCameraPhoto(delta: StepDirection): void {
    const photos = playlists[activePlaylistIdx]?.photos ?? [];
    if (photos.length <= 1) return;
    cameraPhotoIdx = (cameraPhotoIdx + delta + photos.length) % photos.length;
    soundEngine.playCameraButton('nav');
    pulseCameraLed();
    renderCameraModal();
  }

  function stepCameraMonth(delta: StepDirection): void {
    const nextIdx = Math.max(0, Math.min(playlists.length - 1, activePlaylistIdx + delta));
    if (nextIdx === activePlaylistIdx) return;
    soundEngine.playCameraButton('action');
    pulseCameraLed();
    openPlaylist(nextIdx);
  }

  function toggleCameraGrid(): void {
    const photos = playlists[activePlaylistIdx]?.photos ?? [];
    if (photos.length === 0) return;
    soundEngine.playCameraButton('action');
    cameraMode = cameraMode === 'grid' ? 'single' : 'grid';
    pulseCameraLed();
    renderCameraModal();
  }

  function toggleCameraHudOrBack(): void {
    soundEngine.playCameraButton('action');
    if (cameraMode === 'grid') {
      cameraMode = 'single';
      renderCameraModal();
      return;
    }
    cameraShowHud = !cameraShowHud;
    renderCameraModal();
  }

  function cycleCameraFilmSim(): void {
    soundEngine.playCameraButton('action');
    cameraFilmSimIdx = (cameraFilmSimIdx + 1) % FILM_SIM_PRESETS.length;
    pulseCameraLed();
    renderCameraModal();
  }

  function stepIPod(delta: StepDirection, immediate = true): void {
    releaseIframeFocus();
    if (currentView === 'playlists') {
      const next = Math.max(0, Math.min(playlists.length - 1, playlistCursor + delta));
      if (next === playlistCursor) return;
      playlistCursor = next;
      soundEngine.playWheelClick();
      renderListSelection(playlistsListEl, playlistCursor, playlistsThumbEl);
      return;
    }

    const tracks = playlists[activePlaylistIdx]?.tracks ?? [];
    if (tracks.length === 0) return;

    const next = Math.max(0, Math.min(tracks.length - 1, trackCursor + delta));
    if (next === trackCursor) return;
    trackCursor = next;
    soundEngine.playWheelClick();

    if (currentView === 'tracks') {
      renderListSelection(tracksListEl, trackCursor, tracksThumbEl);
    } else if (currentView === 'detail') {
      renderListSelection(tracksListEl, trackCursor, tracksThumbEl);
      playActiveTrack(immediate);
    }
  }

  function pressSelect(): void {
    releaseIframeFocus();
    soundEngine.playButtonPress('select');
    if (currentView === 'playlists') {
      openPlaylist(playlistCursor);
      return;
    }
    if (currentView === 'detail') {
      ytPlayer.togglePlayPause();
      return;
    }

    const pl = playlists[activePlaylistIdx];
    if (!pl || pl.tracks.length === 0) return;
    currentView = 'detail';
    updateIPodViewState();
    playActiveTrack(true);
  }

  function pressPlayPause(): void {
    releaseIframeFocus();
    soundEngine.playButtonPress('select');
    if (currentView === 'detail') {
      if (playbackState === 'error') {
        playActiveTrack(true);
      } else {
        ytPlayer.togglePlayPause();
      }
      return;
    }
    pressSelect();
  }

  function pressMenu(): void {
    releaseIframeFocus();
    soundEngine.playButtonPress('menu');
    if (currentView === 'detail') {
      stopPlayback();
      currentView = 'tracks';
      updateIPodViewState();
      keepRowInView(tracksListEl, trackCursor, tracksThumbEl);
      return;
    }
    if (currentView === 'tracks') {
      playlistCursor = activePlaylistIdx;
      currentView = 'playlists';
      updateIPodViewState();
      renderListSelection(playlistsListEl, playlistCursor, playlistsThumbEl);
    }
  }

  function bindListRowClick(
    listEl: HTMLElement,
    rowSelector: string,
    datasetKey: 'playlistIdx' | 'trackIdx',
    getCursor: () => number,
    setCursor: (idx: number) => void,
    thumbEl: HTMLElement
  ): void {
    listEl.addEventListener('click', (e) => {
      if (!(e.target instanceof Element)) return;
      const row = e.target.closest(rowSelector);
      if (!(row instanceof HTMLElement)) return;
      const idx = Number(row.dataset[datasetKey]);
      if (!Number.isFinite(idx)) return;

      if (idx === getCursor()) {
        pressSelect();
      } else {
        setCursor(idx);
        soundEngine.playWheelClick();
        renderListSelection(listEl, idx, thumbEl);
      }
    });
  }

  function bindClickWheelDrag(wheel: HTMLElement): void {
    let dragging = false;
    let lastAngle = 0;
    let accumRadians = 0;
    const STEP_RADIANS = 0.28;

    const getAngle = (clientX: number, clientY: number): number => {
      const rect = wheel.getBoundingClientRect();
      return Math.atan2(clientY - (rect.top + rect.height / 2), clientX - (rect.left + rect.width / 2));
    };

    wheel.addEventListener('pointerdown', (e) => {
      if (e.target instanceof Element && e.target.closest('button')) return;
      soundEngine.unlock();
      dragging = true;
      accumRadians = 0;
      lastAngle = getAngle(e.clientX, e.clientY);
      wheel.classList.add('is-dragging');
      wheel.setPointerCapture(e.pointerId);
    });

    wheel.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const angle = getAngle(e.clientX, e.clientY);
      let delta = angle - lastAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      lastAngle = angle;
      accumRadians += delta;

      while (Math.abs(accumRadians) >= STEP_RADIANS) {
        const dir: StepDirection = accumRadians > 0 ? 1 : -1;
        accumRadians -= dir * STEP_RADIANS;
        stepIPod(dir, false);
      }
    });

    const endDrag = () => {
      dragging = false;
      wheel.classList.remove('is-dragging');
    };
    wheel.addEventListener('pointerup', endDrag);
    wheel.addEventListener('pointercancel', endDrag);
  }

  bindHoverAutoScrollButton(dialUpBtn, -1);
  bindHoverAutoScrollButton(dialDownBtn, 1);
  bindWheelStepper(dialEl, 34, rotateDial);
  bindWheelStepper(ipodBody, 26, (step) => stepIPod(step, false));

  bindWheelButton(btnMenu, pressMenu, 'menu');
  bindHoldButton(btnPrev, (isRepeat) => stepIPod(-1, !isRepeat), 'prev');
  bindHoldButton(btnNext, (isRepeat) => stepIPod(1, !isRepeat), 'next');
  bindWheelButton(btnPlay, pressPlayPause, 'play');
  bindWheelButton(btnCenter, pressSelect);

  fallbackSkipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    releaseIframeFocus();
    stepIPod(1, true);
  });

  scrubberTrackEl.addEventListener('click', (e) => {
    releaseIframeFocus();
    const rect = scrubberTrackEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = (e.clientX - rect.left) / rect.width;
    ytPlayer.seekToFraction(fraction);
  });

  bindListRowClick(
    playlistsListEl,
    '.ipod-menu-row',
    'playlistIdx',
    () => playlistCursor,
    (idx) => {
      playlistCursor = idx;
    },
    playlistsThumbEl
  );
  bindListRowClick(
    tracksListEl,
    '.ipod-track-row',
    'trackIdx',
    () => trackCursor,
    (idx) => {
      trackCursor = idx;
    },
    tracksThumbEl
  );

  bindClickWheelDrag(clickWheel);

  playlistsListEl.addEventListener('scroll', () =>
    syncScrollbar(playlistsListEl, playlistsThumbEl)
  );
  tracksListEl.addEventListener('scroll', () => syncScrollbar(tracksListEl, tracksThumbEl));

  fujiCameraBtn.addEventListener('click', openCameraModal);
  cameraBackdropEl.addEventListener('click', () => closeCameraModal(true));
  cameraCloseBtn.addEventListener('click', () => closeCameraModal(true));
  cameraPrevMonthBtn.addEventListener('click', () => stepCameraMonth(-1));
  cameraNextMonthBtn.addEventListener('click', () => stepCameraMonth(1));
  cameraDeckDispBtn.addEventListener('click', toggleCameraHudOrBack);
  cameraCmdDialBtn.addEventListener('click', () => stepCameraPhoto(1));
  cameraBtnPlay.addEventListener('click', () => {
    soundEngine.playCameraButton('action');
    if (cameraMode === 'grid') {
      cameraMode = 'single';
      renderCameraModal();
    }
  });
  cameraBtnDisp.addEventListener('click', toggleCameraHudOrBack);
  cameraBtnSim.addEventListener('click', cycleCameraFilmSim);
  cameraBtnGrid.addEventListener('click', toggleCameraGrid);
  cameraDpadUp.addEventListener('click', () => stepCameraMonth(-1));
  cameraDpadDown.addEventListener('click', () => stepCameraMonth(1));
  cameraDpadLeft.addEventListener('click', () => stepCameraPhoto(-1));
  cameraDpadRight.addEventListener('click', () => stepCameraPhoto(1));
  cameraDpadOk.addEventListener('click', () => {
    if (cameraMode === 'grid') {
      soundEngine.playCameraButton('action');
      cameraMode = 'single';
      renderCameraModal();
    } else {
      toggleCameraGrid();
    }
  });
  cameraJumpPopulatedBtn.addEventListener('click', () => {
    const nearestIdx = findNearestPopulatedMonthIdx();
    if (nearestIdx !== -1) {
      soundEngine.playCameraButton('action');
      openPlaylist(nearestIdx);
    }
  });
  cameraGridCellsEl.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    const btn = e.target.closest('.fuji-grid-thumb');
    if (!(btn instanceof HTMLButtonElement)) return;
    const idx = Number(btn.dataset.photoIdx);
    if (!Number.isFinite(idx)) return;
    soundEngine.playCameraButton('action');
    cameraPhotoIdx = idx;
    cameraMode = 'single';
    pulseCameraLed();
    renderCameraModal();
  });

  bindWheelStepper(cameraCmdDialBtn, 24, (step) => stepCameraPhoto(step));
  bindWheelStepper(cameraViewSingleEl, 36, (step) => stepCameraPhoto(step));

  window.addEventListener('keydown', (e) => {
    if (cameraOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (cameraMode === 'grid') {
          cameraMode = 'single';
          soundEngine.playCameraButton('action');
          renderCameraModal();
        } else {
          closeCameraModal(true);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepCameraPhoto(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepCameraPhoto(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        stepCameraMonth(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        stepCameraMonth(1);
      } else if (e.key === 'Enter' || e.key.toLowerCase() === 'g') {
        e.preventDefault();
        toggleCameraGrid();
      } else if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        toggleCameraHudOrBack();
      } else if (e.key.toLowerCase() === 'q') {
        e.preventDefault();
        cycleCameraFilmSim();
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      stepIPod(-1, true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      stepIPod(1, true);
    } else if (e.key === 'ArrowLeft' && currentView === 'detail') {
      e.preventDefault();
      stepIPod(-1, true);
    } else if (e.key === 'ArrowRight' && currentView === 'detail') {
      e.preventDefault();
      stepIPod(1, true);
    } else if (e.key === ' ' && currentView === 'detail') {
      e.preventDefault();
      pressPlayPause();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pressSelect();
    } else if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault();
      pressMenu();
    }
  });

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.addEventListener(
      'pointermove',
      (e) => {
        const nx = (e.clientX / window.innerWidth) * 2 - 1;
        const ny = (e.clientY / window.innerHeight) * 2 - 1;
        ipodBody.style.setProperty('--sheen-x', `${(34 + nx * 18).toFixed(1)}%`);
        ipodBody.style.setProperty('--sheen-y', `${(20 + ny * 14).toFixed(1)}%`);
      },
      { passive: true }
    );
  }

  updateIPodViewState();
  syncScrollbar(playlistsListEl, playlistsThumbEl);
  syncScrollbar(tracksListEl, tracksThumbEl);
  syncCameraDeskBadge();
  renderDial();
}

initTimeMachine();
