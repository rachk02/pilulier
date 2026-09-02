/* ============================================================================
   store.js — etat de l'application et regles metier.
   Un seul endroit ou l'on decide « quelle prise, a quelle heure, pour qui ».
   ========================================================================== */
import { DB } from './db.js';
import { SCHEMA, EXEMPLE, DEFAULT_SETTINGS, formOf } from './schema.js';
import { dkey, fromKey, atTime, addDays, startOfDay, DAY_MS, pad2 } from './util.js';

export const db = new DB(SCHEMA);

/* ------------------------------------------------------------- REGLAGES */
const cacheS = new Map();
export function getS(key) {
  if (cacheS.has(key)) return cacheS.get(key);
  const row = db.get('settings', key);
  let v = row ? row.value : DEFAULT_SETTINGS[key];
  if (row) { try { v = JSON.parse(row.value); } catch { /* valeur brute */ } }
  cacheS.set(key, v);
  return v;
}
export function setS(key, value) {
  cacheS.set(key, value);
  const enc = JSON.stringify(value);
  const row = db.get('settings', key);
  if (row) db.update('settings', key, { value: enc });
  else db.insert('settings', { id: key, value: enc });
  return value;
}
export const allSettings = () => Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, getS(k)]));

/* ------------------------------------------------------------- PROFILS */
export const profiles = () => db.where('profiles', { archived: 0 })
  .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

export function activeProfile() {
  const list = profiles();
  if (!list.length) return null;
  const id = getS('active_profile');
  return list.find((p) => p.id === id) || list[0];
}
export function setActiveProfile(id) { setS('active_profile', id); }

export function saveProfile(data) {
  const row = db.upsert('profiles', { archived: 0, ...data });
  if (!getS('active_profile')) setS('active_profile', row.id);
  return row;
}
export function deleteProfile(id) {
  db.remove('profiles', id);                 // cascade : meds -> schedules -> intakes
  const rest = profiles();
  if (rest.length) setS('active_profile', rest[0].id);
  return rest.length;
}

/* --------------------------------------------------------- MEDICAMENTS */
export const medsOf = (profileId, includeArchived = false) =>
  db.where('meds', (m) => m.profile_id === profileId && (includeArchived || !m.archived))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

export const schedulesOf = (medId) => db.where('schedules', { med_id: medId, active: 1 });

/** Enregistre un medicament + remplace integralement ses plans de prise. */
export function saveMed(med, plans) {
  const row = db.upsert('meds', { archived: 0, ...med });
  if (plans) {
    db.removeWhere('schedules', { med_id: row.id });
    for (const p of plans) {
      db.insert('schedules', {
        med_id: row.id, profile_id: row.profile_id,
        kind: p.kind || 'daily',
        times: JSON.stringify(p.times || []),
        weekdays: JSON.stringify(p.weekdays || []),
        interval_days: p.interval_days || 1,
        cycle_on: p.cycle_on || 0, cycle_off: p.cycle_off || 0,
        anchor_date: p.anchor_date || row.start_date || dkey(),
        active: 1,
      });
    }
  }
  return row;
}
export const archiveMed = (id) => db.update('meds', id, { archived: 1 });
export const unarchiveMed = (id) => db.update('meds', id, { archived: 0 });
export const deleteMed = (id) => db.remove('meds', id);

/* ------------------------------------------------------------- STOCK */
export function addStock(medId, delta, reason = 'reappro', note = '') {
  const m = db.get('meds', medId); if (!m) return null;
  const next = Math.max(0, Math.round(((m.stock_qty || 0) + delta) * 100) / 100);
  db.update('meds', medId, { stock_qty: next });
  db.insert('stock_moves', { med_id: medId, profile_id: m.profile_id, delta, reason, note });
  return next;
}
/** Nombre de jours de traitement restants d'apres la consommation quotidienne. */
export function daysLeft(med) {
  const perDay = dailyConsumption(med.id);
  if (!perDay) return null;
  return Math.floor((med.stock_qty || 0) / perDay);
}
export function dailyConsumption(medId) {
  let total = 0;
  for (const s of schedulesOf(medId)) {
    const times = parseTimes(s);
    const perOcc = times.reduce((a, t) => a + (Number(t.dose) || 0), 0);
    if (s.kind === 'daily') total += perOcc;
    else if (s.kind === 'weekdays') total += perOcc * (JSON.parse(s.weekdays || '[]').length / 7);
    else if (s.kind === 'interval') total += perOcc / Math.max(1, s.interval_days || 1);
    else if (s.kind === 'cycle') {
      const on = s.cycle_on || 1, off = s.cycle_off || 0;
      total += perOcc * (on / Math.max(1, on + off));
    }
  }
  return Math.round(total * 1000) / 1000;
}
export const lowStockMeds = (profileId) => medsOf(profileId).filter((m) => {
  if (m.stock_qty === null || m.stock_qty === undefined) return false;
  const d = daysLeft(m);
  return (m.stock_alert != null && m.stock_qty <= m.stock_alert) || (d !== null && d <= 5);
});

