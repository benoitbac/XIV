import type { Vector3 } from 'three';
import { clamp } from '../core/mathx.ts';

export type AlertLevel = 'calm' | 'suspicious' | 'hunting';

interface DamageArrow {
  el: HTMLDivElement;
  angle: number;
  life: number;
}

interface Toast {
  el: HTMLDivElement;
  life: number;
}

const html = (markup: string): HTMLDivElement => {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = markup.trim();
  return wrapper.firstElementChild as HTMLDivElement;
};

/**
 * The read-outs. Everything here is drawn as if inked onto the page — no
 * glassy bars, no glow. The gauges are hand-lettered blocks that tick down.
 */
export class Hud {
  readonly root: HTMLDivElement;

  readonly #crosshair: HTMLDivElement;
  readonly #hitMarker: HTMLDivElement;
  readonly #healthValue: HTMLDivElement;
  readonly #healthBar: HTMLDivElement;
  readonly #armourBar: HTMLDivElement;
  readonly #armourWrap: HTMLDivElement;
  readonly #ammoMag: HTMLDivElement;
  readonly #ammoReserve: HTMLDivElement;
  readonly #weaponName: HTMLDivElement;
  readonly #objective: HTMLDivElement;
  readonly #objectiveText: HTMLDivElement;
  readonly #subtitle: HTMLDivElement;
  readonly #prompt: HTMLDivElement;
  readonly #alert: HTMLDivElement;
  readonly #toasts: HTMLDivElement;
  readonly #arrows: HTMLDivElement;
  readonly #vignette: HTMLDivElement;

  readonly #liveArrows: DamageArrow[] = [];
  readonly #liveToasts: Toast[] = [];
  #hitMarkerLife = 0;
  #damageFlash = 0;
  #spread = 0;
  #subtitleLife = 0;

  constructor(parent: HTMLElement) {
    this.root = html(`
      <div class="hud">
        <div class="hud__vignette"></div>
        <div class="hud__arrows"></div>

        <div class="crosshair">
          <span class="crosshair__dot"></span>
          <span class="crosshair__arm crosshair__arm--n"></span>
          <span class="crosshair__arm crosshair__arm--s"></span>
          <span class="crosshair__arm crosshair__arm--w"></span>
          <span class="crosshair__arm crosshair__arm--e"></span>
        </div>
        <div class="hitmarker"></div>

        <div class="alert">
          <svg viewBox="0 0 24 16" class="alert__eye" aria-hidden="true">
            <path d="M1 8 C6 1, 18 1, 23 8 C18 15, 6 15, 1 8 Z" />
            <circle cx="12" cy="8" r="3.4" />
          </svg>
          <div class="alert__label">CALME</div>
        </div>

        <div class="objective">
          <div class="objective__tab">OBJECTIF</div>
          <div class="objective__text"></div>
        </div>

        <div class="vitals">
          <div class="vitals__row">
            <span class="vitals__label">ÉTAT</span>
            <span class="vitals__value">100</span>
          </div>
          <div class="gauge gauge--health"><div class="gauge__fill"></div></div>
          <div class="gauge gauge--armour"><div class="gauge__fill"></div></div>
        </div>

        <div class="ammo">
          <div class="ammo__weapon">MAINS NUES</div>
          <div class="ammo__counts">
            <span class="ammo__mag">—</span><span class="ammo__sep">/</span><span class="ammo__reserve">—</span>
          </div>
        </div>

        <div class="prompt"></div>
        <div class="subtitle"></div>
        <div class="toasts"></div>
      </div>
    `);
    parent.appendChild(this.root);

    const q = <T extends Element>(selector: string): T => this.root.querySelector(selector) as T;

    this.#crosshair = q('.crosshair');
    this.#hitMarker = q('.hitmarker');
    this.#healthValue = q('.vitals__value');
    this.#healthBar = q('.gauge--health .gauge__fill');
    this.#armourWrap = q('.gauge--armour');
    this.#armourBar = q('.gauge--armour .gauge__fill');
    this.#ammoMag = q('.ammo__mag');
    this.#ammoReserve = q('.ammo__reserve');
    this.#weaponName = q('.ammo__weapon');
    this.#objective = q('.objective');
    this.#objectiveText = q('.objective__text');
    this.#subtitle = q('.subtitle');
    this.#prompt = q('.prompt');
    this.#alert = q('.alert');
    this.#toasts = q('.toasts');
    this.#arrows = q('.hud__arrows');
    this.#vignette = q('.hud__vignette');
  }

  setVitals(health: number, maxHealth: number, armour: number): void {
    const pct = clamp(health / maxHealth, 0, 1);
    this.#healthValue.textContent = String(Math.max(0, Math.ceil(health)));
    this.#healthBar.style.transform = `scaleX(${pct.toFixed(3)})`;
    this.root.classList.toggle('hud--critical', pct < 0.3);

    this.#armourWrap.style.display = armour > 0 ? 'block' : 'none';
    this.#armourBar.style.transform = `scaleX(${clamp(armour / 100, 0, 1).toFixed(3)})`;
  }

  setAmmo(weaponName: string, mag: number, reserve: number, reserveMax: number): void {
    this.#weaponName.textContent = weaponName.toUpperCase();
    const infinite = !Number.isFinite(mag);
    this.#ammoMag.textContent = infinite ? '∞' : String(mag);
    this.#ammoReserve.textContent = reserveMax === 0 ? '—' : String(reserve);
    this.#ammoMag.classList.toggle('ammo__mag--empty', !infinite && mag === 0);
    this.#ammoMag.classList.toggle('ammo__mag--low', !infinite && mag > 0 && mag <= 2);
  }

