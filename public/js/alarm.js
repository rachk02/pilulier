/* ============================================================================
   alarm.js — moteur de rappel.

   Trois filets superposes, du plus fiable au plus riche :
     1. L'agenda du telephone (export .ics)  -> sonne meme app fermee.
     2. Une notification systeme              -> si l'autorisation est donnee.
     3. L'alarme plein ecran de l'app         -> sonnerie + vibration + actions.
   ========================================================================== */
import { el, ico, dkey, atTime, fromKey, pad2, fmtDose, relTime } from './util.js';
import { dosesForDate, getS, setS, activeProfile, markTaken, takeAll, markSkipped, db } from './store.js';
import { formOf } from './schema.js';
import { playRingtone, stopRingtone, vibrate, stopVibrate, unlockAudio } from './sound.js';
import { say, shutUp, alarmSentence, supported as voiceSupported } from './speech.js';
import { toast, attachRipple } from './ui.js';
import { alarmeQuiNousAReveilles, taireNotificationNative, estNatif } from './native.js';

const TICK_MS = 15000;
const snoozed = new Map();     // "2026-08-25T08:00" -> timestamp de reveil
const handled = new Set();     // creneaux traites pendant cette session
let timer = null;
let overlay = null;
let ringing = null;
let vibeTimer = null;
let wakeLock = null;
let onChange = () => {};

/* ------------------------------------------------------------ Wake lock */
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* non supporte : sans importance */ }
}

