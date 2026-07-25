import type { Vector3 } from 'three';
import { clamp, randRange } from './mathx.ts';

/**
 * Every sound in XIV is synthesised at runtime — there is not a single audio
 * file in the repo. That keeps the download tiny and lets weapons and impacts
 * vary per shot instead of looping the same three samples.
 */
export type SfxName =
  | 'pistol'
  | 'silenced'
  | 'rifle'
  | 'shotgun'
  | 'dryfire'
  | 'reload-out'
  | 'reload-in'
  | 'slide'
  | 'shell'
  | 'impact-concrete'
  | 'impact-metal'
  | 'impact-snow'
  | 'impact-wood'
  | 'impact-flesh'
  | 'ricochet'
  | 'step-snow'
  | 'step-wood'
  | 'step-metal'
  | 'land'
  | 'melee-swing'
  | 'melee-hit'
  | 'hurt'
  | 'death'
  | 'alert'
  | 'panel'
  | 'ui-click'
  | 'ui-deny'
  | 'pickup'
  | 'objective'
  | 'flashback';

export interface PlayOptions {
  /** World position; omit for a non-positional (player-local) sound. */
  position?: Vector3;
  volume?: number;
  detune?: number;
}

const NOISE_SECONDS = 2;

export class AudioBus {
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;
  #sfxGain: GainNode | null = null;
  #musicGain: GainNode | null = null;
  #noise: AudioBuffer | null = null;
  #muted = false;

  #volumes = { master: 0.8, sfx: 1, music: 0.5 };
  #wind: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  /** Browsers only allow audio after a gesture; call this from the first click. */
  unlock(): void {
    if (this.#ctx) {
      if (this.#ctx.state === 'suspended') void this.#ctx.resume();
      return;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.#ctx = ctx;

    this.#master = ctx.createGain();
    this.#master.gain.value = this.#volumes.master;
    this.#master.connect(ctx.destination);

    this.#sfxGain = ctx.createGain();
    this.#sfxGain.gain.value = this.#volumes.sfx;
    this.#sfxGain.connect(this.#master);

    this.#musicGain = ctx.createGain();
    this.#musicGain.gain.value = this.#volumes.music;
    this.#musicGain.connect(this.#master);

    const length = ctx.sampleRate * NOISE_SECONDS;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.#noise = buffer;
  }

  get ready(): boolean {
    return this.#ctx !== null && this.#ctx.state === 'running';
  }

  setVolume(kind: 'master' | 'sfx' | 'music', value: number): void {
    this.#volumes[kind] = clamp(value, 0, 1);
    const node =
      kind === 'master' ? this.#master : kind === 'sfx' ? this.#sfxGain : this.#musicGain;
    if (node && this.#ctx) {
      node.gain.setTargetAtTime(this.#volumes[kind], this.#ctx.currentTime, 0.02);
    }
  }

  getVolume(kind: 'master' | 'sfx' | 'music'): number {
    return this.#volumes[kind];
  }

  set muted(value: boolean) {
    this.#muted = value;
    if (this.#master && this.#ctx) {
      this.#master.gain.setTargetAtTime(
        value ? 0 : this.#volumes.master,
        this.#ctx.currentTime,
        0.05,
      );
    }
  }

  get muted(): boolean {
    return this.#muted;
  }

  /** Moves the WebAudio listener so positional sounds pan correctly. */
  updateListener(position: Vector3, forward: Vector3, up: Vector3): void {
    const ctx = this.#ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const t = ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(position.x, t, 0.02);
      l.positionY.setTargetAtTime(position.y, t, 0.02);
      l.positionZ.setTargetAtTime(position.z, t, 0.02);
      l.forwardX.setTargetAtTime(forward.x, t, 0.02);
      l.forwardY.setTargetAtTime(forward.y, t, 0.02);
      l.forwardZ.setTargetAtTime(forward.z, t, 0.02);
      l.upX.setTargetAtTime(up.x, t, 0.02);
      l.upY.setTargetAtTime(up.y, t, 0.02);
      l.upZ.setTargetAtTime(up.z, t, 0.02);
    }
  }

  #destination(options: PlayOptions): AudioNode {
    const ctx = this.#ctx!;
    if (!options.position) return this.#sfxGain!;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 4;
    panner.maxDistance = 120;
    panner.rolloffFactor = 1.1;
    panner.positionX.value = options.position.x;
    panner.positionY.value = options.position.y;
    panner.positionZ.value = options.position.z;
    panner.connect(this.#sfxGain!);
    return panner;
  }

  #noiseSource(playbackRate = 1): AudioBufferSourceNode {
    const ctx = this.#ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.#noise;
    src.loop = true;
    src.playbackRate.value = playbackRate;
    // Random start offset keeps repeated shots from sounding identical.
    src.start(ctx.currentTime, Math.random() * (NOISE_SECONDS - 0.1));
    return src;
  }

