const SOUND_STORAGE_KEY = 'txi_sound_enabled';

let audioCtx: AudioContext | null = null;

export function isSoundEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const raw = window.localStorage.getItem(SOUND_STORAGE_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage restriction
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export type SfxKind = 'whistle' | 'goal' | 'card' | 'save' | 'click' | 'pack' | 'victory';

export function playSfx(kind: SfxKind): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;

  const playTone = (
    freq: number,
    startOffset: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainPeak = 0.08,
    endFreq?: number
  ) => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + startOffset);
      if (endFreq !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + startOffset + duration);
      }
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.linearRampToValueAtTime(gainPeak, now + startOffset + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    } catch {
      // Ignore audio scheduler errors
    }
  };

  if (kind === 'whistle') {
    playTone(2650, 0, 0.14, 'triangle', 0.055, 2900);
    playTone(2780, 0.16, 0.22, 'triangle', 0.05, 2500);
    return;
  }

  if (kind === 'goal') {
    playTone(523.25, 0, 0.14, 'triangle', 0.09);
    playTone(659.25, 0.1, 0.16, 'triangle', 0.09);
    playTone(783.99, 0.2, 0.22, 'triangle', 0.1);
    playTone(1046.5, 0.32, 0.38, 'sine', 0.1);
    return;
  }

  if (kind === 'card') {
    playTone(980, 0, 0.12, 'sawtooth', 0.05, 620);
    return;
  }

  if (kind === 'save') {
    playTone(220, 0, 0.09, 'sine', 0.07, 110);
    return;
  }

  if (kind === 'pack') {
    playTone(440, 0, 0.1, 'triangle', 0.07);
    playTone(554.37, 0.08, 0.1, 'triangle', 0.07);
    playTone(659.25, 0.16, 0.14, 'triangle', 0.08);
    playTone(880, 0.26, 0.28, 'sine', 0.09);
    return;
  }

  if (kind === 'victory') {
    playTone(523.25, 0, 0.12, 'triangle', 0.08);
    playTone(659.25, 0.1, 0.12, 'triangle', 0.08);
    playTone(783.99, 0.2, 0.12, 'triangle', 0.08);
    playTone(1046.5, 0.3, 0.36, 'triangle', 0.09);
    return;
  }

  // 'click'
  playTone(640, 0, 0.045, 'sine', 0.035, 420);
}