/* --------------------------------------------------------- Notifications */
export async function askNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') { setS('notifications', true); return 'granted'; }
  const r = await Notification.requestPermission();
  setS('notifications', r === 'granted');
  return r;
}
function notify(title, body, tag) {
  if (!getS('notifications') || Notification?.permission !== 'granted') return;
  try {
    navigator.serviceWorker?.ready?.then((reg) => {
      reg.showNotification(title, {
        body, tag, renotify: true, requireInteraction: true,
        icon: '/icons/icon-192.png', badge: '/icons/badge-72.png',
        vibrate: [400, 200, 400], lang: 'fr',
        actions: [{ action: 'taken', title: 'Pris' }, { action: 'snooze', title: 'Plus tard' }],
        data: { tag },
      });
    }).catch(() => new Notification(title, { body, tag }));
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------- Detection */
/** Creneaux a declencher maintenant : heure passee, dose encore en attente. */
function pendingSlots() {
  const p = activeProfile(); if (!p) return [];
  const now = Date.now();
  const win = (getS('alarm_window_min') || 90) * 60000;
  const byTime = new Map();
  for (const d of dosesForDate(new Date(), p.id)) {
    if (d.intake) continue;                          // deja pris / saute
    const t = d.planned.getTime();
    if (t > now) continue;                           // pas encore l'heure
    if (now - t > win) continue;                     // trop tard : compte comme manquee
    const slotKey = `${dkey()}T${d.time}`;
    const until = snoozed.get(slotKey);
    if (until && now < until) continue;
    if (!byTime.has(d.time)) byTime.set(d.time, { time: d.time, key: slotKey, doses: [] });
    byTime.get(d.time).doses.push(d);
  }
  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
}

function tick() {
  if (overlay) return;                                // une alarme est deja a l'ecran
  const groups = pendingSlots();
  const next = groups.find((g) => !handled.has(g.key) || (snoozed.get(g.key) || 0) <= Date.now());
  if (next) fire(next);
}

/* ------------------------------------------------------------ Declenchement */
export function fire(group) {
  if (overlay) return;
  handled.add(group.key);
  snoozed.delete(group.key);

  const p = activeProfile();
  const names = group.doses.map((d) => d.med.name).join(', ');
  notify(`${group.time} — ${p?.name || ''}`,
    `${group.doses.length} médicament${group.doses.length > 1 ? 's' : ''} à prendre : ${names}`,
    group.key);

  /* L'ecran de l'application prend le relais : la notification systeme, et
     la sonnerie du telephone qui va avec, n'ont plus lieu d'etre. Sans ca on
     entendrait deux sonneries, celle d'Android et la notre. */
  taireNotificationNative();

  overlay = buildOverlay(group);
  document.body.append(overlay);
  attachRipple(overlay);
  keepAwake(true);

  if (getS('sound')) {
    unlockAudio();
    ringing = playRingtone(getS('ringtone'), { loops: Infinity, volume: getS('volume') ?? 0.8 });
  }
  if (getS('vibrate')) {
    const buzz = () => vibrate('alarm', true);
    buzz(); vibeTimer = setInterval(buzz, 3000);
  }
  /* La voix passe apres la sonnerie : on annonce, puis on laisse sonner. */
  if (getS('voice') && voiceSupported()) {
    setTimeout(() => say(alarmSentence(group, p?.name),
      { voice: getS('voice_name'), rate: getS('voice_rate') }), 1400);
  }
}

function stopAll() {
  stopRingtone(); ringing = null; shutUp();
  clearInterval(vibeTimer); vibeTimer = null;
  stopVibrate(); keepAwake(false);
}
function closeOverlay() {
  stopAll();
  if (!overlay) return;
  overlay.classList.add('is-closing');
  const n = overlay; overlay = null;
  setTimeout(() => n.remove(), 260);
  onChange();
}

/* --------------------------------------------------------------- L'ecran */
function buildOverlay(group) {
  const p = activeProfile();
  const node = el('div', { class: 'alarm', role: 'alertdialog', 'aria-modal': 'true',
                           'aria-label': `Rappel de ${group.time}` });

  const list = el('div', { class: 'alarm-list' });
  group.doses.forEach((d, i) => {
    const unit = formOf(d.med.form).unit;
    const row = el('div', { class: 'alarm-item', style: { '--i': i } });
    /* La photo de la boite vaut mieux qu'un pictogramme : il y a six boites
       sur la table et il faut prendre la bonne. */
    if (d.med.photo) {
      row.append(el('img', { class: 'alarm-photo', src: d.med.photo, alt: '' }));
    } else {
      row.insertAdjacentHTML('beforeend', ico(formOf(d.med.form).icon));
    }
    row.append(el('div', { class: 'grow' },
      el('b', { text: `${d.med.name}${d.med.strength ? ' ' + d.med.strength : ''}` }),
      el('small', { text: `${fmtDose(d.dose)} ${unit}${d.med.food_rule && d.med.food_rule !== 'any'
        ? ' · ' + foodShort(d.med.food_rule) : ''}` })));
    list.append(row);
  });

  node.append(
    el('div', { class: 'alarm-bell pulse-ring', html: ico('bell') }),
    el('div', { class: 'alarm-time', text: group.time }),
    el('h2', { text: `C'est l'heure${p ? ' — ' + p.name : ''}` }),
    list,
    el('div', { class: 'alarm-actions' },
      el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button',
        html: ico('check') + `<span>Tout pris (${group.doses.length})</span>`,
        onclick: () => {
          const n = takeAll(group.doses);
          closeOverlay();
          toast(`${n} prise${n > 1 ? 's' : ''} enregistrée${n > 1 ? 's' : ''}`, { type: 'ok' });
        } }),
      el('button', { class: 'btn btn-ghost btn-block', type: 'button',
        html: ico('snooze') + `<span>Me rappeler dans ${getS('snooze_min')} min</span>`,
        onclick: () => {
          const min = getS('snooze_min') || 10;
          snoozed.set(group.key, Date.now() + min * 60000);
          handled.delete(group.key);
          closeOverlay();
          toast(`Rappel reporté de ${min} minutes.`, { icon: 'snooze' });
        } }),
      el('button', { class: 'btn btn-ghost btn-block', type: 'button',
        html: ico('sound') + '<span>Répéter à voix haute</span>',
        onclick: () => { shutUp();
          say(alarmSentence(group, p?.name), { voice: getS('voice_name'), rate: getS('voice_rate') }); },
        hidden: !(getS('voice') && voiceSupported()) || null }),
      el('button', { class: 'btn btn-quiet btn-block', type: 'button', text: 'Fermer',
        onclick: () => { closeOverlay(); } })),
    el('p', { class: 't-xs', style: { opacity: .75, maxWidth: '360px' },
      text: "Appuie sur un médicament ci-dessus pour n'en valider qu'une partie." }));

  /* Validation individuelle */
  [...list.children].forEach((row, i) => {
    row.addEventListener('click', () => {
      const d = group.doses[i];
      markTaken(d);
      row.style.opacity = '.45';
      row.style.textDecoration = 'line-through';
      row.setAttribute('aria-disabled', 'true');
      vibrate('ok', getS('vibrate'));
      if (group.doses.every((x) => db.find('intakes',
          (r) => r.med_id === x.med.id && r.slot === x.slot && r.status === 'taken'))) {
        closeOverlay(); toast('Toutes les prises sont enregistrées.', { type: 'ok' });
      }
    }, { once: true });
  });
  return node;
}

