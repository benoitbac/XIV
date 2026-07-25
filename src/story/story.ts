/**
 * XIV — Le Quatorzième Jour
 *
 * Fourteen days after the Chancellor of the Federal Reserve is shot dead in
 * Denver, a man wakes in the wreck of a cable car in the Cascades. No memory,
 * no name. A roman numeral XIV inked under his collarbone, a Colt with one
 * spent casing in the magazine, and a locker key.
 *
 * All narrative text lives here so it can be proof-read, translated and
 * rewritten without touching a line of gameplay code.
 */

export interface Memory {
  id: string;
  /** Numbered like plates in an album — the codex lists them in order. */
  plate: string;
  title: string;
  /** Shown as caption strips under the flashback panel, one after the other. */
  lines: readonly string[];
}

export interface Document {
  id: string;
  title: string;
  source: string;
  body: readonly string[];
}

export interface Objective {
  id: string;
  text: string;
  /** Optional hint shown if the player wanders for a while. */
  hint?: string;
}

export const MEMORIES: Record<string, Memory> = {
  'm01-mains': {
    id: 'm01-mains',
    plate: 'I',
    title: 'Tes mains',
    lines: [
      'Tu n’as pas réfléchi.',
      'Le chargeur est sorti, tu l’as compté du pouce, tu l’as remis.',
      'Sept balles. Six douilles. Quelqu’un a tiré une fois.',
      'C’était toi ?',
    ],
  },
  'm02-nombre': {
    id: 'm02-nombre',
    plate: 'II',
    title: 'Le nombre',
    lines: [
      'Une pièce sans fenêtre. L’odeur de l’encre.',
      'Une voix, derrière l’aiguille : « Quatorze. »',
      '« À partir de maintenant, c’est tout ce que tu es. »',
    ],
  },
  'm03-quai': {
    id: 'm03-quai',
    plate: 'III',
    title: 'La femme sur le quai',
    lines: [
      'Il neigeait déjà. Elle n’a pas pris ta main.',
      '« Ne reviens pas, Adam. »',
      'Adam. Ce nom ne t’appartient pas. Mais tu as répondu.',
    ],
  },
  'm04-lunette': {
    id: 'm04-lunette',
    plate: 'IV',
    title: 'Le quatorze septembre',
    lines: [
      'Une lunette. Une tribune. Un manteau gris.',
      'La Chancelière Kessler lève la main pour saluer.',
      'Le réticule se pose sur elle. Et là, le souvenir se coupe.',
      'Tu ne sais toujours pas qui a appuyé.',
    ],
  },
  'm05-rossiter': {
    id: 'm05-rossiter',
    plate: 'V',
    title: 'Duke',
    lines: [
      'Un homme large, une cigarette éteinte au coin de la bouche.',
      '« Ils sont quatorze, petit. Pas treize. Quatorze. »',
      '« Le quatorzième, c’est celui qu’ils gardent pour porter le chapeau. »',
    ],
  },
};

export const DOCUMENTS: Record<string, Document> = {
  'd01-saturne': {
    id: 'd01-saturne',
    title: 'Ordre d’opération — SATURNE',
    source: 'Feuillet carbonisé, poche intérieure du pilote',
    body: [
      'CLASSIFIÉ — DIFFUSION CONCLAVE UNIQUEMENT',
      'Phase 1 — 14 sept. : neutralisation de la Chancelière Kessler. EXÉCUTÉ.',
      'Phase 2 — J+14 : récupération de l’actif XIV. Transport vers le site AMBRE.',
      'Phase 3 — état d’exception. Transfert des pouvoirs au Conseil de guerre.',
      'Note manuscrite en marge : « XIV ne doit pas arriver vivant à AMBRE. — I »',
    ],
  },
  'd02-carnet': {
    id: 'd02-carnet',
    title: 'Carnet de poste',
    source: 'Poste forestier de Cold Fork, dernière page',
    body: [
      '27 sept. — Ordre de fermer la ligne du téléphérique. Aucune explication.',
      '27 sept. — Douze hommes arrivés par la route sud. Pas des nôtres.',
      '28 sept. — Ils ont coupé la radio. Ils attendent une cabine.',
      '28 sept., plus tard — La cabine est tombée. Ils sont montés la chercher.',
      'Si vous lisez ça : la clé de la salle des treuils est sous la caisse.',
    ],
  },
  'd03-manifeste': {
    id: 'd03-manifeste',
    title: 'Manifeste — cabine 14',
    source: 'Plaque de la cabine accidentée',
    body: [
      'TÉLÉPHÉRIQUE DE COLD FORK — CABINE 14 — 8 PLACES',
      'Passagers déclarés au départ : 2.',
      'Retrouvés : 1.',
      'Toi.',
    ],
  },
};

