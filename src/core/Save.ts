const STORAGE_KEY = 'xiv.save.v1';
const SETTINGS_KEY = 'xiv.settings.v1';

export interface SaveSlot {
  version: 1;
  levelId: string;
  /** Checkpoint identifier inside the level. */
  checkpoint: string;
  health: number;
  armour: number;
  /** ammoInMag / reserve, keyed by weapon id. */
  ammo: Record<string, { mag: number; reserve: number }>;
  weapons: string[];
  currentWeapon: string;
  objectivesDone: string[];
  memoriesFound: string[];
  documentsFound: string[];
  kills: number;
  headshots: number;
  alarmsRaised: number;
  playSeconds: number;
  savedAt: string;
}

export interface Settings {
  sensitivity: number;
  invertY: boolean;
  fov: number;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  /** Comic ink strength; some players find the boil distracting. */
  inkBoil: number;
  halftone: number;
  showPanels: boolean;
  showOnomatopoeia: boolean;
  difficulty: 'recruit' | 'agent' | 'conspirator';
  language: 'fr' | 'en';
  renderScale: number;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 0.0022,
  invertY: false,
  fov: 72,
  masterVolume: 0.8,
  sfxVolume: 1,
  musicVolume: 0.5,
  inkBoil: 0.85,
  halftone: 0.55,
  showPanels: true,
  showOnomatopoeia: true,
  difficulty: 'agent',
  language: 'fr',
  renderScale: 1,
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Private-browsing modes throw on localStorage; the game must still run.
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const saves = {
  load(): SaveSlot | null {
    const slot = read<SaveSlot>(STORAGE_KEY);
    return slot && slot.version === 1 ? slot : null;
  },
  store(slot: SaveSlot): boolean {
    return write(STORAGE_KEY, slot);
  },
  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};

export const settings = {
  load(): Settings {
    return { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
  },
  store(value: Settings): boolean {
    return write(SETTINGS_KEY, value);
  },
};
