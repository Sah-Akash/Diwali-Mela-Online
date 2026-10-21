export type SoundEffectType =
  | 'pop'
  | 'miss'
  | 'ring-win'
  | 'diya-light'
  | 'cheer'
  | 'firework'
  | 'bell'
  | 'eat'
  | 'click'
  | 'sparkle';

export class MelaAudioEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;
  private loopTimer: number | null = null;
  private beatIndex = 0;

  // Pentatonic Indian Raag Desh / Bhopali inspired frequencies (Hz)
  private readonly raagNotes = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

  public async start(): Promise<void> {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      if (!this.loopTimer) {
        this.startAmbientLoop();
      }
    } catch {
      // Ignore autoplay restrictions until next user interaction
    }
  }

  public toggleMute(): boolean {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      if (this.loopTimer) {
        window.clearInterval(this.loopTimer);
        this.loopTimer = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } else {
      this.start();
    }
    return this.enabled;
  }

  private startAmbientLoop(): void {
    if (this.loopTimer) window.clearInterval(this.loopTimer);
    // Gentle festive dholak + santoor/jal-tarang melody every 420ms
    this.loopTimer = window.setInterval(() => {
      if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
      const step = this.beatIndex % 8;
      this.beatIndex++;

      // Soft dholak bass on beats 0, 3, 6
      if (step === 0 || step === 3) {
        this.playTone(98, 0.14, 0.025, 'sine', 62);
      } else if (step === 2 || step === 6) {
        this.playTone(165, 0.09, 0.015, 'triangle', 120);
      }

      // Occasional warm santoor / temple chime note
      if (Math.random() < 0.38) {
        const note = this.raagNotes[Math.floor(Math.random() * this.raagNotes.length)];
        this.playTone(note, 0.55, 0.012, 'sine');
      }
    }, 420);
  }

  public playTone(
    freq: number,
    duration: number,
    gainVal: number,
    type: OscillatorType = 'sine',
    endFreq?: number,
    startTimeOffset = 0
  ): void {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime + startTimeOffset;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playNoiseBurst(duration: number, gainVal: number, filterFreq = 1400): void {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
  }

  public effect(kind: SoundEffectType): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      this.start();
      return;
    }

    switch (kind) {
      case 'pop':
        this.playTone(320, 0.09, 0.14, 'sine', 65);
        this.playNoiseBurst(0.09, 0.12, 2200);
        break;
      case 'miss':
        this.playTone(240, 0.2, 0.04, 'triangle', 140);
        break;
      case 'ring-win':
      case 'cheer':
        [392, 493.88, 587.33, 783.99].forEach((freq, idx) => {
          this.playTone(freq, 0.35, 0.055, 'triangle', undefined, idx * 0.09);
        });
        break;
      case 'diya-light':
        this.playTone(587.33, 0.45, 0.06, 'sine', 880);
        this.playTone(1174.66, 0.6, 0.03, 'sine', undefined, 0.08);
        break;
      case 'bell':
        this.playTone(1046.5, 0.85, 0.045, 'sine');
        this.playTone(2093.0, 0.45, 0.018, 'sine');
        break;
      case 'firework':
        this.playTone(380, 0.45, 0.04, 'sine', 1280);
        this.playNoiseBurst(0.85, 0.11, 1100);
        break;
      case 'eat':
        this.playTone(440, 0.15, 0.04, 'sine', 660);
        this.playTone(660, 0.22, 0.04, 'sine', 880, 0.12);
        break;
      case 'sparkle':
        this.playNoiseBurst(0.12, 0.03, 4200);
        this.playTone(1760, 0.15, 0.02, 'sine', 2400);
        break;
      case 'click':
        this.playTone(520, 0.06, 0.03, 'sine', 680);
        break;
    }
  }

  public speak(text: string): void {
    this.effect('click');
    if (!this.enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text.replace(/[★✦♥🪔]/g, ''));
      utter.lang = 'hi-IN';
      utter.rate = 1.02;
      utter.pitch = 1.05;
      utter.volume = 0.65;
      window.speechSynthesis.speak(utter);
    } catch {
      // Speech synthesis optional
    }
  }

  public dispose(): void {
    if (this.loopTimer) {
      window.clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
