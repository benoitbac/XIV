/** Minimal typed event bus. No deps, no allocation on emit. */
export class Signal<T> {
  #listeners: Array<(payload: T) => void> = [];

  on(fn: (payload: T) => void): () => void {
    this.#listeners.push(fn);
    return () => this.off(fn);
  }

  off(fn: (payload: T) => void): void {
    const i = this.#listeners.indexOf(fn);
    if (i >= 0) this.#listeners.splice(i, 1);
  }

  emit(payload: T): void {
    for (let i = 0; i < this.#listeners.length; i++) this.#listeners[i]!(payload);
  }

  clear(): void {
    this.#listeners.length = 0;
  }
}
