import { Box3, Vector3 } from 'three';
import { Stage } from './render/Stage.ts';
import { Input } from './core/Input.ts';
import { Loop } from './core/Loop.ts';
import { audio } from './core/Audio.ts';
import { Signal } from './core/signal.ts';
import { clamp, pick, randRange } from './core/mathx.ts';
import { Player } from './player/Player.ts';
import { WEAPONS, type WeaponId } from './player/weapons.ts';
import { Enemy, ARCHETYPES, type BodyPart } from './ai/Enemy.ts';
import { Effects } from './fx/Effects.ts';
import { Hud, type AlertLevel } from './ui/Hud.ts';
import { ComicPanels, framingShot } from './ui/ComicPanels.ts';
import { Onomatopoeia } from './ui/Onomatopoeia.ts';
import { LevelBuilder, type LevelDefinition, type Pickup } from './world/Level.ts';
import type { Surface } from './world/Collision.ts';
import { LEVEL_01 } from './world/levels/level01.ts';
import {
  DOCUMENTS,
  LEVEL01_BEATS,
  LEVEL01_OBJECTIVES,
  MEMORIES,
  type Beat,
} from './story/story.ts';
import { DEFAULT_SETTINGS, saves, settings as settingsStore, type Settings } from './core/Save.ts';

export type GameState = 'title' | 'playing' | 'paused' | 'dead' | 'complete';

const DIFFICULTY = {
  recruit: { damageTaken: 0.55, aimError: 1.5, healthPickup: 1.3 },
  agent: { damageTaken: 1, aimError: 1, healthPickup: 1 },
  conspirator: { damageTaken: 1.7, aimError: 0.68, healthPickup: 0.75 },
} as const;

const STEP_SOUND: Record<Surface, 'step-snow' | 'step-wood' | 'step-metal'> = {
  snow: 'step-snow',
  wood: 'step-wood',
  metal: 'step-metal',
  concrete: 'step-wood',
  glass: 'step-metal',
  flesh: 'step-snow',
};

const IMPACT_SOUND = {
  snow: 'impact-snow',
  wood: 'impact-wood',
  metal: 'impact-metal',
  concrete: 'impact-concrete',
  glass: 'impact-metal',
  flesh: 'impact-flesh',
} as const;

export interface RunStats {
  kills: number;
  headshots: number;
  alarms: number;
  memories: number;
  documents: number;
  seconds: number;
}

/**
 * The orchestrator: owns the level, the player, the guards and every system
 * that has to see all three at once — hit resolution, alert propagation, story
 * beats, and the comic panels that punctuate them.
 */
export class Game {
  readonly stage: Stage;
  readonly input: Input;
  readonly hud: Hud;
  readonly panels: ComicPanels;
  readonly words: Onomatopoeia;
  readonly loop: Loop;

  readonly onStateChange = new Signal<GameState>();
  readonly onCodexEntry = new Signal<{ kind: 'memory' | 'document'; id: string }>();
  readonly onChapterComplete = new Signal<RunStats>();

  settings: Settings = { ...DEFAULT_SETTINGS };

  #state: GameState = 'title';
  #level: LevelBuilder | null = null;
  #definition: LevelDefinition = LEVEL_01;
  #player: Player | null = null;
  #effects: Effects | null = null;
  readonly #enemies: Enemy[] = [];
  readonly #squads = new Map<string, Enemy[]>();

  #objective: string | null = null;
  #objectiveAge = 0;
  #hintShown = false;
  readonly #objectivesDone = new Set<string>();
  readonly #memories = new Set<string>();
  readonly #documents = new Set<string>();
  #stats: RunStats = { kills: 0, headshots: 0, alarms: 0, memories: 0, documents: 0, seconds: 0 };

  #beatQueue: Beat[] = [];
  #beatTimer = 0;
  #alert: AlertLevel = 'calm';
  #alertCooldown = 0;
  #powerOn = false;
  #hitFeedbackTimer = 0;
  #panelCooldown = 0;

  readonly #canvas: HTMLCanvasElement;
  readonly #overlayRoot: HTMLElement;
  readonly #tmpA = new Vector3();
  readonly #tmpB = new Vector3();
  readonly #playerBox = new Box3();
  /** Last position the player was standing on solid ground. */
  readonly #lastFooting = new Vector3();