export interface Beat {
  /** Who is speaking; omit for the protagonist's inner voice. */
  speaker?: string;
  text: string;
  seconds?: number;
}

/** Ordered lines fired by triggers in level 01. */
export const LEVEL01_BEATS: Record<string, readonly Beat[]> = {
  wake: [
    { text: 'Froid. Métal tordu. Le goût du sang dans la bouche.', seconds: 4 },
    { text: 'Aucun nom. Aucune date. Juste un chiffre sur la peau : XIV.', seconds: 4.5 },
  ],
  'out-of-car': [
    { text: 'La cabine a arraché le câble sur trois cents mètres.', seconds: 3.6 },
    { text: 'Personne ne survit à ça. Toi, si.', seconds: 3.2 },
  ],
  'first-body': [
    { text: 'Un homme, la nuque brisée. Il portait ton manteau.', seconds: 4 },
    { text: 'Et un Colt. Un chargeur plein, moins une balle.', seconds: 4 },
  ],
  'first-guard': [
    {
      speaker: 'Garde',
      text: '« … secteur nord dégagé. Toujours rien sur le passager. »',
      seconds: 4,
    },
    { text: 'Le passager. C’est toi qu’ils fouillent. Pas les débris.', seconds: 4 },
  ],
  station: [
    { text: 'Poste forestier de Cold Fork. La radio est morte, la porte est neuve.', seconds: 4.2 },
  ],
  'winch-room': [
    { text: 'La salle des treuils. Rends le courant à la ligne et descends.', seconds: 4 },
  ],
  'power-on': [
    { text: 'Le câble se retend. Quelque part en bas, une cabine se met en marche.', seconds: 4.2 },
    {
      speaker: 'Radio',
      text: '« Ici AMBRE. La ligne redémarre. Il est dessus. Cueillez-le en bas. »',
      seconds: 5,
    },
  ],
  exfil: [
    { text: 'Ils t’attendent en bas. Parfait. Tu as des questions à leur poser.', seconds: 4.4 },
  ],
};

export const LEVEL01_OBJECTIVES: Record<string, Objective> = {
  'out-of-car': {
    id: 'out-of-car',
    text: 'Sortir de la cabine',
    hint: 'La paroi est déchirée côté aval.',
  },
  descend: {
    id: 'descend',
    text: 'Descendre vers la ligne d’arbres',
    hint: 'Suis la trace du câble dans la neige.',
  },
  arm: {
    id: 'arm',
    text: 'Trouver de quoi te défendre',
    hint: 'Le corps près des débris.',
  },
  station: {
    id: 'station',
    text: 'Atteindre le poste forestier de Cold Fork',
  },
  winch: {
    id: 'winch',
    text: 'Rétablir le courant de la ligne',
    hint: 'La salle des treuils, derrière le poste.',
  },
  exfil: {
    id: 'exfil',
    text: 'Prendre la cabine et descendre',
  },
};

export const TITLE_CARD = {
  chapter: 'CHAPITRE UN',
  title: 'LE TÉLÉPHÉRIQUE',
  place: 'CASCADES — COLD FORK',
  when: 'QUATORZE JOURS APRÈS DENVER',
} as const;

export const EPILOGUE_LINES: readonly string[] = [
  'La cabine descend dans le blanc.',
  'Sous ta clavicule, quatorze traits d’encre.',
  'Dans ta poche, une clé : gare de Denver, casier quatorze.',
  'Quelqu’un t’attend en bas. Quelqu’un t’attend là-bas aussi.',
];
