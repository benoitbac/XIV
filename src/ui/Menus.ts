import type { Game } from '../Game.ts';
import { audio } from '../core/Audio.ts';
import { DOCUMENTS, MEMORIES, TITLE_CARD, EPILOGUE_LINES } from '../story/story.ts';
import { DEFAULT_SETTINGS, type Settings } from '../core/Save.ts';

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Title, pause, codex, death and end-of-chapter screens. All of it is laid out
 * like the inside cover of an album — plates, captions, a page you turn.
 */
export class Menus {
  readonly root: HTMLDivElement;
  readonly #game: Game;
  readonly #screens = new Map<string, HTMLDivElement>();
  #current: string | null = null;

  constructor(game: Game, parent: HTMLElement) {
    this.#game = game;
    this.root = el('div', 'menus');
    parent.appendChild(this.root);

    this.#buildTitle();
    this.#buildPause();
    this.#buildSettings();
    this.#buildCodex();
    this.#buildDeath();
    this.#buildComplete();

    game.onStateChange.on((state) => {
      switch (state) {
        case 'title':
          this.show('title');
          break;
        case 'playing':
          this.hide();
          break;
        case 'paused':
          this.show('pause');
          break;
        case 'dead':
          this.show('death');
          break;
        case 'complete':
          this.#refreshComplete();
          this.show('complete');
          break;
      }
    });

    game.input.onAction.on((action) => {
      if (action !== 'pause') return;
      if (this.#game.state === 'playing') this.#game.setState('paused');
      else if (this.#game.state === 'paused') this.#game.setState('playing');
    });

    game.onCodexEntry.on(() => this.#refreshCodex());

    // The game is already in its initial state by the time we subscribe, so
    // draw that state now rather than waiting for a transition that won't come.
    if (game.state === 'title') this.show('title');
  }

  show(name: string): void {
    this.hide();
    const screen = this.#screens.get(name);
    if (!screen) return;
    screen.classList.add('screen--visible');
    this.root.classList.add('menus--visible');
    this.#current = name;
    if (name === 'codex') this.#refreshCodex();
  }

  hide(): void {
    if (this.#current) this.#screens.get(this.#current)?.classList.remove('screen--visible');
    this.root.classList.remove('menus--visible');
    this.#current = null;
  }

  #register(name: string, screen: HTMLDivElement): void {
    screen.classList.add('screen');
    this.root.appendChild(screen);
    this.#screens.set(name, screen);
  }

  #button(label: string, onClick: () => void, variant = ''): HTMLButtonElement {
    const b = el('button', `btn ${variant}`.trim(), label);
    b.addEventListener('click', () => {
      audio.unlock();
      audio.play('ui-click');
      onClick();
    });
    return b;
  }

  // ---------------------------------------------------------------------------

  #buildTitle(): void {
    const screen = el('div', 'screen--title');
    screen.innerHTML = `
      <div class="cover">
        <div class="cover__numeral">XIV</div>
        <div class="cover__rule"></div>
        <h1 class="cover__title">Le Quatorzième Jour</h1>
        <p class="cover__blurb">
          Quatorze jours après l’assassinat de la Chancelière Kessler, un homme se réveille
          dans l’épave d’une cabine de téléphérique. Pas de nom. Pas de souvenirs.
          Un chiffre tatoué sous la clavicule&nbsp;: <strong>XIV</strong>.
        </p>
        <div class="cover__plate">
          <span>${TITLE_CARD.chapter}</span>
          <span>${TITLE_CARD.title}</span>
          <span>${TITLE_CARD.place}</span>
        </div>
      </div>
      <div class="cover__actions"></div>
      <div class="cover__keys">
        <span><kbd>ZQSD</kbd>/<kbd>WASD</kbd> se déplacer</span>
        <span><kbd>Maj</kbd> courir</span>
        <span><kbd>Ctrl</kbd> s’accroupir</span>
        <span><kbd>Clic&nbsp;D</kbd> viser</span>
        <span><kbd>R</kbd> recharger</span>
        <span><kbd>E</kbd> interagir</span>
        <span><kbd>F</kbd> corps-à-corps</span>
        <span><kbd>A</kbd> se pencher</span>
        <span><kbd>Échap</kbd> pause</span>
      </div>
    `;
    const actions = screen.querySelector('.cover__actions')!;
    actions.append(
      this.#button(
        'Commencer le chapitre un',
        () => {
          this.#game.loadLevel();
          this.#game.setState('playing');
        },
        'btn--primary',
      ),
      this.#button('Réglages', () => this.show('settings')),
      this.#button('Carnet', () => this.show('codex')),
    );
    this.#register('title', screen);
  }