  constructor(canvas: HTMLCanvasElement, overlayRoot: HTMLElement) {
    this.#canvas = canvas;
    this.#overlayRoot = overlayRoot;

    this.stage = new Stage(canvas);
    this.input = new Input(canvas);
    this.hud = new Hud(overlayRoot);
    this.panels = new ComicPanels(this.stage, overlayRoot);
    this.words = new Onomatopoeia(overlayRoot);
    this.loop = new Loop((dt) => this.#tick(dt));

    this.settings = settingsStore.load();
    this.applySettings(this.settings);

    this.input.onPointerLockChange.on((locked) => {
      if (!locked && this.#state === 'playing') this.setState('paused');
    });

    window.addEventListener('resize', () => this.#resize());
    this.#resize();
    this.hud.setVisible(false);
  }

  get state(): GameState {
    return this.#state;
  }

  get player(): Player | null {
    return this.#player;
  }

  get stats(): RunStats {
    return this.#stats;
  }

  get memoriesFound(): ReadonlySet<string> {
    return this.#memories;
  }

  get documentsFound(): ReadonlySet<string> {
    return this.#documents;
  }

  applySettings(next: Settings): void {
    this.settings = next;
    settingsStore.store(next);

    this.input.sensitivity = next.sensitivity;
    this.input.invertY = next.invertY;

    audio.setVolume('master', next.masterVolume);
    audio.setVolume('sfx', next.sfxVolume);
    audio.setVolume('music', next.musicVolume);

    this.stage.applyComic({ boil: next.inkBoil, halftone: next.halftone });
    this.panels.enabled = next.showPanels;
    this.words.enabled = next.showOnomatopoeia;

    if (this.#player) {
      this.#player.baseFov = next.fov;
      this.#player.damageTaken = DIFFICULTY[next.difficulty].damageTaken;
    }
    for (const e of this.#enemies) e.aimError = DIFFICULTY[next.difficulty].aimError;

    this.#resize();
  }

  #resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio, 2) * (this.settings?.renderScale ?? 1);
    this.stage.setSize(width, height, Math.max(0.5, ratio));
  }

  setState(state: GameState): void {
    if (this.#state === state) return;
    this.#state = state;
    if (state === 'playing') {
      audio.unlock();
      if (!this.input.locked) this.input.requestLock();
      this.hud.setVisible(true);
      audio.setWind(this.#definition.windIntensity);
    } else {
      this.input.releaseAll();
      if (state !== 'paused') this.hud.setVisible(false);
      if (state === 'title') audio.stopWind();
    }
    this.onStateChange.emit(state);
  }

  // -------------------------------------------------------------------------
  // Level lifecycle
  // -------------------------------------------------------------------------

  loadLevel(definition: LevelDefinition = LEVEL_01): void {
    this.unload();
    this.#definition = definition;

    const builder = new LevelBuilder(1414);
    definition.build(builder);
    this.#level = builder;
    this.stage.scene.add(builder.root);
    this.stage.applySky(definition.sky);

    const player = new Player(builder.world, this.stage.camera);
    player.baseFov = this.settings.fov;
    player.damageTaken = DIFFICULTY[this.settings.difficulty].damageTaken;
    player.spawn(definition.spawn.position.clone(), definition.spawn.yaw);
    this.#lastFooting.copy(definition.spawn.position);
    this.#player = player;

    const effects = new Effects(builder.world);
    this.stage.scene.add(effects.group);
    effects.attachMuzzleTo(player.viewModel.root);
    this.#effects = effects;

    this.#wirePlayer(player, effects);

    for (const spawn of builder.enemies) {
      const archetype = ARCHETYPES[spawn.archetype] ?? ARCHETYPES.trooper!;
      const enemy = new Enemy(builder.world, archetype);
      enemy.patrol = spawn.patrol.map((p) => p.clone());
      enemy.aimError = DIFFICULTY[this.settings.difficulty].aimError;
      enemy.spawn(spawn.position.clone(), spawn.yaw);
      this.stage.scene.add(enemy.group);
      this.#enemies.push(enemy);
      this.#wireEnemy(enemy);

      if (spawn.squad) {
        const squad = this.#squads.get(spawn.squad) ?? [];
        squad.push(enemy);
        this.#squads.set(spawn.squad, squad);
      }
    }

    this.#stats = { kills: 0, headshots: 0, alarms: 0, memories: 0, documents: 0, seconds: 0 };
    this.#objectivesDone.clear();
    this.#memories.clear();
    this.#documents.clear();
    this.#powerOn = false;
    this.#alert = 'calm';
    this.hud.setAlert('calm');
    this.hud.clear();
    this.panels.clear();
    this.words.clear();

    this.#setObjective('out-of-car');
    this.#refreshHud();

    if (!this.loop.running) this.loop.start();
  }

  unload(): void {
    for (const e of this.#enemies) {
      this.stage.scene.remove(e.group);
      e.dispose();
    }
    this.#enemies.length = 0;
    this.#squads.clear();

    if (this.#effects) {
      this.stage.scene.remove(this.#effects.group);
      this.#effects = null;
    }
    if (this.#level) {
      this.stage.scene.remove(this.#level.root);
      this.#level.dispose();
      this.#level = null;
    }
    this.#player = null;
    this.#beatQueue = [];
  }

  restart(): void {
    this.loadLevel(this.#definition);
    this.setState('playing');
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------

  #wirePlayer(player: Player, effects: Effects): void {
    player.onShot.on(({ origin, direction, weapon, pelletIndex }) => {
      if (pelletIndex === 0) {
        audio.play(weapon.sound);
        effects.muzzleFlash(player.viewModel.muzzleLocal);
        if (weapon.noiseRadius > 12) {
          this.words.spawn({
            text: pick(weapon.onomatopoeia),
            position: this.#muzzleWorld(player),
            tone: weapon.pellets > 1 ? 'heavy' : 'shot',
            scale: weapon.pellets > 1 ? 1.35 : 1,
          });
        } else {
          this.words.spawn({
            text: pick(weapon.onomatopoeia),
            position: this.#muzzleWorld(player),
            tone: 'quiet',
            scale: 0.75,
            duration: 0.6,
          });
        }
      }
      this.#resolveShot(origin, direction, weapon.range, weapon.damage, true, weapon.id);
    });

    player.onMelee.on(({ origin, direction, damage }) => {
      audio.play('melee-swing');
      const hit = this.#resolveShot(origin, direction, 2.1, damage, true, 'fists', true);
      if (hit) audio.play('melee-hit');
    });

    player.onNoise.on(({ position, radius }) => {
      for (const e of this.#enemies) e.hearNoise(position, radius);
    });

    player.onFootstep.on(({ surface, position }) => {
      audio.play(STEP_SOUND[surface], { position, volume: 0.6 });
    });

    player.onLanded.on(({ force }) => {
      audio.play('land', { volume: clamp(force / 12, 0.3, 1) });
    });

    player.onShellEjected.on(({ position, direction }) => {
      effects.ejectShell(position, direction);
      audio.play('shell', { position, volume: 0.5 });
    });

    player.onReloadStarted.on(() => {
      audio.play('reload-out', { volume: 0.7 });
      window.setTimeout(() => audio.play('reload-in', { volume: 0.7 }), 520);
    });

    player.onDryFire.on(() => audio.play('dryfire'));

    player.onWeaponChanged.on((id) => {
      audio.play('slide', { volume: 0.5 });
      this.#refreshHud();
      void id;
    });

    player.onDamaged.on(({ amount, from }) => {
      audio.play('hurt', { volume: clamp(amount / 20, 0.3, 1) });
      if (from) {
        this.hud.damageFrom(
          this.hud.bearingTo(player.position, player.yaw, from),
          clamp(amount / 30, 0.15, 0.9),
        );
      }
    });

    player.onDied.on(() => {
      audio.play('death');
      this.#showPanel({
        subject: player.position.clone().setY(player.position.y + 1.2),
        from: player.position.clone().add(new Vector3(2, 2, 2)),
        caption: 'Quatorze jours. C’est tout ce que ça aura duré.',
        tone: 'danger',
        duration: 5,
        force: true,
      });
      this.setState('dead');
    });
  }

  #wireEnemy(enemy: Enemy): void {
    enemy.onShoot.on(({ origin, direction, damage, enemy: shooter }) => {
      audio.play('rifle', { position: origin, volume: 0.75 });
      this.#effects?.tracer(origin, origin.clone().addScaledVector(direction, 60), 0x2a2622, 0.05);
      this.#resolveEnemyShot(origin, direction, damage, shooter);
    });

    enemy.onAlerted.on((e) => {
      audio.play('alert', { position: e.position, volume: 0.9 });
      this.#stats.alarms++;
      this.#raiseAlert('hunting');
      // Everyone in the squad converges — a shout carries.
      const player = this.#player;
      if (!player) return;
      for (const [, squad] of this.#squads) {
        if (!squad.includes(e)) continue;
        for (const mate of squad) {
          if (mate !== e) mate.alertTo(player.position);
        }
      }
      this.#showPanel({
        subject: e.position.clone().setY(e.position.y + 1.5),
        from: player.position,
        caption: `${e.archetype.name} — « Il est là ! »`,
        tone: 'danger',
        duration: 2.2,
      });
    });

    enemy.onKilled.on(({ enemy: dead, part }) => {
      audio.play('death', { position: dead.position, volume: 0.8 });
      this.#stats.kills++;
      if (part === 'head') this.#stats.headshots++;

      this.words.spawn({
        text: part === 'head' ? pick(['CRAAC', 'TCHOK']) : pick(['AAARGH', 'UGH', 'HRRK']),
        position: dead.position.clone().setY(dead.position.y + 1.5),
        tone: 'pain',
        scale: part === 'head' ? 1.3 : 1,
      });

      const player = this.#player;
      if (player) {
        this.#showPanel({
          subject: dead.position.clone().setY(dead.position.y + 1.0),
          from: player.position,
          caption: part === 'head' ? 'En pleine tête.' : undefined,
          tone: 'kill',
          duration: part === 'head' ? 2.8 : 2.1,
        });
      }
      this.hud.hitMarker(true);
    });

    enemy.onFootstep.on(({ surface, position }) => {
      audio.play(STEP_SOUND[surface], { position, volume: 0.35 });
    });
  }

  #muzzleWorld(player: Player): Vector3 {
    return player.viewModel.root.localToWorld(player.viewModel.muzzleLocal.clone());
  }

  // -------------------------------------------------------------------------
  // Hit resolution
  // -------------------------------------------------------------------------

  #resolveShot(
    origin: Vector3,
    direction: Vector3,
    range: number,
    damage: number,
    fromPlayer: boolean,
    weapon: WeaponId,
    melee = false,
  ): boolean {
    const level = this.#level;
    const effects = this.#effects;
    if (!level || !effects) return false;

    const worldHit = level.world.raycast(origin, direction, range);
    let nearestEnemy: Enemy | null = null;
    let nearestHit: { part: BodyPart; point: Vector3; distance: number } | null = null;

    for (const enemy of this.#enemies) {
      const hit = enemy.raycast(origin, direction, range);
      if (!hit) continue;
      if (nearestHit && hit.distance >= nearestHit.distance) continue;
      nearestHit = hit;
      nearestEnemy = enemy;
    }

    // A wall in front of the guard stops the bullet.
    const hitsEnemy =
      nearestHit !== null && (worldHit === null || nearestHit.distance < worldHit.distance);

    if (!melee) {
      const end = hitsEnemy
        ? nearestHit!.point
        : worldHit
          ? worldHit.point
          : this.#tmpA.copy(origin).addScaledVector(direction, range).clone();
      // Tracers start at the muzzle, not the eye, or they read as laser beams.
      const start = fromPlayer && this.#player ? this.#muzzleWorld(this.#player) : origin;
      effects.tracer(start, end, fromPlayer ? 0x2a2622 : 0x5a4a3a, 0.045);
    }

    if (hitsEnemy && nearestEnemy && nearestHit) {
      const killed = nearestEnemy.damage(damage, nearestHit.part, origin.clone());
      effects.impact(nearestHit.point, direction.clone().negate(), 'flesh');
      effects.bloodBurst(nearestHit.point, direction.clone().multiplyScalar(0.6));
      audio.play(IMPACT_SOUND.flesh, { position: nearestHit.point, volume: 0.8 });

      if (!killed) {
        this.hud.hitMarker(false);
        if (this.#hitFeedbackTimer <= 0) {
          this.#hitFeedbackTimer = 0.22;
          this.words.spawn({
            text: nearestHit.part === 'head' ? 'TCHOK' : pick(['TAP', 'THUD', 'PAF']),
            position: nearestHit.point.clone(),
            tone: 'impact',
            scale: 0.7,
            duration: 0.55,
          });
        }
      }
      return true;
    }

    if (worldHit) {
      effects.impact(worldHit.point, worldHit.normal, worldHit.surface);
      audio.play(IMPACT_SOUND[worldHit.surface], { position: worldHit.point, volume: 0.6 });
      if (worldHit.surface === 'metal' && Math.random() < 0.4) {
        audio.play('ricochet', { position: worldHit.point, volume: 0.5 });
      }
      // Rounds hitting cover give away where you are.
      if (fromPlayer && WEAPONS[weapon].noiseRadius > 12) {
        for (const e of this.#enemies) e.hearNoise(worldHit.point, 12);
      }
      return false;
    }
    return false;
  }

  #resolveEnemyShot(origin: Vector3, direction: Vector3, damage: number, shooter: Enemy): void {
    const player = this.#player;
    const level = this.#level;
    if (!player || !level || !player.alive) return;

    const range = 90;
    const worldHit = level.world.raycast(origin, direction, range);

    // Player hitbox: the same box the character controller uses, plus the head.
    const height = player.stance === 'crouch' ? 1.15 : 1.8;
    this.#playerBox.min.set(player.position.x - 0.34, player.position.y, player.position.z - 0.34);
    this.#playerBox.max.set(
      player.position.x + 0.34,
      player.position.y + height,
      player.position.z + 0.34,
    );

