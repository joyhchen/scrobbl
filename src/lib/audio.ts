import type { StepDirection } from './types';

interface ToneParams {
  type: OscillatorType;
  startTime: number;
  startFreq: number;
  endFreq: number;
  freqDuration: number;
  peakGain: number;
  attack?: number;
  decayDuration: number;
  stopAfter: number;
}

interface NoiseBurstParams {
  startTime: number;
  freq: number;
  q: number;
  gain: number;
  decayDuration: number;
  stopAfter: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private lastHoverAt = 0;
  private lastTickAt = 0;

  private ensureContext(): { ctx: AudioContext; noiseBuffer: AudioBuffer } | null {
    if (this.muted || typeof window === 'undefined' || !window.AudioContext) return null;

    if (!this.ctx) {
      this.ctx = new window.AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      // Browser autoplay policy rejects resume() until a user gesture occurs.
      void this.ctx.resume().catch(() => {});
    }
    if (!this.noiseBuffer) {
      const length = Math.floor(this.ctx.sampleRate * 0.03);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        // Exponentially decaying impulse noise gives clicks a physical detent texture.
        const env = Math.pow(1 - i / length, 3.2);
        data[i] = (Math.random() * 2 - 1) * env;
      }
      this.noiseBuffer = buffer;
    }

    return { ctx: this.ctx, noiseBuffer: this.noiseBuffer };
  }

  private playTone(ctx: AudioContext, params: ToneParams): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const { startTime } = params;

    osc.type = params.type;
    osc.frequency.setValueAtTime(params.startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(params.endFreq, startTime + params.freqDuration);

    if (params.attack !== undefined) {
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(params.peakGain, startTime + params.attack);
    } else {
      gain.gain.setValueAtTime(params.peakGain, startTime);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + params.decayDuration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + params.stopAfter);
  }

  private playNoiseBurst(
    ctx: AudioContext,
    noiseBuffer: AudioBuffer,
    params: NoiseBurstParams
  ): void {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(params.freq, params.startTime);
    filter.Q.setValueAtTime(params.q, params.startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(params.gain, params.startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, params.startTime + params.decayDuration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(params.startTime);
    noise.stop(params.startTime + params.stopAfter);
  }

  public unlock(): void {
    this.ensureContext();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public playDialTick(direction: StepDirection = 1): void {
    const nowMs = performance.now();
    if (nowMs - this.lastTickAt < 28) return;
    this.lastTickAt = nowMs;

    const audio = this.ensureContext();
    if (!audio) return;

    const now = audio.ctx.currentTime;
    this.playTone(audio.ctx, {
      type: 'triangle',
      startTime: now,
      startFreq: direction > 0 ? 1180 : 1040,
      endFreq: direction > 0 ? 440 : 380,
      freqDuration: 0.022,
      peakGain: 0.11,
      attack: 0.0025,
      decayDuration: 0.026,
      stopAfter: 0.03,
    });
    this.playNoiseBurst(audio.ctx, audio.noiseBuffer, {
      startTime: now,
      freq: direction > 0 ? 2900 : 2500,
      q: 3.2,
      gain: 0.14,
      decayDuration: 0.018,
      stopAfter: 0.022,
    });
  }

  public playDialHover(): void {
    const nowMs = performance.now();
    if (nowMs - this.lastHoverAt < 55) return;
    this.lastHoverAt = nowMs;

    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;

    this.playTone(this.ctx, {
      type: 'sine',
      startTime: this.ctx.currentTime,
      startFreq: 1480,
      endFreq: 860,
      freqDuration: 0.014,
      peakGain: 0.042,
      attack: 0.002,
      decayDuration: 0.016,
      stopAfter: 0.02,
    });
  }

  public playWheelClick(): void {
    const nowMs = performance.now();
    if (nowMs - this.lastTickAt < 24) return;
    this.lastTickAt = nowMs;

    const audio = this.ensureContext();
    if (!audio) return;

    const now = audio.ctx.currentTime;
    this.playNoiseBurst(audio.ctx, audio.noiseBuffer, {
      startTime: now,
      freq: 4100,
      q: 5.5,
      gain: 0.18,
      decayDuration: 0.009,
      stopAfter: 0.012,
    });
    this.playTone(audio.ctx, {
      type: 'sine',
      startTime: now,
      startFreq: 1950,
      endFreq: 720,
      freqDuration: 0.008,
      peakGain: 0.055,
      decayDuration: 0.009,
      stopAfter: 0.012,
    });
  }

  public playButtonPress(kind: 'select' | 'menu' = 'select'): void {
    const audio = this.ensureContext();
    if (!audio) return;

    this.playTone(audio.ctx, {
      type: 'triangle',
      startTime: audio.ctx.currentTime,
      startFreq: kind === 'select' ? 920 : 720,
      endFreq: kind === 'select' ? 340 : 260,
      freqDuration: kind === 'select' ? 0.024 : 0.026,
      peakGain: 0.12,
      attack: 0.002,
      decayDuration: 0.028,
      stopAfter: 0.032,
    });
  }

  public playCassetteLoad(): void {
    const audio = this.ensureContext();
    if (!audio) return;

    const now = audio.ctx.currentTime;
    const seatAt = now + 0.055;

    this.playTone(audio.ctx, {
      type: 'triangle',
      startTime: now,
      startFreq: 640,
      endFreq: 190,
      freqDuration: 0.028,
      peakGain: 0.14,
      attack: 0.003,
      decayDuration: 0.035,
      stopAfter: 0.04,
    });
    this.playTone(audio.ctx, {
      type: 'sine',
      startTime: seatAt,
      startFreq: 240,
      endFreq: 88,
      freqDuration: 0.055,
      peakGain: 0.16,
      attack: 0.006,
      decayDuration: 0.068,
      stopAfter: 0.075,
    });
    this.playNoiseBurst(audio.ctx, audio.noiseBuffer, {
      startTime: seatAt,
      freq: 1400,
      q: 1.8,
      gain: 0.12,
      decayDuration: 0.024,
      stopAfter: 0.028,
    });
  }
}

export const soundEngine = new SoundEngine();
