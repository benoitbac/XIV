# Décisions

Registre ADR-lite. Format fixe : **Décision · Pourquoi (valeur) · Compromis · Statut**.
Le plus ancien en premier, on n'édite pas une décision passée — on en ajoute une qui la remplace.

---

## ADR-001 — Le web plutôt qu'un moteur natif

**Décision.** TypeScript + Three.js + Vite, cible navigateur, plutôt que Godot 4 ou Unreal.

**Pourquoi.** Trois raisons, dans cet ordre. (1) Le trait d'encre est un shader maison : en écrivant
le pipeline soi-même on contrôle exactement l'épaisseur, le tremblement et la trame, là où un moteur
impose son post-traitement. (2) Un lien suffit pour jouer — pas de build par plateforme, pas de
téléchargement. (3) Le développement est vérifiable de bout en bout en ligne de commande : on
compile, on lance, on regarde le résultat, sans piloter un éditeur graphique à l'aveugle.

**Compromis.** Pas d'éditeur de niveaux, pas de pipeline d'assets, et un plafond de performance plus
bas qu'un moteur natif. On l'accepte parce que le style graphique est volontairement pauvre en
polygones : des boîtes, aplats, et tout le détail est ajouté par le post-traitement.

**Statut.** Acté.

---

## ADR-002 — Le trait est calculé, pas dessiné

**Décision.** Contour d'encre par détection de bords en post-traitement (Sobel sur profondeur ET
normales), plutôt que la technique classique de la coque inversée (« inverted hull »).

**Pourquoi.** La coque inversée ne donne que des silhouettes extérieures : elle rate tous les plis
intérieurs, les arêtes de mur, les cadres de fenêtre. Or c'est exactement ce que l'encrage d'un
album souligne. La détection de bords attrape les deux, et elle est indépendante du nombre d'objets.

**Compromis.** Il faut un second rendu de la scène en normales, donc la géométrie est dessinée deux
fois. Et le réglage est délicat : seuil de profondeur normalisé par la distance, terme de normales
atténué au loin, sinon la neige scintille.

**Statut.** Acté. Le passage en MRT (une seule passe) reste possible si le nombre de draw calls
devient limitant.

---

## ADR-003 — Les vignettes sont de vrais rendus

**Décision.** Une case incrustée est un rendu complet du monde depuis une seconde caméra, à travers
le même pipeline, dont on relit les pixels — pas une icône ni un effet 2D.

**Pourquoi.** C'est la signature du genre : la case montre _le même instant_ sous un autre angle.
Une icône ne raconte rien ; une vraie image du garde qui tombe, encrée comme le reste, si.

**Compromis.** `readRenderTargetPixels` est synchrone et bloque le GPU (~2 ms en 288×180). Donc :
événements discrets uniquement, cadence maximale d'une case toutes les 1,1 s, deux cases
simultanées au plus. Ce n'est pas une optimisation à faire plus tard, c'est une contrainte de
conception.

**Statut.** Acté.

---

## ADR-004 — Zéro asset audio

**Décision.** Tous les sons sont synthétisés à l'exécution en WebAudio. Aucun fichier son dans le
dépôt.

**Pourquoi.** Le jeu complet tient sous 700 ko. Et chaque tir peut varier (décalage aléatoire dans
le buffer de bruit, désaccord léger) au lieu de rejouer trois échantillons en boucle — la
répétition s'entend immédiatement dans une fusillade.

**Compromis.** On ne fera jamais de musique orchestrale ni de voix. L'ambiance sonore restera
minérale : vent, métal, souffle. C'est cohérent avec le décor, ça ne le sera plus au chapitre deux
s'il faut une foule de gare.

**Statut.** Acté, à réévaluer quand le chapitre deux demandera des voix.

---

## ADR-005 — Pas d'ESLint

**Décision.** Pas de linter JavaScript. La porte qualité est `tsc --noEmit` en configuration très
stricte (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noUnusedLocals/Parameters`, `verbatimModuleSyntax`) plus Prettier pour le format.

**Pourquoi.** Deux raisons. La première est factuelle : `typescript-eslint` ne supporte pas encore
TypeScript 7. La seconde est plus solide — l'essentiel de ce qu'un preset ESLint attrape sur ce
genre de code (variables inutilisées, index non vérifiés, `undefined` implicite) est déjà une erreur
de compilation ici, et un second outil qui répète le premier coûte du temps de CI sans rien
apprendre.

**Compromis.** On perd les règles purement stylistiques et les règles React/a11y — dont on n'a pas
besoin, il n'y a pas de framework. On perd aussi la détection de code mort inter-fichiers.

**Statut.** Acté. À rouvrir quand `typescript-eslint` supportera TS 7, si une règle manque vraiment.

---

## ADR-006 — Les niveaux sont du code, pas des données

**Décision.** `level01.ts` est un module TypeScript qui appelle un `LevelBuilder`, plutôt qu'un
fichier JSON chargé à l'exécution.

**Pourquoi.** Un niveau en code peut boucler, calculer, réutiliser des fonctions (`shed()`,
`pylon()`, `wreckedCar()`) et il est typé : une faute de frappe sur un nom de surface ne compile
pas. Écrire le premier niveau en JSON aurait demandé d'inventer un schéma avant de savoir de quoi
un niveau a besoin.

**Compromis.** Pas d'éditeur possible, et pas de modification sans recompiler. Maintenant que la
forme d'un niveau est connue, le passage en données est une tâche identifiée de la réserve.

**Statut.** Acté pour le chapitre un, à revoir avant le chapitre trois.

---

## ADR-007 — Le suivi projet est un cockpit local, pas un site

**Décision.** Le dashboard (`tools/dashboard/`) est un serveur Node sans dépendance qui tourne en
local, alimenté par un scan git + système de fichiers en SSE et trois fichiers JSON déclaratifs.
Il n'est pas déployé.

**Pourquoi.** Le suivi sert à celui qui code, pendant qu'il code : quel sous-système a bougé il y a
deux minutes, combien de fichiers pas encore commités, est-ce que les huit conventions du dépôt
tiennent toujours. Publier ça n'apporterait rien à un visiteur, et l'exposer demanderait de
l'authentification.

**Compromis.** Rien à montrer à quelqu'un qui n'a pas cloné le dépôt. La page publique, c'est le
jeu lui-même sur GitHub Pages.

**Statut.** Acté. Convention reprise de l'écosystème Quark (QuarkWatch).