  /** Filtered noise burst with an exponential tail — the backbone of most SFX. */
  #burst(
    dest: AudioNode,
    opts: {
      gain: number;
      attack: number;
      decay: number;
      type: BiquadFilterType;
      freq: number;
      q?: number;
      sweepTo?: number;
      rate?: number;
    },
  ): void {
    const ctx = this.#ctx!;
    const t = ctx.currentTime;
    const src = this.#noiseSource(opts.rate ?? 1);
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type;
    filter.frequency.setValueAtTime(opts.freq, t);
    if (opts.sweepTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, opts.sweepTo), t + opts.decay);
    }
    filter.Q.value = opts.q ?? 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t + opts.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.attack + opts.decay);

    src.connect(filter).connect(gain).connect(dest);
    src.stop(t + opts.attack + opts.decay + 0.05);
  }

  /** Pitched body: the "thump" under a gunshot, or a UI blip. */
  #tone(
    dest: AudioNode,
    opts: {
      gain: number;
      freq: number;
      to?: number;
      attack: number;
      decay: number;
      type?: OscillatorType;
    },
  ): void {
    const ctx = this.#ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t);
    if (opts.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + opts.decay);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t + opts.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.attack + opts.decay);

    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + opts.attack + opts.decay + 0.05);
  }

  play(name: SfxName, options: PlayOptions = {}): void {
    if (!this.#ctx || this.#ctx.state !== 'running' || this.#muted) return;
    const dest = this.#destination(options);
    const v = options.volume ?? 1;
    const wobble = 1 + (options.detune ?? 0) * 0.01 + randRange(-0.05, 0.05);

    switch (name) {
      case 'pistol':
        this.#burst(dest, {
          gain: 0.55 * v,
          attack: 0.001,
          decay: 0.16,
          type: 'bandpass',
          freq: 2400 * wobble,
          q: 0.8,
          sweepTo: 380,
        });
        this.#tone(dest, {
          gain: 0.42 * v,
          freq: 210 * wobble,
          to: 55,
          attack: 0.001,
          decay: 0.13,
          type: 'triangle',
        });
        break;
      case 'silenced':
        this.#burst(dest, {
          gain: 0.3 * v,
          attack: 0.002,
          decay: 0.07,
          type: 'lowpass',
          freq: 1500 * wobble,
          sweepTo: 320,
        });
        this.#tone(dest, {
          gain: 0.14 * v,
          freq: 160,
          to: 70,
          attack: 0.002,
          decay: 0.06,
          type: 'sine',
        });
        break;
      case 'rifle':
        this.#burst(dest, {
          gain: 0.68 * v,
          attack: 0.001,
          decay: 0.22,
          type: 'bandpass',
          freq: 3200 * wobble,
          q: 0.6,
          sweepTo: 300,
        });
        this.#tone(dest, {
          gain: 0.5 * v,
          freq: 170 * wobble,
          to: 44,
          attack: 0.001,
          decay: 0.18,
          type: 'sawtooth',
        });
        break;
      case 'shotgun':
        this.#burst(dest, {
          gain: 0.8 * v,
          attack: 0.002,
          decay: 0.34,
          type: 'lowpass',
          freq: 2600 * wobble,
          sweepTo: 180,
        });
        this.#tone(dest, {
          gain: 0.55 * v,
          freq: 120,
          to: 38,
          attack: 0.002,
          decay: 0.28,
          type: 'square',
        });
        break;
      case 'dryfire':
        this.#burst(dest, {
          gain: 0.16 * v,
          attack: 0.001,
          decay: 0.03,
          type: 'highpass',
          freq: 3800,
        });
        break;
      case 'reload-out':
        this.#burst(dest, {
          gain: 0.22 * v,
          attack: 0.002,
          decay: 0.09,
          type: 'bandpass',
          freq: 1700,
          q: 3,
        });
        break;
      case 'reload-in':
        this.#burst(dest, {
          gain: 0.28 * v,
          attack: 0.002,
          decay: 0.07,
          type: 'bandpass',
          freq: 900,
          q: 4,
        });
        this.#tone(dest, {
          gain: 0.12 * v,
          freq: 340,
          to: 190,
          attack: 0.002,
          decay: 0.06,
          type: 'square',
        });
        break;
      case 'slide':
        this.#burst(dest, {
          gain: 0.3 * v,
          attack: 0.002,
          decay: 0.11,
          type: 'bandpass',
          freq: 2600,
          q: 2.4,
        });
        break;
      case 'shell':
        this.#burst(dest, {
          gain: 0.13 * v,
          attack: 0.001,
          decay: 0.05,
          type: 'bandpass',
          freq: 5200 * wobble,
          q: 6,
        });
        this.#tone(dest, {
          gain: 0.07 * v,
          freq: 2600 * wobble,
          to: 1700,
          attack: 0.001,
          decay: 0.09,
          type: 'sine',
        });
        break;
      case 'impact-concrete':
        this.#burst(dest, {
          gain: 0.32 * v,
          attack: 0.001,
          decay: 0.11,
          type: 'bandpass',
          freq: 1900 * wobble,
          q: 1.1,
          sweepTo: 500,
        });
        break;
      case 'impact-metal':
        this.#burst(dest, {
          gain: 0.26 * v,
          attack: 0.001,
          decay: 0.08,
          type: 'bandpass',
          freq: 4200 * wobble,
          q: 5,
        });
        this.#tone(dest, {
          gain: 0.2 * v,
          freq: 2400 * wobble,
          to: 900,
          attack: 0.001,
          decay: 0.22,
          type: 'sine',
        });
        break;
      case 'impact-snow':
        this.#burst(dest, {
          gain: 0.22 * v,
          attack: 0.003,
          decay: 0.13,
          type: 'lowpass',
          freq: 900 * wobble,
          sweepTo: 200,
        });
        break;
      case 'impact-wood':
        this.#burst(dest, {
          gain: 0.3 * v,
          attack: 0.001,
          decay: 0.1,
          type: 'bandpass',
          freq: 1100 * wobble,
          q: 2,
        });
        this.#tone(dest, {
          gain: 0.16 * v,
          freq: 420,
          to: 160,
          attack: 0.001,
          decay: 0.09,
          type: 'triangle',
        });
        break;
      case 'impact-flesh':
        this.#burst(dest, {
          gain: 0.34 * v,
          attack: 0.002,
          decay: 0.1,
          type: 'lowpass',
          freq: 700 * wobble,
          sweepTo: 130,
        });
        this.#tone(dest, {
          gain: 0.2 * v,
          freq: 130,
          to: 48,
          attack: 0.002,
          decay: 0.11,
          type: 'sine',
        });
        break;
      case 'ricochet':
        this.#tone(dest, {
          gain: 0.2 * v,
          freq: randRange(1600, 3400),
          to: randRange(400, 800),
          attack: 0.002,
          decay: 0.3,
          type: 'sine',
        });
        break;
      case 'step-snow':
        this.#burst(dest, {
          gain: 0.14 * v,
          attack: 0.004,
          decay: 0.1,
          type: 'lowpass',
          freq: 1200 * wobble,
          sweepTo: 300,
        });
        break;
      case 'step-wood':
        this.#burst(dest, {
          gain: 0.16 * v,
          attack: 0.002,
          decay: 0.07,
          type: 'bandpass',
          freq: 700 * wobble,
          q: 1.8,
        });
        break;
      case 'step-metal':
        this.#burst(dest, {
          gain: 0.15 * v,
          attack: 0.002,
          decay: 0.09,
          type: 'bandpass',
          freq: 2800 * wobble,
          q: 3.5,
        });
        break;
      case 'land':
        this.#burst(dest, {
          gain: 0.3 * v,
          attack: 0.003,
          decay: 0.16,
          type: 'lowpass',
          freq: 800,
          sweepTo: 140,
        });
        this.#tone(dest, {
          gain: 0.22 * v,
          freq: 90,
          to: 40,
          attack: 0.003,
          decay: 0.14,
          type: 'sine',
        });
        break;
      case 'melee-swing':
        this.#burst(dest, {
          gain: 0.2 * v,
          attack: 0.02,
          decay: 0.12,
          type: 'bandpass',
          freq: 600,
          q: 1.2,
          sweepTo: 2200,
        });
        break;
      case 'melee-hit':
        this.#burst(dest, {
          gain: 0.4 * v,
          attack: 0.001,
          decay: 0.14,
          type: 'lowpass',
          freq: 1100,
          sweepTo: 160,
        });
        this.#tone(dest, {
          gain: 0.3 * v,
          freq: 150,
          to: 50,
          attack: 0.001,
          decay: 0.15,
          type: 'triangle',
        });
        break;
      case 'hurt':
        this.#tone(dest, {
          gain: 0.3 * v,
          freq: 300 * wobble,
          to: 120,
          attack: 0.005,
          decay: 0.24,
          type: 'sawtooth',
        });
        this.#burst(dest, {
          gain: 0.2 * v,
          attack: 0.004,
          decay: 0.2,
          type: 'lowpass',
          freq: 600,
          sweepTo: 160,
        });
        break;
      case 'death':
        this.#tone(dest, {
          gain: 0.34 * v,
          freq: 240 * wobble,
          to: 60,
          attack: 0.01,
          decay: 0.75,
          type: 'sawtooth',
        });
        this.#burst(dest, {
          gain: 0.22 * v,
          attack: 0.01,
          decay: 0.6,
          type: 'lowpass',
          freq: 500,
          sweepTo: 90,
        });
        break;
      case 'alert':
        this.#tone(dest, {
          gain: 0.28 * v,
          freq: 320 * wobble,
          to: 460,
          attack: 0.02,
          decay: 0.28,
          type: 'square',
        });
        break;
      case 'panel':
        this.#burst(dest, {
          gain: 0.2 * v,
          attack: 0.004,
          decay: 0.16,
          type: 'highpass',
          freq: 2200,
          sweepTo: 6000,
        });
        break;
      case 'ui-click':
        this.#tone(dest, {
          gain: 0.18 * v,
          freq: 880,
          to: 1320,
          attack: 0.002,
          decay: 0.06,
          type: 'square',
        });
        break;
      case 'ui-deny':
        this.#tone(dest, {
          gain: 0.2 * v,
          freq: 220,
          to: 140,
          attack: 0.004,
          decay: 0.14,
          type: 'square',
        });
        break;
      case 'pickup':
        this.#tone(dest, {
          gain: 0.2 * v,
          freq: 660,
          to: 1180,
          attack: 0.004,
          decay: 0.14,
          type: 'triangle',
        });
        break;
      case 'objective':
        this.#tone(dest, { gain: 0.2 * v, freq: 523, attack: 0.01, decay: 0.3, type: 'triangle' });
        this.#tone(dest, {
          gain: 0.16 * v,
          freq: 784,
          attack: 0.09,
          decay: 0.34,
          type: 'triangle',
        });
        break;
      case 'flashback':
        this.#tone(dest, {
          gain: 0.24 * v,
          freq: 1400,
          to: 180,
          attack: 0.03,
          decay: 1.1,
          type: 'sine',
        });
        this.#burst(dest, {
          gain: 0.14 * v,
          attack: 0.05,
          decay: 1.0,
          type: 'bandpass',
          freq: 700,
          q: 0.7,
          sweepTo: 2600,
        });
        break;
    }
  }

  /** Looping wind bed. `intensity` 0 kills it, 1 is a full blizzard. */
  setWind(intensity: number): void {
    const ctx = this.#ctx;
    if (!ctx || !this.#noise) return;
    const target = clamp(intensity, 0, 1);

    if (!this.#wind) {
      if (target <= 0) return;
      const source = ctx.createBufferSource();
      source.buffer = this.#noise;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 420;
      filter.Q.value = 0.55;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(this.#musicGain!);
      source.start();
      this.#wind = { source, gain };
    }
    this.#wind.gain.gain.setTargetAtTime(target * 0.35, ctx.currentTime, 1.2);
  }

  stopWind(): void {
    if (!this.#wind || !this.#ctx) return;
    this.#wind.gain.gain.setTargetAtTime(0, this.#ctx.currentTime, 0.4);
    const { source } = this.#wind;
    this.#wind = null;
    setTimeout(() => source.stop(), 1500);
  }

  dispose(): void {
    this.stopWind();
    void this.#ctx?.close();
    this.#ctx = null;
  }
}

export const audio = new AudioBus();
