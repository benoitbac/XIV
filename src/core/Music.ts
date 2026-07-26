import { clamp, mulberry32 } from './mathx.ts';

/**
 * The score.
 *
 * There is no audio file here either: the music is played by a small synth that
 * is scheduled ahead of the clock, the way a sequencer works. A game score has
 * to react — going quiet when the player is sneaking and lifting the moment a
 * guard shouts — and reacting is something a looped MP3 cannot do without an
 * audible seam.
 *
 * Structure is four layers that fade independently:
 *   pad     — a slow, detuned drone. Always present, sets the cold.
 *   bass    — a pulse on the root. Enters with suspicion.
 *   pulse   — muted, damped plucks on the offbeat. The clock of a chase.
 *   drums   — brushed noise hits. Combat only.
 *
 * Everything sits in D natural minor with a flattened second borrowed from
 * Phrygian for the tense states — the interval that makes spy scores sound
 * like spy scores.
 */

export type MusicState = 'silent' | 'title' | 'calm' | 'suspicious' | 'combat' | 'memory';

/** Semitone offsets from the root, D. */
export const SCALE_MINOR = [0, 2, 3, 5, 7, 8, 10];
export const SCALE_PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

const ROOT_HZ = 73.42; // D2

const midiToHz = (semitonesAboveRoot: number): number => ROOT_HZ * 2 ** (semitonesAboveRoot / 12);

export interface LayerMix {
  pad: number;
  bass: number;
  pulse: number;
  drums: number;
  /** Beats per minute for this state. */
  bpm: number;
  /** Chance per bar that a melodic figure is played. */
  motif: number;
  phrygian: boolean;
}

export const MIXES: Record<MusicState, LayerMix> = {
  silent: { pad: 0, bass: 0, pulse: 0, drums: 0, bpm: 80, motif: 0, phrygian: false },
  title: { pad: 0.5, bass: 0.22, pulse: 0, drums: 0, bpm: 72, motif: 0.5, phrygian: true },
  calm: { pad: 0.34, bass: 0.1, pulse: 0, drums: 0, bpm: 78, motif: 0.16, phrygian: false },
  suspicious: { pad: 0.4, bass: 0.34, pulse: 0.3, drums: 0, bpm: 100, motif: 0.3, phrygian: true },
  combat: { pad: 0.3, bass: 0.5, pulse: 0.55, drums: 0.5, bpm: 138, motif: 0.5, phrygian: true },
  memory: { pad: 0.55, bass: 0.06, pulse: 0, drums: 0, bpm: 60, motif: 0.7, phrygian: false },
};

/** Chord roots, as scale degrees, one per bar. A slow, circling progression. */
export const PROGRESSION = [0, 0, 5, 3, 0, 0, 6, 5];

const LOOKAHEAD_MS = 60;
const SCHEDULE_AHEAD = 0.35;

export class Music {
  #ctx: AudioContext | null = null;
  #out: GainNode | null = null;
  #layers: Record<'pad' | 'bass' | 'pulse' | 'drums', GainNode> | null = null;
  #noise: AudioBuffer | null = null;

  #state: MusicState = 'silent';
  #mix: LayerMix = MIXES.silent;
  #timer: number | null = null;
  #nextNoteTime = 0;
  #step = 0;
  #rand = mulberry32(1414);
  #padVoices: OscillatorNode[] = [];
  #enabled = true;

  /** Attaches to an existing context and destination — shares the audio bus. */
  attach(ctx: AudioContext, destination: AudioNode): void {
    if (this.#ctx) return;
    this.#ctx = ctx;

    this.#out = ctx.createGain();
    this.#out.gain.value = 1;
    this.#out.connect(destination);

    const layer = (): GainNode => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.#out!);
      return g;
    };
    this.#layers = { pad: layer(), bass: layer(), pulse: layer(), drums: layer() };

    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.#noise = buffer;

    this.#startPad();
    this.#nextNoteTime = ctx.currentTime + 0.1;
    this.#timer = window.setInterval(() => this.#schedule(), LOOKAHEAD_MS);
  }

