# Journal de travail

Entrée la plus récente en haut. La roadmap vivante (sprints/tâches) est dans
`tools/dashboard/sprints.json`, visualisée sur le cockpit `npm run dashboard`
→ http://localhost:5014.

---

## 2026-07-25 — passe artistique

Retour joueur sans détour : « c'est moche et ça marche pas super bien ». Il avait raison sur les
deux points, et le diagnostic était plus simple que prévu.

### L'éclairage était cassé, et ça effondrait tout le reste

Ambiante 0,62 + hémisphérique 0,7 par-dessus une directionnelle : toutes les surfaces saturaient
dans la bande claire du dégradé toon. Le cel-shading ne produisait donc **aucun palier** — chaque
mur était un rectangle d'une seule couleur. On ne peut pas rattraper ça avec du contenu.

Corrections : ambiante à 0,15, hémisphérique à 0,42, soleil à 1,4 (au-dessus de ~1,5 le matériau
toon écrête tout en blanc, parce qu'il multiplie albédo × rampe × lumière). Et les albédos de la
palette ont été assombris — partir d'un blanc cassé ne laisse aucune place à la rampe.

### Les ombres portées ne sortaient pas : `updateProjectionMatrix` manquant

J'avais réglé `shadow.camera.left/right/top/bottom` à ±42 m après construction. Three ne recalcule
jamais la matrice de projection tout seul : la caméra d'ombre gardait son frustum ±5 m par défaut,
soit une carte d'ombre couvrant une seule porte. Un appel à `updateProjectionMatrix()` a suffi.
Le frustum suit maintenant le joueur (`Stage.focusShadows`) pour garder de la densité de texels.

### Un moteur n'est pas un monde

Le vrai problème n'était pas le réglage : une plaine de neige de 84 m ne donne **aucune arête** au
Sobel. Le trait d'encre n'a littéralement rien à dessiner. D'où :

- une bibliothèque d'accessoires (`src/world/kit.ts`) : caisses avec traverses et croix de
  Saint-André, bidons cerclés, vestiaires, étagères garnies, poêle avec conduit, poste radio,
  couchettes, fenêtres à petits bois, portes ferrées, garde-corps, échelles, courses de tuyaux,
  lampes, panneaux peints (texte généré au canvas), clôtures à neige, poteaux télégraphiques,
  sapins enneigés en trois silhouettes, falaises, cabines de téléphérique, pylônes, treuil ;
- un niveau resserré et meublé : la vallée est passée de 84 m à ~40 m de large, murée de falaises,
  et le poste forestier comme la salle des treuils ont de vrais intérieurs où l'on entre ;
- des textures procédurales générées au canvas, avec des UV mis à l'échelle du monde
  (`scaleBoxUVs`) — sans ça une même texture s'étire sur une dalle de 60 m et s'écrase sur un
  encadrement de porte.

Le nombre de mailles est passé d'environ 400 à 2 600, et c'est précisément le but : ce sont autant
d'arêtes noires en plus dans le cadre.

### Les intérieurs étaient dans le noir absolu

Conséquence directe de l'éclairage de scène : sous un toit, il ne reste que 0,15 d'ambiante.
Monter l'ambiante aurait re-aplati tout l'extérieur. La bonne réponse était des sources
ponctuelles réelles (`LevelBuilder.lamp`), volontairement sans ombre — une ombre de lumière
ponctuelle coûte six passes de rendu, et l'encrage donne déjà sa structure à la pièce.

### Deux bugs bloquants trouvés par une marche automatique

J'ai écrit un test qui pousse le joueur d'étape en étape le long du parcours et vérifie qu'il
n'est ni coincé ni en chute libre. Il a trouvé tout de suite ce qu'aucune capture d'écran ne
montrait :

1. **Le joueur était enfermé dans l'épave.** La paroi pleine de la cabine faisait face à la sortie.
   La cabine a maintenant une variante `openFront` déchirée sur toute la hauteur — sinon il aurait
   fallu enjamber un seuil de 50 cm dès la première seconde de jeu.
2. **La pente était inversée.** `slope()` interprétait ses deux hauteurs dans l'ordre inverse de
   celui que le niveau supposait : au lieu d'une rampe, un mur de 6 m puis le vide. Les paramètres
   s'appellent désormais `yAtMinZ` / `yAtMaxZ`, la géométrie de marche est extraite en fonction
   pure `slopeSteps()`, et cinq tests la couvrent — dont un qui vérifie qu'aucune contremarche ne
   dépasse la hauteur de pas du personnage.

Ajouté au passage : un garde-fou anti-chute (`VOID_FLOOR`) qui repose le joueur sur son dernier
appui au sol au lieu de le laisser tomber indéfiniment.

---

## 2026-07-25 — premier jet

### Le pipeline d'encrage

Trois passes : couleur toon, normales en espace vue, puis un Sobel qui croise profondeur et
normales. Le premier essai n'utilisait que la profondeur — résultat : de belles silhouettes et
aucune arête intérieure, donc des murs qui ressemblaient à des aplats de couleur posés côte à côte.
En ajoutant le terme de normales les plis sont revenus, mais la neige s'est mise à scintiller au
loin. Deux corrections : le seuil de profondeur est désormais normalisé par la distance, et le terme
de normales est atténué au-delà d'une cinquantaine de mètres. Vérifié en regardant la pente depuis
l'épave, là où il y a à la fois du proche et du lointain dans le même plan.

Le détail qui fait la différence n'est pas dans le Sobel : c'est le tremblement. Les décalages
d'échantillonnage sont perturbés par un hash qui ne change que 11 fois par seconde. Sans lui le
trait est parfaitement stable et le rendu ressemble à un filtre ; avec lui il bouge comme un
encrage à la main. C'est exposé en réglage parce que certains le trouveront gênant.

### Les collisions, et le piège de la sonde de sol

Résolution axe par axe façon Quake, plus une marche d'escalier de 42 cm. Ça a permis de construire
tout le relief en boîtes empilées, donc pas de collision par triangles nulle part.

Le piège : sans sonde de sol, descendre une pente en escalier fait entrer le corps en chute libre à
chaque marche. Une frame en l'air, une frame au sol, et la caméra tremble à chaque pas. La sonde
(12 cm vers le bas quand on n'est pas au sol et qu'on ne monte pas) règle ça. C'est aussi ce qui a
motivé le test `stays glued to the ground when walking` — il vérifie `grounded === true` sur
20 frames consécutives.

### Un vrai bug trouvé par un test

Le test de marche d'escalier a d'abord échoué sur `expect(1).toBeGreaterThan(1)`. En creusant : la
montée fonctionnait, mais dans la même frame le corps restait à 42 cm en l'air, la sonde ne
descendait que de 12 cm et le pas suivant repartait de trop haut. Le comportement était correct
sur plusieurs frames, faux sur une seule. Le test a été réécrit pour simuler une demi-seconde de
marche sous gravité plutôt qu'un seul appel — ce qui est de toute façon la seule chose que le jeu
fait vraiment.

### L'audio sans un seul fichier

Chaque son est une salve de bruit filtrée plus une fondamentale qui descend. Le point non évident :
il faut un décalage de lecture aléatoire dans le buffer de bruit partagé, sinon deux tirs d'affilée
sont bit-à-bit identiques et l'oreille l'entend tout de suite. Ajouter en plus un léger désaccord
par tir suffit à donner l'impression d'une banque d'échantillons.

### Les vignettes

Décision structurante (ADR-003) : une case incrustée est un vrai second rendu du monde, relu en
pixels. Coût mesuré : blocage GPU d'environ 2 ms en 288×180. Donc cadence limitée à une case toutes
les 1,1 s, deux cases simultanées au plus, et jamais dans la boucle de tir — seulement sur
événement discret (mort, alerte, souvenir).

Piège rencontré : les flashbacks poussent le post-traitement en désaturé + gros grain pour la durée
du snapshot. Si on oublie de restaurer, **tout le jeu** reste gris. D'où `stage.resetComic()`
immédiatement après la lecture, et non pas à la fin de l'animation de la case.

### Ce qui a été vérifié, et comment

- `npx tsc --noEmit` propre, en configuration stricte (huit erreurs corrigées au premier passage,
  dont deux vrais problèmes : un type littéral figé par un `as const` sur la palette, et
  `exactOptionalPropertyTypes` qui refusait un `caption: string | undefined`).
- `npx vitest run` → 26 tests verts sur 3 fichiers.
- `npx vite build` → 104 ko de code jeu + 528 ko de Three, gzip 36 ko + 132 ko.
- Lancement réel dans Chrome : titre, chapitre chargé, vue d'ouverture depuis l'épave, HUD,
  objectif, sous-titre, trame de demi-teintes et contours visibles. Le premier lancement affichait
  un ciel vide sans menu — cause : `setState('title')` sortait tôt parce que l'état initial était
  déjà `title`, donc aucun événement n'était émis. Corrigé en synchronisant l'écran à la
  construction du menu.
- Perf non mesurée de façon fiable : Chrome suspend `requestAnimationFrame` dans un onglet en
  arrière-plan, donc les relevés de FPS étaient nuls. Tâche T4.6 ouverte pour un vrai budget image
  mesuré depuis le jeu.
