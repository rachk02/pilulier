/* ============================================================================
   sync.js — le telephone du pere publie, celui du fils recoit.

   COMMENT LA VIE PRIVEE EST PROTEGEE
   Le telephone du patient ne publie pas sa base : il publie un *compte rendu*
   (prises du jour, observance, stock, ressenti). Ce compte rendu est chiffre
   dans le navigateur avec une cle derivee du code d'appairage, code qui n'est
   JAMAIS transmis. Le serveur ne recoit qu'un identifiant opaque et un bloc
   illisible ; il ne peut pas savoir de qui ni de quoi il s'agit.

   Consequence assumee : si le code est perdu, les donnees publiees sont
   irrecuperables. C'est le prix du chiffrement de bout en bout.
   ========================================================================== */
import { activeProfile, dosesForDate, adherence, adherenceSeries, streak,
         supplyStatus, symptomTally, measuresOf, medsOf, getS, setS } from './store.js';
import { formOf } from './schema.js';
import { missStreaks, symptomLabel, RED_FLAGS } from './safety.js';
import { dkey, fmtDose, addDays } from './util.js';
import { RELAIS_COMPILE } from './relais.js';

/* ==========================================================================
   OU EST LA BOITE AUX LETTRES

   Servie depuis un vrai domaine, l'application appelle `/api/sync` : la
   fonction est a cote d'elle. Dans l'APK, les fichiers viennent de
   `https://pilulier.local/` — une origine inventee, servie par la coque — et
   `/api/sync` n'y existe pas. Le suivi a distance ne pouvait donc PAS
   fonctionner sur telephone, quoi qu'on fasse dans l'interface.

   L'adresse est donc un reglage. On la transporte dans le QR d'appairage :
   le proche n'a rien a saisir, il scanne et les deux telephones parlent au
   meme relais.
   ========================================================================== */
const ENDPOINT_LOCAL = '/api/sync';

/** L'application tourne-t-elle depuis une origine qui peut heberger l'API ? */
export const relaisLocalPossible = () =>
  typeof location !== 'undefined' && /^https?:$/.test(location.protocol) &&
  !/(^|\.)pilulier\.local$/.test(location.hostname);

/**
 * L'adresse du relais, telle qu'elle sera appelee. Trois sources, dans cet
 * ordre : ce que l'utilisateur a saisi, ce qui a ete pose a la compilation
 * (voir relais.js), et enfin « a cote de l'application » quand elle est
 * servie depuis un vrai domaine.
 */
export function serveur() {
  const p = String(getS('sync_server') || '').trim();
  if (p) return p.replace(/\/+$/, '');
  if (RELAIS_COMPILE) return String(RELAIS_COMPILE).replace(/\/+$/, '');
  return relaisLocalPossible() ? ENDPOINT_LOCAL : '';
}

/** D'ou vient l'adresse actuelle — pour pouvoir le dire dans les reglages. */
export function origineDuRelais() {
  if (String(getS('sync_server') || '').trim()) return 'saisie';
  if (RELAIS_COMPILE) return 'compilation';
  return relaisLocalPossible() ? 'locale' : 'aucune';
}

/**
 * Nettoie une adresse tapee a la main.
 *
 * On saisit « sync-one-virid.vercel.app » — sans schema, sans chemin. Tel
 * quel, `fetch()` le prend pour une adresse RELATIVE et va frapper
 * `http://localhost:5173/sync-one-virid.vercel.app` : le vrai serveur n'est
 * jamais appele. On ajoute donc `https://` s'il manque, et `/api/sync` quand
 * on n'a donne qu'un domaine.
 */
export function normaliserAdresse(url) {
  let v = String(url || '').trim();
  if (!v) return '';
  /* Un chemin absolu vaut « a cote de l'application » : on le resout contre
     l'origine courante, qui est justement ce que l'APK n'a pas. */
  if (v.startsWith('/')) {
    try { return new URL(v, location.href).href.replace(/\/+$/, ''); } catch { return ''; }
  }
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  let u;
  try { u = new URL(v); } catch { return ''; }
  /* Un hote sans point ne peut pas etre un relais public : c'est presque
     toujours une faute de frappe, et la laisser passer produirait un appel
     vers nulle part que personne ne saurait diagnostiquer. */
  if (!/^[a-z0-9.-]+$/i.test(u.hostname)) return '';
  if (!u.hostname.includes('.') && u.hostname !== 'localhost') return '';
  if (u.pathname === '/' || u.pathname === '') u.pathname = '/api/sync';
  u.search = ''; u.hash = '';
  return u.href.replace(/\/+$/, '');
}