/* ------------------------------------------- MOTEUR D'OCCURRENCES */
const parseTimes = (s) => { try { return JSON.parse(s.times || '[]'); } catch { return []; } };
const parseWd    = (s) => { try { return JSON.parse(s.weekdays || '[]'); } catch { return []; } };

function scheduleRunsOn(sched, med, date) {
  const d = startOfDay(date);
  if (med.start_date && d < startOfDay(fromKey(med.start_date))) return false;
  if (med.end_date   && d > startOfDay(fromKey(med.end_date)))   return false;
  const anchor = startOfDay(fromKey(sched.anchor_date || med.start_date || dkey(d)));
  const n = Math.round((d - anchor) / DAY_MS);
  switch (sched.kind) {
    case 'daily':    return true;
    case 'weekdays': return parseWd(sched).includes(d.getDay());
    case 'interval': return n >= 0 && n % Math.max(1, sched.interval_days || 1) === 0;
    case 'cycle': {
      const on = sched.cycle_on || 1, off = sched.cycle_off || 0;
      if (n < 0) return false;
      return (n % (on + off)) < on;
    }
    case 'prn':      return false;    // « si besoin » : pas d'occurrence programmee
    default:         return false;
  }
}

/**
 * Toutes les prises prevues pour une date donnee, fusionnees avec l'historique.
 * @returns {Array} triees par heure puis par nom
 */
export function dosesForDate(date, profileId = activeProfile()?.id) {
  if (!profileId) return [];
  const key = dkey(date);
  const now = Date.now();
  const windowMs = (getS('alarm_window_min') || 90) * 60000;
  const out = [];

  for (const med of medsOf(profileId)) {
    for (const sched of schedulesOf(med.id)) {
      if (!scheduleRunsOn(sched, med, date)) continue;
      for (const slot of parseTimes(sched)) {
        const planned = atTime(fromKey(key), slot.t);
        const slotId = `${key}T${slot.t}`;
        const intake = db.find('intakes',
          (i) => i.med_id === med.id && i.schedule_id === sched.id && i.slot === slotId);
        let status = intake?.status || 'pending';
        if (status === 'pending') {
          if (planned.getTime() > now) status = 'upcoming';
          else if (now - planned.getTime() <= windowMs) status = 'due';
          else status = 'missed';
        }
        out.push({
          key: `${sched.id}:${slotId}`,
          slot: slotId, time: slot.t, planned, dose: Number(slot.dose) || 1,
          med, sched, intake, status, profile_id: profileId,
        });
      }
    }
  }
  out.sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name, 'fr'));
  return out;
}

