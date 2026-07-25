import { Signal } from './signal.ts';

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'crouch'
  | 'sprint'
  | 'fire'
  | 'aim'
  | 'reload'
  | 'use'
  | 'melee'
  | 'lean-left'
  | 'lean-right'
  | 'weapon-next'
  | 'weapon-prev'
  | 'flashback'
  | 'pause';

/** `event.code` values, so the bindings survive AZERTY/QWERTY. */
export const DEFAULT_BINDINGS: Record<string, Action> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  ControlLeft: 'crouch',
  KeyC: 'crouch',
  ShiftLeft: 'sprint',
  KeyR: 'reload',
  KeyE: 'use',
  KeyF: 'melee',
  KeyQ: 'lean-left',
  KeyZ: 'flashback',
  Digit1: 'weapon-prev',
  Digit2: 'weapon-next',
  Escape: 'pause',
};

export const MOUSE_BINDINGS: Record<number, Action> = {
  0: 'fire',
  2: 'aim',
};

interface ActionState {
  down: boolean;
  /** Frames-since-press latch, consumed by `pressed()`. */
  pressedThisTick: boolean;
  releasedThisTick: boolean;
}

export class Input {
  readonly onPointerLockChange = new Signal<boolean>();
  readonly onAction = new Signal<Action>();

  /** Accumulated pointer delta since the last `endFrame()`, in raw device units. */
  mouseDX = 0;
  mouseDY = 0;
  wheelDelta = 0;
  sensitivity = 0.0022;
  invertY = false;

  #states = new Map<Action, ActionState>();
  #bindings = { ...DEFAULT_BINDINGS };
  #element: HTMLElement;
  #locked = false;
  #detachers: Array<() => void> = [];

  constructor(element: HTMLElement) {
    this.#element = element;
    this.#attach();
  }

  get locked(): boolean {
    return this.#locked;
  }

  #state(action: Action): ActionState {
    let s = this.#states.get(action);
    if (!s) {
      s = { down: false, pressedThisTick: false, releasedThisTick: false };
      this.#states.set(action, s);
    }
    return s;
  }

  #set(action: Action, down: boolean): void {
    const s = this.#state(action);
    if (s.down === down) return;
    s.down = down;
    if (down) {
      s.pressedThisTick = true;
      this.onAction.emit(action);
    } else {
      s.releasedThisTick = true;
    }
  }

  #attach(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = this.#bindings[e.code];
      if (!action) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.#set(action, true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const action = this.#bindings[e.code];
      if (action) this.#set(action, false);
    };
    const onMouseDown = (e: MouseEvent) => {
      const action = MOUSE_BINDINGS[e.button];
      if (action && this.#locked) this.#set(action, true);
    };
    const onMouseUp = (e: MouseEvent) => {
      const action = MOUSE_BINDINGS[e.button];
      if (action) this.#set(action, false);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!this.#locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    };
    const onWheel = (e: WheelEvent) => {
      if (!this.#locked) return;
      e.preventDefault();
      this.wheelDelta += Math.sign(e.deltaY);
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onPointerLockChange = () => {
      this.#locked = document.pointerLockElement === this.#element;
      if (!this.#locked) this.releaseAll();
      this.onPointerLockChange.emit(this.#locked);
    };
    // Alt-tabbing mid-sprint must not leave the key stuck down.
    const onBlur = () => this.releaseAll();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', onBlur);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    this.#detachers = [
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('mousedown', onMouseDown),
      () => window.removeEventListener('mouseup', onMouseUp),
      () => window.removeEventListener('mousemove', onMouseMove),
      () => window.removeEventListener('wheel', onWheel),
      () => window.removeEventListener('contextmenu', onContextMenu),
      () => window.removeEventListener('blur', onBlur),
      () => document.removeEventListener('pointerlockchange', onPointerLockChange),
    ];
  }

  requestLock(): void {
    void this.#element.requestPointerLock();
  }

  exitLock(): void {
    if (document.pointerLockElement === this.#element) document.exitPointerLock();
  }

  held(action: Action): boolean {
    return this.#state(action).down;
  }

  pressed(action: Action): boolean {
    return this.#state(action).pressedThisTick;
  }

  released(action: Action): boolean {
    return this.#state(action).releasedThisTick;
  }

  /** Signed movement axes in local space: x = strafe, y = forward. */
  moveAxis(out: { x: number; y: number }): void {
    out.x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    out.y = (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0);
    const len = Math.hypot(out.x, out.y);
    if (len > 1) {
      out.x /= len;
      out.y /= len;
    }
  }

  lookDelta(out: { yaw: number; pitch: number }): void {
    out.yaw = -this.mouseDX * this.sensitivity;
    out.pitch = (this.invertY ? this.mouseDY : -this.mouseDY) * this.sensitivity;
  }

  releaseAll(): void {
    for (const [action, s] of this.#states) {
      if (s.down) this.#set(action, false);
    }
  }

  /** Call once at the end of every tick to clear edge-triggered latches. */
  endFrame(): void {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    for (const s of this.#states.values()) {
      s.pressedThisTick = false;
      s.releasedThisTick = false;
    }
  }

  rebind(code: string, action: Action): void {
    this.#bindings[code] = action;
  }

  get bindings(): Readonly<Record<string, Action>> {
    return this.#bindings;
  }

  dispose(): void {
    for (const d of this.#detachers) d();
    this.#detachers = [];
    this.onAction.clear();
    this.onPointerLockChange.clear();
  }
}
