/* ============================================================================
   speech.js — l'application parle.

   Un homme de 66 ans entend mieux qu'il ne lit un ecran a bout de bras. A
   l'heure de la prise, le telephone annonce a voix haute ce qu'il faut avaler.
   La synthese vocale d'Android est utilisee telle quelle : aucun fichier, aucun
   reseau, aucune donnee qui sort.
   ========================================================================== */
import { fmtDose } from './util.js';
import { formOf } from './schema.js';

let voices = [];
let chosen = null;
let ready = false;

/*
 * Deux moteurs possibles, dans cet ordre :
 *
 *   1. celui d'Android, par le pont — dans l'APK, `speechSynthesis` repond
 *      present mais sa liste de voix revient vide, si bien que l'application
 *      annoncait « voix … » sans jamais rien dire. C'est le cas qui compte,
 *      puisque c'est celui du telephone de tous les jours ;
 *   2. `speechSynthesis`, dans un vrai navigateur.
 */
import { voixNativeDisponible, parlerNatif, taireLaVoixNative,
         etatDeLaVoix } from './native.js';

export const supportedWeb = () => typeof speechSynthesis !== 'undefined'
  && typeof SpeechSynthesisUtterance !== 'undefined';
export const supported = () => voixNativeDisponible() || supportedWeb();
/** Qui parle, en clair, pour pouvoir le dire dans les reglages. */
export const moteur = () => voixNativeDisponible() ? 'android'
  : supportedWeb() && frenchVoices().length ? 'navigateur' : 'aucun';
/** Le moteur d'Android est-il encore en train de se preparer ? */
export const voixEnPreparation = () => etatDeLaVoix() === 'attente';

function load() {
  if (!supportedWeb()) return [];
  voices = speechSynthesis.getVoices() || [];
  return voices;
}
if (supportedWeb()) {
  load();
  speechSynthesis.addEventListener?.('voiceschanged', () => { load(); ready = true; });
}

/** Voix disponibles, les francaises d'abord. */
export function frenchVoices() {
  if (!voices.length) load();
  const fr = voices.filter((v) => /^fr/i.test(v.lang));
  return fr.length ? fr : voices;
}

/** Choisit la voix a utiliser : celle reglee, sinon la meilleure francaise. */
function pickVoice(name) {
  if (!voices.length) load();
  if (name) {
    const v = voices.find((x) => x.name === name);
    if (v) return v;
  }
  const fr = voices.filter((v) => /^fr/i.test(v.lang));
  /* Une voix locale ne depend pas du reseau : on la prefere toujours. */
  return fr.find((v) => v.localService) || fr[0] || voices[0] || null;
}

/**
 * Dit un texte.
 * @param {string} text
 * @param {object} o { voice:nom, rate:0.5..1.5, volume:0..1, onend:fn }
 */
export function say(text, o = {}) {
  if (!text) return null;
  /* Le moteur d'Android d'abord : dans l'APK, c'est le seul qui parle. */
  if (parlerNatif(text, o.rate ?? 0.9)) return null;
  if (!supportedWeb()) return null;
  try {
    const u = new SpeechSynthesisUtterance(String(text));
    const v = pickVoice(o.voice);
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'fr-FR'; }
    u.rate = o.rate ?? 0.9;        /* un peu plus lent que la normale */
    u.pitch = o.pitch ?? 1;
    u.volume = o.volume ?? 1;
    if (o.onend) u.addEventListener('end', o.onend);
    speechSynthesis.speak(u);
    return u;
  } catch { return null; }
}
export function shutUp() {
  taireLaVoixNative();
  try { speechSynthesis.cancel(); } catch { /* pas de moteur web */ }
}
export const isSpeaking = () => { try { return speechSynthesis.speaking; } catch { return false; } };

/* ---------------------------------------------------------------- TEXTES */
const heureEnMots = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  const H = ['minuit', 'une heure', 'deux heures', 'trois heures', 'quatre heures', 'cinq heures',
             'six heures', 'sept heures', 'huit heures', 'neuf heures', 'dix heures', 'onze heures',
             'midi', 'treize heures', 'quatorze heures', 'quinze heures', 'seize heures',
             'dix-sept heures', 'dix-huit heures', 'dix-neuf heures', 'vingt heures',
             'vingt-et-une heures', 'vingt-deux heures', 'vingt-trois heures'][h] || `${h} heures`;
  if (!m) return H;
  if (m === 15) return `${H} et quart`;
  if (m === 30) return `${H} et demie`;
  if (m === 45) return `${H} quarante-cinq`;
  return `${H} ${m}`;
};

const doseEnMots = (n, unit) => {
  const map = { 0.25: 'un quart de', 0.5: 'un demi', 0.75: 'trois quarts de', 1: 'un', 2: 'deux',
                3: 'trois', 1.5: 'un et demi' };
  const mot = map[Number(n)];
  const u = { cp: 'comprimé', 'gél.': 'gélule', ml: 'millilitres', gttes: 'gouttes',
              'inj.': 'injection', 'bouff.': 'bouffées', patch: 'patch', 'sach.': 'sachet',
              'supp.': 'suppositoire', 'appl.': 'application' }[unit] || unit;
  if (mot === undefined) return `${fmtDose(n)} ${u}`;
  const pluriel = Number(n) > 1 ? u + 's' : u;
  return `${mot} ${pluriel}`;
};

/** Phrase annoncee a l'alarme. */
export function alarmSentence(group, profileName) {
  const parts = [`Il est ${heureEnMots(group.time)}.`];
  if (profileName) parts.push(`${profileName}, c'est l'heure de vos médicaments.`);
  for (const d of group.doses) {
    const f = formOf(d.med.form);
    parts.push(`${doseEnMots(d.dose, f.unit)} de ${d.med.name}${d.med.strength ? ' ' + spellStrength(d.med.strength) : ''}.`);
  }
  const n = group.doses.length;
  parts.push(n > 1 ? `En tout, ${n} médicaments.` : '');
  return parts.filter(Boolean).join(' ');
}

/** « 100 mg » -> « cent milligrammes » : sinon la synthese lit « m g ». */
function spellStrength(s) {
  return String(s)
    .replace(/\bmg\b/gi, 'milligrammes')
    .replace(/\bg\b/gi, 'grammes')
    .replace(/\bml\b/gi, 'millilitres')
    .replace(/\bUI\b/g, 'unités')
    .replace(/\bmcg\b|\bµg\b/gi, 'microgrammes');
}

/** Phrase courte pour une seule prise (bouton « écouter »). */
export function doseSentence(d) {
  const f = formOf(d.med.form);
  const food = { before: ' avant le repas', during: ' pendant le repas', after: ' après le repas',
                 empty: ', à jeun' }[d.med.food_rule] || '';
  return `À ${heureEnMots(d.time)} : ${doseEnMots(d.dose, f.unit)} de ${d.med.name}` +
         `${d.med.strength ? ' ' + spellStrength(d.med.strength) : ''}${food}.`;
}

export { heureEnMots, doseEnMots, spellStrength };