    const t = rayBox(origin, direction, this.#playerBox, range);
    if (t !== null && (worldHit === null || t < worldHit.distance)) {
      const point = this.#tmpB.copy(direction).multiplyScalar(t).add(origin);
      player.applyDamage(damage, shooter.position.clone());
      this.#effects?.bloodBurst(point.clone(), direction.clone().multiplyScalar(0.4));
      this.words.spawn({
        text: pick(['TAP', 'THOK']),
        position: point.clone(),
        tone: 'pain',
        scale: 0.8,
        duration: 0.5,
      });
      return;
    }

    if (worldHit) {
      this.#effects?.impact(worldHit.point, worldHit.normal, worldHit.surface);
      audio.play(IMPACT_SOUND[worldHit.surface], { position: worldHit.point, volume: 0.5 });
      // A near miss should be felt, not just heard.
      if (worldHit.point.distanceTo(player.position) < 3) {
        player.addShake(0.16);
        this.words.spawn({
          text: pick(['ZIP', 'VZZT']),
          position: worldHit.point.clone(),
          tone: 'quiet',
          scale: 0.6,
          duration: 0.4,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Story, objectives, panels
  // -------------------------------------------------------------------------

  #setObjective(id: string): void {
    const objective = LEVEL01_OBJECTIVES[id];
    if (!objective) return;
    this.#objective = id;
    this.#objectiveAge = 0;
    this.#hintShown = false;
    this.hud.setObjective(objective.text);
    audio.play('objective', { volume: 0.6 });
  }

  /** After a while stuck on one objective, nudge — once, quietly. */
  #updateHint(dt: number): void {
    if (this.#objective === null || this.#hintShown) return;
    this.#objectiveAge += dt;
    if (this.#objectiveAge < 55) return;
    const hint = LEVEL01_OBJECTIVES[this.#objective]?.hint;
    this.#hintShown = true;
    if (hint) this.hud.toast(hint, 'objective');
  }

  #completeObjective(id: string, next?: string): void {
    if (this.#objectivesDone.has(id)) return;
    this.#objectivesDone.add(id);
    if (next) this.#setObjective(next);
  }

  #queueBeats(key: string): void {
    const beats = LEVEL01_BEATS[key];
    if (!beats) return;
    this.#beatQueue.push(...beats);
    if (this.#beatTimer <= 0) this.#beatTimer = 0;
  }

  #updateBeats(dt: number): void {
    this.#beatTimer -= dt;
    if (this.#beatTimer > 0 || this.#beatQueue.length === 0) return;
    const beat = this.#beatQueue.shift()!;
    this.hud.say(beat.text, beat.speaker, beat.seconds ?? 3.4);
    this.#beatTimer = (beat.seconds ?? 3.4) * 0.86;
  }

  #showPanel(request: {
    subject: Vector3;
    from: Vector3;
    caption?: string | undefined;
    tone?: 'ink' | 'kill' | 'danger' | 'memory' | undefined;
    duration?: number | undefined;
    memory?: boolean | undefined;
    force?: boolean | undefined;
  }): void {
    // Rate-limited: panels are punctuation. Fire one per kill in a firefight,
    // not one per bullet.
    if (!request.force && this.#panelCooldown > 0) return;
    this.#panelCooldown = request.force ? 0 : 1.1;

    const shot = framingShot(request.subject, request.from, randRange(2.2, 3.4));
    const panel: Parameters<ComicPanels['show']>[0] = {
      eye: shot.eye,
      target: shot.target,
      duration: request.duration ?? 2.4,
    };
    if (request.caption !== undefined) panel.caption = request.caption;
    if (request.tone !== undefined) panel.tone = request.tone;
    if (request.memory !== undefined) panel.memory = request.memory;

    if (this.panels.show(panel)) audio.play('panel', { volume: 0.5 });
  }

  #playMemory(id: string): void {
    const memory = MEMORIES[id];
    const player = this.#player;
    if (!memory || !player) return;

    this.#memories.add(id);
    this.#stats.memories = this.#memories.size;
    audio.play('flashback');
    this.hud.toast(`Souvenir ${memory.plate} — ${memory.title}`, 'memory');
    this.onCodexEntry.emit({ kind: 'memory', id });

    const look = player.lookDirection(this.#tmpA).clone();
    const subject = player.position
      .clone()
      .addScaledVector(look, 2.4)
      .setY(player.position.y + 1.3);
    this.#showPanel({
      subject,
      from: player.position,
      caption: memory.lines[0] ?? memory.title,
      tone: 'memory',
      duration: 4.4,
      memory: true,
      force: true,
    });

    for (const line of memory.lines) this.#beatQueue.push({ text: line, seconds: 3.6 });
  }

  #readDocument(id: string): void {
    const document_ = DOCUMENTS[id];
    if (!document_) return;
    this.#documents.add(id);
    this.#stats.documents = this.#documents.size;
    audio.play('pickup');
    this.hud.toast(`Document — ${document_.title}`, 'info');
    this.onCodexEntry.emit({ kind: 'document', id });
    this.#beatQueue.push(
      { text: document_.title, seconds: 2.4 },
      ...document_.body.slice(0, 3).map((text) => ({ text, seconds: 3.4 })),
    );
  }

  #raiseAlert(level: AlertLevel): void {
    const rank = { calm: 0, suspicious: 1, hunting: 2 };
    if (rank[level] <= rank[this.#alert]) {
      this.#alertCooldown = 8;
      return;
    }
    this.#alert = level;
    this.#alertCooldown = 8;
    this.hud.setAlert(level);
  }

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  #updatePickups(player: Player): void {
    const level = this.#level;
    if (!level) return;

    let prompt: string | null = null;
    const wantsUse = this.input.pressed('use');

    for (const pickup of level.pickups) {
      if (pickup.taken) continue;
      const distance = pickup.position.distanceTo(player.position);
      if (distance > pickup.radius + 1.4) continue;

      // Float and turn, so loot reads as loot from across a clearing.
      pickup.object.rotation.y += 0.02;

      if (distance > pickup.radius) continue;

      if (pickup.requiresUse) {
        prompt = `[E] ${pickup.label}`;
        if (!wantsUse) continue;
      }
      this.#collect(pickup, player);
    }

    for (const item of level.interactables) {
      if (!item.enabled || (item.used && item.once)) continue;
      if (item.position.distanceTo(player.position) > item.radius) continue;
      prompt = `[E] ${item.label}`;
      if (wantsUse) this.#interact(item.id, item);
    }

    this.hud.setPrompt(prompt);
  }

