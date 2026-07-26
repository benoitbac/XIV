import { clamp } from '../core/mathx.ts';
import { JOINT_COUNT, type Clip } from './clips.ts';
import { JOINT_NAMES, type JointName, type Rig } from './rig.ts';

/**
 * Pose blending and playback.
 *
 * Poses are flat Float32Arrays of `[rx, ry, rz]` per joint rather than objects:
 * a firefight can have a dozen characters being posed every frame, and an
 * allocation per joint per frame is exactly the kind of thing that produces a
 * garbage-collection hitch at the worst possible moment.
 */

type Pose = Float32Array;

const newPose = (): Pose => new Float32Array(JOINT_COUNT * 3);

/** Smootherstep — zero first *and* second derivative at both ends. */
function ease(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Samples one clip into `out`. Keys are sorted by time; clips are short enough
 * that a linear scan beats any indexing scheme.
 */
function sampleClip(clip: Clip, time: number, out: Pose): void {
  const t = clip.loop ? (time / clip.duration) % 1 : clamp(time / clip.duration, 0, 1);

  for (const [joint, keys] of clip.tracks) {
    let a = keys[0]!;
    let b = keys[keys.length - 1]!;
    for (let i = 0; i < keys.length - 1; i++) {
      if (t >= keys[i]![0] && t <= keys[i + 1]![0]) {
        a = keys[i]!;
        b = keys[i + 1]!;
        break;
      }
    }
    const span = b[0] - a[0];
    const k = span <= 1e-6 ? 0 : ease((t - a[0]) / span);
    const o = joint * 3;
    out[o] = a[1] + (b[1] - a[1]) * k;
    out[o + 1] = a[2] + (b[2] - a[2]) * k;
    out[o + 2] = a[3] + (b[3] - a[3]) * k;
  }
}

function lerpPose(from: Pose, to: Pose, k: number, out: Pose): void {
  for (let i = 0; i < out.length; i++) out[i] = from[i]! + (to[i]! - from[i]!) * k;
}

interface Layer {
  clip: Clip;
  time: number;
  weight: number;
}

const jointIndex = new Map<JointName, number>(JOINT_NAMES.map((n, i) => [n, i]));

export class Animator {
  readonly rig: Rig;
  /** Multiplies clip playback speed — locomotion is driven by actual speed. */
  timeScale = 1;

  #current: Clip | null = null;
  #currentTime = 0;
  #previous: Clip | null = null;
  #previousTime = 0;
  #fade = 1;
  #fadeDuration = 0.2;

  /** One-shot additive layers: recoil, flinches. */
  readonly #additive: Layer[] = [];

  readonly #base = newPose();
  readonly #scratch = newPose();
  readonly #result = newPose();

  /** Aim offset, applied on top of everything as a torso/head look-at. */
  aimPitch = 0;
  aimYaw = 0;
  #aimWeight = 0;
  aimTarget = 0;

  constructor(rig: Rig) {
    this.rig = rig;
  }

  get currentName(): string | null {
    return this.#current?.name ?? null;
  }

  /** Cross-fades to `clip`. Re-playing the same looping clip is a no-op. */
  play(clip: Clip, fadeSeconds = 0.22): void {
    if (this.#current === clip && clip.loop) return;
    this.#previous = this.#current;
    this.#previousTime = this.#currentTime;
    this.#current = clip;
    this.#currentTime = 0;
    this.#fadeDuration = Math.max(fadeSeconds, 0.001);
    this.#fade = this.#previous ? 0 : 1;
  }

  /** Fires a one-shot additive clip; several can overlap. */
  punch(clip: Clip, weight = 1): void {
    // Three simultaneous flinches is already more than reads on screen.
    if (this.#additive.length >= 3) this.#additive.shift();
    this.#additive.push({ clip, time: 0, weight });
  }

  /** True once a non-looping clip has run to its end. */
  get finished(): boolean {
    return (
      this.#current !== null && !this.#current.loop && this.#currentTime >= this.#current.duration
    );
  }

  update(dt: number): void {
    const step = dt * this.timeScale;
    this.#currentTime += step;
    this.#previousTime += step;

    if (this.#fade < 1) {
      this.#fade = Math.min(1, this.#fade + dt / this.#fadeDuration);
    }

    // Base pose: previous clip cross-faded into the current one.
    this.#base.fill(0);
    if (this.#current) {
      sampleClip(this.#current, this.#currentTime, this.#base);
      if (this.#previous && this.#fade < 1) {
        this.#scratch.fill(0);
        sampleClip(this.#previous, this.#previousTime, this.#scratch);
        lerpPose(this.#scratch, this.#base, ease(this.#fade), this.#result);
        this.#base.set(this.#result);
      }
    }
    if (this.#fade >= 1) this.#previous = null;

    // Additive layers add their offsets rather than replacing the pose.
    for (let i = this.#additive.length - 1; i >= 0; i--) {
      const layer = this.#additive[i]!;
      layer.time += dt;
      if (layer.time >= layer.clip.duration) {
        this.#additive.splice(i, 1);
        continue;
      }
      this.#scratch.fill(0);
      sampleClip(layer.clip, layer.time, this.#scratch);
      for (let j = 0; j < this.#base.length; j++) {
        this.#base[j]! += this.#scratch[j]! * layer.weight;
      }
    }

    // Aim: split between chest, neck and head so the whole upper body turns.
    this.#aimWeight += (this.aimTarget - this.#aimWeight) * Math.min(1, dt * 8);
    if (this.#aimWeight > 0.001) {
      const w = this.#aimWeight;
      const pitch = clamp(this.aimPitch, -0.7, 0.7);
      const yaw = clamp(this.aimYaw, -0.9, 0.9);
      this.#addTo('spine', pitch * 0.2 * w, yaw * 0.25 * w, 0);
      this.#addTo('chest', pitch * 0.4 * w, yaw * 0.4 * w, 0);
      this.#addTo('neck', pitch * 0.15 * w, yaw * 0.15 * w, 0);
      this.#addTo('head', pitch * 0.25 * w, yaw * 0.2 * w, 0);
    }

    this.#applyToRig();
  }

  #addTo(joint: JointName, x: number, y: number, z: number): void {
    const index = jointIndex.get(joint);
    if (index === undefined) return;
    const o = index * 3;
    this.#base[o]! += x;
    this.#base[o + 1]! += y;
    this.#base[o + 2]! += z;
  }

  #applyToRig(): void {
    for (let i = 0; i < JOINT_NAMES.length; i++) {
      const joint = this.rig.joints.get(JOINT_NAMES[i]!);
      if (!joint) continue;
      const o = i * 3;
      joint.rotation.set(this.#base[o]!, this.#base[o + 1]!, this.#base[o + 2]!);
    }
  }
}
