import { PerspectiveCamera, Vector3 } from 'three';
import type { Stage } from '../render/Stage.ts';
import { randRange, pick } from '../core/mathx.ts';

export type PanelSlot = 'tl' | 'tr' | 'bl' | 'br' | 'ml' | 'mr';

export interface PanelRequest {
  /** Where the panel camera sits, and what it looks at. */
  eye: Vector3;
  target: Vector3;
  /** Screen corner. Omit to pick one that isn't already busy. */
  slot?: PanelSlot;
  /** Caption strip along the bottom of the panel, comic-narration style. */
  caption?: string;
  /** Seconds on screen. */
  duration?: number;
  fov?: number;
  /** Tints the border: red for danger, yellow for a kill, blue for memory. */
  tone?: 'ink' | 'kill' | 'danger' | 'memory';
  /** Renders desaturated with heavy grain — used for flashbacks. */
  memory?: boolean;
}

const SLOTS: PanelSlot[] = ['tl', 'tr', 'bl', 'br', 'ml', 'mr'];

const PANEL_WIDTH = 288;
const PANEL_HEIGHT = 180;

interface LivePanel {
  slot: PanelSlot;
  el: HTMLDivElement;
  life: number;
  duration: number;
}

/**
 * The inset panels. When something worth drawing happens — a guard drops, a
 * memory surfaces, someone gets the drop on you — the game renders that moment
 * from a second camera, through the same ink pipeline, and pins the frozen
 * frame into a corner of the page.
 */
export class ComicPanels {
  readonly root: HTMLDivElement;
  enabled = true;

  readonly #stage: Stage;
  readonly #camera = new PerspectiveCamera(52, PANEL_WIDTH / PANEL_HEIGHT, 0.08, 400);
  readonly #live: LivePanel[] = [];
  #maxConcurrent = 2;

  constructor(stage: Stage, parent: HTMLElement) {
    this.#stage = stage;
    this.root = document.createElement('div');
    this.root.className = 'panels';
    parent.appendChild(this.root);
  }

  #freeSlot(preferred?: PanelSlot): PanelSlot | null {
    const busy = new Set(this.#live.map((p) => p.slot));
    if (preferred && !busy.has(preferred)) return preferred;
    for (const s of SLOTS) if (!busy.has(s)) return s;
    return null;
  }

  show(request: PanelRequest): boolean {
    if (!this.enabled) return false;
    if (this.#live.length >= this.#maxConcurrent) return false;

    const slot = this.#freeSlot(request.slot);
    if (!slot) return false;

    this.#camera.position.copy(request.eye);
    this.#camera.lookAt(request.target);
    this.#camera.fov = request.fov ?? 52;
    this.#camera.updateProjectionMatrix();

    // Flashbacks are printed on the same press but with the colour pulled out.
    const restore = request.memory
      ? { saturation: 0.12, grain: 0.34, halftone: 0.95, vignette: 0.7 }
      : null;
    if (restore) this.#stage.applyComic(restore);

    const image = this.#stage.snapshot(this.#camera, PANEL_WIDTH, PANEL_HEIGHT);
    if (restore) this.#stage.resetComic();
    if (!image) return false;

    const canvas = document.createElement('canvas');
    canvas.width = PANEL_WIDTH;
    canvas.height = PANEL_HEIGHT;
    canvas.getContext('2d')?.putImageData(image, 0, 0);

    const el = document.createElement('div');
    el.className = `panel panel--${slot} panel--${request.tone ?? 'ink'}`;
    // A hand-pinned panel is never perfectly square to the page.
    el.style.setProperty('--tilt', `${randRange(-2.6, 2.6).toFixed(2)}deg`);
    el.appendChild(canvas);

    if (request.caption) {
      const caption = document.createElement('div');
      caption.className = 'panel__caption';
      caption.textContent = request.caption;
      el.appendChild(caption);
    }

    this.root.appendChild(el);
    const duration = request.duration ?? 2.6;
    this.#live.push({ slot, el, life: duration, duration });
    return true;
  }

  update(dt: number): void {
    for (let i = this.#live.length - 1; i >= 0; i--) {
      const p = this.#live[i]!;
      p.life -= dt;
      if (p.life <= 0.45 && !p.el.classList.contains('panel--out')) {
        p.el.classList.add('panel--out');
      }
      if (p.life <= 0) {
        p.el.remove();
        this.#live.splice(i, 1);
      }
    }
  }

  set maxConcurrent(value: number) {
    this.#maxConcurrent = Math.max(1, value);
  }

  clear(): void {
    for (const p of this.#live) p.el.remove();
    this.#live.length = 0;
  }
}

/** Places a panel camera to frame `subject` from an interesting angle. */
export function framingShot(
  subject: Vector3,
  from: Vector3,
  distance = 2.6,
): {
  eye: Vector3;
  target: Vector3;
} {
  const dir = new Vector3().subVectors(subject, from);
  dir.y = 0;
  if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
  dir.normalize();

  // Swing round to a three-quarter view — a straight-on shot reads as flat.
  const side = pick([-1, 1]);
  const angle = randRange(0.6, 1.25) * side;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const offset = new Vector3(dir.x * cos - dir.z * sin, 0, dir.x * sin + dir.z * cos);

  return {
    eye: subject
      .clone()
      .addScaledVector(offset, -distance)
      .add(new Vector3(0, randRange(0.35, 1.1), 0)),
    target: subject.clone().add(new Vector3(0, randRange(0.9, 1.35), 0)),
  };
}