  #buildPause(): void {
    const screen = el('div', 'screen--pause');
    screen.innerHTML = `<h2 class="screen__heading">Pause</h2>
      <p class="screen__sub">La page est retournée. Rien ne bouge.</p>
      <div class="screen__actions"></div>`;
    const actions = screen.querySelector('.screen__actions')!;
    actions.append(
      this.#button('Reprendre', () => this.#game.setState('playing'), 'btn--primary'),
      this.#button('Carnet', () => this.show('codex')),
      this.#button('Réglages', () => this.show('settings')),
      this.#button('Recommencer le chapitre', () => this.#game.restart()),
      this.#button(
        'Quitter au titre',
        () => {
          this.#game.unload();
          this.#game.setState('title');
        },
        'btn--ghost',
      ),
    );
    this.#register('pause', screen);
  }

  #buildSettings(): void {
    const screen = el('div', 'screen--settings');
    screen.innerHTML = `<h2 class="screen__heading">Réglages</h2><div class="settings"></div>
      <div class="screen__actions"></div>`;
    const list = screen.querySelector('.settings')!;

    const slider = (
      label: string,
      key: keyof Settings,
      min: number,
      max: number,
      step: number,
      format: (v: number) => string,
    ): void => {
      const row = el('label', 'setting');
      row.append(el('span', 'setting__label', label));
      const input = el('input', 'setting__range');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(this.#game.settings[key]);
      const value = el('span', 'setting__value', format(Number(input.value)));
      input.addEventListener('input', () => {
        const v = Number(input.value);
        value.textContent = format(v);
        this.#game.applySettings({ ...this.#game.settings, [key]: v });
      });
      row.append(input, value);
      list.appendChild(row);
    };

    const toggle = (label: string, key: keyof Settings): void => {
      const row = el('label', 'setting setting--toggle');
      row.append(el('span', 'setting__label', label));
      const input = el('input', 'setting__check');
      input.type = 'checkbox';
      input.checked = Boolean(this.#game.settings[key]);
      input.addEventListener('change', () => {
        this.#game.applySettings({ ...this.#game.settings, [key]: input.checked });
      });
      row.append(input);
      list.appendChild(row);
    };

    slider('Sensibilité', 'sensitivity', 0.0006, 0.006, 0.0001, (v) => (v * 1000).toFixed(1));
    slider('Champ de vision', 'fov', 60, 100, 1, (v) => `${v.toFixed(0)}°`);
    slider('Volume général', 'masterVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    slider('Effets', 'sfxVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    slider('Ambiance', 'musicVolume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`);
    slider('Tremblement du trait', 'inkBoil', 0, 1.6, 0.05, (v) => v.toFixed(2));
    slider('Trame de demi-teintes', 'halftone', 0, 1, 0.05, (v) => v.toFixed(2));
    slider('Résolution', 'renderScale', 0.6, 1.4, 0.05, (v) => `${Math.round(v * 100)}%`);
    toggle('Inverser l’axe vertical', 'invertY');
    toggle('Vignettes BD', 'showPanels');
    toggle('Onomatopées', 'showOnomatopoeia');

    const diff = el('div', 'setting setting--choice');
    diff.append(el('span', 'setting__label', 'Difficulté'));
    const group = el('div', 'choices');
    for (const [key, label] of [
      ['recruit', 'Recrue'],
      ['agent', 'Agent'],
      ['conspirator', 'Conspirateur'],
    ] as const) {
      const b = el('button', 'choice', label);
      b.addEventListener('click', () => {
        this.#game.applySettings({ ...this.#game.settings, difficulty: key });
        for (const child of group.children) child.classList.remove('choice--on');
        b.classList.add('choice--on');
        audio.play('ui-click');
      });
      if (this.#game.settings.difficulty === key) b.classList.add('choice--on');
      group.appendChild(b);
    }
    diff.append(group);
    list.appendChild(diff);

    const actions = screen.querySelector('.screen__actions')!;
    actions.append(
      this.#button('Retour', () => this.show(this.#game.state === 'paused' ? 'pause' : 'title')),
      this.#button(
        'Valeurs par défaut',
        () => {
          this.#game.applySettings({ ...DEFAULT_SETTINGS });
          // Rebuild so every control reflects the reset values.
          this.#screens.get('settings')?.remove();
          this.#screens.delete('settings');
          this.#buildSettings();
          this.show('settings');
        },
        'btn--ghost',
      ),
    );
    this.#register('settings', screen);
  }

  #buildCodex(): void {
    const screen = el('div', 'screen--codex');
    screen.innerHTML = `<h2 class="screen__heading">Carnet du Quatorzième</h2>
      <p class="screen__sub">Ce que tu as retrouvé. Ce qu’il manque encore.</p>
      <div class="codex"></div>
      <div class="screen__actions"></div>`;
    const actions = screen.querySelector('.screen__actions')!;
    actions.append(
      this.#button('Retour', () => this.show(this.#game.state === 'paused' ? 'pause' : 'title')),
    );
    this.#register('codex', screen);
  }

  #refreshCodex(): void {
    const screen = this.#screens.get('codex');
    const list = screen?.querySelector('.codex');
    if (!list) return;
    list.replaceChildren();

    const memories = el('div', 'codex__column');
    memories.append(
      el(
        'h3',
        'codex__heading',
        `Souvenirs — ${this.#game.memoriesFound.size}/${Object.keys(MEMORIES).length}`,
      ),
    );
    for (const memory of Object.values(MEMORIES)) {
      const found = this.#game.memoriesFound.has(memory.id);
      const card = el('article', `codex__card ${found ? '' : 'codex__card--locked'}`.trim());
      card.append(el('div', 'codex__plate', `Planche ${memory.plate}`));
      card.append(el('h4', 'codex__title', found ? memory.title : '— — —'));
      if (found) {
        for (const line of memory.lines) card.append(el('p', 'codex__line', line));
      } else {
        card.append(el('p', 'codex__line codex__line--locked', 'Pas encore revenu.'));
      }
      memories.append(card);
    }

    const documents = el('div', 'codex__column');
    documents.append(
      el(
        'h3',
        'codex__heading',
        `Documents — ${this.#game.documentsFound.size}/${Object.keys(DOCUMENTS).length}`,
      ),
    );
    for (const doc of Object.values(DOCUMENTS)) {
      const found = this.#game.documentsFound.has(doc.id);
      const card = el('article', `codex__card ${found ? '' : 'codex__card--locked'}`.trim());
      card.append(el('h4', 'codex__title', found ? doc.title : '— — —'));
      card.append(el('div', 'codex__source', found ? doc.source : 'Non retrouvé'));
      if (found) for (const line of doc.body) card.append(el('p', 'codex__line', line));
      documents.append(card);
    }

    list.append(memories, documents);
  }

  #buildDeath(): void {
    const screen = el('div', 'screen--death');
    screen.innerHTML = `
      <div class="death">
        <div class="death__numeral">XIV</div>
        <h2 class="death__title">Fin de la planche</h2>
        <p class="death__line">Le Conclave rature une case. Il en reste treize.</p>
      </div>
      <div class="screen__actions"></div>`;
    const actions = screen.querySelector('.screen__actions')!;
    actions.append(
      this.#button('Reprendre au début du chapitre', () => this.#game.restart(), 'btn--primary'),
      this.#button(
        'Quitter au titre',
        () => {
          this.#game.unload();
          this.#game.setState('title');
        },
        'btn--ghost',
      ),
    );
    this.#register('death', screen);
  }

  #buildComplete(): void {
    const screen = el('div', 'screen--complete');
    screen.innerHTML = `
      <div class="epilogue">
        <div class="epilogue__chapter">FIN DU CHAPITRE UN</div>
        <h2 class="epilogue__title">Le Téléphérique</h2>
        <div class="epilogue__lines"></div>
        <div class="epilogue__stats"></div>
        <p class="epilogue__next">Chapitre deux — <em>Casier 14</em> — à venir.</p>
      </div>
      <div class="screen__actions"></div>`;
    const lines = screen.querySelector('.epilogue__lines')!;
    for (const line of EPILOGUE_LINES) lines.append(el('p', 'epilogue__line', line));

    const actions = screen.querySelector('.screen__actions')!;
    actions.append(
      this.#button('Rejouer le chapitre', () => this.#game.restart(), 'btn--primary'),
      this.#button('Carnet', () => this.show('codex')),
      this.#button(
        'Titre',
        () => {
          this.#game.unload();
          this.#game.setState('title');
        },
        'btn--ghost',
      ),
    );
    this.#register('complete', screen);
  }

  #refreshComplete(): void {
    const box = this.#screens.get('complete')?.querySelector('.epilogue__stats');
    if (!box) return;
    const s = this.#game.stats;
    const minutes = Math.floor(s.seconds / 60);
    const seconds = Math.floor(s.seconds % 60);
    box.replaceChildren();
    const rows: Array<[string, string]> = [
      ['Temps', `${minutes}′${seconds.toString().padStart(2, '0')}″`],
      ['Neutralisés', String(s.kills)],
      ['En pleine tête', String(s.headshots)],
      ['Alertes données', String(s.alarms)],
      ['Souvenirs', `${s.memories}/${Object.keys(MEMORIES).length}`],
      ['Documents', `${s.documents}/${Object.keys(DOCUMENTS).length}`],
    ];
    for (const [label, value] of rows) {
      const row = el('div', 'stat');
      row.append(el('span', 'stat__label', label), el('span', 'stat__value', value));
      box.append(row);
    }
  }
}
