<div align="center">

# XIV ⚫

**Le Quatorzième Jour** — un FPS cel-shadé qui se joue comme on lit une planche.

Quatorze jours après l'assassinat de la Chancelière Kessler, un homme se réveille dans l'épave
d'une cabine de téléphérique. Pas de nom. Pas de souvenirs. Un chiffre tatoué sous la clavicule.

[![CI](https://github.com/benoitbac/XIV/actions/workflows/ci.yml/badge.svg)](https://github.com/benoitbac/XIV/actions/workflows/ci.yml)
[![Pages](https://github.com/benoitbac/XIV/actions/workflows/pages.yml/badge.svg)](https://benoitbac.github.io/XIV/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)](tsconfig.json)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL2-000000?logo=threedotjs)](https://threejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**[▶ Jouer](https://benoitbac.github.io/XIV/)** · [Architecture](docs/ARCHITECTURE.md) ·
[Décisions](docs/DECISIONS.md) · [Journal](docs/WORKLOG.md)

</div>

---

## ✨ Pourquoi XIV

Un hommage à une certaine bande dessinée d'espionnage adaptée en jeu de tir, refait avec les outils
d'aujourd'hui et une histoire entièrement neuve. Trois partis pris le définissent :

- **Le trait est calculé, pas dessiné.** Pas de coque inversée : un Sobel qui croise profondeur et
  normales, donc les silhouettes _et_ les plis intérieurs. Les décalages d'échantillonnage sont
  perturbés à 11 images/seconde — le contour « bout » comme un encrage à la main plutôt que de
  rester figé comme un filtre.
- **Les vignettes sont de vraies images.** Quand un garde tombe, le jeu rend la scène depuis une
  seconde caméra à travers le même pipeline, gèle l'image et l'épingle dans un coin de la page. Ce
  n'est pas une icône : c'est le même instant, sous un autre angle.
- **Zéro asset binaire.** Aucun fichier son, aucune texture, aucun modèle. Les sons sont synthétisés
  à l'exécution, la géométrie est faite de boîtes, les textures sont générées. Le jeu entier tient
  sous **700 ko** (≈170 ko gzip) et se lance depuis un lien.

---

## 🏗️ Architecture

```text
                      ┌───────────────────────────────────────────────┐
                      │                    Game                       │
                      │  ordre strict : joueur → gardes → monde → FX  │
                      └───────────────────────────────────────────────┘
                            │             │              │
              ┌─────────────┘             │              └──────────────┐
              ▼                           ▼                             ▼
      ┌───────────────┐          ┌────────────────┐            ┌────────────────┐
      │    Player     │          │   Enemy  ×N    │            │   BrushWorld   │
      │ capsule + ADS │          │ vue · ouïe     │            │ boîtes AABB    │
      │ recul ressort │          │ 5 états        │            │ grille XZ      │
      └───────────────┘          └────────────────┘            └────────────────┘
              └──────────────────────────┬──────────────────────────────┘
                                         ▼
      ┌──────────────────────────────────────────────────────────────────────┐
      │                              Stage                                   │
      │   [1] couleur toon + profondeur    [2] normales    [3] ComicPass     │
      │                                                     Sobel · trame     │
      │                                                     grain · vignetage │
      └──────────────────────────────────────────────────────────────────────┘
                                         │
                          ┌──────────────┴───────────────┐
                          ▼                              ▼
                  ┌───────────────┐             ┌────────────────┐
                  │  écran        │             │ ComicPanels    │
                  │  (canvas)     │             │ même pipeline, │
                  └───────────────┘             │ image gelée    │
                                                └────────────────┘
```

| Couche        | Dossier            | Rôle                                                        |
| ------------- | ------------------ | ----------------------------------------------------------- |
| Rendu         | `src/render/`      | Contexte WebGL, cel-shading, encrage, trame, palette fermée |
| Simulation    | `src/player/`      | Contrôleur FPS, table d'armes, view model procédural        |
|               | `src/ai/`          | Gardes : cône de vision, ouïe, escouades, hitbox par pièce  |
|               | `src/world/`       | Monde de boîtes, `LevelBuilder`, `levels/level01.ts`        |
| Mise en scène | `src/ui/`          | HUD encré, vignettes BD, onomatopées ancrées en 3D, menus   |
|               | `src/fx/`          | Traçantes, impacts, sang, douilles — tout est poolé         |
| Récit         | `src/story/`       | **Tout le texte joueur.** Souvenirs, documents, répliques   |
| Noyau         | `src/core/`        | Entrées, boucle, audio synthétisé, sauvegarde, maths        |
| Outillage     | `tools/dashboard/` | Cockpit de suivi local (hors bundle)                        |

Les détails qui comptent — pourquoi deux passes, pourquoi une sonde de sol, pourquoi les vignettes
sont limitées à une par seconde — sont dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 🚀 Démarrage

```bash
npm install
npm run dev
# → http://localhost:5173
```

```bash
npm run verify        # types + format + tests — la même porte que la CI
npm run build         # → dist/, prêt pour n'importe quel hébergeur statique
npm run dashboard     # cockpit de suivi → http://localhost:5014
```

**Prérequis** : Node ≥ 20.19 et un navigateur avec WebGL 2 (Chrome, Edge, Firefox à jour).
Le jeu détecte l'absence de WebGL 2 et l'annonce plutôt que d'afficher un écran noir.

---

## 🎮 Commandes

| Touche              | Action         | Touche        | Action               |
| ------------------- | -------------- | ------------- | -------------------- |
| `ZQSD` / `WASD`     | se déplacer    | `Clic gauche` | tirer                |
| `Maj`               | courir         | `Clic droit`  | viser (ADS)          |
| `Ctrl` / `C`        | s'accroupir    | `R`           | recharger            |
| `Espace`            | sauter         | `F`           | corps-à-corps        |
| `A`                 | se pencher     | `E`           | interagir / fouiller |
| `Molette` / `1` `2` | changer d'arme | `Échap`       | pause & carnet       |

S'accroupir ralentit de 45 % la vitesse à laquelle un garde vous identifie. Le Hush-22 fait
sept fois moins de bruit que le Colt. Les deux sont des façons de ne pas déclencher l'escouade.

---

## 🗺️ Chapitre un — Le Téléphérique

Cascades, Cold Fork. Six actes, de l'épave à la gare aval : la cabine, le corps du pilote et son
Colt, la ligne d'arbres et les premiers gardes, le poste forestier, la salle des treuils, la
descente. **Cinq souvenirs** et **trois documents** à retrouver — ils remplissent le carnet et
racontent qui sont les Quatorze.

Le chapitre deux, _Casier 14_, se passe à la gare de Denver.
[Feuille de route complète](tools/dashboard/sprints.json).

---

## 📊 Suivi du projet

```bash
npm run dashboard     # → http://localhost:5014
```

Un cockpit local sans dépendance : diagramme de Gantt en SVG fait main, courbe de progression,
carte du système, journal de session, et un **audit des huit conventions du dépôt** que le serveur
revérifie toutes les 4 secondes — y compris sur lui-même. Il n'est pas déployé, c'est un outil de
poste de travail ([ADR-007](docs/DECISIONS.md#adr-007--le-suivi-projet-est-un-cockpit-local-pas-un-site)).

---

## 🛠️ Développement

| Sujet  | Commande                                     |
| ------ | -------------------------------------------- |
| Types  | `npm run typecheck` — `tsc --noEmit`, strict |
| Format | `npm run format` / `npm run format:check`    |
| Tests  | `npm test` / `npm run test:watch`            |
| Tout   | `npm run verify`                             |

Il n'y a pas d'ESLint : la configuration TypeScript (`strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`) fait office de linter, et un second outil qui répète
le premier coûterait du temps de CI sans rien apprendre — voir
[ADR-005](docs/DECISIONS.md#adr-005--pas-deslint).

La CI reprend exactement ces commandes, avec les tests sur les trois systèmes d'exploitation : le
solveur de collisions et le PRNG déterministe qui habille les niveaux doivent donner le même
résultat partout, sinon un niveau se reconstruit différemment selon qui joue. Voir
[`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## 🤝 Contribuer

Les PR sont bienvenues — lisez [`CONTRIBUTING.md`](CONTRIBUTING.md). Deux règles faciles à
manquer : **rien ne doit allouer dans la boucle de frame**, et **aucune phrase française hors de
`src/story/`**.

---

## 📜 Licence

[MIT](LICENSE) © 2026 Benoit Bacot.

Œuvre originale. XIV n'est affilié à aucun éditeur ni ayant droit ; l'univers, les personnages et
le scénario sont inventés pour ce projet.