  setObjective(text: string | null): void {
    if (!text) {
      this.#objective.classList.remove('objective--visible');
      return;
    }
    this.#objectiveText.textContent = text;
    this.#objective.classList.add('objective--visible');
    this.#objective.classList.remove('objective--flash');
    // Force a reflow so the flash animation restarts on a repeated objective.
    void this.#objective.offsetWidth;
    this.#objective.classList.add('objective--flash');
  }

  setAlert(level: AlertLevel): void {
    this.#alert.className = `alert alert--${level}`;
    const label = this.#alert.querySelector('.alert__label');
    if (label) {
      label.textContent =
        level === 'calm' ? 'CALME' : level === 'suspicious' ? 'SUSPICION' : 'REPÉRÉ';
    }
  }

  setPrompt(text: string | null): void {
    this.#prompt.textContent = text ?? '';
    this.#prompt.classList.toggle('prompt--visible', text !== null);
  }

  /** Spread is 0..1; the crosshair opens as accuracy degrades. */
  setSpread(value: number): void {
    this.#spread = clamp(value, 0, 1);
    this.#crosshair.style.setProperty('--spread', `${(4 + this.#spread * 22).toFixed(1)}px`);
  }

  setCrosshairVisible(visible: boolean): void {
    this.#crosshair.classList.toggle('crosshair--hidden', !visible);
  }

  hitMarker(lethal: boolean): void {
    this.#hitMarker.classList.toggle('hitmarker--lethal', lethal);
    this.#hitMarker.classList.remove('hitmarker--on');
    void this.#hitMarker.offsetWidth;
    this.#hitMarker.classList.add('hitmarker--on');
    this.#hitMarkerLife = lethal ? 0.42 : 0.22;
  }

  say(text: string, speaker?: string, seconds = 3.4): void {
    this.#subtitle.innerHTML = speaker
      ? `<span class="subtitle__who">${speaker}</span>${text}`
      : text;
    this.#subtitle.classList.add('subtitle--visible');
    this.#subtitleLife = seconds;
  }

  toast(text: string, kind: 'info' | 'pickup' | 'memory' | 'objective' = 'info'): void {
    const el = html(`<div class="toast toast--${kind}">${text}</div>`);
    this.#toasts.appendChild(el);
    this.#liveToasts.push({ el, life: 3.6 });
    // Keep the stack short; older notices slide out early.
    while (this.#liveToasts.length > 4) {
      const oldest = this.#liveToasts.shift();
      oldest?.el.remove();
    }
  }

  /** `angle` is the bearing of the shooter relative to where the player faces. */
  damageFrom(angle: number, severity: number): void {
    this.#damageFlash = Math.min(1, this.#damageFlash + severity);
    const el = html('<div class="arrow"></div>');
    this.#arrows.appendChild(el);
    this.#liveArrows.push({ el, angle, life: 1.1 });
  }

  update(dt: number): void {
    if (this.#hitMarkerLife > 0) {
      this.#hitMarkerLife -= dt;
      if (this.#hitMarkerLife <= 0) this.#hitMarker.classList.remove('hitmarker--on');
    }

    if (this.#subtitleLife > 0) {
      this.#subtitleLife -= dt;
      if (this.#subtitleLife <= 0) this.#subtitle.classList.remove('subtitle--visible');
    }

    this.#damageFlash = Math.max(0, this.#damageFlash - dt * 1.7);
    this.#vignette.style.opacity = this.#damageFlash.toFixed(3);

    for (let i = this.#liveArrows.length - 1; i >= 0; i--) {
      const a = this.#liveArrows[i]!;
      a.life -= dt;
      if (a.life <= 0) {
        a.el.remove();
        this.#liveArrows.splice(i, 1);
        continue;
      }
      a.el.style.transform = `rotate(${((a.angle * 180) / Math.PI).toFixed(1)}deg) translateY(-140px)`;
      a.el.style.opacity = Math.min(1, a.life / 0.5).toFixed(3);
    }

    for (let i = this.#liveToasts.length - 1; i >= 0; i--) {
      const t = this.#liveToasts[i]!;
      t.life -= dt;
      if (t.life <= 0.4) t.el.classList.add('toast--out');
      if (t.life <= 0) {
        t.el.remove();
        this.#liveToasts.splice(i, 1);
      }
    }
  }

  /**
   * Bearing of an attacker relative to where the player is facing: 0 is dead
   * ahead, positive is to the right, matching the CSS rotation direction.
   */
  bearingTo(playerPosition: Vector3, playerYaw: number, source: Vector3): number {
    const dx = source.x - playerPosition.x;
    const dz = source.z - playerPosition.z;
    const forwardX = -Math.sin(playerYaw);
    const forwardZ = -Math.cos(playerYaw);
    const rightX = Math.cos(playerYaw);
    const rightZ = -Math.sin(playerYaw);
    return Math.atan2(dx * rightX + dz * rightZ, dx * forwardX + dz * forwardZ);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'block' : 'none';
  }

  clear(): void {
    for (const a of this.#liveArrows) a.el.remove();
    this.#liveArrows.length = 0;
    for (const t of this.#liveToasts) t.el.remove();
    this.#liveToasts.length = 0;
    this.#subtitle.classList.remove('subtitle--visible');
    this.setPrompt(null);
  }
}
