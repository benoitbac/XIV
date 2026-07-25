/**
 * requestAnimationFrame driver with a clamped delta and a rolling FPS readout.
 *
 * Movement runs on a variable step (clamped so an alt-tab can't tunnel anyone
 * through a wall) because mouse look feels wrong on anything else — but the
 * clamp means a stall degrades into slow-motion rather than teleportation.
 */
export class Loop {
  #handle = 0;
  #last = 0;
  #running = false;
  #accumulatedFrames = 0;
  #accumulatedTime = 0;

  fps = 0;
  /** Wall-clock seconds since `start()`, excluding paused time. */
  elapsed = 0;
  timeScale = 1;
  maxDelta = 1 / 20;

  constructor(private readonly step: (dt: number, elapsed: number) => void) {}

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#last = performance.now();
    const tick = (now: number): void => {
      if (!this.#running) return;
      this.#handle = requestAnimationFrame(tick);

      const raw = (now - this.#last) / 1000;
      this.#last = now;

      this.#accumulatedFrames++;
      this.#accumulatedTime += raw;
      if (this.#accumulatedTime >= 0.5) {
        this.fps = this.#accumulatedFrames / this.#accumulatedTime;
        this.#accumulatedFrames = 0;
        this.#accumulatedTime = 0;
      }

      const dt = Math.min(raw, this.maxDelta) * this.timeScale;
      this.elapsed += dt;
      this.step(dt, this.elapsed);
    };
    this.#handle = requestAnimationFrame(tick);
  }

  stop(): void {
    this.#running = false;
    cancelAnimationFrame(this.#handle);
  }

  get running(): boolean {
    return this.#running;
  }
}
