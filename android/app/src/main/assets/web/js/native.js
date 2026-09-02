/* ============================================================================
   native.js — le pont vers l'APK, quand il y en a une.

   L'application est la meme dans les deux cas. Installee depuis Chrome, elle
   se debrouille avec ce qu'un navigateur permet : trois filets de rappel dont
   aucun n'est sur. Installee par l'APK, elle trouve `window.Pilulier` et
   delegue alors les rappels au systeme — `setAlarmClock`, le meme mecanisme
   que le reveil du telephone, qui sonne meme en veille profonde.

   Le natif ne decide de rien : il recoit une liste de prises deja calculee et
   se contente de poser les alarmes. Toute la logique reste ici, donc les deux
   versions ne peuvent pas diverger.
   ========================================================================== */
import { dosesForDate, profiles, getS } from './store.js';
import { fmtDose, addDays } from './util.js';
import { formOf } from './schema.js';

/**
 * Le pont, ou `null` dans un navigateur.
 *
 * Il est relu a chaque appel, jamais capture au chargement du module : la
 * WebView installe `window.Pilulier` avant la page, mais un test — ou une
 * version future d'Android qui l'injecterait plus tard — ne le ferait pas.
 * Un module qui a decide une fois pour toutes qu'il n'y a pas de pont est un
 * module qui se tait pour rien.
 */
export const lePont = () => (typeof window !== 'undefined' && window.Pilulier) || null;
export const estNatif = () => !!lePont();

/** Combien de jours a l'avance on arme. Au-dela, l'application aura rouvert. */
const HORIZON_JOURS = 3;
/** Android limite ce qui est raisonnable : une trentaine d'alarmes suffit. */
const MAX = 24;

/**
 * Les prochaines prises de TOUS les profils, dans l'ordre.
 * Le pere et la mere peuvent avoir chacun leur traitement : le rappel doit
 * sonner pour les deux, pas seulement pour le profil affiche.
 */
export function prochainesPrises(depuis = Date.now()) {
  const out = [];
  for (const p of profiles()) {
    for (let j = 0; j <= HORIZON_JOURS; j++) {
      for (const d of dosesForDate(addDays(new Date(depuis), j), p.id)) {
        const quand = d.planned.getTime();
        if (quand <= depuis + 30_000) continue;
        if (d.status === 'taken' || d.status === 'skipped') continue;
        const f = formOf(d.med.form);
        out.push({
          quand,
          heure: d.time,
          /* Le profil voyage avec l'alarme : au reveil, l'application doit
             ouvrir le carnet dont c'est l'heure, pas celui qu'on regardait
             hier soir. */
          profil: p.id,
          titre: d.med.name + (d.med.strength ? ' ' + d.med.strength : ''),
          detail: `${fmtDose(d.dose)} ${f.unit}` +
                  (profiles().length > 1 ? ` · ${p.name}` : ''),
        });
      }
    }
  }
  out.sort((a, b) => a.quand - b.quand);
  return out.slice(0, MAX);
}

/**
 * Publie les rappels au systeme. A appeler apres tout ce qui change les
 * horaires : validation d'une prise, ajout ou retrait d'un medicament,
 * changement de profil, modification d'un horaire.
 * @returns le nombre d'alarmes reellement posees, ou -1 hors APK.
 */
export function publierRappels() {
  const pont = lePont();
  if (!pont) return -1;
  try {
    return pont.publierPrises(JSON.stringify(prochainesPrises()));
  } catch (e) {
    return 0;
  }
}

/** Ce que le systeme peut empecher, et qu'il faut donc pouvoir dire. */
/**
 * Ce que le systeme autorise, en un seul aller-retour.
 *
 * Quatre verrous, et une alarme qui ne sonne pas en a rarement qu'un seul :
 * l'alarme exacte, l'economiseur de batterie, les notifications, et — depuis
 * Android 14 — le droit d'ouvrir un ecran par-dessus tout. C'est la
 * combinaison qui compte, donc c'est la combinaison qu'on lit d'un coup.
 */
export function etatDesRappels() {
  const pont = lePont();
  if (!pont) return null;
  try {
    if (typeof pont.etatDuSysteme === 'function') {
      const o = JSON.parse(pont.etatDuSysteme() || '{}');
      return {
        alarmesExactes: o.alarmesExactes !== false,
        batterieLibre: o.batterieLibre !== false,
        notifications: o.notifications !== false,
        pleinEcran: o.pleinEcran !== false,
        voix: o.voix || 'attente',
      };
    }
  } catch { /* coque plus ancienne */ }
  return null;
}

