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

export interface RadioTrack {
  id: string;
  title: string;
  subtitle: string;
  tempoMs: number;
  notes: number[];
  droneFreq: number;
}

export const DIWALI_RADIO_TRACKS: RadioTrack[] = [
  {
    id: 'deepotsav-aarti',
    title: 'Deepotsav Maha-Aarti Dhun',
    subtitle: 'Temple Bells, Santoor & Tanpura',
    tempoMs: 380,
    // Inspired by Om Jai Jagdish / festive Aarti scale (Sa Re Ga Ma Pa Dha Ni Sa)
    notes: [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 392.0, 329.63, 293.66, 261.63],
    droneFreq: 130.81,
  },
  {
    id: 'raag-desh',
    title: 'Raag Desh · Festive Night',
    subtitle: 'Classical Flute & Dholak Pulse',
    tempoMs: 340,
    notes: [293.66, 349.23, 392.0, 493.88, 523.25, 493.88, 440.0, 392.0, 349.23, 329.63],
    droneFreq: 146.83,
  },
  {
    id: 'bachpan-jhoola',
    title: 'Bachpan Wala Mela Carousel',
    subtitle: 'Nostalgic Fairground Harmonium',
    tempoMs: 300,
    notes: [329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 587.33, 523.25, 440.0, 392.0],
    droneFreq: 164.81,
  },
  {
    id: 'dhol-bazaar',
    title: 'Bazaar Dhol & Shehnai',
    subtitle: 'Upbeat Maut Ka Kuan & Mela Beats',
    tempoMs: 250,
    notes: [392.0, 440.0, 523.25, 587.33, 523.25, 440.0, 392.0, 329.63],
    droneFreq: 196.0,
  },
];

export class MelaAudioEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;
  public radioPlaying = true;
  public volume = 0.75;
  public currentTrackIndex = 0;

  private loopTimer: number | null = null;
  private beatIndex = 0;

  public async start(): Promise<void> {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      if (!this.loopTimer) {
        this.startAmbientLoop();
      }
    } catch {
      // Ignore autoplay restrictions until user interaction
    }
  }

  public setSoundEnabled(val: boolean): boolean {
    this.enabled = val;
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

  public toggleMute(): boolean {
    return this.setSoundEnabled(!this.enabled);
  }

  public setRadioPlaying(playing: boolean): void {
    this.radioPlaying = playing;
    this.beatIndex = 0;
    if (this.enabled) {
      this.startAmbientLoop();
    }
  }

  public setTrackIndex(index: number): void {
    this.currentTrackIndex =
      ((index % DIWALI_RADIO_TRACKS.length) + DIWALI_RADIO_TRACKS.length) %
      DIWALI_RADIO_TRACKS.length;
    this.beatIndex = 0;
    if (this.enabled) {
      this.startAmbientLoop();
    }
  }

  public setVolume(val: number): void {
    this.volume = Math.max(0.05, Math.min(1, val));
  }

  private startAmbientLoop(): void {
    if (this.loopTimer) window.clearInterval(this.loopTimer);
    const track = DIWALI_RADIO_TRACKS[this.currentTrackIndex];

    this.loopTimer = window.setInterval(() => {
      if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
      const step = this.beatIndex % 8;
      const noteIdx = this.beatIndex % track.notes.length;
      this.beatIndex++;

      const volScale = this.volume;

      // Soft dholak bass on beats 0, 3, 6
      if (step === 0 || step === 3) {
        this.playTone(98, 0.14, 0.026 * volScale, 'sine', 62);
      } else if (step === 2 || step === 6) {
        this.playTone(165, 0.09, 0.015 * volScale, 'triangle', 120);
      }

      if (this.radioPlaying) {
        // Play melodic note from active Diwali Radio track
        const note = track.notes[noteIdx];
        this.playTone(note, (track.tempoMs / 1000) * 1.35, 0.022 * volScale, 'triangle');

        // Soft tanpura root drone on beat 0
        if (step === 0) {
          this.playTone(track.droneFreq, 1.2, 0.014 * volScale, 'sine');
        }
        // Temple manjira chime on beat 4
        if (step === 4) {
          this.playTone(note * 2, 0.35, 0.009 * volScale, 'sine');
        }
      }
    }, track.tempoMs);
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
    gain.gain.linearRampToValueAtTime(Math.max(0.0002, gainVal), now + 0.015);
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
    gain.gain.setValueAtTime(Math.max(0.0002, gainVal * this.volume), now);
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

    const v = this.volume;
    switch (kind) {
      case 'pop':
        this.playTone(320, 0.09, 0.14 * v, 'sine', 65);
        this.playNoiseBurst(0.09, 0.12, 2200);
        break;
      case 'miss':
        this.playTone(240, 0.2, 0.04 * v, 'triangle', 140);
        break;
      case 'ring-win':
      case 'cheer':
        [392, 493.88, 587.33, 783.99].forEach((freq, idx) => {
          this.playTone(freq, 0.35, 0.055 * v, 'triangle', undefined, idx * 0.09);
        });
        break;
      case 'diya-light':
        this.playTone(587.33, 0.45, 0.06 * v, 'sine', 880);
        this.playTone(1174.66, 0.6, 0.03 * v, 'sine', undefined, 0.08);
        break;
      case 'bell':
        this.playTone(1046.5, 0.85, 0.045 * v, 'sine');
        this.playTone(2093.0, 0.45, 0.018 * v, 'sine');
        break;
      case 'firework':
        this.playTone(380, 0.45, 0.04 * v, 'sine', 1280);
        this.playNoiseBurst(0.85, 0.11, 1100);
        break;
      case 'eat':
        this.playTone(440, 0.15, 0.04 * v, 'sine', 660);
        this.playTone(660, 0.22, 0.04 * v, 'sine', 880, 0.12);
        break;
      case 'sparkle':
        this.playNoiseBurst(0.12, 0.03, 4200);
        this.playTone(1760, 0.15, 0.02 * v, 'sine', 2400);
        break;
      case 'click':
        this.playTone(520, 0.06, 0.03 * v, 'sine', 680);
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
      utter.volume = 0.65 * this.volume;
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
