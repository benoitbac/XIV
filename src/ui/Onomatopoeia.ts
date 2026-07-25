import { PerspectiveCamera, Vector3 } from 'three';
import { randRange } from '../core/mathx.ts';

export type OnomatopoeiaTone = 'shot' | 'impact' | 'heavy' | 'quiet' | 'pain' | 'alert';

export interface OnomatopoeiaRequest {
  text: string;
  position: Vector3;
  tone?: OnomatopoeiaTone;
  /** Seconds on screen. */
  duration?: number;
  scale?: number;
}

interface LiveWord {
  el: HTMLDivElement;
  anchor: Vector3;
  drift: Vector3;
  life: number;
  duration: number;
  rotation: number;
  scale: number;
}

const MAX_WORDS = 14;

/**
 * The lettering. Words are anchored in the world and projected to the page
 * every frame, so "BLAM" sits on the muzzle and "TCHAK" on the body — they
 * belong to the scene, not to the HUD.
 */
export class Onomatopoeia {
  readonly root: HTMLDivElement;
  enabled = true;

  readonly #live: LiveWord[] = [];
  readonly #pool: HTMLDivElement[] = [];
  readonly #projected = new Vector3();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'onomatopoeia';
    parent.appendChild(this.root);
  }

  spawn(request: OnomatopoeiaRequest): void {
    if (!this.enabled) return;
    // Oldest word makes way — a firefight must never bury the screen in text.
    if (this.#live.length >= MAX_WORDS) this.#retire(0);

    let el = this.#pool.pop();
    if (!el) {
      el = document.createElement('div');
      this.root.appendChild(el);
    }
    el.className = `word word--${request.tone ?? 'shot'}`;
    el.textContent = request.text;
    el.style.opacity = '1';
    el.style.display = 'block';

    const duration = request.duration ?? 0.85;
    this.#live.push({
      el,
      anchor: request.position.clone(),
      drift: new Vector3(randRange(-0.35, 0.35), randRange(0.6, 1.4), randRange(-0.35, 0.35)),
      life: duration,
      duration,
      rotation: randRange(-14, 14),
      scale: request.scale ?? randRange(0.9, 1.25),
    });
  }

  #retire(index: number): void {
    const w = this.#live[index]!;
    w.el.style.display = 'none';
    this.#pool.push(w.el);
    this.#live.splice(index, 1);
  }

  update(dt: number, camera: PerspectiveCamera, width: number, height: number): void {
    for (let i = this.#live.length - 1; i >= 0; i--) {
      const w = this.#live[i]!;
      w.life -= dt;
      if (w.life <= 0) {
        this.#retire(i);
        continue;
      }

      w.anchor.addScaledVector(w.drift, dt);

      this.#projected.copy(w.anchor).project(camera);
      // Behind the camera: hide rather than mirror it onto the wrong side.
      if (this.#projected.z > 1) {
        w.el.style.display = 'none';
        continue;
      }
      w.el.style.display = 'block';

      const x = (this.#projected.x * 0.5 + 0.5) * width;
      const y = (-this.#projected.y * 0.5 + 0.5) * height;

      const t = 1 - w.life / w.duration;
      // Overshoot then settle: the letters land like a stamp.
      const pop = t < 0.18 ? 0.4 + (t / 0.18) * 0.75 : 1.15 - (t - 0.18) * 0.18;
      const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;

      w.el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(
        1,
      )}px) rotate(${w.rotation}deg) scale(${(pop * w.scale).toFixed(3)})`;
      w.el.style.opacity = fade.toFixed(3);
    }
  }

  clear(): void {
    while (this.#live.length > 0) this.#retire(0);
  }
}
