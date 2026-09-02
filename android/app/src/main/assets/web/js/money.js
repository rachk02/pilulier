import { langue } from './i18n.js';

/* ============================================================================
   money.js — les devises, et le piege qu'elles tendent.

   Un prix stocke est un NOMBRE. La devise, elle, n'etait qu'une etiquette
   posee a l'affichage. Resultat : passer de FCFA a l'euro transformait
   « 21 000 FCFA » en « 21 000 € » — une boite d'aspirine au prix d'une
   voiture. Le bug etait silencieux, ce qui est le pire genre.

   Deux corrections. D'abord les prix portent desormais leur devise avec eux :
   changer d'etiquette ne change plus leur sens. Ensuite, quand on change de
   devise, l'application PROPOSE de convertir, montre le calcul, et laisse
   corriger le taux — parce qu'un taux embarque est forcement date, et qu'on
   ne convertit pas l'argent de quelqu'un dans son dos.
   ========================================================================== */

/**
 * Les devises proposees. `dec` = chiffres apres la virgule : le franc CFA
 * n'a pas de centimes, l'euro si. Afficher « 3 040,00 FCFA » serait faux.
 */
export const DEVISES = {
  XOF: { code: 'XOF', label: 'FCFA', nom: 'Franc CFA (UEMOA)', dec: 0 },
  XAF: { code: 'XAF', label: 'FCFA', nom: 'Franc CFA (CEMAC)', dec: 0 },
  EUR: { code: 'EUR', label: '€',    nom: 'Euro',              dec: 2 },
  USD: { code: 'USD', label: '$',    nom: 'Dollar américain',  dec: 2 },
  MAD: { code: 'MAD', label: 'DH',   nom: 'Dirham marocain',   dec: 2 },
  CAD: { code: 'CAD', label: '$ CA', nom: 'Dollar canadien',   dec: 2 },
  CHF: { code: 'CHF', label: 'CHF',  nom: 'Franc suisse',      dec: 2 },
  GBP: { code: 'GBP', label: '£',    nom: 'Livre sterling',    dec: 2 },
  NGN: { code: 'NGN', label: '₦',    nom: 'Naira nigérian',    dec: 0 },
  GHS: { code: 'GHS', label: 'GH₵',  nom: 'Cedi ghanéen',      dec: 2 },
};

/**
 * Taux indicatifs, en unites pour 1 euro. Ils sont EMBARQUES, donc dates :
 * l'application ne joint jamais le reseau pour les rafraichir. Le seul taux
 * exact et immuable est celui du franc CFA, fixe par traite.
 *
 * C'est assumé : ces taux servent a proposer une conversion plausible, que
 * l'utilisateur relit et corrige. Ils ne servent jamais a decider quoi que
 * ce soit tout seuls.
 */
export const TAUX_PAR_EURO = {
  EUR: 1,
  XOF: 655.957,      /* parite fixe, par traite */
  XAF: 655.957,      /* parite fixe, par traite */
  USD: 1.08,
  MAD: 10.8,
  CAD: 1.47,
  CHF: 0.95,
  GBP: 0.85,
  NGN: 1650,
  GHS: 14.5,
};

/** La date des taux non fixes, pour pouvoir le dire au lieu de le taire. */
export const TAUX_DATE = '2026-08';

/** Les deux parites qui ne bougeront pas : on peut convertir sans reserve. */
export const FIXE = new Set(['XOF', 'XAF', 'EUR']);

/* On accepte aussi bien un code (« XOF ») que l'ancienne etiquette
   (« FCFA », « € ») : les reglages d'avant stockaient l'etiquette. */
export const devise = (code) => DEVISES[code] || DEVISES[normaliser(code)] || DEVISES.XOF;

/** Ancienne etiquette -> code. Les reglages stockaient « FCFA », « € »… */
export function normaliser(valeur) {
  if (!valeur) return 'XOF';
  const v = String(valeur).trim();
  if (DEVISES[v.toUpperCase()]) return v.toUpperCase();
  const parEtiquette = { FCFA: 'XOF', 'CFA': 'XOF', '€': 'EUR', EURO: 'EUR',
    '$': 'USD', USD: 'USD', MAD: 'MAD', DH: 'MAD', '£': 'GBP' };
  return parEtiquette[v.toUpperCase()] || parEtiquette[v] || 'XOF';
}

/**
 * Le taux de `de` vers `vers`, en passant par l'euro.
 * @returns {number|null} null si une des deux devises est inconnue
 */
export function taux(de, vers) {
  const a = TAUX_PAR_EURO[normaliser(de)], b = TAUX_PAR_EURO[normaliser(vers)];
  if (!a || !b) return null;
  return b / a;
}

/** Le taux est-il exact, ou seulement indicatif ? */
export const tauxExact = (de, vers) =>
  FIXE.has(normaliser(de)) && FIXE.has(normaliser(vers));

/**
 * Convertit un montant, en arrondissant a la precision de la devise
 * d'arrivee. Un prix de boite en FCFA n'a pas de centimes ; en euro, si.
 */
export function convertir(montant, de, vers, tauxForce = null) {
  const n = Number(montant);
  if (!Number.isFinite(n)) return null;
  const t = tauxForce != null ? Number(tauxForce) : taux(de, vers);
  if (!Number.isFinite(t) || t <= 0) return null;
  const d = devise(vers).dec;
  const f = Math.pow(10, d);
  return Math.round(n * t * f) / f;
}

/** Le montant, ecrit comme on l'ecrit dans cette devise. */
export function fmt(montant, code = 'XOF') {
  const d = devise(code);   /* accepte un code ou une ancienne etiquette */
  const n = Number(montant);
  if (!Number.isFinite(n)) return '—';
  /* Le separateur de milliers suit la langue : « 21 000 » en francais,
     « 21,000 » en anglais. Le nombre est le meme, sa lecture non. */
  return new Intl.NumberFormat(langue(), {
    minimumFractionDigits: d.dec, maximumFractionDigits: d.dec,
  }).format(n) + ' ' + d.label;
}

/**
 * Un exemple parlant pour le dialogue de conversion : plutot que d'annoncer
 * un taux abstrait, on montre ce que devient un vrai prix du dossier.
 */
export function apercu(montants, de, vers, tauxForce = null) {
  return montants.filter((m) => Number(m) > 0).slice(0, 3).map((m) => ({
    avant: fmt(m, de),
    apres: fmt(convertir(m, de, vers, tauxForce), vers),
  }));
}
