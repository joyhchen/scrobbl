import { soundEngine } from '../lib/audio';
import { requireButton, requireEl } from '../lib/dom';
import { formatDiscSlot } from '../lib/format';
import type { StepDirection } from '../lib/types';

export interface ChangerState {
  /** Disc id in each of the six changer slots (null = empty tray). */
  slotDiscIds: ReadonlyArray<string | null>;
  activeSlotIdx: number;
}

interface CdBookOptions {
  getChangerState: () => ChangerState;
  /** Called when a disc is picked from a sleeve. */
  onPickDisc: (discId: string) => void;
  /** Lets the host pause anything (e.g. a focused YouTube iframe) before the book opens. */
  onOpen?: () => void;
}

export function initCdBook({ getChangerState, onPickDisc, onOpen }: CdBookOptions): void {
  const deskBtn = requireButton('cd-book-btn');
  const modalEl = requireEl('cd-book-modal');
  const backdropEl = requireEl('cd-book-backdrop');
  const closeBtn = requireButton('cd-book-close-btn');
  const prevBtn = requireButton('cd-book-prev-btn');
  const nextBtn = requireButton('cd-book-next-btn');
  const titleEl = requireEl('cd-book-title');
  const spreadsEl = requireEl('cd-book-spreads');
  const spreadEls = Array.from(spreadsEl.querySelectorAll<HTMLElement>('.cd-book-spread'));
  const sleeveBtns = Array.from(spreadsEl.querySelectorAll<HTMLButtonElement>('button.cd-sleeve'));

  let open = false;
  let spreadIdx = 0;

  function renderSleeveStatuses(): void {
    const { slotDiscIds, activeSlotIdx } = getChangerState();
    for (const btn of sleeveBtns) {
      const statusEl = btn.querySelector<HTMLElement>('[data-sleeve-status]');
      const slotIdx = slotDiscIds.indexOf(btn.dataset.discId ?? '');
      const slotLabel = formatDiscSlot(slotIdx);
      let status: 'playing' | 'loaded' | 'shelf' = 'shelf';
      let text = 'LOAD INTO CHANGER';
      if (slotIdx === activeSlotIdx) {
        status = 'playing';
        text = `▶ SPINNING · ${slotLabel}`;
      } else if (slotIdx !== -1) {
        status = 'loaded';
        text = `IN CHANGER · ${slotLabel}`;
      }
      btn.dataset.status = status;
      if (statusEl) statusEl.textContent = text;
    }
  }

  function renderSpread(direction?: StepDirection): void {
    spreadEls.forEach((el, i) => {
      el.dataset.state = i === spreadIdx ? 'active' : 'hidden';
      el.classList.remove('is-turning-next', 'is-turning-prev');
      if (i === spreadIdx && direction) {
        // Force reflow so the page-turn animation restarts on rapid flips.
        void el.offsetWidth;
        el.classList.add(direction === 1 ? 'is-turning-next' : 'is-turning-prev');
      }
    });
    titleEl.textContent = `CD BOOK · ${spreadIdx + 1} / ${spreadEls.length}`;
    prevBtn.disabled = spreadIdx === 0;
    nextBtn.disabled = spreadIdx >= spreadEls.length - 1;
  }

  function flip(delta: StepDirection): void {
    const next = spreadIdx + delta;
    if (next < 0 || next >= spreadEls.length) return;
    spreadIdx = next;
    soundEngine.playPageFlip();
    renderSpread(delta);
  }

  function openBook(): void {
    onOpen?.();
    soundEngine.unlock();
    soundEngine.playZipper();
    open = true;

    // Open to the spread holding whatever is spinning right now.
    const { slotDiscIds, activeSlotIdx } = getChangerState();
    const activeId = slotDiscIds[activeSlotIdx];
    const activeSleeve = sleeveBtns.find((b) => b.dataset.discId === activeId);
    spreadIdx = Math.max(0, spreadEls.findIndex((el) => activeSleeve && el.contains(activeSleeve)));

    renderSleeveStatuses();
    renderSpread();
    modalEl.dataset.open = 'true';
    modalEl.setAttribute('aria-hidden', 'false');
    deskBtn.setAttribute('aria-expanded', 'true');
    closeBtn.focus({ preventScroll: true });
  }

  function close(playSound = true): void {
    if (!open) return;
    open = false;
    modalEl.dataset.open = 'false';
    modalEl.setAttribute('aria-hidden', 'true');
    deskBtn.setAttribute('aria-expanded', 'false');
    if (playSound) soundEngine.playZipper(true);
    deskBtn.focus({ preventScroll: true });
  }

  deskBtn.addEventListener('click', openBook);
  backdropEl.addEventListener('click', () => close());
  closeBtn.addEventListener('click', () => close());
  prevBtn.addEventListener('click', () => flip(-1));
  nextBtn.addEventListener('click', () => flip(1));

  spreadsEl.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    const btn = e.target.closest('button.cd-sleeve');
    if (!(btn instanceof HTMLButtonElement) || !btn.dataset.discId) return;
    const discId = btn.dataset.discId;
    btn.classList.add('is-pulling');
    // Let the disc slide out of its sleeve before the book closes.
    window.setTimeout(() => {
      btn.classList.remove('is-pulling');
      close(false);
      onPickDisc(discId);
    }, 260);
  });

  // Capture phase so the iPod's global arrow/enter shortcuts don't fire underneath the open book.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        flip(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        flip(1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Backspace') {
        e.preventDefault();
      } else if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Tab') {
        return;
      }
      // Enter/Space still activate the focused button natively; just keep them from the iPod.
      e.stopImmediatePropagation();
    },
    { capture: true }
  );

  renderSpread();
}