export const ouvrirReglageAlarmes = () => {
  const pont = lePont(); try { pont?.ouvrirReglageAlarmes(); } catch { /* rien */ }
};
export const ouvrirReglageBatterie = () => {
  const pont = lePont(); try { pont?.ouvrirReglageBatterie(); } catch { /* rien */ }
};

/** Le partage passe par le selecteur d'Android : toutes les messageries. */
export function partagerNatif(texte, titre) {
  const pont = lePont();
  if (!pont) return false;
  try { pont.partager(texte, titre || 'Pilulier'); return true; } catch { return false; }
}

/** Une vibration courte, quand une prise est validee. */
export function vibrerNatif(ms = 30) {
  const pont = lePont();
  if (!pont) return false;
  try { pont.vibrer(ms); return true; } catch { return false; }
}

/* ==========================================================================
   CE QU'UNE WEBVIEW NE SAIT PAS FAIRE

   L'APK a ete essaye pour de vrai, et quatre choses se sont revelees mortes :
   l'impression, les telechargements, les notifications et la voix. Aucune ne
   levait d'erreur — elles ne faisaient simplement rien. C'est le pire cas :
   un bouton qui ne repond pas, sans un mot.

   Chacune a donc son passage par le pont, avec le meme contrat : rendre
   `false` quand le natif n'est pas la, pour que le web reprenne la main.
   ========================================================================== */

/**
 * Imprimer. `window.print()` existe dans une WebView, ne leve rien, et
 * n'imprime rien. Le service d'impression d'Android, lui, sait faire — et
 * imprime le contenu de la WebView, donc avec la feuille `@media print` de
 * l'application : le papier kaki et ses filets.
 */
export function imprimerNatif(nom = 'Pilulier') {
  const pont = lePont();
  if (!pont || typeof pont.imprimer !== 'function') return false;
  try { return !!pont.imprimer(nom); } catch { return false; }
}

/**
 * Enregistrer un fichier. `<a download>` et les URL `blob:` sont ignores par
 * une WebView : la sauvegarde, l'export SQL et le .ics disparaissaient.
 * Rend le chemin ecrit, ou '' en cas d'echec.
 */
export function enregistrerFichierNatif(nom, texte, mime = 'text/plain') {
  const pont = lePont();
  if (!pont || typeof pont.enregistrerFichier !== 'function') return '';
  try {
    /* btoa ne prend que des octets : on passe par UTF-8 avant. */
    const octets = new TextEncoder().encode(texte);
    let bin = '';
    for (const o of octets) bin += String.fromCharCode(o);
    return pont.enregistrerFichier(nom, mime, btoa(bin)) || '';
  } catch { return ''; }
}

/** Les notifications systeme, cote APK : elles existent, il fallait le dire. */
export function etatDesNotifications() {
  const e = etatDesRappels();
  return e ? { autorisees: e.notifications } : null;
}
export function demanderNotificationsNatif() {
  const pont = lePont();
  if (!pont || typeof pont.demanderNotifications !== 'function') return false;
  try { pont.demanderNotifications(); return true; } catch { return false; }
}

/* ==========================================================================
   L'ECRAN DE RAPPEL

   Depuis Android 10, une application en arriere-plan ne peut plus ouvrir un
   ecran d'elle-meme : l'appel est ignore, sans un mot. Le systeme le fait a
   sa place, par l'intention plein ecran de la notification — et nous lance
   avec les extras de l'alarme. On vient les chercher ici.
   ========================================================================== */

/** L'alarme qui vient de nous reveiller, ou null. La lecture l'efface. */
export function alarmeQuiNousAReveilles() {
  const pont = lePont();
  if (!pont || typeof pont.alarmeEnAttente !== 'function') return null;
  try {
    const brut = pont.alarmeEnAttente();
    if (!brut) return null;
    const o = JSON.parse(brut);
    return { titre: o.titre || '', detail: o.detail || '', heure: o.heure || '',
             profil: Number(o.profil) || 0 };
  } catch { return null; }
}

/** L'ecran de l'application a pris le relais : la notification peut partir. */
export function taireNotificationNative() {
  const pont = lePont();
  try { pont?.taireNotification?.(); return true; } catch { return false; }
}

