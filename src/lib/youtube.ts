export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface YouTubePlayerCallbacks {
  onStateChange: (state: PlaybackState, errorCode?: number) => void;
  onProgress: (currentSeconds: number, durationSeconds: number) => void;
}

interface YTPlayerInstance {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      width?: string | number;
      height?: string | number;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    }
  ) => YTPlayerInstance;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeIframeAPI(): Promise<YTNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube API requires a browser environment.'));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error('YouTube IFrame API failed to expose YT.Player.'));
      }
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        reject(new Error('Failed to load YouTube IFrame API script.'));
      };
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}

export class IPodYouTubePlayer {
  private hostEl: HTMLElement;
  private callbacks: YouTubePlayerCallbacks;
  private player: YTPlayerInstance | null = null;
  private ready = false;
  private initializing = false;
  private activeVideoId: string | null = null;
  private pendingVideoId: string | null = null;
  private requestSeq = 0;
  private state: PlaybackState = 'idle';
  private progressTimer: number | null = null;

  constructor(hostEl: HTMLElement, callbacks: YouTubePlayerCallbacks) {
    this.hostEl = hostEl;
    this.callbacks = callbacks;
  }

  public preload(): void {
    void loadYouTubeIframeAPI().catch(() => {});
  }

  public getState(): PlaybackState {
    return this.state;
  }

  private setState(next: PlaybackState, errorCode?: number): void {
    this.state = next;
    this.callbacks.onStateChange(next, errorCode);
    if (next === 'playing' || next === 'loading') {
      this.startProgressLoop();
    } else {
      this.stopProgressLoop();
    }
  }

  private startProgressLoop(): void {
    if (this.progressTimer !== null) return;
    this.progressTimer = window.setInterval(() => {
      if (!this.player || !this.ready) return;
      try {
        const cur = this.player.getCurrentTime();
        const dur = this.player.getDuration();
        if (Number.isFinite(cur) && Number.isFinite(dur) && dur > 0) {
          this.callbacks.onProgress(cur, dur);
        }
      } catch {
        // Ignore transient iframe state reads.
      }
    }, 250);
  }

  private stopProgressLoop(): void {
    if (this.progressTimer !== null) {
      window.clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  private ensurePlayer(initialVideoId: string, seq: number): void {
    if (this.player || this.initializing) return;
    this.initializing = true;

    loadYouTubeIframeAPI()
      .then((YT) => {
        this.initializing = false;
        // User may have stopped or switched away before the API finished loading.
        if (seq !== this.requestSeq && !this.pendingVideoId) return;

        const targetId = this.pendingVideoId ?? initialVideoId;
        const mountEl = document.createElement('div');
        mountEl.className = 'ipod-yt-mount';
        this.hostEl.replaceChildren(mountEl);

        const origin =
          window.location.protocol === 'http:' || window.location.protocol === 'https:'
            ? window.location.origin
            : undefined;

        this.player = new YT.Player(mountEl, {
          width: '100%',
          height: '100%',
          videoId: targetId,
          playerVars: {
            autoplay: 1,
            controls: 1,
            rel: 0,
            playsinline: 1,
            iv_load_policy: 3,
            modestbranding: 1,
            enablejsapi: 1,
            ...(origin ? { origin } : {}),
          },
          events: {
            onReady: () => {
              this.ready = true;
              const latest = this.pendingVideoId;
              this.pendingVideoId = null;
              if (!latest) {
                try {
                  this.player?.stopVideo();
                } catch {}
                return;
              }
              this.activeVideoId = latest;
              try {
                if (latest !== targetId) {
                  this.player?.loadVideoById(latest);
                } else {
                  this.player?.playVideo();
                }
              } catch {
                this.setState('error');
              }
            },
            onStateChange: (event) => {
              // Ignore late state events after stop()
              if (!this.activeVideoId) return;
              const PS = YT.PlayerState;
              if (event.data === PS.PLAYING) {
                this.setState('playing');
              } else if (event.data === PS.PAUSED || event.data === PS.CUED) {
                this.setState('paused');
              } else if (event.data === PS.BUFFERING) {
                this.setState('loading');
              } else if (event.data === PS.ENDED) {
                this.setState('ended');
              }
            },
            onError: (event) => {
              if (!this.activeVideoId) return;
              this.setState('error', event.data);
            },
          },
        });
      })
      .catch(() => {
        this.initializing = false;
        if (seq === this.requestSeq) {
          this.setState('error');
        }
      });
  }

  public play(videoId: string): void {
    const seq = ++this.requestSeq;
    this.activeVideoId = videoId;
    this.pendingVideoId = videoId;
    this.callbacks.onProgress(0, 0);
    this.setState('loading');

    if (this.player && this.ready) {
      this.pendingVideoId = null;
      try {
        this.player.loadVideoById(videoId);
      } catch {
        this.setState('error');
      }
      return;
    }

    this.ensurePlayer(videoId, seq);
  }

  public togglePlayPause(): void {
    if (!this.activeVideoId) return;
    if (!this.player || !this.ready) {
      if (this.pendingVideoId) return;
      this.play(this.activeVideoId);
      return;
    }

    try {
      const ytState = this.player.getPlayerState();
      // 1 = PLAYING, 3 = BUFFERING
      if (ytState === 1 || ytState === 3) {
        this.player.pauseVideo();
      } else {
        this.player.playVideo();
      }
    } catch {
      // Ignore if player is mid-transition
    }
  }

  public seekToFraction(fraction: number): void {
    if (!this.player || !this.ready || !this.activeVideoId) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    try {
      const dur = this.player.getDuration();
      if (Number.isFinite(dur) && dur > 0) {
        const target = dur * clamped;
        this.player.seekTo(target, true);
        this.callbacks.onProgress(target, dur);
      }
    } catch {
      // Ignore seek error
    }
  }

  public pauseForSkip(): void {
    this.requestSeq++;
    this.pendingVideoId = null;
    this.stopProgressLoop();
    if (this.player && this.ready) {
      try {
        this.player.pauseVideo();
      } catch {
        // Ignore pause error
      }
    }
    this.state = 'loading';
    this.callbacks.onStateChange('loading');
    this.callbacks.onProgress(0, 0);
  }

  public stop(): void {
    this.requestSeq++;
    this.activeVideoId = null;
    this.pendingVideoId = null;
    this.stopProgressLoop();
    if (this.player) {
      try {
        if (this.ready) {
          this.player.pauseVideo();
          this.player.stopVideo();
        }
        this.player.destroy();
      } catch {
        // Ignore destroy error
      }
      this.player = null;
    }
    this.ready = false;
    this.initializing = false;
    this.hostEl.replaceChildren();
    this.state = 'idle';
    this.callbacks.onStateChange('idle');
    this.callbacks.onProgress(0, 0);
  }
}