/** Regroupe les prises par heure : [{ time, doses[] }] */
export function groupByTime(doses) {
  const map = new Map();
  for (const d of doses) {
    if (!map.has(d.time)) map.set(d.time, []);
    map.get(d.time).push(d);
  }
  return [...map.entries()].map(([time, list]) => ({ time, doses: list }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

/* ------------------------------------------------ ENREGISTRER UNE PRISE */
function writeIntake(dose, status, extra = {}) {
  const base = {
    profile_id: dose.profile_id, med_id: dose.med.id, schedule_id: dose.sched.id,
    slot: dose.slot, planned_at: dose.planned.getTime(), dose: dose.dose, status, ...extra,
  };
  return dose.intake ? db.update('intakes', dose.intake.id, base) : db.insert('intakes', base);
}

export function markTaken(dose, when = Date.now()) {
  const was = dose.intake?.status;
  const row = writeIntake(dose, 'taken', { taken_at: when });
  if (getS('auto_stock') && was !== 'taken' && dose.med.stock_qty != null) {
    addStock(dose.med.id, -dose.dose, 'prise', dose.slot);
  }
  return row;
}
export function markSkipped(dose, note = '') {
  const was = dose.intake?.status;
  if (getS('auto_stock') && was === 'taken' && dose.med.stock_qty != null) {
    addStock(dose.med.id, dose.dose, 'annulation', dose.slot);
  }
  return writeIntake(dose, 'skipped', { taken_at: null, note });
}
export function clearIntake(dose) {
  if (!dose.intake) return;
  if (getS('auto_stock') && dose.intake.status === 'taken' && dose.med.stock_qty != null) {
    addStock(dose.med.id, dose.dose, 'annulation', dose.slot);
  }
  db.remove('intakes', dose.intake.id);
}
/** Bascule pris / non pris (appui sur la pastille). */
export function toggleTaken(dose) {
  if (dose.intake?.status === 'taken') { clearIntake(dose); return false; }
  markTaken(dose); return true;
}
export function takeAll(doses) {
  let n = 0;
  for (const d of doses) if (d.intake?.status !== 'taken') { markTaken(d); n++; }
  return n;
}

/* ==========================================================================
   LA DEVISE
   Les prix sont stockes comme de simples nombres, dans la devise reglee au
   moment de la saisie. Changer l'etiquette sans toucher aux nombres etait un
   bug silencieux : 21 000 FCFA devenaient 21 000 €. On convertit donc pour
   de vrai, et l'appelant se charge de demander avant.
   ========================================================================== */

/** Tous les montants du dossier, pour montrer un apercu avant de convertir. */
export function montantsDuDossier() {
  return db.all('meds').map((m) => m.pack_price)
    .filter((v) => Number(v) > 0)
    .sort((a, b) => b - a);
}

/**
 * Convertit tous les prix enregistres, tous profils confondus.
 * @param {number} facteur combien vaut 1 unite de l'ancienne devise dans la
 *                         nouvelle. C'est l'appelant qui le fournit, pour
 *                         qu'un taux corrige a la main soit respecte.
 * @param {number} decimales 0 pour le franc CFA, 2 pour l'euro
 * @returns le nombre de prix modifies
 */
export function convertirLesPrix(facteur, decimales = 0) {
  const f = Number(facteur);
  if (!Number.isFinite(f) || f <= 0) return 0;
  const p = Math.pow(10, decimales);
  let n = 0;
  for (const m of db.all('meds')) {
    if (!(Number(m.pack_price) > 0)) continue;
    db.update('meds', m.id, { pack_price: Math.round(m.pack_price * f * p) / p });
    n++;
  }
  return n;
}

/* --------------------------------------------------- BOITES CONNUES */
/**
 * Une boite deja scannee, reconnue a son code produit.
 * C'est le cas le plus frequent : on rachete chaque mois les memes boites.
 * @returns {object|null} le medicament enregistre, tous profils confondus
 */
export function findByGtin(gtin, profileId = null) {
  if (!gtin) return null;
  const g = String(gtin).replace(/^0+/, '');
  const memeCode = (m) => m.gtin && String(m.gtin).replace(/^0+/, '') === g;
  /* Le profil actif d'abord : c'est presque toujours le bon. */
  return db.where('meds', (m) => memeCode(m) && m.profile_id === profileId)[0]
      || db.where('meds', memeCode)[0] || null;
}

/** Le plan de prise d'un medicament, sous la forme attendue par les formulaires. */
export function planOf(medId) {
  const s = schedulesOf(medId)[0];
  if (!s) return null;
  return { kind: s.kind, times: parseTimes(s), weekdays: parseWd(s),
           interval_days: s.interval_days, cycle_on: s.cycle_on, cycle_off: s.cycle_off };
}

/* ------------------------------------------------------- PEREMPTION */
/**
 * Boites dont la date de peremption approche ou est passee.
 * @returns [{ med, iso, days, level }] les perimees d'abord
 */
export function expiryWatch(profileId) {
  const lead = getS('expiry_lead_days') || 60;
  const out = [];
  for (const m of medsOf(profileId)) {
    if (!m.expiry) continue;
    const d = new Date(m.expiry + 'T12:00:00');
    if (isNaN(d)) continue;
    const days = Math.floor((d - Date.now()) / DAY_MS);
    if (days > lead) continue;
    out.push({ med: m, iso: m.expiry, days, level: days < 0 ? 'expired' : 'soon' });
  }
  return out.sort((a, b) => a.days - b.days);
}

/** Une boite perimee ne devrait plus etre proposee : on le signale fort. */
export const isExpired = (med) => {
  if (!med?.expiry) return false;
  const d = new Date(med.expiry + 'T12:00:00');
  return !isNaN(d) && d.getTime() < Date.now();
};

/* ---------------------------------------------------- RENOUVELLEMENT */
/**
 * Etat d'approvisionnement d'un traitement.
 * @returns [{ med, perDay, left, runOut, urgent }] trie par urgence
 */
export function supplyStatus(profileId) {
  const lead = getS('refill_lead_days') || 7;
  return medsOf(profileId).map((m) => {
    const perDay = dailyConsumption(m.id);
    const left = perDay ? Math.floor((m.stock_qty || 0) / perDay) : null;
    const runOut = left === null ? null : addDays(new Date(), left);
    return { med: m, perDay, left, runOut, urgent: left !== null && left <= lead };
  }).filter((x) => x.perDay > 0)
    .sort((a, b) => (a.left ?? 9999) - (b.left ?? 9999));
}

/** Date a laquelle le premier medicament sera epuise. */
export function firstRunOut(profileId) {
  const s = supplyStatus(profileId).filter((x) => x.left !== null);
  return s.length ? s[0] : null;
}

/**
 * Liste de courses pour couvrir `days` jours de traitement.
 * @returns { items:[{med, need, boxes, cost}], total, days }
 */
export function refillList(profileId, days = 30) {
  const items = [];
  let total = 0;
  for (const { med, perDay } of supplyStatus(profileId)) {
    const need = Math.max(0, Math.ceil(perDay * days - (med.stock_qty || 0)));
    if (!need) continue;
    const pack = med.pack_qty || 30;
    const boxes = Math.ceil(need / pack);
    const cost = med.pack_price ? boxes * med.pack_price : null;
    if (cost) total += cost;
    items.push({ med, need, boxes, cost, perDay });
  }
  return { items, total, days };
}

/* ---------------------------------------------------------- SYMPTOMES */
export const addSymptom = (s) => db.insert('symptoms', { at: Date.now(), severity: 1, ...s });
export const symptomsOf = (profileId, days = 90) => db.where('symptoms',
  (r) => r.profile_id === profileId && r.at >= Date.now() - days * DAY_MS)
  .sort((a, b) => b.at - a.at);
export const deleteSymptom = (id) => db.remove('symptoms', id);

/** Regroupe les symptomes par type sur la periode. */
export function symptomTally(profileId, days = 30) {
  const map = new Map();
  for (const s of symptomsOf(profileId, days)) {
    if (!map.has(s.key)) map.set(s.key, { key: s.key, count: 0, last: s.at, max: 0 });
    const e = map.get(s.key);
    e.count++; e.last = Math.max(e.last, s.at); e.max = Math.max(e.max, s.severity || 1);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------ MESURES */
export const addMeasure = (m) => db.insert('measures', { at: Date.now(), ...m });
export const measuresOf = (profileId, kind, days = 90) => db.where('measures',
  (r) => r.profile_id === profileId && (!kind || r.kind === kind) &&
         r.at >= Date.now() - days * DAY_MS).sort((a, b) => b.at - a.at);

/* ------------------------------------------------------- STATISTIQUES */
/** Observance sur N jours (jours passes uniquement, aujourd'hui inclus partiellement). */
export function adherence(profileId, days = 7) {
  let taken = 0, total = 0, skipped = 0, missed = 0;
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    for (const d of dosesForDate(addDays(today, -i), profileId)) {
      if (d.status === 'upcoming' || d.status === 'due') continue;   // pas encore jugeable
      total++;
      if (d.status === 'taken') taken++;
      else if (d.status === 'skipped') skipped++;
      else missed++;
    }
  }
  return { taken, skipped, missed, total, rate: total ? Math.round((taken / total) * 100) : null };
}

/** Serie journaliere pour le graphique : [{ key, label, rate, taken, total }] */
export function adherenceSeries(profileId, days = 14) {
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const list = dosesForDate(d, profileId);
    const judged = list.filter((x) => x.status !== 'upcoming' && x.status !== 'due');
    const taken = judged.filter((x) => x.status === 'taken').length;
    out.push({ key: dkey(d), date: d, taken, total: judged.length,
               rate: judged.length ? Math.round((taken / judged.length) * 100) : null });
  }
  return out;
}

/** Etat d'une journee pour le calendrier : ok | partial | bad | idle | future */
export function dayStatus(date, profileId) {
  const list = dosesForDate(date, profileId);
  if (!list.length) return { state: 'idle', taken: 0, total: 0 };
  const taken = list.filter((d) => d.status === 'taken').length;
  const pending = list.filter((d) => d.status === 'upcoming' || d.status === 'due').length;
  if (pending === list.length) return { state: 'future', taken, total: list.length };
  if (taken === list.length) return { state: 'ok', taken, total: list.length };
  if (taken === 0) return { state: 'bad', taken, total: list.length };
  return { state: 'partial', taken, total: list.length };
}

/** Serie ininterrompue de journees a 100 %. */
export function streak(profileId) {
  let n = 0;
  for (let i = 1; i <= 365; i++) {
    const s = dayStatus(addDays(new Date(), -i), profileId);
    if (s.state === 'ok') n++;
    else if (s.state === 'idle') continue;
    else break;
  }
  const t = dayStatus(new Date(), profileId);
  if (t.state === 'ok') n++;
  return n;
}

/* --------------------------------------------------------- INITIALISATION */
export async function initStore() {
  await db.open();
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!db.get('settings', k)) db.insert('settings', { id: k, value: JSON.stringify(v) });
  }
  cacheS.clear();
  /* PAS de creation automatique de profil : l'application s'installe vide.
     C'est le premier lancement (views/onboarding.js) qui demande a qui elle
     va servir. Une application de sante qui arrive avec les donnees de
     quelqu'un d'autre, meme en exemple, n'est pas acceptable. */
  if (!activeProfile() && profiles().length) setS('active_profile', profiles()[0].id);
  return db;
}

/** L'application est-elle encore vierge ? */
export const estVierge = () => db.all('profiles').length === 0;

/**
 * Charge l'exemple fictif — a la demande, jamais tout seul.
 * Les dates sont calees sur aujourd'hui pour que l'ecran du jour ait quelque
 * chose a montrer tout de suite.
 */
export function chargerExemple(options = {}) {
  const { profil = null, choix = null } = options;
  const aujourdhui = dkey(new Date());

  /* Deux usages : deposer les exemples dans un carnet existant (le cas normal,
     depuis le premier lancement ou les reglages), ou fabriquer un profil de
     demonstration a part quand il n'y a aucun carnet ou aller. */
  const cible = profil ? db.get('profiles', profil) : db.insert('profiles', EXEMPLE.profile);
  if (!cible) return null;

  const liste = Array.isArray(choix)
    ? EXEMPLE.meds.filter((m) => choix.includes(m.name))
    : EXEMPLE.meds;

  for (const m of liste) {
    const { times, end_after_days, ...med } = m;
    const fin = end_after_days
      ? dkey(new Date(Date.now() + end_after_days * 86400000)) : null;
    const row = db.insert('meds', {
      ...med, ...EXEMPLE.common, start_date: aujourdhui, end_date: fin,
      profile_id: cible.id, archived: 0,
    });
    db.insert('schedules', {
      med_id: row.id, profile_id: cible.id, kind: 'daily',
      times: JSON.stringify(times), weekdays: '[]', interval_days: 1,
      cycle_on: 0, cycle_off: 0, anchor_date: aujourdhui, active: 1,
    });
  }
  if (!profil) setS('active_profile', cible.id);
  return cible;
}

/** Ancien nom, conserve le temps que rien ne l'appelle plus. */
export const seedFromPrescription = chargerExemple;

export { formOf, parseTimes, parseWd };