/** Enregistre l'adresse du relais. Rend l'adresse normalisee. */
export function setServeur(url) {
  const v = normaliserAdresse(url);
  setS('sync_server', v);
  return v;
}

/**
 * Un relais joignable, ou une explication. Jamais un echec muet.
 *
 * On sonde avec un identifiant VOLONTAIREMENT invalide. La fonction Pilulier
 * repond alors 400 « identifiant invalide » — c'est sa signature. N'importe
 * quel autre serveur, ou une adresse mal comprise, rend 404 ou 200. Sonder
 * avec un identifiant valide ne prouvait rien : la boite vide rend 404, et
 * un site quelconque aussi.
 */
export async function testerRelais(url = serveur()) {
  const cible = normaliserAdresse(url);
  if (!cible) throw new Error('Adresse vide ou illisible. Exemple : https://mon-projet.vercel.app/api/sync');

  let res;
  try {
    res = await fetch(`${cible}?id=pas-un-identifiant`, { cache: 'no-store' });
  } catch (e) {
    throw new Error(`Relais injoignable : ${e.message}. Vérifie l’adresse et la connexion.`);
  }

  if (res.status === 400) {
    let j = null;
    try { j = await res.json(); } catch { /* pas du JSON */ }
    if (j && typeof j.error === 'string') {
      /* `stockage` n'existe pas sur un relais deploye avant cette version :
         on ne sait alors pas, et on le dit comme tel. */
      return { url: cible, stockage: j.stockage || 'inconnu' };
    }
  }
  if (res.status === 404) {
    throw new Error(`404 à cette adresse : la fonction n’y est pas. `
      + `Vérifie que api/sync.js est bien déployé, et que l’adresse finit par /api/sync.`);
  }
  throw new Error(`Réponse ${res.status} : ce n’est pas une fonction Pilulier.`);
}

function pointDeChute() {
  const url = serveur();
  if (!url) {
    throw new Error('Aucun relais configuré. Réglages → Suivi à distance → Adresse du relais.');
  }
  return url;
}

/* ------------------------------------------------- Le lien d'appairage
   Un seul geste transporte tout ce qu'il faut : le code ET le relais. Ce
   n'est pas une URL — une URL finirait dans un historique, et le code ne doit
   voyager que d'ecran a appareil photo. */
const MARQUE = 'PILULIER1';

/* L'adresse voyage en ABSOLU. Servie depuis le web, elle vaut « /api/sync » —
   un chemin qui ne veut rien dire sur l'autre telephone, ou l'application est
   servie depuis une origine locale. On la resout avant de la transmettre. */
export function adresseAbsolue(url = serveur()) {
  if (!url) return '';
  try { return new URL(url, location.href).href; } catch { return url; }
}

export function lienDAppairage(code = getS('sync_code'), url = serveur()) {
  return [MARQUE, normalizeCode(code), adresseAbsolue(url)].join('|');
}
export function lireLienDAppairage(texte) {
  const parts = String(texte || '').trim().split('|');
  if (parts[0] !== MARQUE) return null;
  const code = normalizeCode(parts[1] || '');
  if (!isValidCode(code)) return null;
  return { code, serveur: (parts[2] || '').trim() };
}
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   /* ni O/0 ni I/1 */
const SALT = 'pilulier-sync-v1';
const ITER = 200000;

/* --------------------------------------------------------- Le code */
export function makeCode() {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  const s = [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
export const normalizeCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const isValidCode = (c) => normalizeCode(c).length === 12;
export const prettyCode = (c) => {
  const n = normalizeCode(c);
  return `${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8, 12)}`;
};

/* ------------------------------------------------------ Les clefs */
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKeys(code) {
  const n = normalizeCode(code);
  /* Identifiant public : un simple condensat, sans lien avec la cle. */
  const idBuf = await crypto.subtle.digest('SHA-256', enc.encode('pilulier-id|' + n));
  const keyId = [...new Uint8Array(idBuf).slice(0, 16)]
    .map((x) => x.toString(16).padStart(2, '0')).join('');

  const base = await crypto.subtle.importKey('raw', enc.encode('pilulier-key|' + n),
    'PBKDF2', false, ['deriveKey']);
  const aes = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(SALT), iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { keyId, aes };
}

async function seal(obj, aes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes,
    enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}
async function open(blob, aes) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, aes,
    unb64(blob.ct));
  return JSON.parse(dec.decode(pt));
}