/** Le droit d'ouvrir un ecran par-dessus tout (Android 14). */
export const demanderAlarmePleinEcran = () => {
  const pont = lePont();
  try { pont?.demanderAlarmePleinEcran?.(); } catch { /* rien */ }
};

/**
 * Qui sonne : le telephone, ou l'application ?
 *
 * Un canal Android est fige des sa creation, sa sonnerie ne peut plus
 * changer : il y a donc deux canaux, et ceci choisit lequel. Avec la
 * sonnerie du systeme, le rappel s'entend meme quand l'ecran ne s'ouvre pas
 * — c'est le filet de securite, et c'est la valeur par defaut.
 */
export function reglerSonSysteme(actif) {
  const pont = lePont();
  try { pont?.reglerSonSysteme?.(!!actif); return true; } catch { return false; }
}

/**
 * La voix. `speechSynthesis` repond present dans la WebView mais sa liste de
 * voix revient vide : l'application annoncait « voix … » sans rien dire.
 * Le moteur de synthese d'Android, lui, est toujours la.
 */
/**
 * Ou en est le moteur de synthese : 'prete', 'attente', 'absente', ou null
 * hors de l'APK.
 *
 * L'initialisation d'un TextToSpeech est asynchrone. Repondre « non » pendant
 * ce temps-la, c'est annoncer une absence qui n'existe pas — c'est ce qui
 * faisait afficher « aucun moteur de synthese vocale » au demarrage, jusqu'a
 * ce qu'une alarme reveille le moteur.
 */
export function etatDeLaVoix() {
  const e = etatDesRappels();
  return e ? (e.voix || 'attente') : null;
}

/** Ce telephone peut-il parler ? « Pas encore » compte comme oui : la phrase
    sera dite, le natif la garde en attendant. */
export function voixNativeDisponible() {
  const etat = etatDeLaVoix();
  return etat !== null && etat !== 'absente';
}

/**
 * Rappelle `fn` quand le moteur a fini de s'initialiser, ou au bout de
 * `limite`. Sert a redessiner un ecran qui a ete peint trop tot.
 */
export function quandLaVoixEstFixee(fn, limite = 6000) {
  if (!estNatif()) return;
  const debut = Date.now();
  const voir = () => {
    const etat = etatDeLaVoix();
    if (etat !== 'attente' || Date.now() - debut > limite) { fn(etat); return; }
    setTimeout(voir, 400);
  };
  setTimeout(voir, 400);
}
export function parlerNatif(texte, vitesse = 1) {
  const pont = lePont();
  if (!pont || typeof pont.parler !== 'function') return false;
  try { return !!pont.parler(String(texte), Number(vitesse) || 1); } catch { return false; }
}
export function taireLaVoixNative() {
  const pont = lePont();
  try { pont?.taireLaVoix?.(); } catch { /* rien */ }
}

/*
 * Republier automatiquement.
 *
 * Plutot que d'aller poser un appel dans chaque fonction qui ecrit — valider
 * une prise, ajouter un medicament, changer un horaire, changer de profil —
 * on s'accroche au redessin : toute modification passe par la. C'est un
 * endroit, pas quinze, donc on ne peut pas en oublier un. L'appel est
 * regroupe pour ne pas reposer vingt-quatre alarmes a chaque pression.
 */
let minuteur = null;
export function planifierRepublication(delai = 900) {
  if (!estNatif()) return;
  clearTimeout(minuteur);
  minuteur = setTimeout(publierRappels, delai);
}

export function brancherRappels() {
  if (!estNatif()) return;
  /* Le choix « qui sonne » vit cote web mais s'applique cote Java : un canal
     Android est fige des sa creation, il en existe donc deux, et il faut
     dire au natif lequel employer. On le refait a chaque demarrage plutot
     que de supposer que les deux cotes sont d'accord. */
  reglerSonSysteme(getS('son_systeme') !== false);
  publierRappels();
  /* Au retour au premier plan : une prise a pu etre validee depuis la
     notification, ou la journee a simplement change. */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) publierRappels();
  });
  /* Avant que l'application soit mise de cote : c'est le moment ou les
     alarmes doivent etre a jour, puisque plus rien ne tournera. */
  addEventListener('pagehide', () => { clearTimeout(minuteur); publierRappels(); });
}
