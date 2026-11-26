import { soundEngine } from '../lib/audio';
import { getSlotStyle, VISIBLE_DIAL_MONTHS } from '../lib/dial';
import type {
  ClientCassette,
  ClientPlaylist,
  ClientTrack,
  IPodColorTheme,
  StepDirection,
} from '../lib/types';

type IPodView = 'playlists' | 'tracks' | 'detail';

const VALID_THEMES: ReadonlySet<string> = new Set<IPodColorTheme>(['aqua', 'coral', 'mint']);

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
    typeof value.durationText === 'string'
  );
}

function isClientPlaylist(value: unknown): value is ClientPlaylist {
  return (
    isRecord(value) &&
    typeof value.year === 'number' &&
    typeof value.monthShort === 'string' &&
    typeof value.label === 'string' &&
    typeof value.trackCount === 'number' &&
    typeof value.totalDurationText === 'string' &&
    Array.isArray(value.tracks) &&
    value.tracks.every(isClientTrack)
  );
}

function isClientCassette(value: unknown): value is ClientCassette {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isIPodColorTheme(value.ipodTheme) &&
    typeof value.showTimelineDial === 'boolean' &&
    Array.isArray(value.playlists) &&
    value.playlists.every(isClientPlaylist)
  );
}

function parseClientCassettes(rawJson: string): ClientCassette[] {
  const parsed: unknown = JSON.parse(rawJson);
  if (!Array.isArray(parsed) || !parsed.every(isClientCassette)) {
    throw new Error('Invalid embedded #cassettes-data payload.');
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
  const payloadEl = requireEl('cassettes-data');
  if (!payloadEl.textContent) {
    throw new Error('Embedded #cassettes-data payload is empty.');
  }

  const cassettes = parseClientCassettes(payloadEl.textContent);
  if (cassettes.length === 0) {
    throw new Error('No cassettes found in #cassettes-data.');
  }

  const dialEl = requireEl('timeline-dial');
  const dialSlotsEl = requireEl('dial-slots');
  const dialUpBtn = requireButton('dial-up-btn');
  const dialDownBtn = requireButton('dial-down-btn');

  const cassetteDeckEl = requireEl('cassette-deck');

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

  const detailCounterEl = requireEl('ipod-detail-counter');
  const detailArtMonthEl = requireEl('ipod-detail-art-month');
  const detailArtYearEl = requireEl('ipod-detail-art-year');
  const detailTitleEl = requireEl('ipod-detail-title');
  const detailArtistEl = requireEl('ipod-detail-artist');
  const detailPlaylistEl = requireEl('ipod-detail-playlist');
  const detailDurationEl = requireEl('ipod-detail-duration');

  const clickWheel = requireEl('ipod-click-wheel');
  const btnMenu = requireButton('wheel-btn-menu');
  const btnPrev = requireButton('wheel-btn-prev');
  const btnNext = requireButton('wheel-btn-next');
  const btnPlay = requireButton('wheel-btn-play');
  const btnCenter = requireButton('wheel-center-btn');

  const soundToggle = requireButton('sound-toggle');

  let activeCassetteIdx = 0;
  let playlists: ClientPlaylist[] = cassettes[0].playlists;
  let maxDialStart = Math.max(0, playlists.length - VISIBLE_DIAL_MONTHS);
  let dialStart = 0;
  let activePlaylistIdx = 0;
  let playlistCursor = 0;
  let trackCursor = 0;
  let currentView: IPodView = 'tracks';

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
    onStep: () => void,
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
      soundEngine.unlock();
      didRepeat = false;
      clickWheel.dataset.press = pressAttr;
      holdTimeout = window.setTimeout(() => {
        didRepeat = true;
        onStep();
        repeatInterval = window.setInterval(onStep, 105);
      }, 310);
    });

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      soundEngine.unlock();
      if (didRepeat) {
        didRepeat = false;
        return;
      }
      onStep();
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
      soundEngine.unlock();
      if (pressAttr) clickWheel.dataset.press = pressAttr;
    });

    el.addEventListener('pointerup', clearPress);
    el.addEventListener('pointerleave', clearPress);
    el.addEventListener('pointercancel', clearPress);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
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
    detailDurationEl.textContent = track.durationText ? `-${track.durationText}` : '-0:00';
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
    } else if (currentView === 'tracks') {
      topbarTitle.textContent = pl?.label ?? 'Playlist';
    } else {
      topbarTitle.textContent = 'Track Info';
    }

    topbarLeft.textContent = currentView === 'playlists' ? '♪' : '‹';
  }

  function loadCassette(cassetteId: string): void {
    const nextIdx = cassettes.findIndex((c) => c.id === cassetteId);
    if (nextIdx === -1 || nextIdx === activeCassetteIdx) return;

    activeCassetteIdx = nextIdx;
    const cassette = cassettes[activeCassetteIdx];
    playlists = cassette.playlists;
    maxDialStart = Math.max(0, playlists.length - VISIBLE_DIAL_MONTHS);
    dialStart = 0;
    activePlaylistIdx = 0;
    playlistCursor = 0;
    trackCursor = 0;
    currentView = 'tracks';

    soundEngine.playCassetteLoad();
    ipodRig.dataset.theme = cassette.ipodTheme;

    dialEl.dataset.hidden = cassette.showTimelineDial ? 'false' : 'true';
    dialEl.setAttribute('aria-hidden', cassette.showTimelineDial ? 'false' : 'true');

    const buttons = cassetteDeckEl.querySelectorAll<HTMLButtonElement>('.cassette-card');
    buttons.forEach((btn) => {
      const active = btn.dataset.cassetteId === cassette.id;
      btn.dataset.active = active ? 'true' : 'false';
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });

    renderPlaylistsMenu();
    renderTracksList();
    updateIPodViewState();
    if (cassette.showTimelineDial) {
      renderDial();
    }
  }

  cassetteDeckEl.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    const btn = e.target.closest('.cassette-card');
    if (!(btn instanceof HTMLButtonElement) || !btn.dataset.cassetteId) return;
    soundEngine.unlock();
    loadCassette(btn.dataset.cassetteId);
  });

  function openPlaylist(idx: number): void {
    activePlaylistIdx = idx;
    playlistCursor = idx;
    trackCursor = 0;
    currentView = 'tracks';
    renderTracksList();
    renderListSelection(playlistsListEl, playlistCursor, playlistsThumbEl);
    updateIPodViewState();
    if (cassettes[activeCassetteIdx].showTimelineDial) {
      ensurePlaylistVisibleOnDial(idx);
    }
  }

  function stepIPod(delta: StepDirection): void {
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
      renderDetailView();
      renderListSelection(tracksListEl, trackCursor, tracksThumbEl);
    }
  }

  function pressSelect(): void {
    soundEngine.playButtonPress('select');
    if (currentView === 'playlists') {
      openPlaylist(playlistCursor);
      return;
    }
    if (currentView !== 'tracks') return;

    const pl = playlists[activePlaylistIdx];
    if (!pl || pl.tracks.length === 0) return;
    currentView = 'detail';
    renderDetailView();
    updateIPodViewState();
  }

  function pressMenu(): void {
    soundEngine.playButtonPress('menu');
    if (currentView === 'detail') {
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
        stepIPod(dir);
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
  bindWheelStepper(ipodBody, 26, stepIPod);

  bindWheelButton(btnMenu, pressMenu, 'menu');
  bindHoldButton(btnPrev, () => stepIPod(-1), 'prev');
  bindHoldButton(btnNext, () => stepIPod(1), 'next');
  bindWheelButton(btnPlay, pressSelect, 'play');
  bindWheelButton(btnCenter, pressSelect);

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

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      stepIPod(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      stepIPod(1);
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
        ipodRig.style.setProperty('--tilt-x', `${(-ny * 3.5 + 1.5).toFixed(2)}deg`);
        ipodRig.style.setProperty('--tilt-y', `${(nx * 4.5 - 2.5).toFixed(2)}deg`);
        ipodBody.style.setProperty('--sheen-x', `${(34 + nx * 24).toFixed(1)}%`);
        ipodBody.style.setProperty('--sheen-y', `${(20 + ny * 18).toFixed(1)}%`);
      },
      { passive: true }
    );
  }

  updateIPodViewState();
  syncScrollbar(playlistsListEl, playlistsThumbEl);
  syncScrollbar(tracksListEl, tracksThumbEl);
  renderDial();
}

initTimeMachine();