  set enabled(value: boolean) {
    this.#enabled = value;
    if (!value) this.#applyMix(MIXES.silent, 0.6);
    else this.#applyMix(this.#mix, 0.6);
  }

  get state(): MusicState {
    return this.#state;
  }

  /** Cross-fades to a new mood. Safe to call every frame. */
  setState(state: MusicState, fadeSeconds = 1.6): void {
    if (this.#state === state) return;
    this.#state = state;
    this.#mix = MIXES[state];
    // Dropping out of combat should relax slowly; entering it must be instant,
    // or the music arrives after the player is already being shot at.
    const fade = state === 'combat' ? 0.25 : fadeSeconds;
    if (this.#enabled) this.#applyMix(this.#mix, fade);
  }

  #applyMix(mix: LayerMix, fade: number): void {
    const ctx = this.#ctx;
    const layers = this.#layers;
    if (!ctx || !layers) return;
    const t = ctx.currentTime;
    // setTargetAtTime's time constant reaches ~95 % in 3τ.
    const tau = Math.max(0.05, fade / 3);
    layers.pad.gain.setTargetAtTime(mix.pad, t, tau);
    layers.bass.gain.setTargetAtTime(mix.bass, t, tau);
    layers.pulse.gain.setTargetAtTime(mix.pulse, t, tau);
    layers.drums.gain.setTargetAtTime(mix.drums, t, tau);
  }

  // -------------------------------------------------------------------------
  // Voices
  // -------------------------------------------------------------------------

  /**
   * The pad runs continuously rather than being re-triggered: three detuned
   * saws through a slowly breathing low-pass. Re-attacking it every bar makes
   * the drone pulse, which is the one thing a bed of cold air must not do.
   */
  #startPad(): void {
    const ctx = this.#ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 2.5;
    filter.connect(this.#layers!.pad);

    // Slow filter sweep, so the drone is never quite static.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 190;
    lfo.connect(lfoDepth).connect(filter.frequency);
    lfo.start();

    for (const [semitones, detune, gain] of [
      [0, -6, 0.16],
      [0, 7, 0.13],
      [12, 3, 0.08],
      [19, -4, 0.05],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToHz(semitones);
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(filter);
      osc.start();
      this.#padVoices.push(osc);
    }
  }

  #pluck(time: number, hz: number, gain: number, decay: number, destination: GainNode): void {
    const ctx = this.#ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(hz, time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(hz * 7, time);
    filter.frequency.exponentialRampToValueAtTime(hz * 1.6, time + decay);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(gain, time + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, time + decay);

    osc.connect(filter).connect(env).connect(destination);
    osc.start(time);
    osc.stop(time + decay + 0.05);
  }

  #bassNote(time: number, semitones: number, length: number): void {
    const ctx = this.#ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(midiToHz(semitones), time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, time);
    filter.frequency.exponentialRampToValueAtTime(160, time + length);
    filter.Q.value = 6;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(0.5, time + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, time + length);

    osc.connect(filter).connect(env).connect(this.#layers!.bass);
    osc.start(time);
    osc.stop(time + length + 0.05);
  }

  #hit(time: number, kind: 'kick' | 'rim' | 'brush'): void {
    const ctx = this.#ctx!;
    const dest = this.#layers!.drums;

    if (kind === 'kick') {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(120, time);
      osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, time);
      env.gain.exponentialRampToValueAtTime(0.7, time + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
      osc.connect(env).connect(dest);
      osc.start(time);
      osc.stop(time + 0.2);
      return;
    }

    const src = ctx.createBufferSource();
    src.buffer = this.#noise;
    src.playbackRate.value = kind === 'rim' ? 1.6 : 0.9;
    const filter = ctx.createBiquadFilter();
    filter.type = kind === 'rim' ? 'bandpass' : 'highpass';
    filter.frequency.value = kind === 'rim' ? 2100 : 5200;
    filter.Q.value = kind === 'rim' ? 8 : 1;

    const decay = kind === 'rim' ? 0.08 : 0.18;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(kind === 'rim' ? 0.34 : 0.2, time + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, time + decay);

    src.connect(filter).connect(env).connect(dest);
    src.start(time, this.#rand() * 1.5);
    src.stop(time + decay + 0.05);
  }

  // -------------------------------------------------------------------------
  // Sequencer
  // -------------------------------------------------------------------------

  /**
   * Schedules every note that falls inside the next window.
   *
   * WebAudio events must be booked against the audio clock, not fired from a
   * timer: a `setInterval` callback drifts by tens of milliseconds under load,
   * which on a drum pattern is instantly audible as a stumble.
   */
  #schedule(): void {
    const ctx = this.#ctx;
    if (!ctx || ctx.state !== 'running' || !this.#enabled) return;

    const secondsPerStep = 60 / this.#mix.bpm / 4; // sixteenth notes

    while (this.#nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.#playStep(this.#step, this.#nextNoteTime, secondsPerStep);
      this.#step = (this.#step + 1) % 128;
      this.#nextNoteTime += secondsPerStep;
    }
  }

  #playStep(step: number, time: number, stepLength: number): void {
    const mix = this.#mix;
    const bar = Math.floor(step / 16) % PROGRESSION.length;
    const beat = step % 16;
    const scale = mix.phrygian ? SCALE_PHRYGIAN : SCALE_MINOR;
    const chordRoot = scale[PROGRESSION[bar]! % scale.length]!;

    // Bass: root on the downbeat, plus a push before the next bar.
    if (mix.bass > 0.01) {
      if (beat === 0) this.#bassNote(time, chordRoot, stepLength * 6);
      else if (beat === 10 && mix.bpm > 90) this.#bassNote(time, chordRoot, stepLength * 2);
      else if (beat === 14 && mix.bpm > 120) this.#bassNote(time, chordRoot + 7, stepLength * 2);
    }

    // Pulse: damped plucks on the offbeats — the clock of a chase.
    if (mix.pulse > 0.01 && beat % 4 === 2) {
      const degree = scale[(PROGRESSION[bar]! + 2) % scale.length]!;
      this.#pluck(time, midiToHz(degree + 24), 0.2, stepLength * 1.6, this.#layers!.pulse);
    }

    // Drums: a spare, driving pattern. Nothing on beat one but the kick.
    if (mix.drums > 0.01) {
      if (beat === 0 || beat === 6) this.#hit(time, 'kick');
      if (beat === 4 || beat === 12) this.#hit(time, 'rim');
      if (beat % 2 === 1 && this.#rand() < 0.4) this.#hit(time, 'brush');
    }

    // Motif: a short falling figure, once a bar at most. Sparse on purpose —
    // a melody that plays constantly stops being a signal.
    if (beat === 0 && this.#rand() < mix.motif) {
      const start = 3 + Math.floor(this.#rand() * 3);
      for (let n = 0; n < 3; n++) {
        const degree = scale[(start - n + scale.length) % scale.length]!;
        const octave = mix.bpm > 120 ? 36 : 24;
        this.#pluck(
          time + n * stepLength * 2,
          midiToHz(degree + octave),
          0.16,
          stepLength * 5,
          this.#layers!.pad,
        );
      }
    }
  }

  setVolume(value: number): void {
    if (!this.#out || !this.#ctx) return;
    this.#out.gain.setTargetAtTime(clamp(value, 0, 1), this.#ctx.currentTime, 0.1);
  }

  dispose(): void {
    if (this.#timer !== null) window.clearInterval(this.#timer);
    this.#timer = null;
    for (const osc of this.#padVoices) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.#padVoices.length = 0;
    this.#ctx = null;
  }
}

export const music = new Music();