  #collect(pickup: Pickup, player: Player): void {
    const kind = pickup.kind;
    let consumed = true;

    switch (kind.type) {
      case 'weapon': {
        const isNew = player.giveWeapon(kind.weapon, kind.magazines ?? 2);
        this.hud.toast(
          isNew
            ? `${WEAPONS[kind.weapon].name} récupéré`
            : `Munitions — ${WEAPONS[kind.weapon].name}`,
          'pickup',
        );
        if (isNew && kind.weapon === 'colt') this.#completeObjective('arm', 'station');
        break;
      }
      case 'ammo': {
        const taken = player.giveAmmo(kind.weapon, kind.rounds);
        if (taken === 0) {
          consumed = false;
          break;
        }
        this.hud.toast(`+${taken} — ${WEAPONS[kind.weapon].name}`, 'pickup');
        break;
      }
      case 'health': {
        const scale = DIFFICULTY[this.settings.difficulty].healthPickup;
        const healed = player.heal(kind.amount * scale);
        if (healed <= 0) {
          consumed = false;
          break;
        }
        this.hud.toast(`+${Math.round(healed)} état`, 'pickup');
        break;
      }
      case 'armour': {
        player.armour = Math.min(100, player.armour + kind.amount);
        this.hud.toast('Gilet pare-balles', 'pickup');
        break;
      }
      case 'document':
        this.#readDocument(kind.id);
        break;
      case 'memory':
        this.#playMemory(kind.id);
        break;
    }