const foodShort = (r) => ({ before: 'avant le repas', during: 'pendant le repas',
  after: 'après le repas', empty: 'à jeun' }[r] || '');

/* ==========================================================================
   REVEILLES PAR LE SYSTEME

   Quand l'APK est lancee par l'intention plein ecran d'un rappel, elle
   demarre avec l'alarme en poche. Deux choses a faire, et vite : basculer
   sur le bon carnet — l'alarme peut concerner un autre profil que celui
   ouvert la veille — et ouvrir l'ecran sans attendre le prochain battement,
   qui pourrait etre quinze secondes plus tard.
   ========================================================================== */
function ouvrirSiReveilSysteme() {
  if (!estNatif()) return false;
  const a = alarmeQuiNousAReveilles();
  if (!a) return false;

  if (a.profil) {
    const p = db.get('profiles', a.profil);
    if (p && p.id !== activeProfile()?.id) setS('active_profile', p.id);
  }

  /* On cherche le creneau annonce ; a defaut, n'importe lequel qui est du. */
  const groupes = pendingSlots();
  const vise = groupes.find((g) => g.time === a.heure) || groupes[0];
  if (!vise) return false;

  handled.delete(vise.key);
  snoozed.delete(vise.key);
  fire(vise);
  return true;
}

/* ------------------------------------------------------------- Cycle de vie */
export function startAlarms(changeCb = () => {}) {
  onChange = changeCb;
  stopAlarms();
  timer = setInterval(tick, TICK_MS);
  /* D'abord l'alarme qui nous a reveilles, s'il y en a une. */
  setTimeout(() => { if (!ouvrirSiReveilSysteme()) tick(); }, 250);
  setTimeout(tick, 1200);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!ouvrirSiReveilSysteme()) tick();
  });
  navigator.serviceWorker?.addEventListener?.('message', (e) => {
    if (e.data?.type === 'notification-action') handleNotificationAction(e.data);
  });
}
export function stopAlarms() { clearInterval(timer); timer = null; }

function handleNotificationAction({ action, tag }) {
  const g = pendingSlots().find((x) => x.key === tag);
  if (!g) return;
  if (action === 'taken') { takeAll(g.doses); toast('Prise enregistrée depuis la notification.', { type: 'ok' }); }
  if (action === 'snooze') snoozed.set(tag, Date.now() + (getS('snooze_min') || 10) * 60000);
  if (overlay) closeOverlay(); else onChange();
}

/** Test manuel depuis les reglages. */
export function previewAlarm() {
  const p = activeProfile();
  const today = dosesForDate(new Date(), p?.id);
  const sample = today.length ? today.slice(0, 3) : [];
  if (!sample.length) { toast("Aucun médicament programmé pour aujourd'hui."); return; }
  fire({ time: sample[0].time, key: 'apercu-' + Date.now(), doses: sample });
}

/** Prochaine prise a venir (affichee sur l'accueil). */
export function nextDose(profileId) {
  const now = Date.now();
  for (let i = 0; i < 3; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const list = dosesForDate(d, profileId)
      .filter((x) => x.planned.getTime() > now && !x.intake)
      .sort((a, b) => a.planned - b.planned);
    if (list.length) {
      const t = list[0].planned.getTime();
      return { ...list[0], sameTime: list.filter((x) => x.planned.getTime() === t), in: relTime(list[0].planned) };
    }
  }
  return null;
}
export const isAlarmOpen = () => !!overlay;
export const dismissAlarm = () => closeOverlay();
