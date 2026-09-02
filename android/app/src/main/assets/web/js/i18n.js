/* ============================================================================
   i18n.js — plusieurs langues, sans casser celle qui marche.

   Le principe est volontairement pauvre : la CLE est la phrase francaise.
   `t('Tout valider')` cherche une traduction ; s'il n'en trouve pas, il rend
   le francais. Une phrase non traduite s'affiche donc dans la langue
   d'origine plutot que de laisser un trou ou un identifiant technique.

   C'est ce qui permet de traduire l'application par morceaux sans jamais la
   casser — et `tools/check.mjs` liste ce qui reste a faire.

   Ajouter une langue : un fichier dans `js/lang/`, une entree dans LANGUES.
   Rien d'autre. Les catalogues sont charges a la demande : la version
   francaise ne paie pas le poids des autres.
   ========================================================================== */

export const LANGUES = {
  fr: { code: 'fr', nom: 'Français',  natif: 'Français',  source: true },
  en: { code: 'en', nom: 'Anglais',   natif: 'English' },
};

let courante = 'fr';
let table = {};

/** La langue du telephone, si on la parle ; le francais sinon. */
export function langueProposee() {
  const dites = (navigator.languages || [navigator.language || 'fr'])
    .map((l) => String(l).slice(0, 2).toLowerCase());
  return dites.find((l) => LANGUES[l]) || 'fr';
}

/**
 * Installe une langue. Le francais est la source : il n'a pas de catalogue.
 * @returns le code reellement applique
 */
export async function setLangue(code) {
  const c = LANGUES[code] ? code : 'fr';
  if (c === 'fr') { courante = 'fr'; table = {}; }
  else {
    try {
      const mod = await import(`./lang/${c}.js`);
      table = mod.default || mod.CATALOGUE || {};
      courante = c;
    } catch {
      /* Catalogue absent ou illisible : on reste ou on etait, plutot que
         d'afficher une application a moitie vide. */
      courante = 'fr'; table = {};
    }
  }
  document.documentElement.lang = courante;
  return courante;
}

export const langue = () => courante;

/**
 * Traduit. Les valeurs entre accolades sont remplacees :
 *   t('{n} prises validées', { n: 3 })
 * Le pluriel se gere a l'appel, avec deux phrases distinctes — une regle de
 * pluriel generique se trompe dans trop de langues pour valoir le detour.
 */
export function t(phrase, vars = null) {
  /* Mode releve : `globalThis.__i18nRec = new Set()` fait noter chaque phrase
     reellement demandee a l'ecran. C'est ainsi que le catalogue anglais a ete
     etabli — a partir de l'usage, pas d'une extraction a l'aveugle — et c'est
     ainsi que `tools/check.mjs` mesure la couverture. Cout quand c'est
     eteint : une comparaison. */
  if (globalThis.__i18nRec) globalThis.__i18nRec.add(phrase);
  let out = table[phrase] ?? phrase;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split('{' + k + '}').join(String(v));
    }
  }
  return out;
}

/** Toutes les phrases connues du catalogue courant — pour les verifications. */
export const catalogue = () => table;