/* ------------------------------------------------- Le compte rendu */
/** Prepare le rapport publie par le telephone du patient. */
export function buildReport() {
  const p = activeProfile();
  if (!p) return null;
  const today = dosesForDate(new Date(), p.id);
  const a = adherence(p.id, 7);

  const alerts = missStreaks(p.id, medsOf(p.id), dosesForDate)
    .map((x) => ({ level: x.level, text: x.text }));
  const sy = symptomTally(p.id, 7);
  for (const s of sy) {
    if (RED_FLAGS.includes(s.key)) {
      alerts.unshift({ level: 'bad',
        text: `Signe à ne pas laisser passer signalé : ${symptomLabel(s.key)}.` });
    }
  }

  return {
    v: 1,
    at: Date.now(),
    profile: { name: p.name, relation: p.relation, sex: p.sex, birthdate: p.birthdate,
               color: p.color, avatar_kind: p.avatar_kind, avatar_value: p.avatar_value,
               doctor_name: p.doctor_name, doctor_phone: p.doctor_phone },
    day: dkey(),
    today: {
      total: today.length,
      taken: today.filter((d) => d.status === 'taken').length,
      doses: today.map((d) => ({
        time: d.time, name: d.med.name, strength: d.med.strength || '',
        dose: fmtDose(d.dose), unit: formOf(d.med.form).unit, status: d.status,
        takenAt: d.intake?.taken_at || null, color: d.med.color,
      })),
    },
    week: adherenceSeries(p.id, 7).map((s) => ({ key: s.key, taken: s.taken,
      total: s.total, rate: s.rate })),
    adherence7: a,
    streak: streak(p.id),
    supply: supplyStatus(p.id).map((s) => ({ name: s.med.name, left: s.left, urgent: s.urgent })),
    symptoms: sy.map((s) => ({ key: s.key, label: symptomLabel(s.key), count: s.count, last: s.last })),
    measures: measuresOf(p.id, null, 7).slice(0, 6)
      .map((m) => ({ kind: m.kind, v1: m.v1, v2: m.v2, v3: m.v3, at: m.at })),
    alerts,
  };
}

/* ------------------------------------------------------- Le reseau */
export async function publish(code = getS('sync_code')) {
  if (!isValidCode(code)) throw new Error('Code de liaison invalide.');
  const report = buildReport();
  if (!report) throw new Error('Aucun profil à publier.');
  const { keyId, aes } = await deriveKeys(code);
  const blob = await seal(report, aes);
  const res = await fetch(`${pointDeChute()}?id=${keyId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blob),
  });
  if (!res.ok) throw new Error(`Publication refusée (${res.status}).`);
  setS('sync_last', Date.now());
  return report.at;
}

export async function receive(code = getS('sync_code')) {
  if (!isValidCode(code)) throw new Error('Code de liaison invalide.');
  const { keyId, aes } = await deriveKeys(code);
  const res = await fetch(`${pointDeChute()}?id=${keyId}`, { cache: 'no-store' });
  if (res.status === 404) return null;                 /* rien n'a encore ete publie */
  if (!res.ok) throw new Error(`Lecture impossible (${res.status}).`);
  const blob = await res.json();
  let report;
  try { report = await open(blob, aes); }
  catch { throw new Error('Déchiffrement impossible : le code ne correspond pas.'); }
  localStorage.setItem('pilulier:mirror', JSON.stringify(report));
  setS('sync_last', Date.now());
  return report;
}

/** Dernier rapport recu, conserve localement pour un affichage hors-ligne. */
export function mirror() {
  try { return JSON.parse(localStorage.getItem('pilulier:mirror') || 'null'); }
  catch { return null; }
}
export function forgetMirror() { localStorage.removeItem('pilulier:mirror'); }

/** Coupe la liaison sur ce telephone (le blob distant expire tout seul). */
export function unlink() {
  setS('sync_code', ''); setS('sync_role', ''); setS('sync_last', 0);
  forgetMirror();
}

/* --------------------------------------------------- Automatisation */
let timer = null;
/**
 * Lance la synchronisation periodique selon le role choisi.
 * Patient : publie. Aidant : recoit. Toutes les 15 minutes et a l'ouverture.
 */
export function startSync(onUpdate = () => {}) {
  stopSync();
  const tick = async () => {
    if (!getS('sync_auto') || !isValidCode(getS('sync_code'))) return;
    if (!navigator.onLine) return;
    try {
      if (getS('sync_role') === 'patient') { await publish(); onUpdate('published'); }
      else if (getS('sync_role') === 'aidant') { const r = await receive(); if (r) onUpdate('received', r); }
    } catch (e) { console.warn('[sync]', e.message); }
  };
  timer = setInterval(tick, 15 * 60000);
  setTimeout(tick, 4000);
  addEventListener('online', tick);
  return tick;
}
export function stopSync() { clearInterval(timer); timer = null; }