    if (!consumed) return;
    pickup.taken = true;
    pickup.object.visible = false;
    if (kind.type !== 'memory' && kind.type !== 'document') audio.play('pickup');
  }

  #interact(id: string, item: { used: boolean }): void {
    switch (id) {
      case 'power': {
        item.used = true;
        this.#powerOn = true;
        audio.play('ui-click');
        audio.play('objective');
        this.#queueBeats('power-on');
        this.#completeObjective('winch', 'exfil');
        const board = this.#level?.interactables.find((i) => i.id === 'board');
        if (board) board.enabled = true;
        this.hud.toast('Ligne du téléphérique sous tension', 'objective');
        break;
      }
      case 'board': {
        if (!this.#powerOn) {
          audio.play('ui-deny');
          return;
        }
        item.used = true;
        this.#completeObjective('exfil');
        this.#finishChapter();
        break;
      }
    }
  }

  #finishChapter(): void {
    this.#stats.seconds = this.loop.elapsed;
    saves.store({
      version: 1,
      levelId: this.#definition.id,
      checkpoint: 'complete',
      health: this.#player?.health ?? 100,
      armour: this.#player?.armour ?? 0,
      ammo: Object.fromEntries(
        [...(this.#player?.ammo ?? [])].map(([id, a]) => [
          id,
          { mag: Number.isFinite(a.mag) ? a.mag : 0, reserve: a.reserve },
        ]),
      ),
      weapons: this.#player?.owned ?? [],
      currentWeapon: this.#player?.current ?? 'fists',
      objectivesDone: [...this.#objectivesDone],
      memoriesFound: [...this.#memories],
      documentsFound: [...this.#documents],
      kills: this.#stats.kills,
      headshots: this.#stats.headshots,
      alarmsRaised: this.#stats.alarms,
      playSeconds: this.#stats.seconds,
      savedAt: new Date().toISOString(),
    });
    this.onChapterComplete.emit(this.#stats);
    this.setState('complete');
  }

  #updateTriggers(player: Player): void {
    const level = this.#level;
    if (!level) return;
    for (const trigger of level.triggers) {
      if (trigger.fired && trigger.once) continue;
      if (!trigger.box.containsPoint(player.position)) continue;
      trigger.fired = true;
      this.#queueBeats(trigger.id);

      switch (trigger.id) {
        case 'out-of-car':
          this.#completeObjective('out-of-car', 'descend');
          break;
        case 'first-body':
          this.#setObjective('arm');
          break;
        case 'descend':
          this.#completeObjective('descend', 'arm');
          break;
        case 'station':
          this.#completeObjective('station', 'winch');
          break;
        case 'winch-room':
          this.#setObjective('winch');
          break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  #tick(dt: number): void {
    const playing = this.#state === 'playing';
    const player = this.#player;

    if (player && this.#level) {
      const canAct = playing && player.alive;
      player.update(dt, this.input, canAct);
      // Keep the tight shadow frustum centred on whoever we're looking through.
      this.stage.focusShadows(player.position);
      this.#guardAgainstVoid(player);

      if (playing) {
        const eye = player.eyePosition(this.#tmpA);
        const crouched = player.stance === 'crouch';
        for (const enemy of this.#enemies) {
          enemy.update(dt, eye, player.alive, crouched);
        }

        this.#updateTriggers(player);
        this.#updatePickups(player);
        this.#updateBeats(dt);
        this.#updateHint(dt);

        this.#alertCooldown = Math.max(0, this.#alertCooldown - dt);
        if (this.#alertCooldown === 0 && this.#alert !== 'calm') {
          const stillAware = this.#enemies.some((e) => e.alive && e.aware);
          if (!stillAware) {
            this.#alert = 'calm';
            this.hud.setAlert('calm');
          } else {
            this.#alertCooldown = 3;
          }
        }

        this.#hitFeedbackTimer = Math.max(0, this.#hitFeedbackTimer - dt);
        this.#panelCooldown = Math.max(0, this.#panelCooldown - dt);
        this.#refreshHud();
      }

      this.#effects?.update(dt);

      const forward = player.lookDirection(this.#tmpB);
      audio.updateListener(this.stage.camera.position, forward, _up);
    }

    this.hud.update(dt);
    this.panels.update(dt);
    this.words.update(dt, this.stage.camera, window.innerWidth, window.innerHeight);

    this.stage.render(dt);
    this.input.endFrame();
  }

  /**
   * A level built from boxes will always have a seam somewhere. Falling out of
   * the world should cost you, not end the session: put the player back on the
   * last ground they stood on and take a bite out of their health.
   */
  #guardAgainstVoid(player: Player): void {
    if (player.position.y > VOID_FLOOR) {
      if (player.grounded) this.#lastFooting.copy(player.position);
      return;
    }
    player.position.copy(this.#lastFooting);
    player.velocity.set(0, 0, 0);
    player.applyDamage(20, null);
    player.addShake(0.6);
    this.hud.toast('Tu as glissé. Reprends pied.', 'info');
  }

  #refreshHud(): void {
    const player = this.#player;
    if (!player) return;
    const def = player.weapon;
    const ammo = player.currentAmmo;
    this.hud.setVitals(player.health, player.maxHealth, player.armour);
    this.hud.setAmmo(def.name, ammo.mag, ammo.reserve, def.reserveMax);

    // Crosshair opens with movement and closes when you settle or aim.
    const movement = clamp(player.speed / 7.3, 0, 1);
    const aimBlend = player.viewModel.aimBlend;
    const spread = clamp(
      (def.spread / 0.1) * (1 - aimBlend * (1 - def.aimSpread)) * (0.4 + movement * 0.9),
      0,
      1,
    );
    this.hud.setSpread(spread);
    this.hud.setCrosshairVisible(def.kind !== 'melee' && aimBlend < 0.85);
  }

  dispose(): void {
    this.loop.stop();
    this.unload();
    this.input.dispose();
    this.stage.dispose();
    audio.dispose();
    this.#overlayRoot.replaceChildren();
    void this.#canvas;
  }
}

const _up = new Vector3(0, 1, 0);

/** Below this height the player is considered to have fallen out of the level. */
const VOID_FLOOR = -12;

/** Slab test against a single box; mirrors the one in Collision for the player. */
function rayBox(
  origin: Vector3,
  direction: Vector3,
  box: Box3,
  maxDistance: number,
): number | null {
  let tmin = 0;
  let tmax = maxDistance;
  for (let axis = 0; axis < 3; axis++) {
    const o = axis === 0 ? origin.x : axis === 1 ? origin.y : origin.z;
    const d = axis === 0 ? direction.x : axis === 1 ? direction.y : direction.z;
    const lo = axis === 0 ? box.min.x : axis === 1 ? box.min.y : box.min.z;
    const hi = axis === 0 ? box.max.x : axis === 1 ? box.max.y : box.max.z;
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const inv = 1 / d;
    let t1 = (lo - o) * inv;
    let t2 = (hi - o) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin >= 0 && tmin <= maxDistance ? tmin : null;
}
